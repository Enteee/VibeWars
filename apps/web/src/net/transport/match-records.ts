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
import {
  byteLength,
  openRelayPool,
  signEvent,
  webSocket,
  type NostrEvent,
  type OpenRelaySocket,
} from "./nostr-relays.js";
import { NOSTR_RELAYS } from "./relays.js";
import { newTicketKey } from "./ticket-key.js";

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
  const now = deps.now();
  const event = matchRecordEvent(record, now);
  // Checked as a reader gets it: the JSON, not the object it came from.
  if (
    event === undefined ||
    validateMatchRecord(JSON.parse(event.content), new Set(arenaIds()), Math.floor(now / 1000)) ===
      undefined
  ) {
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
