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
 * encoding of the largest there can be is 22.8 KB. That is 16 seats with
 * every id, name and integer at its bound in `\uXXXX` escapes, 16 leavers,
 * and both signature maps full, at about 200 bytes an entry. A common 8v8
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
  /** The `asOf` of the leaderboard every `claimedRating` was read from, unix seconds. */
  readonly leaderboardAsOf: number;
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

/** A ranked match, signed: signatures are keyed by pubkey, 128 lowercase hex digits each. */
export interface RankedReceipt {
  readonly start: RankedStart;
  readonly startSigs: Readonly<Record<string, string>>;
  readonly result: RankedResult;
  readonly resultSigs: Readonly<Record<string, string>>;
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
}

/** Why a receipt is not valid. */
export type ReceiptFault =
  | "duplicate-seat"
  | "start-hash"
  | "start-signature"
  | "winning-team"
  | "leavers"
  | "host-left"
  | "result-signature";

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
  const { pubkey, characterId, name, claimedRating, prev } = value;
  if (
    !isHash(pubkey) ||
    !isId(characterId) ||
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > MAX_SEAT_NAME_LENGTH ||
    typeof claimedRating !== "number" ||
    !Number.isSafeInteger(claimedRating) ||
    !isHash(prev)
  ) {
    return undefined;
  }
  return { pubkey, characterId, name, claimedRating, prev };
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
  const { matchId, buildHash, mode, map, seed, startedAt, leaderboardAsOf } = value;
  const teams = parseTeams(value.teams);
  if (
    !isId(matchId) ||
    !isId(buildHash) ||
    !isId(mode) ||
    !isId(map) ||
    !isCount(seed) ||
    !isCount(startedAt) ||
    !isCount(leaderboardAsOf) ||
    teams === undefined
  ) {
    return undefined;
  }
  return { matchId, buildHash, mode, map, seed, startedAt, leaderboardAsOf, teams };
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
  const resultSigs = parseSigs(value.resultSigs, seated);
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
 * departed host counts among the seats and does not sign.
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
  const signedResult = (pubkey: string): boolean =>
    signed(resultSigs, pubkey, digestOfResult, crypto.verify);
  if (!seats.every((pubkey) => leavers.has(pubkey) || signedResult(pubkey))) {
    return { ok: false, reason: "result-signature" };
  }
  // Consent: more than half of the seats signed, or nobody is rated.
  // Seats are distinct, so no key counts twice.
  const signers = seats.filter(signedResult).length;
  return { ok: true, void: 2 * signers <= seats.length };
}

function mergeSigs(
  seats: readonly string[],
  a: Readonly<Record<string, string>>,
  b: Readonly<Record<string, string>>,
  digest: Uint8Array,
  verify: VerifySchnorr,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const pubkey of seats) {
    const sig = [a[pubkey], b[pubkey]].find(
      (candidate) => candidate !== undefined && verify(pubkey, digest, candidate),
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
 * verifies, so a forged one published beside a good one cannot displace
 * it; `a`'s wins where both do.
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
  return {
    start: a.start,
    startSigs: mergeSigs(
      seats,
      a.startSigs,
      b.startSigs,
      startDigest(a.start, crypto.sha256),
      crypto.verify,
    ),
    result: a.result,
    resultSigs: mergeSigs(
      seats,
      a.resultSigs,
      b.resultSigs,
      resultDigest(a.result, crypto.sha256),
      crypto.verify,
    ),
  };
}
