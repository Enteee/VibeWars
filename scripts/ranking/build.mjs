#!/usr/bin/env node
/**
 * `pnpm ranking:build` — the leaderboard cache (ADR-0055, #3574): reads
 * the receipt archive, adds what the relays hold since its newest match,
 * and writes the archive back with `leaderboard.json` and `log.txt`.
 * The hourly `ranking.yml` runs it on the `ranking/` directory of
 * gh-pages; anyone can run it on that same archive, with `--no-fetch`
 * and the same `--as-of`, and get the same `leaderboard.json` hash.
 *
 *   --archive <dir>  the archive directory (default ranking-out/)
 *   --as-of <time>   the instant the board is as of, as `Date.parse`
 *                    reads it: a bare day is its midnight, UTC (default now)
 *   --no-fetch       rate the archive alone, without asking a relay
 *
 * A relay outage costs nothing: the archive only ever grows.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { schnorr } from "@noble/secp256k1";
import {
  canonicalBytes,
  mergeReceipts,
  parseReceipt,
  rankOrder,
  rate,
  RATING,
  resultDigest,
  utcDay,
  validateReceipt,
} from "@vibewars/ranking";

import relays from "../../apps/web/src/net/transport/relays.json" with { type: "json" };

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {import("@vibewars/ranking").ReceiptCrypto} ReceiptCrypto */

/**
 * @typedef {object} NostrEvent the fields of an event this script reads
 * @property {number} kind
 * @property {string[][]} tags
 * @property {string} content
 *
 * @typedef {object} RelayAnswer
 * @property {boolean} reached the relay answered the subscription before its timeout
 * @property {unknown[]} events every event it sent, unchecked
 *
 * @typedef {(url: string, filter: Record<string, unknown>) => Promise<RelayAnswer>} FetchRelay
 */

/** The kind ranked receipts are published as: NIP-78 app data, as match records are. */
export const RANKED_EVENT_KIND = 30078;
/** The `t` every ranked receipt carries: `RANKED_TOPIC` in `ranked-receipts.ts`. */
export const RANKED_TOPIC = "vibewars-ranked";
/** How far before the archive's newest match the relays are asked from: late publishers. */
export const SINCE_SLACK_SECONDS = 2 * RATING.secondsPerDay;
/** How long one relay gets to answer before it counts as down. */
export const RELAY_TIMEOUT_MS = 20_000;

const RECEIPTS = "receipts.ndjson";
const LEADERBOARD = "leaderboard.json";
const LOG = "log.txt";

/**
 * Receipts are checked with @noble, as the client's player key signs
 * them. Each check is remembered for the run: `rate` checks every
 * signature again, and an archive of 100k receipts holds about a million.
 *
 * @returns {ReceiptCrypto}
 */
export function nobleCrypto() {
  /** @type {Map<string, boolean>} */
  const checked = new Map();
  return {
    sha256,
    verify: (pubkey, digest, sig) => {
      const key = `${pubkey}${Buffer.from(digest).toString("hex")}${sig}`;
      let ok = checked.get(key);
      if (ok === undefined) {
        try {
          ok = schnorr.verify(hexToBytes(sig), digest, hexToBytes(pubkey));
        } catch {
          ok = false;
        }
        checked.set(key, ok);
      }
      return ok;
    },
  };
}

/**
 * The receipt `event` carries, or `undefined`: another kind or topic, a
 * `d` that is neither its match's address nor one under it, or a content
 * that is no receipt. As `parseRankedReceiptEvent` in the client.
 *
 * @param {unknown} event
 * @returns {RankedReceipt | undefined}
 */
export function receiptOfEvent(event) {
  if (typeof event !== "object" || event === null) {
    return undefined;
  }
  const { kind, tags, content } = /** @type {Partial<NostrEvent>} */ (event);
  if (kind !== RANKED_EVENT_KIND || !Array.isArray(tags) || typeof content !== "string") {
    return undefined;
  }
  /** @param {string} name */
  const tag = (name) => {
    const found = tags.find((parts) => Array.isArray(parts) && parts[0] === name)?.[1];
    return typeof found === "string" ? found : undefined;
  };
  if (tag("t") !== RANKED_TOPIC) {
    return undefined;
  }
  const receipt = parseReceipt(content);
  const address = tag("d");
  if (receipt === undefined || address === undefined) {
    return undefined;
  }
  const own = `${RANKED_TOPIC}/${receipt.start.matchId}`;
  return address === own || address.startsWith(`${own}/`) ? receipt : undefined;
}

/**
 * Whether `receipt` is worth archiving, or why not: a valid receipt, void
 * or not, and a partial one, that verifiably carries some seat's result
 * signature but not every non-leaver's. Partials are what a re-round is
 * voided by and what `host-left` receipts are merged from, so they stay.
 *
 * @param {RankedReceipt} receipt
 * @param {ReceiptCrypto} crypto
 * @returns {string | undefined} the reject reason, or `undefined` to keep it
 */
