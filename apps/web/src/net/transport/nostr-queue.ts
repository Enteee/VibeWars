/**
 * The Random Arena queue board over public Nostr relays (#872, ADR-0032):
 * strangers on different networks see each other's tickets. A ticket is an
 * ephemeral event, which relays forward and do not store, signed with the
 * ticket's own key, so the event's `pubkey` is the ticket id and nobody
 * else can speak for it.
 *
 * Every client opens every relay in `NOSTR_RELAYS`, not Trystero's
 * `RELAY_REDUNDANCY` of them: two clients on disjoint relays would never
 * see each other's tickets, and a ticket is a few hundred bytes.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  PROTOCOL_VERSION,
  parseQueueTicket,
  TICKET_TTL_MS,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";
import {
  admissionBytes,
  type QueueBoard,
  type QueueBoardEvent,
  type TicketKey,
  type TransportTrouble,
} from "@vibewars/game-session";

import {
  byteLength,
  eventId,
  HEX_128,
  HEX_64,
  isTags,
  openRelayPool,
  signEvent,
  webSocket,
  type NostrEvent,
  type OpenRelaySocket,
} from "./nostr-relays.js";
import { APP_ID, NOSTR_RELAYS } from "./relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";

/** The ephemeral kind (NIP-01: 20000–29999) every ticket and withdrawal is. */
export const QUEUE_EVENT_KIND = 23854;

/**
 * The largest relay message a client parses. A ticket event is about
 * 600 bytes; anything far over that is not one of ours.
 */
export const MAX_QUEUE_MESSAGE_BYTES = 4 * 1024;

/** Event ids remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 1024;

/** Party tickets whose consents were verified, remembered as many. */
const CONSENTED_LIMIT = SEEN_LIMIT;

/**
 * Signature checks a board makes a second, and in one burst. A Schnorr
 * verify costs about 3 ms of main thread, and anyone on the public relays
 * can send events that need one at no cost to themselves: past the
 * budget an event is dropped, so a flood slows matchmaking and never
 * freezes the tab. Honest load is far below it: a ticket heartbeats every
 * 5 s, and the other relays' copies are dropped before any check. A party
 * ticket costs one more a member the first time (#1078), and its
 * heartbeats none, since the consents they carry do not change.
 */
export const VERIFY_PER_SECOND = 30;
export const VERIFY_BURST = 60;

const SUBSCRIPTION_ID = "vibewars-queue";

/** What the board takes from the world; the unit test hands in fakes. */
export interface NostrQueueDeps {
  readonly relays: readonly string[];
  readonly openSocket: OpenRelaySocket;
  /** ms since the epoch. */
  readonly now: () => number;
  readonly newTicketKey: () => TicketKey;
  readonly verifyTicketSig: (ticketId: string, digest: Uint8Array, sig: string) => boolean;
}

export interface NostrQueue {
  readonly board: QueueBoard;
  /**
   * A fresh key for the queue client: the board signs this ticket's events
   * with it, so a ticket is only ever published under a key made here.
   */
  newTicketKey(): TicketKey;
  /** Closes every relay socket; the board says nothing more. */
  close(): void;
}

const BROWSER: NostrQueueDeps = {
  relays: NOSTR_RELAYS,
  openSocket: webSocket,
  now: () => Date.now(),
  newTicketKey,
  verifyTicketSig,
};

function signedEvent(key: TicketKey, mode: QueueMode, content: string, at: number): NostrEvent {
  return signEvent(
    {
      pubkey: key.ticketId,
      created_at: Math.floor(at / 1000),
      kind: QUEUE_EVENT_KIND,
      tags: [
        ["t", APP_ID],
        ["protocol", PROTOCOL_VERSION],
        ["mode", mode],
      ],
      content,
    },
    (digest) => key.sign(digest),
  );
}

/**
 * `raw` as an event of ours whose id is its content's, with that id's
 * bytes, or `undefined`. Its signature is not checked yet: that is the
 * expensive part, and budgeted.
 */
