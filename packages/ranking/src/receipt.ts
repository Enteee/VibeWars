/**
 * Ranked receipts (ADR-0055): what every player of a ranked match signs,
 * twice. The start round fixes who plays what; the result round fixes how
 * it ended. A receipt is checked here, by anybody, with nothing but the
 * hash and the signature check it is handed, so this module runs in a
 * page and in Node alike and carries no curve code of its own.
 */

/** BIP-340 tag of the start digest every seat signs. */
export const RANKED_START_TAG = "vibewars/ranked-start";
/** BIP-340 tag of the result digest every non-leaver signs. */
export const RANKED_RESULT_TAG = "vibewars/ranked-result";
/** BIP-340 tag of a proof-of-work stamp: one match, one signer (#3746). */
export const RANKED_WORK_TAG = "vibewars/ranked-work";
/** BIP-340 tag of a receipt's hash: the match it records, whoever's copy. */
export const RANKED_RECEIPT_TAG = "vibewars/ranked-receipt";
/** A `prev` with no receipt before it, and a `host-left` result's `replayHash`. */
export const ZERO_HASH = "0".repeat(64);

/** The most seats a ranked match has: 8v8. */
export const MAX_RANKED_SEATS = 16;
/** The longest seat name, in UTF-16 units: a character name (`names.ts`). */
export const MAX_SEAT_NAME_LENGTH = 40;
/**
 * The largest receipt `parseReceipt` reads, in UTF-8 bytes: the canonical
 * encoding of the largest there can be is 23.3 KB. That is 16 seats with
 * every id, name and integer at its bound in `\uXXXX` escapes, 16 leavers,
 * and both signature maps full, a result one with its stamp. A common 8v8
 * one is about 11 KB.
 */
export const MAX_RECEIPT_BYTES = 24 * 1024;
/** The longest id: a match, a build, a mode, a map or a character. */
const MAX_ID_LENGTH = 64;

/**
 * How a ranked match ended: the simulation's own reasons, and
 * `host-left`, which the remaining players write when the host vanishes.
 */
export const RANKED_END_REASONS = [
  "score",
  "time",
  "sudden-death",
  "annihilation",
  "morale",
  "guild-lord",
  "aggression",
  "host-left",
] as const;

export type RankedEndReason = (typeof RANKED_END_REASONS)[number];

/** One seat of a ranked match. */
export interface RankedSeat {
  /** The player key, x-only, as 64 lowercase hex digits: the ranked identity. */
  readonly pubkey: string;
  readonly characterId: string;
  /** The character's name, as the leaderboard shows it. */
  readonly name: string;
  /** The player's conservative rating at `leaderboardAsOf`, rounded to an integer. */
  readonly claimedRating: number;
  /**
   * The `asOf` of the leaderboard `claimedRating` was read from, unix
   * seconds: each player reads its own copy, so seats may differ (#3575).
   */
  readonly leaderboardAsOf: number;
  /** `receiptHash` of the player's own last receipt, or `ZERO_HASH` for the first. */
  readonly prev: string;
}

/** What every seat signs before the first tick. */
export interface RankedStart {
  /** The formation's `groupId`. */
  readonly matchId: string;
  /** The game build, as the protocol handshake names it. */
  readonly buildHash: string;
  readonly mode: string;
  readonly map: string;
  readonly seed: number;
  /** Unix seconds. */
  readonly startedAt: number;
  /** Seats by team: `teams[t]` is team `t`. */
  readonly teams: readonly (readonly RankedSeat[])[];
}

/** What every non-leaver signs at the end. */
export interface RankedResult {
  /** `startHash` of the start this result ends. */
  readonly startHash: string;
  /** The winning team's index, or `null` for a draw. */
  readonly winningTeam: number | null;
  readonly endReason: RankedEndReason;
  /** The pubkeys whose seats were freed, or that would not sign. Each loses. */
  readonly leavers: readonly string[];
  readonly durationSeconds: number;
  /** The hash of the replay's canonical encoding, or `ZERO_HASH` for `host-left`. */
  readonly replayHash: string;
}