export function rejectReason(receipt, crypto) {
  const validity = validateReceipt(receipt, crypto);
  if (validity.ok) {
    return undefined;
  }
  if (validity.reason !== "result-signature") {
    return validity.reason;
  }
  const digest = resultDigest(receipt.result, crypto.sha256);
  const signedBySeat = receipt.start.teams.flat().some(({ pubkey }) => {
    const sig = receipt.resultSigs[pubkey];
    return sig !== undefined && crypto.verify(pubkey, digest, sig);
  });
  return signedBySeat ? undefined : validity.reason;
}

/** @param {RankedReceipt} receipt */
const encode = (receipt) => new TextDecoder().decode(canonicalBytes(receipt));

/**
 * One receipt per start and result: copies with the same bytes for both
 * are merged, their signatures united, and every other copy is kept as
 * it is, sorted by `startedAt` and then by encoding.
 *
 * @param {readonly RankedReceipt[]} receipts
 * @param {ReceiptCrypto} crypto
 * @returns {RankedReceipt[]}
 */
export function mergeArchive(receipts, crypto) {
  /** @type {Map<string, RankedReceipt>} */
  const merged = new Map();
  for (const receipt of receipts) {
    const key = new TextDecoder().decode(
      canonicalBytes({ start: receipt.start, result: receipt.result }),
    );
    const other = merged.get(key);
    merged.set(
      key,
      other === undefined ? receipt : (mergeReceipts(other, receipt, crypto) ?? other),
    );
  }
  return [...merged.values()]
    .map((receipt) => ({ receipt, line: encode(receipt) }))
    .sort(
      (a, b) =>
        a.receipt.start.startedAt - b.receipt.start.startedAt ||
        (a.line < b.line ? -1 : a.line > b.line ? 1 : 0),
    )
    .map(({ receipt }) => receipt);
}

/**
 * Asks one relay for every ranked receipt since `filter.since`, with
 * Node's own WebSocket, until it says EOSE or `timeoutMs` passes.
 *
 * @param {number} timeoutMs
 * @returns {FetchRelay}
 */
export const webSocketRelay = (timeoutMs) => (url, filter) =>
  new Promise((resolve) => {
    /** @type {unknown[]} */
    const events = [];
    const subscription = "vibewars-ranking";
    /** @type {WebSocket} */
    let socket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve({ reached: false, events });
      return;
    }
    /** @param {boolean} reached */
    const done = (reached) => {
      clearTimeout(timer);
      socket.close();
      resolve({ reached, events });
    };
    const timer = setTimeout(() => {
      done(false);
    }, timeoutMs);
    socket.onopen = () => {
      socket.send(JSON.stringify(["REQ", subscription, filter]));
    };
    socket.onerror = () => {
      done(false);
    };
    socket.onmessage = (message) => {
      /** @type {unknown} */
      let data;
      try {
        data = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (!Array.isArray(data) || data[1] !== subscription) {
        return;
      }
      if (data[0] === "EVENT") {
        events.push(data[2]);
      } else if (data[0] === "EOSE") {
        done(true);
      } else if (data[0] === "CLOSED") {
        done(false);
      }
    };
  });

/**
 * @param {string} dir
 * @returns {Promise<string>}
 */