function wellFormedEvent(
  raw: unknown,
): { readonly event: NostrEvent; readonly digest: Uint8Array } | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { id, pubkey, created_at, kind, tags, content, sig } = raw as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    !HEX_64.test(id) ||
    typeof pubkey !== "string" ||
    !HEX_64.test(pubkey) ||
    typeof created_at !== "number" ||
    kind !== QUEUE_EVENT_KIND ||
    !isTags(tags) ||
    typeof content !== "string" ||
    typeof sig !== "string" ||
    !HEX_128.test(sig)
  ) {
    return undefined;
  }
  const event = { id, pubkey, created_at, kind, tags, content, sig };
  const digest = eventId(event);
  return bytesToHex(digest) === id ? { event, digest } : undefined;
}

/**
 * What a verified event says, if it says it of its own key: a ticket whose
 * id is the event's `pubkey`, of this protocol, or the withdrawal of the
 * ticket that key is.
 */
function boardEvent(event: NostrEvent): QueueBoardEvent | undefined {
  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return undefined;
  }
  if (typeof content === "object" && content !== null && "withdrawn" in content) {
    const { withdrawn } = content;
    return Object.keys(content).length === 1 && withdrawn === event.pubkey
      ? { kind: "withdrawn", ticketId: event.pubkey }
      : undefined;
  }
  const ticket = parseQueueTicket(content);
  if (ticket?.ticketId !== event.pubkey || ticket.protocol !== PROTOCOL_VERSION) {
    return undefined;
  }
  return { kind: "ticket", ticket };
}

interface Subscriber {
  readonly mode: QueueMode;
  readonly on: (event: QueueBoardEvent) => void;
}

