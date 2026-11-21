/**
 * `pnpm ranking:build [--archive <dir>] [--as-of <YYYY-MM-DD>]`: the
 * leaderboard cache (ADR-0055, #3574). Reads the archive of ranked
 * receipts, asks every relay for the ones published since, keeps the
 * new ones, and rates them all from scratch.
 *
 * Writes into the archive directory:
 * - `receipts/<YYYY-MM>.ndjson`: every kept receipt, one canonical JSON
 *   per line, sorted, in the shard of its `startedAt`'s UTC month, since
 *   relays forget. A receipt is never dropped from it, a new one whose
 *   every seat is at `MAX_RECEIPTS_PER_KEY_DAY`, or that started over
 *   `MAX_RECEIPT_AGE_DAYS` before the day, is not taken in (#3738),
 *   and only shards whose bytes changed are written (#3730);
 * - `leaderboard.json`: `{asOf, engine, count, entries}`. When the
 *   entries are those of the previous run's, it is that run's bytes;
 *   otherwise its `asOf` moves past the previous one, so one `asOf`
 *   never names two boards;
 * - `boards/<asOf>.json`: the same bytes under its own `asOf`, so a
 *   ranked claim is checked against the very board it was read from
 *   (#3575). Boards more than `BOARD_KEPT_SECONDS` older than this
 *   run's are deleted. The run fails rather than rewrite one;
 * - `log.txt`: counts by reject reason, the relays reached, and the
 *   sha256 of `leaderboard.json`.
 *
 * Anyone with the same archive and relay content gets the same bytes.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hashes, schnorr } from "@noble/secp256k1";
import {
  canonicalBytes,
  mergeReceipts,
  parseReceipt,
  rankOrder,
  rate,
  RATING,
  receiptHash,
  resultDigest,
  startDigest,
  utcDay,
  validateReceipt,
} from "@vibewars/ranking";

import RELAYS from "../../apps/web/src/net/transport/relays.json" with { type: "json" };

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {import("@vibewars/ranking").ReceiptCrypto} ReceiptCrypto */
/**
 * Every event `relay` holds for the ranked topic since `since` (unix
 * seconds; none for everything), or `undefined` when it could not be reached.
 * @typedef {(relay: string, since: number | undefined) => Promise<unknown[] | undefined>} FetchRelay
 */

/** NIP-78 application data, as `ranked-receipts.ts` publishes it. */
const RECEIPT_KIND = 30078;
/** The `t` and the `d` prefix of every ranked receipt (`ranked-receipts.ts`). */
const RANKED_TOPIC = "vibewars-ranked";
/** How far before the newest archived match the relays are asked from: late publishers. */
const SINCE_SLACK_SECONDS = 2 * RATING.secondsPerDay;
const RELAY_TIMEOUT_MS = 20_000;
/** Events asked for per page: relays cap a `REQ`, so older ones are paged with `until`. */
const PAGE_LIMIT = 500;
/** The archive's shards, one per UTC month, under the archive directory. */
const SHARDS_DIR = "receipts";
const SHARD_NAME = /^\d{4}-\d{2}\.ndjson$/;
/** Past boards, each under its `asOf`, under the archive directory. */
const BOARDS_DIR = "boards";
const BOARD_NAME = /^(\d+)\.json$/;
/**
 * How much older than the newest a past board is kept: a ranked claim
 * from an older one is refused, as no board is found for it (#3575).
 */
export const BOARD_KEPT_SECONDS = 3 * 60 * 60;
/** Over this a shard fails the run: GitHub refuses a file over 100 MB. */
const MAX_SHARD_BYTES = 90 * 1024 * 1024;
/**
 * A new receipt whose every seat key is already in this many for its UTC
 * day of `startedAt` is not taken in: about eight hours of ten-minute
 * matches, more than a player plays. Anyone can sign receipts between keys
 * they hold, so without it one key could fill a month shard past
 * `MAX_SHARD_BYTES` and stop every run. Every seat, not any, so one key's
 * flood cannot veto a match it lost with keys under the cap; fresh keys
 * are not stopped (#3738).
 */