/**
 * A seat's signature of a result, and the stamp that pays for it: `work`
 * is a nonce, 16 lowercase hex digits, whose `workDigest` for the match
 * and the signer has `RANKED_WORK_BITS` leading zero bits (#3746).
 */
export interface ResultSignature {
  /** 128 lowercase hex digits. */
  readonly sig: string;
  readonly work: string;
}

/**
 * A ranked match, signed, its signatures keyed by pubkey: a start
 * signature is 128 lowercase hex digits, a result one also carries its
 * stamp.
 */
export interface RankedReceipt {
  readonly start: RankedStart;
  readonly startSigs: Readonly<Record<string, string>>;
  readonly result: RankedResult;
  readonly resultSigs: Readonly<Record<string, ResultSignature>>;
}

/** SHA-256 of `bytes`. */
export type Sha256 = (bytes: Uint8Array) => Uint8Array;

/**
 * Whether `sig` is `pubkey`'s BIP-340 signature of `digest`. Total:
 * anything malformed, a key off the curve included, is simply not one.
 */
export type VerifySchnorr = (pubkey: string, digest: Uint8Array, sig: string) => boolean;

/** The curve code a receipt is checked with, handed in as `VerifyPlayerProof` is. */
export interface ReceiptCrypto {
  readonly sha256: Sha256;
  readonly verify: VerifySchnorr;
  /** The zero bits a result signature's stamp needs: `RANKED_WORK_BITS`, but in tests. */
  readonly workBits: number;
}

/** Why a receipt is not valid. */
export type ReceiptFault =
  | "duplicate-seat"
  | "start-hash"
  | "start-signature"
  | "winning-team"
  | "leavers"
  | "host-left"
  | "result-signature"
  | "no-work";

/**
 * Whether a receipt is valid, and if so whether it is void: valid, but
 * signed for its result by no more than half of its seats, so it rates
 * nobody. A host team that lists all its opponents as leavers gets this,
 * not a win.
 */
export type ReceiptValidity =
  | { readonly ok: true; readonly void: boolean }
  | { readonly ok: false; readonly reason: ReceiptFault };

const HEX_32 = /^[0-9a-f]{64}$/;
const HEX_64 = /^[0-9a-f]{128}$/;
const HEX_8 = /^[0-9a-f]{16}$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`not an integer: ${String(value)}`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  throw new TypeError(`not canonical data: ${typeof value}`);
}

/**
 * The one encoding of `value`: JSON with keys sorted, no whitespace and
 * integers only, as UTF-8. Throws for what has none: a fraction, an
 * `undefined`, a function.
 */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** BIP-340's tagged hash: `sha256(sha256(tag) ‖ sha256(tag) ‖ message)`. */
function taggedHash(sha256: Sha256, tag: string, message: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const joined = new Uint8Array(tagHash.length * 2 + message.length);
  joined.set(tagHash, 0);
  joined.set(tagHash, tagHash.length);
  joined.set(message, tagHash.length * 2);
  return sha256(joined);
}

/** The digest every seat signs: `start`'s canonical bytes under `vibewars/ranked-start`. */
export function startDigest(start: RankedStart, sha256: Sha256): Uint8Array {
  return taggedHash(sha256, RANKED_START_TAG, canonicalBytes(start));
}

/** `startDigest` as 64 lowercase hex digits: a result's `startHash`. */
export function startHash(start: RankedStart, sha256: Sha256): string {
  return toHex(startDigest(start, sha256));
}

/** The digest every non-leaver signs: `result`'s canonical bytes under `vibewars/ranked-result`. */
export function resultDigest(result: RankedResult, sha256: Sha256): Uint8Array {
  return taggedHash(sha256, RANKED_RESULT_TAG, canonicalBytes(result));
}