/** The board on `deps.relays`. `deps` is for the unit test; the app passes nothing. */
export function createNostrQueue(deps: NostrQueueDeps = BROWSER): NostrQueue {
  const subscribers = new Set<Subscriber>();
  const troubles = new Set<(trouble: TransportTrouble) => void>();
  /** Keys this board made, with the mode their ticket was last published in. */
  const keys = new Map<string, { readonly key: TicketKey; mode: QueueMode | undefined }>();
  const seen = new Set<string>();
  /**
   * Withdrawn ticket ids, to when they were withdrawn. Withdrawal is final
   * for a key, so a heartbeat signed before it, arriving late from a
   * slower relay or replayed, must not bring the ticket back. Kept a TTL:
   * after that, any copy of the ticket is dead anyway.
   */
  const withdrawn = new Map<string, number>();
  let closed = false;
  let verifyTokens = VERIFY_BURST;
  let verifyRefilledAt = deps.now();
  /**
   * Party ticket id to its last verified `members` and `party`, as text
   * (#1078): a party heartbeats the same consents every 5 s, which need
   * no second check. Both, as the consents sign the members: a heartbeat
   * that swaps one is checked again.
   */
  const consented = new Map<string, string>();

  const request = JSON.stringify([
    "REQ",
    SUBSCRIPTION_ID,
    { kinds: [QUEUE_EVENT_KIND], "#t": [APP_ID] },
  ]);

  /** Whether `said` is a ticket already withdrawn; notes a withdrawal. */
  function isWithdrawn(said: QueueBoardEvent): boolean {
    const at = deps.now();
    // Oldest first, as they were set: the first still live ends the walk.
    for (const [ticketId, since] of withdrawn) {
      if (at - since < TICKET_TTL_MS) {
        break;
      }
      withdrawn.delete(ticketId);
    }
    if (said.kind === "withdrawn") {
      withdrawn.delete(said.ticketId);
      withdrawn.set(said.ticketId, at);
      return false;
    }
    return withdrawn.has(said.ticket.ticketId);
  }

  /** Whether the verify budget has room for `count` more; takes them if so. */
  function mayVerify(count = 1): boolean {
    const at = deps.now();
    verifyTokens = Math.min(
      VERIFY_BURST,
      verifyTokens + ((at - verifyRefilledAt) * VERIFY_PER_SECOND) / 1000,
    );
    verifyRefilledAt = at;
    if (verifyTokens < count) {
      return false;
    }
    verifyTokens -= count;
    return true;
  }

  /**
   * Whether `ticket` names only members who consented to it (#1078): a
   * solo always does, a party when every `consents[i]` is `members[i]`'s
   * signature over its group and exactly these members. The checks are paid for from the verify
   * budget, all or none, and `unpaid` when it cannot; a party heard with
   * the same consents before costs nothing.
   */
  function consentOf(ticket: QueueTicket): "held" | "forged" | "unpaid" {
    const { party } = ticket;
    if (party === null) {
      return "held";
    }
    const said = JSON.stringify([ticket.members, party]);
    if (consented.get(ticket.ticketId) === said) {
      return "held";
    }
    if (!mayVerify(ticket.members.length)) {
      return "unpaid";
    }
    const { members } = ticket;
    const digest = sha256(
      admissionBytes("vibewars-party", party.groupId, members.join(""), ticket.mode),
    );
    const holds = members.every((member, i) => {
      const consent = party.consents[i];
      return consent !== undefined && deps.verifyTicketSig(member, digest, consent);
    });
    if (!holds) {
      return "forged";
    }
    if (consented.size >= CONSENTED_LIMIT) {
      consented.clear();
    }
    consented.set(ticket.ticketId, said);
    return "held";
  }

  /** Whether `event` is tagged with a mode somebody here listens to. */
  function wanted(event: NostrEvent): boolean {
    return event.tags.some(
      ([name, value]) =>
        name === "mode" && [...subscribers].some((subscriber) => subscriber.mode === value),
    );
  }

  function hear(data: unknown): void {
    if (typeof data !== "string" || byteLength(data) > MAX_QUEUE_MESSAGE_BYTES) {
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!Array.isArray(message) || message[0] !== "EVENT" || message[1] !== SUBSCRIPTION_ID) {
      return;
    }
    const raw: unknown = message[2];
    // The id is checked against the content before any handler sees it,
    // so a relay cannot use a known id to hide a different event.
    const id =
      typeof raw === "object" && raw !== null && "id" in raw && typeof raw.id === "string"
        ? raw.id
        : undefined;
    if (id === undefined || seen.has(id) || subscribers.size === 0) {
      return;
    }
    const formed = wellFormedEvent(raw);
    if (formed === undefined || !wanted(formed.event) || !mayVerify()) {
      return;
    }
    const { event, digest } = formed;
    if (!deps.verifyTicketSig(event.pubkey, digest, event.sig)) {
      return;
    }
    const said = boardEvent(event);
    const consent = said?.kind === "ticket" ? consentOf(said.ticket) : "held";
    if (consent === "unpaid") {
      // Over budget, as above: another relay's copy may yet be checked.
      return;
    }
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(event.id);
    if (said === undefined || consent === "forged" || isWithdrawn(said)) {
      return;
    }
    for (const subscriber of [...subscribers]) {
      // A withdrawal names no mode; a subscriber that never heard of the
      // ticket ignores it.
      if (said.kind === "withdrawn" || subscriber.mode === said.ticket.mode) {
        subscriber.on(said);
      }
    }
  }

  const pool = openRelayPool({
    relays: deps.relays,
    openSocket: deps.openSocket,
    request,
    hear,
    allDown: () => {
      for (const handler of [...troubles]) {
        handler("no-relay");
      }
    },
  });
  const send = (event: NostrEvent): void => {
    pool.send(event);
  };

  const board: QueueBoard = {
    publish: (ticket: QueueTicket) => {
      const known = keys.get(ticket.ticketId);
      if (closed || known === undefined) {
        console.warn("nostr queue: no key for ticket", ticket.ticketId);
        return;
      }
      known.mode = ticket.mode;
      send(signedEvent(known.key, ticket.mode, JSON.stringify(ticket), ticket.heartbeatAt));
    },
    withdraw: (ticketId) => {
      const known = keys.get(ticketId);
      keys.delete(ticketId);
      if (closed || known?.mode === undefined) {
        // Never published, so there is nothing for anyone to forget.
        return;
      }
      send(signedEvent(known.key, known.mode, JSON.stringify({ withdrawn: ticketId }), deps.now()));
    },
    subscribe: (mode, on) => {
      const subscriber: Subscriber = { mode, on };
      subscribers.add(subscriber);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    onTrouble: (handler) => {
      troubles.add(handler);
      return () => {
        troubles.delete(handler);
      };
    },
  };

  return {
    board,
    newTicketKey: () => {
      const key = deps.newTicketKey();
      keys.set(key.ticketId, { key, mode: undefined });
      return key;
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      subscribers.clear();
      troubles.clear();
      pool.close();
    },
  };
}