const MAX_RECEIPTS_PER_KEY_DAY = 50;

/**
 * The first second after `day`. A receipt from then on is in the future:
 * taken in, it would pin the relays' `since` and the leaderboard's `asOf`
 * there for good, so nothing past it is taken in or counted.
 * @param {number} day
 */
const endOf = (day) => (day + 1) * RATING.secondsPerDay;

/**
 * UTC days before `asOfDay` a new receipt may start on. Signers choose
 * `startedAt`, so without it one key could spread a flood over every past
 * day and get `MAX_RECEIPTS_PER_KEY_DAY` on each; with it, one day opens
 * per day. The relays are asked from as far back (`SINCE_SLACK_SECONDS`).
 * Archived receipts are not judged again (#3738).
 */
const MAX_RECEIPT_AGE_DAYS = 2;

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => new Uint8Array(createHash("sha256").update(bytes).digest());
hashes.sha256 = sha256;

/**
 * BIP-340 with Node's sha256. A check is pure, and `rate` repeats the
 * same ones as it merges copies, so each is computed once. `trust`
 * marks the archive's signatures good without the curve: only ones that
 * verified were ever written to it, and checking 100k receipts again
 * every hour would not finish in time.
 * @returns {{ crypto: ReceiptCrypto, trust: (receipt: RankedReceipt) => void }}
 */
function receiptCrypto() {
  /** Per signature, the key and digest it is good or bad for. */
  /** @type {Map<string, { pubkey: string, digest: string, ok: boolean }>} */
  const checked = new Map();
  /** @param {Uint8Array} digest */
  const hexOf = (digest) => Buffer.from(digest).toString("hex");
  /** @type {ReceiptCrypto} */
  const crypto = {
    sha256,
    verify: (pubkey, digest, sig) => {
      const known = checked.get(sig);
      const digestHex = hexOf(digest);
      if (known?.pubkey === pubkey && known.digest === digestHex) {
        return known.ok;
      }
      let ok;
      try {
        ok = schnorr.verify(Buffer.from(sig, "hex"), digest, Buffer.from(pubkey, "hex"));
      } catch {
        ok = false;
      }
      checked.set(sig, { pubkey, digest: digestHex, ok });
      return ok;
    },
  };
  return {
    crypto,
    trust: (receipt) => {
      const signed = [
        { sigs: receipt.startSigs, digest: hexOf(startDigest(receipt.start, sha256)) },
        { sigs: receipt.resultSigs, digest: hexOf(resultDigest(receipt.result, sha256)) },
      ];
      for (const { sigs, digest } of signed) {
        for (const [pubkey, sig] of Object.entries(sigs)) {
          checked.set(sig, { pubkey, digest, ok: true });
        }
      }
    },
  };
}

const decoder = new TextDecoder();
/** @param {unknown} value */
const canonical = (value) => decoder.decode(canonicalBytes(value));

/**
 * The receipt `event` carries: the ranked topic, and a `d` that is its
 * match's address or one under it (`parseRankedReceiptEvent`).
 * @param {unknown} event
 * @returns {RankedReceipt | undefined}
 */
function receiptOf(event) {
  if (
    typeof event !== "object" ||
    event === null ||
    !("kind" in event && "tags" in event && "content" in event) ||
    event.kind !== RECEIPT_KIND ||
    !Array.isArray(event.tags) ||
    typeof event.content !== "string"
  ) {
    return undefined;
  }
  /** @type {unknown[]} */
  const tags = event.tags;
  /** @param {string} name */
  const tag = (name) => {
    const found = tags.find((parts) => Array.isArray(parts) && parts[0] === name);
    return Array.isArray(found) && typeof found[1] === "string" ? found[1] : undefined;
  };
  const receipt = tag("t") === RANKED_TOPIC ? parseReceipt(event.content) : undefined;
  const address = tag("d");
  if (receipt === undefined || address === undefined) {
    return undefined;
  }
  const own = `${RANKED_TOPIC}/${receipt.start.matchId}`;
  return address === own || address.startsWith(`${own}/`) ? receipt : undefined;
}

