/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/**
 * Bumped whenever the wire format changes incompatibly. The server refuses
 * clients that do not match, so a stale browser tab fails loudly at join time
 * instead of desynchronising mid-match.
 */
export const PROTOCOL_VERSION = 1 as const;

/** Colyseus room name for the pre-match lobby. */
export const ROOM_LOBBY = "lobby" as const;

/**
 * Lobby codes are read aloud across a room at a LAN party, so the alphabet
 * excludes characters that are easy to mishear or misread:
 * `0`/`O`, `1`/`I`/`L`, `2`/`Z`, `5`/`S`, `8`/`B`, `U`/`V`.
 */
export const LOBBY_CODE_ALPHABET = "ACDEFGHJKMNPQRTWXY34679";

export const LOBBY_CODE_LENGTH = 4;

const LOBBY_CODE_PATTERN = new RegExp(`^[${LOBBY_CODE_ALPHABET}]{${String(LOBBY_CODE_LENGTH)}}$`);

/**
 * Normalise user-typed input (trim, strip separators, upper-case) before
 * validating. Players mistype lobby codes constantly; this is the one place
 * that tolerance lives.
 */
export function normalizeLobbyCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isLobbyCode(value: string): boolean {
  return LOBBY_CODE_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- */
/* Client -> server                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Desired movement direction as a unit-ish vector in world space.
 *
 * The server clamps and validates this; it is a *request to move*, not a
 * position. Magnitudes above 1 are clamped rather than rejected so that
 * joystick-style inputs degrade gracefully.
 */
export interface MoveIntent {
  readonly kind: "move";
  readonly dirX: number;
  readonly dirY: number;
}

/** Stop moving. Distinct from a zero-length move so intent stays explicit. */
export interface StopIntent {
  readonly kind: "stop";
}

/**
 * Every message a client is allowed to send during a match.
 *
 * Deliberately a closed discriminated union: adding a new client capability
 * requires touching this type, which forces a protocol-version decision and a
 * server-side validator.
 */
export type ClientIntent = MoveIntent | StopIntent;

/* -------------------------------------------------------------------------- */
/* Server -> client                                                            */
/* -------------------------------------------------------------------------- */

/** Sent once on join, before any state patch. */
export interface ServerHello {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly sessionId: string;
  /** Fixed simulation step in milliseconds; clients interpolate against it. */
  readonly tickIntervalMs: number;
}