/**
 * The hash of the match a receipt records, as 64 lowercase hex digits:
 * its start and result under `vibewars/ranked-receipt`, and none of its
 * signatures. Every copy of one match hashes the same, whichever
 * signatures it holds, so a player's next `prev` is the hash the
 * leaderboard keeps.
 */
export function receiptHash(receipt: RankedReceipt, sha256: Sha256): string {
  const { start, result } = receipt;
  return toHex(taggedHash(sha256, RANKED_RECEIPT_TAG, canonicalBytes({ start, result })));
}

/**
 * The leading zero bits a result signature's stamp needs (#3746): a
 * mean of 2^17 hashes, about 1.6 s of one desktop core in JS, so minting
 * a fake receipt costs a key that much CPU, and an honest player pays it
 * once a match, in a worker, while the match is played. Sized so a
 * mid-range phone's p99 at the worker's half-core throttle stays within
 * `RANKED_WORK_GRACE_MS`; ADR-0055 has the measurements.
 */
export const RANKED_WORK_BITS = 17;

/**
 * How much longer than its own timeout a result round waits for a seat's
 * signature (#3746): the p99 stamp time on a mid-range phone at the
 * worker's half-core throttle. The stamp starts once the start is
 * signed, so only a match over within this long ever spends it.
 */
export const RANKED_WORK_GRACE_MS = 60_000;

/** The bytes a stamp hashes: tag hash twice, then `{startHash, pubkey, work}` canonically. */
function workMessage(started: string, pubkey: string, work: string, sha256: Sha256): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(RANKED_WORK_TAG));
  const message = canonicalBytes({ startHash: started, pubkey, work });
  const joined = new Uint8Array(tagHash.length * 2 + message.length);
  joined.set(tagHash, 0);
  joined.set(tagHash, tagHash.length);
  joined.set(message, tagHash.length * 2);
  return joined;
}

/**
 * The digest of stamp `work` for `pubkey`'s result signature in the match
 * whose `startHash` is `started`: `{startHash, pubkey, work}`'s canonical
 * bytes under `vibewars/ranked-work`. It binds the start, not the round,
 * so a seat that signs a result again needs no new work; and not the
 * `matchId`, which a flooder could replay under another start.
 */
export function workDigest(
  started: string,
  pubkey: string,
  work: string,
  sha256: Sha256,
): Uint8Array {
  return sha256(workMessage(started, pubkey, work, sha256));
}

/** Whether `digest` starts with at least `bits` zero bits. */
export function hasWork(digest: Uint8Array, bits: number): boolean {
  const whole = Math.floor(bits / 8);
  for (let i = 0; i < whole; i += 1) {
    if (digest[i] !== 0) {
      return false;
    }
  }
  const rest = bits % 8;
  return rest === 0 || (digest[whole] ?? 0xff) >> (8 - rest) === 0;
}

/** Whether `work` is a well-formed stamp for `pubkey` under start `started`, of `bits` zero bits. */
export function validWork(
  started: string,
  pubkey: string,
  work: string,
  sha256: Sha256,
  bits: number,
): boolean {
  return HEX_8.test(work) && hasWork(workDigest(started, pubkey, work, sha256), bits);
}

/** Nonce `n` as a stamp: 16 lowercase hex digits. */
export const workNonce = (n: number): string => n.toString(16).padStart(16, "0");

/** Where `findWork` got to: the stamp, or the nonce to go on from. */
export type WorkSearch = { readonly work: string } | { readonly next: number };

/**
 * One slice of the search for `pubkey`'s stamp under start `started`: nonces from
 * `from` on, until one has `bits` zero bits or `budgetMs` of `now` is
 * spent. A worker calls it again from `next` after yielding, so the
 * search never holds a core; the slices find the nonce one long search
 * would.
 */
