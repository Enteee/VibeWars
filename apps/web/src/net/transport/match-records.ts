/**
 * Finished matches, published on Nostr (#2528): every match a host runs
 * to its end goes out as one record, for the Matches page (#2532) to
 * read. Public, with no opt-out (Q220): the players' in-game names and
 * guild tags are in it, and nothing else that identifies them.
 *
 * Host-reported: the event is signed by a key made for it alone, so its
 * signature proves only that the record arrived intact. It ties nothing
 * to the host, from one match to the next, and a host can lie.
 */

import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import {
  MATCH_RECORD_VERSION,
  validateMatchRecord,
  type MatchRecord,
} from "@vibewars/game-session";

import { arenaIds } from "../maps.js";
import { VERIFY_PER_SECOND } from "./nostr-queue.js";
import {
  byteLength,
  openRelayPool,
  signEvent,
  verifyBudget,
  webSocket,
  wellFormedEvent,
  type NostrEvent,
  type OpenRelaySocket,
} from "./nostr-relays.js";
import { NOSTR_RELAYS } from "./relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";

/** NIP-78 application data: a kind relays store. */
export const MATCH_RECORD_EVENT_KIND = 30078;
/** The tag every match record carries, for a reader to ask for. */
export const MATCH_RECORD_TOPIC = "vibewars-matches";
/** A record bigger than this is not published. */
export const MAX_MATCH_RECORD_BYTES = 8 * 1024;
/** How long the relays have to take a record before it is given up. */
export const MATCH_RECORD_PUBLISH_MS = 10_000;

export interface MatchRecordDeps {
  readonly relays: readonly string[];
  readonly openSocket: OpenRelaySocket;
  /** Unix milliseconds. */
  readonly now: () => number;
}

const BROWSER: MatchRecordDeps = {
  relays: NOSTR_RELAYS,
  openSocket: webSocket,
  now: () => Date.now(),
};

/** `record` as a signed event, or `undefined` for one too big to publish. */
export function matchRecordEvent(record: MatchRecord, now: number): NostrEvent | undefined {
  const content = JSON.stringify(record);
  if (byteLength(content) > MAX_MATCH_RECORD_BYTES) {
    return undefined;
  }
  const key = newTicketKey();
  return signEvent(
    {
      pubkey: key.ticketId,
      created_at: Math.floor(now / 1000),
      kind: MATCH_RECORD_EVENT_KIND,
      tags: [
        ["d", `vibewars-match/${bytesToHex(randomBytes(16))}`],
        ["t", MATCH_RECORD_TOPIC],
        ["v", String(MATCH_RECORD_VERSION)],
      ],
      content,
    },
    (digest) => key.sign(digest),
  );
}

/**
 * Send `record` to the relays, once, and let go: the pool closes when
 * every relay has answered, when none is reachable, or after
 * `MATCH_RECORD_PUBLISH_MS`. Nothing is retried, kept or logged. A record
 * this build would not accept from someone else is not sent either.
 */
export function publishMatchRecord(record: MatchRecord, deps: MatchRecordDeps = BROWSER): void {
  const event = publishableEvent(record, deps.now());
  if (event === undefined) {
    return;
  }
  let answers = 0;
  // A microtask later: every relay may be down before the pool is even
  // returned. Closing twice is harmless.
  const done = (): void => {
    queueMicrotask(() => {
      clearTimeout(timeout);
      pool.close();
    });
  };
  const pool = openRelayPool({
    relays: deps.relays,
    openSocket: deps.openSocket,
    hear: (data) => {
      if (isOkFor(data, event.id)) {
        answers += 1;
        if (answers >= deps.relays.length) {
          done();
        }
      }
    },
    allDown: done,
  });
  const timeout = setTimeout(done, MATCH_RECORD_PUBLISH_MS);
  pool.send(event);
}

/**
 * `record` as a signed event, or `undefined` for one this build would not
 * accept from someone else. Checked as a reader gets it: the JSON, not
 * the object it came from.
 */
export function publishableEvent(record: MatchRecord, now: number): NostrEvent | undefined {
  const event = matchRecordEvent(record, now);
  if (
    event === undefined ||
    validateMatchRecord(JSON.parse(event.content), new Set(arenaIds()), Math.floor(now / 1000)) ===
      undefined
  ) {
    return undefined;
  }
  return event;
}

/** Whether `data` is a relay's NIP-01 `["OK", <id>, …]` for event `id`. */
function isOkFor(data: unknown, id: string): boolean {
  if (typeof data !== "string") {
    return false;
  }
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return false;
  }
  return Array.isArray(message) && message[0] === "OK" && message[1] === id;
}

