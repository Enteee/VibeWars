/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/**
 * Bumped whenever the wire format changes incompatibly. The server refuses
 * clients that do not match, so a stale browser tab fails loudly at join time
 * instead of desynchronising mid-match.
 */
export const PROTOCOL_VERSION = 1 as const;

/**
 * Colyseus room name for the match simulation room.
 *
 * A genuine pre-match lobby (lobby codes, team assignment, ready state —
 * brief §25) is a distinct room arriving in Sprint 19; until then, joining
 * `ROOM_MATCH` directly is the whole flow, which is why it starts moving
 * players immediately rather than waiting in a staging state.
 */
export const ROOM_MATCH = "match" as const;

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
 * Select (or clear, with `targetSessionId: null`) the entity this client is
 * targeting. The server validates `targetSessionId` against who is actually
 * connected (brief §5 "Targeting") — a client can request any target, but
 * only a real one is ever accepted.
 */
export interface TargetIntent {
  readonly kind: "target";
  readonly targetSessionId: string | null;
}

/**
 * Request to use the skill in slot `slot` of the caster's skill bar.
 *
 * The client sends a *slot index*, never a skill id: that way a client
 * cannot ask to cast a skill it does not have equipped, and the server
 * never has to trust a client-supplied skill identity (brief §32).
 */
export interface UseSkillIntent {
  readonly kind: "use-skill";
  readonly slot: number;
}

/**
 * Every message a client is allowed to send during a match.
 *
 * Deliberately a closed discriminated union: adding a new client capability
 * requires touching this type, which forces a protocol-version decision and a
 * server-side validator.
 */
export type ClientIntent = MoveIntent | StopIntent | TargetIntent | UseSkillIntent;

/**
 * Validate an arbitrary network payload as a `ClientIntent`, or reject it.
 *
 * Every field the client sends arrives over the wire as `unknown` — the
 * server never trusts a parsed-looking object shape without checking it
 * (brief §32). A malformed or malicious payload (missing fields, wrong
 * types, `NaN`/`Infinity`, an unrecognized `kind`) returns `undefined`
 * rather than throwing, so a caller can simply ignore one bad message
 * instead of needing a try/catch around every intent handler.
 */
export function parseClientIntent(value: unknown): ClientIntent | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;

  if (record.kind === "stop") {
    return { kind: "stop" };
  }

  if (
    record.kind === "move" &&
    typeof record.dirX === "number" &&
    typeof record.dirY === "number" &&
    Number.isFinite(record.dirX) &&
    Number.isFinite(record.dirY)
  ) {
    return { kind: "move", dirX: record.dirX, dirY: record.dirY };
  }

  if (
    record.kind === "target" &&
    (record.targetSessionId === null || typeof record.targetSessionId === "string")
  ) {
    return { kind: "target", targetSessionId: record.targetSessionId };
  }

  if (
    record.kind === "use-skill" &&
    typeof record.slot === "number" &&
    Number.isInteger(record.slot) &&
    record.slot >= 0
  ) {
    // An out-of-bounds-but-non-negative slot is accepted here and
    // rejected by the room against the caster's actual bar length —
    // parsing validates shape, the simulation validates meaning.
    return { kind: "use-skill", slot: record.slot };
  }

  return undefined;
}

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

/**
 * The wire shape of a map's static geometry, sent once on join (brief §19's
 * "renderer turns the map description into minimalist graphics").
 *
 * Deliberately independent of `@vibewars/game-maps`'s own `MapData`/`Wall`
 * types rather than importing them: `game-protocol` has zero dependencies
 * (ADR-0001), and the wire format is allowed to diverge from the
 * server-side domain representation over time without that being a
 * protocol-version bump on its own.
 */
export interface RectWallDescriptor {
  readonly kind: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PolygonWallDescriptor {
  readonly kind: "polygon";
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

export type WallDescriptor = RectWallDescriptor | PolygonWallDescriptor;

export interface MapDescriptor {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly walls: readonly WallDescriptor[];
}
