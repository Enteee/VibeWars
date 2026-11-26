import { RECONNECT_WINDOW_SECONDS } from "@vibewars/game-session";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/**
 * What a guest's page leaves behind when it goes away mid-match (#4110),
 * so the next page it opens takes the seat back while the host holds it:
 * the lobby's code and host, the seat, both tokens, and when the hold
 * ends. Secrets: never logged. One record, gone within the window.
 */
export interface RejoinRecord {
  /** The lobby's invite code. */
  readonly code: string;
  /** The peer that hosts it: the lobby token goes to it alone. */
  readonly hostId: string;
  readonly matchId: string;
  readonly playerId: string;
  readonly lobbyToken: string;
  readonly matchToken: string;
  /** Ms epoch: the page went, plus `RECONNECT_WINDOW_SECONDS`. */
  readonly expiresAt: number;
}

/** Where the record is kept: `localStorage`, but for tests. */
type RecordStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const REJOIN_KEY = `${STORAGE_NAMESPACE}.rejoin`;

/** How many fields a record has: every one is required, and no other. */
const FIELD_COUNT = 7;

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** `value` as a record, if it is exactly one; anything else is not. */
function parseRejoinRecord(value: unknown): RejoinRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const fields = value as Record<string, unknown>;
  const { code, hostId, matchId, playerId, lobbyToken, matchToken, expiresAt } = fields;
  if (
    Object.keys(fields).length !== FIELD_COUNT ||
    !isText(code) ||
    !isText(hostId) ||
    !isText(matchId) ||
    !isText(playerId) ||
    !isText(lobbyToken) ||
    !isText(matchToken) ||
    typeof expiresAt !== "number" ||
    !Number.isFinite(expiresAt)
  ) {
    return undefined;
  }
  return { code, hostId, matchId, playerId, lobbyToken, matchToken, expiresAt };
}

/** Leave `record` for the next page, its hold counted from `nowMs`. Best effort. */
export function writeRejoinRecord(
  record: Omit<RejoinRecord, "expiresAt">,
  nowMs: number,
  storage: RecordStorage = localStorage,
): void {
  const stored: RejoinRecord = { ...record, expiresAt: nowMs + RECONNECT_WINDOW_SECONDS * 1000 };
  try {
    storage.setItem(REJOIN_KEY, JSON.stringify(stored));
  } catch {
    // Storage refused: this page's seat is held all the same, unclaimed.
  }
}

export function clearRejoinRecord(storage: RecordStorage = localStorage): void {
  try {
    storage.removeItem(REJOIN_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

/**
 * The record a page left, taken: it is deleted as it is read, so only one
 * page tries. One whose hold is over is `"expired"`, for the player to be
 * told once; a malformed one is no record.
 */
export function takeRejoinRecord(
  nowMs: number,
  storage: RecordStorage = localStorage,
): RejoinRecord | "expired" | undefined {
  let raw: string | null;
  try {
    raw = storage.getItem(REJOIN_KEY);
  } catch {
    return undefined;
  }
  if (raw === null) {
    return undefined;
  }
  clearRejoinRecord(storage);
  let record: RejoinRecord | undefined;
  try {
    record = parseRejoinRecord(JSON.parse(raw));
  } catch {
    record = undefined;
  }
  if (record === undefined) {
    return undefined;
  }
  return record.expiresAt > nowMs ? record : "expired";
}