export function findWork(
  started: string,
  pubkey: string,
  sha256: Sha256,
  search: {
    readonly from: number;
    readonly budgetMs: number;
    readonly now: () => number;
    readonly bits: number;
  },
): WorkSearch {
  const bytes = workMessage(started, pubkey, workNonce(0), sha256);
  // The nonce is the last string of the canonical encoding: `…"work":"<16>"}`.
  const at = bytes.length - 18;
  const deadline = search.now() + search.budgetMs;
  let n = search.from;
  for (;;) {
    // Check the clock every 256 hashes: reading it costs more than one.
    for (const end = n + 256; n < end; n += 1) {
      const hex = workNonce(n);
      for (let i = 0; i < 16; i += 1) {
        bytes[at + i] = hex.charCodeAt(i);
      }
      if (hasWork(sha256(bytes), search.bits)) {
        return { work: hex };
      }
    }
    if (search.now() >= deadline) {
      return { next: n };
    }
  }
}

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isHash = (value: unknown): value is string => typeof value === "string" && HEX_32.test(value);

const isEndReason = (value: unknown): value is RankedEndReason =>
  RANKED_END_REASONS.some((reason) => reason === value);

function parseSeat(value: unknown): RankedSeat | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { pubkey, characterId, name, claimedRating, leaderboardAsOf, prev } = value;
  if (
    !isHash(pubkey) ||
    !isId(characterId) ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > MAX_SEAT_NAME_LENGTH ||
    typeof claimedRating !== "number" ||
    !Number.isSafeInteger(claimedRating) ||
    !isCount(leaderboardAsOf) ||
    !isHash(prev)
  ) {
    return undefined;
  }
  return { pubkey, characterId, name, claimedRating, leaderboardAsOf, prev };
}

function parseTeams(value: unknown): RankedSeat[][] | undefined {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }
  const teams: RankedSeat[][] = [];
  let seats = 0;
  for (const team of value) {
    if (!Array.isArray(team) || team.length === 0) {
      return undefined;
    }
    seats += team.length;
    if (seats > MAX_RANKED_SEATS) {
      return undefined;
    }
    const parsed: RankedSeat[] = [];
    for (const seat of team) {
      const parsedSeat = parseSeat(seat);
      if (parsedSeat === undefined) {
        return undefined;
      }
      parsed.push(parsedSeat);
    }
    teams.push(parsed);
  }
  return teams;
}

/** The start `value` encodes, or `undefined`: the shape `parseReceipt` checks it for (#3573). */
export function parseRankedStart(value: unknown): RankedStart | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { matchId, buildHash, mode, map, seed, startedAt } = value;
  const teams = parseTeams(value.teams);
  if (
    !isId(matchId) ||
    !isId(buildHash) ||
    !isId(mode) ||
    !isId(map) ||
    !isCount(seed) ||
    !isCount(startedAt) ||
    teams === undefined
  ) {
    return undefined;
  }
  return { matchId, buildHash, mode, map, seed, startedAt, teams };
}

/** The result `value` encodes, or `undefined`: the shape `parseReceipt` checks it for (#3573). */
export function parseRankedResult(value: unknown): RankedResult | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { startHash, winningTeam, endReason, leavers, durationSeconds, replayHash } = value;
  if (
    !isHash(startHash) ||
    !(winningTeam === null || isCount(winningTeam)) ||
    !isEndReason(endReason) ||
    !Array.isArray(leavers) ||
    leavers.length > MAX_RANKED_SEATS ||
    !leavers.every(isHash) ||
    !isCount(durationSeconds) ||
    !isHash(replayHash)
  ) {
    return undefined;
  }
  return { startHash, winningTeam, endReason, leavers, durationSeconds, replayHash };
}