async function readArchive(dir) {
  try {
    return await readFile(join(dir, RECEIPTS), "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

/** @param {Record<string, number>} counts */
const sortedCounts = (counts) =>
  Object.entries(counts)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([reason, count]) => `  ${reason}: ${String(count)}`);

/**
 * @typedef {object} BuildOptions
 * @property {string} archive the archive directory
 * @property {number} asOf unix seconds the board is as of
 * @property {FetchRelay | undefined} fetchRelay how relays are asked, or `undefined` not to ask any
 * @property {readonly string[]} relays
 * @property {string} engine what computed the floats: `process.version`
 *
 * @typedef {object} BuildResult
 * @property {string} hash sha256 of `leaderboard.json`, hex
 * @property {string} log what `log.txt` says
 */

/**
 * One run: archive, fetch, merge, rate, write.
 *
 * @param {BuildOptions} options
 * @returns {Promise<BuildResult>}
 */
export async function build({ archive, asOf, fetchRelay, relays: urls, engine }) {
  const crypto = nobleCrypto();
  /** @type {Record<string, number>} */
  const rejected = {};
  const reject = (/** @type {string} */ reason) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };

  /** @type {RankedReceipt[]} */
  const archived = [];
  for (const line of (await readArchive(archive)).split("\n")) {
    if (line === "") {
      continue;
    }
    const receipt = parseReceipt(line);
    if (receipt === undefined) {
      throw new Error(`${join(archive, RECEIPTS)} holds a line that is no receipt`);
    }
    archived.push(receipt);
  }

  const lines = [`as of ${new Date(asOf * 1000).toISOString()}`];
  /** @type {RankedReceipt[]} */
  const fetched = [];
  if (fetchRelay === undefined) {
    lines.push("relays: not asked (--no-fetch)");
  } else {
    const newest = Math.max(0, ...archived.map((receipt) => receipt.start.startedAt));
    const since = Math.max(0, newest - SINCE_SLACK_SECONDS);
    const filter = { kinds: [RANKED_EVENT_KIND], "#t": [RANKED_TOPIC], since };
    const answers = await Promise.all(urls.map((url) => fetchRelay(url, filter)));
    const reached = urls.filter((_, i) => answers[i]?.reached === true);
    lines.push(
      `relays reached: ${String(reached.length)} of ${String(urls.length)}, since ${String(since)}`,
    );
    for (const url of urls) {
      lines.push(`  ${reached.includes(url) ? "reached" : "down   "} ${url}`);
    }
    if (reached.length === 0) {
      lines.push("every relay is down: the archive is unchanged");
    }
    // Every relay holds a copy of most events: each one counts once.
    const events = new Map(
      answers.flatMap((answer) => answer.events).map((event) => [JSON.stringify(event), event]),
    );
    for (const event of events.values()) {
      {
        const receipt = receiptOfEvent(event);
        const reason = receipt === undefined ? "malformed" : rejectReason(receipt, crypto);
        if (receipt === undefined || reason !== undefined) {
          reject(reason ?? "malformed");
        } else {
          fetched.push(receipt);
        }
      }
    }
  }

  const receipts = mergeArchive([...archived, ...fetched], crypto);
  const asOfDay = utcDay(asOf);
  const ratings = rate(
    receipts.filter((receipt) => receipt.start.startedAt <= asOf),
    asOfDay,
    crypto,
  );
  const ranked = rankOrder(ratings);
  const rankOf = new Map(ranked.map((pubkey, i) => [pubkey, i + 1]));
  const provisional = [...ratings]
    .filter(([pubkey]) => !rankOf.has(pubkey))
    .sort(([a, x], [b, y]) => y.conservative - x.conservative || (a < b ? -1 : 1))
    .map(([pubkey]) => pubkey);
  const entries = [...ranked, ...provisional].map((pubkey) => {
    const rating = ratings.get(pubkey);
    if (rating === undefined) {
      throw new Error(`unrated key in rank order: ${pubkey}`);
    }
    return {
      pubkey,
      name: rating.name,
      characterId: rating.characterId,
      rank: rankOf.get(pubkey) ?? null,
      provisional: rating.provisional,
      rating: rating.rating,
      rd: rating.rd,
      conservative: rating.conservative,
      matches: rating.matches,
      wins: rating.wins,
      streak: rating.streak,
      lastPlayedDay: rating.lastPlayedDay,
      lastReceiptHash: rating.lastReceiptHash,
      forked: rating.forked,
    };
  });
  const leaderboard = `${JSON.stringify({ asOf, engine, count: entries.length, entries })}\n`;
  const hash = createHash("sha256").update(leaderboard).digest("hex");

  lines.push(
    `archive: ${String(archived.length)} read, ${String(fetched.length)} fetched, ${String(receipts.length)} kept`,
    `rejected: ${String(Object.values(rejected).reduce((sum, n) => sum + n, 0))}`,
    ...sortedCounts(rejected),
    `identities: ${String(entries.length)}, ranked ${String(ranked.length)}`,
    `engine: ${engine}`,
    `sha256(${LEADERBOARD}): ${hash}`,
  );
  const log = `${lines.join("\n")}\n`;

  await mkdir(archive, { recursive: true });
  await writeFile(
    join(archive, RECEIPTS),
    receipts.map((receipt) => `${encode(receipt)}\n`).join(""),
  );
  await writeFile(join(archive, LEADERBOARD), leaderboard);
  await writeFile(join(archive, LOG), log);
  return { hash, log };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      archive: { type: "string", default: "ranking-out" },
      "as-of": { type: "string" },
      "no-fetch": { type: "boolean", default: false },
    },
  });
  const at = values["as-of"] === undefined ? Date.now() : Date.parse(values["as-of"]);
  if (Number.isNaN(at)) {
    throw new Error(`--as-of: not a time: ${String(values["as-of"])}`);
  }
  const { log } = await build({
    archive: values.archive,
    asOf: Math.floor(at / 1000),
    fetchRelay: values["no-fetch"] ? undefined : webSocketRelay(RELAY_TIMEOUT_MS),
    relays,
    engine: process.version,
  });
  process.stdout.write(log);
}