/**
 * Why `receipt` is not kept, or `undefined` to keep it. A valid one is
 * kept, void or not; so is one short only of result signatures, as a
 * player's partial is, if a seat signed it: a partial merges into a whole
 * receipt, and is the evidence a re-round is voided with (#3573).
 * @param {RankedReceipt} receipt
 * @param {ReceiptCrypto} crypto
 * @returns {string | undefined}
 */
function rejection(receipt, crypto) {
  const validity = validateReceipt(receipt, crypto);
  if (validity.ok) {
    return undefined;
  }
  if (validity.reason !== "result-signature") {
    return validity.reason;
  }
  // Copied with only the signatures that verify, so a forged one never counts.
  const own = mergeReceipts(receipt, receipt, crypto);
  return own && Object.keys(own.resultSigs).length > 0 ? undefined : "result-signature";
}

/**
 * The leaderboard and the archive `archived` and the relays' `events`
 * make, as of `asOfDay`, after the `previous` run's `leaderboard.json`
 * (`undefined` on the first run).
 * @param {{ archived: string, events: unknown[], relaysReached: readonly string[], relays: readonly string[], asOfDay: number, previous?: string }} input
 * @returns {{ shards: Record<string, string>, leaderboard: string, log: string }}
 */
export function build({ archived, events, relaysReached, relays, asOfDay, previous }) {
  const { crypto, trust } = receiptCrypto();
  /** @type {Map<string, RankedReceipt>} */
  const kept = new Map();
  /** @param {RankedReceipt} receipt */
  const keep = (receipt) => {
    const hash = receiptHash(receipt, crypto.sha256);
    const before = kept.get(hash);
    const merged = mergeReceipts(before ?? receipt, receipt, crypto);
    const isNew = before === undefined;
    if (merged) {
      kept.set(hash, merged);
    }
    return isNew;
  };
  for (const line of archived.split("\n")) {
    const receipt = line === "" ? undefined : parseReceipt(line);
    if (receipt) {
      trust(receipt);
      keep(receipt);
    }
  }
  const archivedCount = kept.size;
  const archivedHashes = new Set(kept.keys());

  /** @type {Map<string, number>} */
  const rejected = new Map();
  let added = 0;
  for (const event of events) {
    const receipt = receiptOf(event);
    const reason =
      receipt === undefined
        ? "malformed"
        : receipt.start.startedAt >= endOf(asOfDay)
          ? "future"
          : receipt.start.startedAt < (asOfDay - MAX_RECEIPT_AGE_DAYS) * RATING.secondsPerDay
            ? "stale"
            : rejection(receipt, crypto);
    if (reason !== undefined) {
      rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
    } else if (receipt && keep(receipt)) {
      added += 1;
    }
  }

  const sorted = [...kept]
    .map(([hash, receipt]) => ({ hash, receipt, line: canonical(receipt) }))
    .sort(
      (a, b) =>
        a.receipt.start.startedAt - b.receipt.start.startedAt ||
        (a.line < b.line ? -1 : a.line > b.line ? 1 : 0),
    );
  // The cap admits new receipts only: signers pick `startedAt`, so a cap
  // over the whole set would let a backdated flood evict an archived loss
  // (#3738). Counting starts from what the archive holds, and new receipts
  // are admitted in canonical order, so the arrival order within a run
  // changes nothing. A partial counts too, or a flooder would sign every
  // receipt as one; it merges with its whole receipt into one entry.
  /** @param {RankedReceipt} receipt @returns {string[]} its `<day> <pubkey>` per seat */
  const slotsOf = (receipt) => {
    const day = String(utcDay(receipt.start.startedAt));
    return receipt.start.teams.flat().map(({ pubkey }) => `${day} ${pubkey}`);
  };
  /** Receipts per seat key per UTC day. */
  /** @type {Map<string, number>} */
  const perKeyDay = new Map();
  /** @param {RankedReceipt} receipt */
  const count = (receipt) => {
    for (const slot of slotsOf(receipt)) {
      perKeyDay.set(slot, (perKeyDay.get(slot) ?? 0) + 1);
    }
  };
  for (const { hash, receipt } of sorted) {
    if (archivedHashes.has(hash)) {
      count(receipt);
    }
  }
  /** Over-cap receipts per seat key. */
  /** @type {Map<string, number>} */
  const overCap = new Map();
  const receipts = sorted.filter(({ hash, receipt }) => {
    if (archivedHashes.has(hash)) {
      return true;
    }
    const slots = slotsOf(receipt);
    // Refused only when every seat is at its cap: one key's flood must not
    // veto a match it played with keys that are not.
    if (slots.every((slot) => (perKeyDay.get(slot) ?? 0) >= MAX_RECEIPTS_PER_KEY_DAY)) {
      for (const slot of slots) {
        const pubkey = slot.slice(slot.indexOf(" ") + 1);
        overCap.set(pubkey, (overCap.get(pubkey) ?? 0) + 1);
      }
      return false;
    }
    count(receipt);
    return true;
  });
  const dropped = sorted.length - receipts.length;
  const ratings = rate(
    receipts.map(({ receipt }) => receipt),
    asOfDay,
    crypto,
  );
  const order = rankOrder(ratings);
  const rankOf = new Map(order.map((pubkey, i) => [pubkey, i + 1]));
  const entries = [...order, ...[...ratings.keys()].filter((pubkey) => !rankOf.has(pubkey))].map(
    (pubkey) => ({ pubkey, rank: rankOf.get(pubkey) ?? null, ...ratings.get(pubkey) }),
  );
  const newest = receipts.findLast(({ receipt }) => receipt.start.startedAt < endOf(asOfDay));
  /** @type {unknown} */
  const parsed = previous === undefined ? undefined : JSON.parse(previous);
  const before = /** @type {{ asOf: number, entries: unknown[] } | undefined} */ (parsed);
  const leaderboard =
    previous !== undefined && JSON.stringify(before?.entries) === JSON.stringify(entries)
      ? previous
      : `${JSON.stringify({
          // The as-of day's midnight, or the newest match if later (architect,
          // #3574), and past the previous board's: a late receipt with an older
          // startedAt changes the entries, never what an asOf names (#3575).
          asOf: Math.max(
            asOfDay * RATING.secondsPerDay,
            newest?.receipt.start.startedAt ?? 0,
            (before?.asOf ?? -1) + 1,
          ),
          engine: process.version,
          count: entries.length,
          entries,
        })}\n`;

  const log = [
    `relays reached: ${String(relaysReached.length)} of ${String(relays.length)}`,
    ...relays.map((relay) => `  ${relaysReached.includes(relay) ? "ok  " : "down"} ${relay}`),
    ...(relaysReached.length === 0 ? ["no relay reached: the archive is unchanged"] : []),
    `events: ${String(events.length)}`,
    `receipts: ${String(archivedCount)} archived, ${String(added - dropped)} new, ${String(receipts.length)} kept`,
    `over-cap: ${String(dropped)}`,
    ...[...overCap]
      .sort(([a, m], [b, n]) => n - m || (a < b ? -1 : 1))
      .slice(0, 5)
      .map(([pubkey, n]) => `  ${pubkey}: ${String(n)}`),
    "rejected:",
    ...[...rejected]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([reason, n]) => `  ${reason}: ${String(n)}`),
    `identities: ${String(entries.length)}, ranked: ${String(order.length)}`,
    `leaderboard.json sha256: ${createHash("sha256").update(leaderboard).digest("hex")}`,
    "",
  ].join("\n");

  /** @type {Record<string, string>} */
  const shards = {};
  for (const { receipt, line } of receipts) {
    const month = new Date(receipt.start.startedAt * 1000).toISOString().slice(0, 7);
    shards[month] = `${shards[month] ?? ""}${line}\n`;
  }
  return {
    shards,
    leaderboard,
    log,
  };
}