/** The signatures in `value` of the keys in `seated`; anyone else's are dropped. */
function parseSigs(
  value: unknown,
  seated: ReadonlySet<string>,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sigs: Record<string, string> = {};
  for (const [pubkey, sig] of Object.entries(value)) {
    if (!HEX_32.test(pubkey) || typeof sig !== "string" || !HEX_64.test(sig)) {
      return undefined;
    }
    if (seated.has(pubkey)) {
      sigs[pubkey] = sig;
    }
  }
  return sigs;
}

/** The result signatures in `value` of the keys in `seated`, each with its stamp. */
function parseResultSigs(
  value: unknown,
  seated: ReadonlySet<string>,
): Record<string, ResultSignature> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sigs: Record<string, ResultSignature> = {};
  for (const [pubkey, entry] of Object.entries(value)) {
    if (!HEX_32.test(pubkey) || !isRecord(entry)) {
      return undefined;
    }
    const { sig, work } = entry;
    if (
      typeof sig !== "string" ||
      !HEX_64.test(sig) ||
      typeof work !== "string" ||
      !HEX_8.test(work)
    ) {
      return undefined;
    }
    if (seated.has(pubkey)) {
      sigs[pubkey] = { sig, work };
    }
  }
  return sigs;
}

/**
 * The receipt `json` encodes, or `undefined` for anything that is not
 * one: too large, not JSON, a field missing, out of bounds or of an
 * unknown `endReason`. Total. Fields it does not know, and signatures of
 * keys that are not seated, are dropped.
 * Whether the receipt is *valid* is `validateReceipt`'s question.
 */
export function parseReceipt(json: string): RankedReceipt | undefined {
  if (
    json.length > MAX_RECEIPT_BYTES ||
    new TextEncoder().encode(json).length > MAX_RECEIPT_BYTES
  ) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  return parseRankedReceipt(value);
}

/**
 * The receipt `value` encodes, or `undefined`: `parseReceipt` of a value
 * already parsed, as a lobby message carries it (#3573). Its size is the
 * caller's to bound.
 */
export function parseRankedReceipt(value: unknown): RankedReceipt | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const start = parseRankedStart(value.start);
  if (start === undefined) {
    return undefined;
  }
  const seated = new Set(start.teams.flat().map((seat) => seat.pubkey));
  const startSigs = parseSigs(value.startSigs, seated);
  const result = parseRankedResult(value.result);
  const resultSigs = parseResultSigs(value.resultSigs, seated);
  if (startSigs === undefined || result === undefined || resultSigs === undefined) {
    return undefined;
  }
  return { start, startSigs, result, resultSigs };
}

const signed = (
  sigs: Readonly<Record<string, string>>,
  pubkey: string,
  digest: Uint8Array,
  verify: VerifySchnorr,
): boolean => {
  const sig = sigs[pubkey];
  return sig !== undefined && verify(pubkey, digest, sig);
};

/**
 * Whether `receipt` is valid (ADR-0055): every seat signed the start,
 * and every non-leaver signed the result that ends that start. A
 * signature from a key that is not seated is ignored. It is void unless
 * more than half of the seats signed the result (consent, Q109 B): the
 * host's team cannot win alone by naming every opponent a leaver. A
 * departed host counts among the seats and does not sign. Every result
 * signature carries a stamp of `crypto.workBits` zero bits for its signer and
 * this match, or the receipt is `no-work` (#3746).
 */