/** The subscription the Matches page holds, by its id on every relay. */
export const WATCH_SUBSCRIPTION_ID = "vibewars-matches";

/** How many records the Matches page asks each relay for. */
export const MATCH_RECORD_LIMIT = 100;

/**
 * The largest relay message a reader parses: a record's content at its
 * cap, every character escaped, and room for the event around it.
 */
const MAX_MATCH_RECORD_MESSAGE_BYTES = 2 * MAX_MATCH_RECORD_BYTES + 2 * 1024;

/**
 * Signature checks the watch makes at once: one relay's whole answer.
 * The other relays' copies of a record are dropped before any check.
 */
export const MATCH_RECORD_VERIFY_BURST = MATCH_RECORD_LIMIT;

/** Record `d` tags remembered to drop the copy each other relay delivers. */
const SEEN_LIMIT = 1024;

export interface MatchRecordWatchDeps extends MatchRecordDeps {
  readonly verifyTicketSig: (pubkey: string, digest: Uint8Array, sig: string) => boolean;
}

const BROWSER_WATCH: MatchRecordWatchDeps = { ...BROWSER, verifyTicketSig };

/** A record heard, with the `d` tag that names it. */
export interface HeardMatchRecord {
  readonly id: string;
  readonly record: MatchRecord;
}

export interface MatchRecordWatchHandlers {
  /** A valid, verified record, each `d` once. */
  readonly record: (heard: HeardMatchRecord) => void;
  /** Every relay is down. */
  readonly noRelay: () => void;
}

export interface MatchRecordWatch {
  /** Closes every socket; nothing more is heard. */
  close(): void;
}

/**
 * The records on the relays, the last `MATCH_RECORD_LIMIT` each has and
 * every new one after, until closed. A record reaches `record` only once
 * it is valid and its event's signature holds; anything else is dropped
 * without a word, as is a second record under a `d` already heard.
 */
export function watchMatchRecords(
  on: MatchRecordWatchHandlers,
  deps: MatchRecordWatchDeps = BROWSER_WATCH,
): MatchRecordWatch {
  const pool = openRelayPool({
    relays: deps.relays,
    openSocket: deps.openSocket,
    request: JSON.stringify([
      "REQ",
      WATCH_SUBSCRIPTION_ID,
      { kinds: [MATCH_RECORD_EVENT_KIND], "#t": [MATCH_RECORD_TOPIC], limit: MATCH_RECORD_LIMIT },
    ]),
    hear: recordHearer(on, deps),
    allDown: on.noRelay,
  });
  return {
    close: () => {
      pool.close();
    },
  };
}

/**
 * A reader of relay messages that hands `on.record` each valid, verified
 * record once: what every record feed parses with, the relays' and the
 * broadcast build's (#2585) alike.
 */
export function recordHearer(
  on: MatchRecordWatchHandlers,
  deps: Pick<MatchRecordWatchDeps, "now" | "verifyTicketSig">,
): (data: unknown) => void {
  const mayVerify = verifyBudget(deps.now, VERIFY_PER_SECOND, MATCH_RECORD_VERIFY_BURST);
  const mapIds = new Set(arenaIds());
  const seen = new Set<string>();

  function hear(data: unknown): void {
    if (typeof data !== "string" || byteLength(data) > MAX_MATCH_RECORD_MESSAGE_BYTES) {
      return;
    }
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }
    if (!Array.isArray(message) || message[0] !== "EVENT" || message[1] !== WATCH_SUBSCRIPTION_ID) {
      return;
    }
    const formed = wellFormedEvent(message[2], MATCH_RECORD_EVENT_KIND);
    if (formed === undefined) {
      return;
    }
    const { event, digest } = formed;
    const id = event.tags.find(([name]) => name === "d")?.[1];
    if (
      id === undefined ||
      seen.has(id) ||
      !event.tags.some(([name, value]) => name === "t" && value === MATCH_RECORD_TOPIC) ||
      byteLength(event.content) > MAX_MATCH_RECORD_BYTES
    ) {
      return;
    }
    let content: unknown;
    try {
      content = JSON.parse(event.content);
    } catch {
      return;
    }
    const record = validateMatchRecord(content, mapIds, Math.floor(deps.now() / 1000));
    // Over budget, a record is dropped unmarked: another relay's copy may yet be checked.
    if (record === undefined || !mayVerify()) {
      return;
    }
    if (!deps.verifyTicketSig(event.pubkey, digest, event.sig)) {
      return;
    }
    if (seen.size >= SEEN_LIMIT) {
      seen.clear();
    }
    seen.add(id);
    on.record({ id, record });
  }

  return hear;
}
