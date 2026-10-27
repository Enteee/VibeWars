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
import type {
  QueueBoard,
  QueueBoardEvent,
  TicketKey,
  TransportTrouble,
} from "@vibewars/game-session";

import { APP_ID, NOSTR_RELAYS } from "./relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";

/** The ephemeral kind (NIP-01: 20000–29999) every ticket and withdrawal is. */
export const QUEUE_EVENT_KIND = 23854;

/**
 * The largest relay message a client parses. A ticket event is about
 * 600 bytes; anything far over that is not one of ours.
 */
export const MAX_QUEUE_MESSAGE_BYTES = 4 * 1024;

/** How long a closed relay socket waits before it opens again. */
export const RELAY_RETRY_MS = 10_000;

/** Messages a socket still opening holds for when it opens; the oldest go first. */
const PENDING_LIMIT = 16;

/** Event ids remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 1024;

const SUBSCRIPTION_ID = "vibewars-queue";

/** One relay connection, as `openSocket` makes it. */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
}

export interface RelaySocketHandlers {
  open(): void;
  message(data: unknown): void;
  /** Closed or failed; fired once per socket. */
  close(): void;
}

/** What the board takes from the world; the unit test hands in fakes. */
export interface NostrQueueDeps {
  readonly relays: readonly string[];
  readonly openSocket: (url: string, handlers: RelaySocketHandlers) => RelaySocket;
  /** ms since the epoch. */
  readonly now: () => number;
  readonly newTicketKey: () => TicketKey;
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

interface NostrEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: readonly (readonly string[])[];
  readonly content: string;
  readonly sig: string;
}

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_128 = /^[0-9a-f]{128}$/;

function webSocket(url: string, handlers: RelaySocketHandlers): RelaySocket {
  const socket = new WebSocket(url);
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      handlers.close();
    }
  };
  socket.onopen = () => {
    handlers.open();
  };
  socket.onmessage = (event) => {
    handlers.message(event.data);
  };
  socket.onerror = close;
  socket.onclose = close;
  return socket;
}

const BROWSER: NostrQueueDeps = {
  relays: NOSTR_RELAYS,
  openSocket: webSocket,
  now: () => Date.now(),
  newTicketKey,
};

/** NIP-01's event id: sha256 of the serialised `[0, pubkey, created_at, kind, tags, content]`. */
function eventId(event: Omit<NostrEvent, "id" | "sig">): Uint8Array {
  const serialised = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256(new TextEncoder().encode(serialised));
}

function signedEvent(key: TicketKey, mode: QueueMode, content: string, at: number): NostrEvent {
  const unsigned = {
    pubkey: key.ticketId,
    created_at: Math.floor(at / 1000),
    kind: QUEUE_EVENT_KIND,
    tags: [
      ["t", APP_ID],
      ["protocol", PROTOCOL_VERSION],
      ["mode", mode],
    ],
    content,
  };
  const id = eventId(unsigned);
  return { ...unsigned, id: bytesToHex(id), sig: key.sign(id) };
}

function isTags(value: unknown): value is readonly (readonly string[])[] {
  return (
    Array.isArray(value) &&
    value.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === "string"))
  );
}

/** `raw` as an event of ours, whole and signed by its `pubkey`, or `undefined`. */
function verifiedEvent(raw: unknown): NostrEvent | undefined {
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
  if (bytesToHex(digest) !== id || !verifyTicketSig(pubkey, digest, sig)) {
    return undefined;
  }
  return event;
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

function byteLength(data: string): number {
  return new TextEncoder().encode(data).length;
}

interface Relay {
  socket: RelaySocket | undefined;
  open: boolean;
  readonly pending: string[];
  retry: ReturnType<typeof setTimeout> | undefined;
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
  const relays = new Map<string, Relay>();
  let closed = false;
  /** Set while every relay is down and `no-relay` has been said. */
  let saidNoRelay = false;

  const request = JSON.stringify([
    "REQ",
    SUBSCRIPTION_ID,
    { kinds: [QUEUE_EVENT_KIND], "#t": [APP_ID] },
  ]);

  /** Whether `said` is a ticket already withdrawn; notes a withdrawal. */
  function isWithdrawn(said: QueueBoardEvent): boolean {
    const at = deps.now();
    for (const [ticketId, since] of withdrawn) {
      if (at - since >= TICKET_TTL_MS) {
        withdrawn.delete(ticketId);
      }
    }
    if (said.kind === "withdrawn") {
      withdrawn.set(said.ticketId, at);
      return false;
    }
    return withdrawn.has(said.ticket.ticketId);
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
    const event = verifiedEvent(raw);
    if (event === undefined) {
      return;
    }
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(event.id);
    const said = boardEvent(event);
    if (said === undefined || isWithdrawn(said)) {
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

  function checkRelays(): void {
    const anyUp = [...relays.values()].some((relay) => relay.socket !== undefined);
    if (anyUp) {
      return;
    }
    if (!saidNoRelay) {
      saidNoRelay = true;
      for (const handler of [...troubles]) {
        handler("no-relay");
      }
    }
  }

  function connect(url: string, relay: Relay): void {
    relay.retry = undefined;
    relay.socket = deps.openSocket(url, {
      open: () => {
        if (closed) {
          return;
        }
        relay.open = true;
        saidNoRelay = false;
        relay.socket?.send(request);
        for (const message of relay.pending.splice(0)) {
          relay.socket?.send(message);
        }
      },
      message: (data) => {
        if (!closed) {
          hear(data);
        }
      },
      close: () => {
        relay.socket = undefined;
        relay.open = false;
        if (closed) {
          return;
        }
        relay.retry = setTimeout(() => {
          connect(url, relay);
        }, RELAY_RETRY_MS);
        checkRelays();
      },
    });
  }

  function send(event: NostrEvent): void {
    const message = JSON.stringify(["EVENT", event]);
    for (const relay of relays.values()) {
      if (relay.open) {
        relay.socket?.send(message);
      } else {
        relay.pending.push(message);
        relay.pending.splice(0, relay.pending.length - PENDING_LIMIT);
      }
    }
  }

  for (const url of deps.relays) {
    const relay: Relay = { socket: undefined, open: false, pending: [], retry: undefined };
    relays.set(url, relay);
    connect(url, relay);
  }

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
      for (const relay of relays.values()) {
        clearTimeout(relay.retry);
        relay.socket?.close();
      }
    },
  };
}