/**
 * The relay's stored ranked events since `since`, paged back with
 * `until`, or `undefined` if it never answered. It gives up after
 * `RELAY_TIMEOUT_MS` with what it has.
 * @type {FetchRelay}
 */
export function fetchRelay(relay, since) {
  return new Promise((resolve) => {
    /** @type {unknown[]} */
    const events = [];
    /** @type {Set<unknown>} */
    const seen = new Set();
    let answered = false;
    let finished = false;
    let page = 0;
    let fresh = 0;
    let received = 0;
    let oldest = Infinity;
    /** The last page's `until`. */
    let until = Infinity;
    /** @type {WebSocket | undefined} */
    let socket;
    const done = () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        socket?.close();
        resolve(answered ? events : undefined);
      }
    };
    const timer = setTimeout(done, RELAY_TIMEOUT_MS);
    /** @param {unknown[]} message */
    const send = (message) => {
      socket?.send(JSON.stringify(message));
    };
    /** @param {number | undefined} before */
    const ask = (before) => {
      page += 1;
      fresh = 0;
      received = 0;
      until = before ?? Infinity;
      send([
        "REQ",
        `ranked-${String(page)}`,
        {
          kinds: [RECEIPT_KIND],
          "#t": [RANKED_TOPIC],
          limit: PAGE_LIMIT,
          ...(since === undefined ? {} : { since }),
          ...(before === undefined ? {} : { until: before }),
        },
      ]);
    };
    try {
      socket = new WebSocket(relay);
    } catch {
      done();
      return;
    }
    socket.addEventListener("open", () => {
      ask(undefined);
    });
    socket.addEventListener("error", done);
    socket.addEventListener("close", done);
    socket.addEventListener("message", ({ data }) => {
      /** @type {unknown} */
      let message;
      try {
        message = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!Array.isArray(message) || message[1] !== `ranked-${String(page)}`) {
        return;
      }
      answered = true;
      /** @type {unknown} */
      const event = message[2];
      if (message[0] === "EVENT" && typeof event === "object" && event !== null) {
        const id = "id" in event ? event.id : undefined;
        received += 1;
        if (!seen.has(id)) {
          seen.add(id);
          events.push(event);
          fresh += 1;
          const at = "created_at" in event ? Number(event.created_at) : NaN;
          oldest = Number.isFinite(at) ? Math.min(oldest, at) : oldest;
        }
      } else if (message[0] === "EOSE" || message[0] === "CLOSED") {
        send(["CLOSE", message[1]]);
        // A page with nothing new is the end, unless it held old ones: then
        // one second holds a relay's whole page, maybe a flood, and only that
        // second is skipped, each time one further back. Otherwise ask for
        // older ones; `until` is inclusive.
        if (message[0] !== "EOSE" || !Number.isFinite(oldest)) {
          done();
        } else if (fresh > 0) {
          ask(oldest);
        } else if (received > 0) {
          ask(Math.min(oldest, until) - 1);
        } else {
          done();
        }
      }
    });
  });
}