export function validateReceipt(receipt: RankedReceipt, crypto: ReceiptCrypto): ReceiptValidity {
  const { start, startSigs, result, resultSigs } = receipt;
  const seats = start.teams.flat().map((seat) => seat.pubkey);
  const seated = new Set(seats);
  if (seated.size !== seats.length) {
    return { ok: false, reason: "duplicate-seat" };
  }
  const digestOfStart = startDigest(start, crypto.sha256);
  if (result.startHash !== toHex(digestOfStart)) {
    return { ok: false, reason: "start-hash" };
  }
  if (!seats.every((pubkey) => signed(startSigs, pubkey, digestOfStart, crypto.verify))) {
    return { ok: false, reason: "start-signature" };
  }
  if (
    result.winningTeam !== null &&
    (result.winningTeam < 0 || result.winningTeam >= start.teams.length)
  ) {
    return { ok: false, reason: "winning-team" };
  }
  const leavers = new Set(result.leavers);
  if (
    leavers.size !== result.leavers.length ||
    !result.leavers.every((pubkey) => seated.has(pubkey))
  ) {
    return { ok: false, reason: "leavers" };
  }
  if (
    result.endReason === "host-left" &&
    (leavers.size !== 1 ||
      result.winningTeam !== null ||
      result.durationSeconds !== 0 ||
      result.replayHash !== ZERO_HASH)
  ) {
    return { ok: false, reason: "host-left" };
  }
  const digestOfResult = resultDigest(result, crypto.sha256);
  const signedResult = (pubkey: string): boolean => {
    const entry = resultSigs[pubkey];
    return entry !== undefined && crypto.verify(pubkey, digestOfResult, entry.sig);
  };
  // A signature is paid for, partials' included (#3746).
  const unpaid = Object.entries(resultSigs).some(
    ([pubkey, { work }]) =>
      seated.has(pubkey) &&
      signedResult(pubkey) &&
      !validWork(result.startHash, pubkey, work, crypto.sha256, crypto.workBits),
  );
  if (unpaid) {
    return { ok: false, reason: "no-work" };
  }
  if (!seats.every((pubkey) => leavers.has(pubkey) || signedResult(pubkey))) {
    return { ok: false, reason: "result-signature" };
  }
  // Consent: more than half of the seats signed, or nobody is rated.
  // Seats are distinct, so no key counts twice.
  const signers = seats.filter(signedResult).length;
  return { ok: true, void: 2 * signers <= seats.length };
}

/** Of `a`'s and `b`'s signature for each seat, the first that is `good`; `a`'s wins. */
function mergeSigs<Sig>(
  seats: readonly string[],
  a: Readonly<Record<string, Sig>>,
  b: Readonly<Record<string, Sig>>,
  good: (pubkey: string, sig: Sig) => boolean,
): Record<string, Sig> {
  const merged: Record<string, Sig> = {};
  for (const pubkey of seats) {
    const sig = [a[pubkey], b[pubkey]].find(
      (candidate) => candidate !== undefined && good(pubkey, candidate),
    );
    if (sig !== undefined) {
      merged[pubkey] = sig;
    }
  }
  return merged;
}

/**
 * One receipt of two partial ones over the same match, as players who
 * each signed a `host-left` result alone publish them: the union of
 * their signatures when start and result are byte for byte the same,
 * otherwise `undefined`. A signature is kept only if it is a seat's and
 * verifies, and a result one only with its stamp, so a forged one
 * published beside a good one cannot displace it; `a`'s wins where both
 * do.
 */
export function mergeReceipts(
  a: RankedReceipt,
  b: RankedReceipt,
  crypto: ReceiptCrypto,
): RankedReceipt | undefined {
  if (
    canonicalJson(a.start) !== canonicalJson(b.start) ||
    canonicalJson(a.result) !== canonicalJson(b.result)
  ) {
    return undefined;
  }
  const seats = a.start.teams.flat().map((seat) => seat.pubkey);
  const { startHash: started } = a.result;
  const ofStart = startDigest(a.start, crypto.sha256);
  const ofResult = resultDigest(a.result, crypto.sha256);
  return {
    start: a.start,
    startSigs: mergeSigs(seats, a.startSigs, b.startSigs, (pubkey, sig) =>
      crypto.verify(pubkey, ofStart, sig),
    ),
    result: a.result,
    resultSigs: mergeSigs(
      seats,
      a.resultSigs,
      b.resultSigs,
      (pubkey, { sig, work }) =>
        crypto.verify(pubkey, ofResult, sig) &&
        validWork(started, pubkey, work, crypto.sha256, crypto.workBits),
    ),
  };
}