/**
 * Reads the archive in `dir`, fetches from `relays` with `fetch`, and
 * writes it back: the shards that changed, the leaderboard and the log. A
 * relay that is down only adds nothing. A shard over `maxShardBytes`
 * fails the run before anything is written.
 * @param {{ dir: string, asOfDay: number, relays?: readonly string[], fetch?: FetchRelay, maxShardBytes?: number }} options
 */
export async function run({
  dir,
  asOfDay,
  relays = RELAYS,
  fetch = fetchRelay,
  maxShardBytes = MAX_SHARD_BYTES,
}) {
  const shardsDir = path.join(dir, SHARDS_DIR);
  const names = fs.existsSync(shardsDir)
    ? fs
        .readdirSync(shardsDir)
        .filter((name) => SHARD_NAME.test(name))
        .sort()
    : [];
  const archived = names
    .map((name) => fs.readFileSync(path.join(shardsDir, name), "utf8"))
    .join("\n");
  const newest = archived
    .split("\n")
    .map((line) => (line === "" ? undefined : parseReceipt(line)?.start.startedAt))
    .reduce(
      (max, at) =>
        at === undefined || at >= endOf(asOfDay) || (max !== undefined && max >= at) ? max : at,
      undefined,
    );
  const since = newest === undefined ? undefined : newest - SINCE_SLACK_SECONDS;
  const boardFile = path.join(dir, "leaderboard.json");
  const previous = fs.existsSync(boardFile) ? fs.readFileSync(boardFile, "utf8") : undefined;
  const answers = await Promise.all(relays.map((relay) => fetch(relay, since)));
  const out = build({
    archived,
    events: answers.flatMap((events) => events ?? []),
    relaysReached: relays.filter((_, i) => answers[i] !== undefined),
    relays,
    asOfDay,
    previous,
  });
  for (const [month, bytes] of Object.entries(out.shards)) {
    const size = Buffer.byteLength(bytes);
    if (size > maxShardBytes) {
      throw new Error(
        `${SHARDS_DIR}/${month}.ndjson would be ${String(size)} bytes, over ${String(maxShardBytes)}: GitHub refuses files over 100 MB`,
      );
    }
  }
  const boardsDir = path.join(dir, BOARDS_DIR);
  /** @type {unknown} */
  const written = JSON.parse(out.leaderboard);
  const { asOf } = /** @type {{ asOf: number }} */ (written);
  const board = path.join(boardsDir, `${String(asOf)}.json`);
  if (fs.existsSync(board) && fs.readFileSync(board, "utf8") !== out.leaderboard) {
    throw new Error(
      `${BOARDS_DIR}/${String(asOf)}.json is published with other bytes: a published board never changes`,
    );
  }
  fs.mkdirSync(shardsDir, { recursive: true });
  for (const [month, bytes] of Object.entries(out.shards)) {
    const file = path.join(shardsDir, `${month}.ndjson`);
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== bytes) {
      fs.writeFileSync(file, bytes);
    }
  }
  fs.writeFileSync(boardFile, out.leaderboard);
  fs.mkdirSync(boardsDir, { recursive: true });
  fs.writeFileSync(board, out.leaderboard);
  for (const name of fs.readdirSync(boardsDir)) {
    const at = BOARD_NAME.exec(name)?.[1];
    if (at !== undefined && Number(at) < asOf - BOARD_KEPT_SECONDS) {
      fs.rmSync(path.join(boardsDir, name));
    }
  }
  fs.writeFileSync(path.join(dir, "log.txt"), out.log);
  return out;
}

/** @param {readonly string[]} argv */
function options(argv) {
  /** @param {string} name */
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i < 0 ? undefined : argv[i + 1];
  };
  const asOf = arg("--as-of");
  const asOfDay =
    asOf === undefined
      ? utcDay(Math.floor(Date.now() / 1000))
      : utcDay(Date.parse(`${asOf}T00:00:00Z`) / 1000);
  if (!Number.isInteger(asOfDay)) {
    throw new Error(`--as-of wants a day, YYYY-MM-DD: ${String(asOf)}`);
  }
  return { dir: arg("--archive") ?? "ranking-out", asOfDay };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { log } = await run(options(process.argv.slice(2)));
  process.stdout.write(log);
}
