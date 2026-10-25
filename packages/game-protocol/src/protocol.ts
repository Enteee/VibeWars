/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/**
 * Bumped whenever the wire format changes incompatibly. Every client sends
 * it as `protocolVersion` on every create and join, and both rooms refuse a
 * join whose value is absent or different (`PROTOCOL_MISMATCH_MESSAGE`), so
 * a stale browser tab fails loudly at join time instead of desynchronising
 * mid-match. It only ever rejects; there is no code path per version
 * (ADR-0016).
 */
export const PROTOCOL_VERSION = 6 as const;

/** What a client is told when its `protocolVersion` does not match. */
export const PROTOCOL_MISMATCH_MESSAGE =
  "This tab is running an outdated version of VibeWars. Reload the page.";

/**
 * Colyseus room name for the match simulation room.
 *
 * Players normally arrive here from a lobby (`ROOM_LOBBY`), but joining
 * `ROOM_MATCH` directly is also a supported path: it is Quick Match, a
 * deliberate product feature for jumping straight into an arena. That is
 * why the room starts moving players immediately rather than waiting in a
 * staging state.
 */
export const ROOM_MATCH = "match" as const;

/**
 * Colyseus room name for the pre-match lobby (brief §25).
 *
 * The lobby is where a host creates a game, shares its code, and players
 * gather, pick teams and ready up before the match starts. Lobby state is
 * server-owned and volatile: when the server restarts, lobbies are gone,
 * which is intentional (brief §3).
 */
export const ROOM_LOBBY = "lobby" as const;

/** Lobby phases, in order. A lobby only ever moves forward through these. */
export type LobbyPhase = "waiting" | "starting" | "in-match";

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
 * Attack `targetId` with the equipped weapon until told otherwise: walk
 * into reach, then swing (#160). Moving, `CancelAttackIntent` or the
 * target dying ends it.
 */
export interface AttackIntent {
  readonly kind: "attack";
  readonly targetId: string;
}

/** Stop the attack in progress, if there is one. */
export interface CancelAttackIntent {
  readonly kind: "cancel-attack";
}

/**
 * Sent as `"cast-refused"` to the caster alone when the server turns down a
 * `UseSkillIntent` or an `AttackIntent`, so a key that did nothing can say
 * why (issue #51). Advisory only: the refusal has already happened, and
 * nothing about the match state rides on this message.
 */
export type CastRefusedMessage =
  | {
      readonly kind: "skill";
      /** The slot the client asked for. */
      readonly slot: number;
      readonly skillId: string;
      /** game-core's `ActivationRejection`, e.g. `"out-of-range"`. */
      readonly reason: string;
    }
  | {
      readonly kind: "attack";
      /** Why the attack was refused, from the same vocabulary. */
      readonly reason: string;
    };

/** One recharging slot of a `RechargeMessage`. */
export interface RechargeSlot {
  readonly slot: number;
  readonly remainingSeconds: number;
  /** What the recharge started with, so a modified one still draws a true wipe. */
  readonly totalSeconds: number;
}

/**
 * Sent as `"recharge"` to one player alone: their own recharges are
 * nobody else's business, so they never ride the shared state (#152). A
 * full replacement list; a slot absent from it is ready. Sent on join and
 * whenever the recharges change in a way the client cannot predict by
 * counting down; the countdown itself is the client's to extrapolate.
 */
export interface RechargeMessage {
  readonly slots: readonly RechargeSlot[];
}

/** Options a client passes when creating or joining a match room. */
export interface MatchJoinOptions {
  /** Must equal `PROTOCOL_VERSION`, or the join is refused. */
  readonly protocolVersion: number;
  /** The arena the first joiner asks for; later joiners get the room's. */
  readonly mapId?: string;
  /** Display name the player asks for; the server sanitises it. */
  readonly name?: string;
  /**
   * The build the player asks to play. Untyped on purpose: this package has
   * no game-core dependency, and the server parses and validates whatever
   * arrives before trusting any of it (brief §32).
   */
  readonly build?: unknown;
}

/* -------------------------------------------------------------------------- */
/* Lobby messages                                                              */
/* -------------------------------------------------------------------------- */

/** Options a client passes when creating or joining a lobby. */
export interface LobbyJoinOptions {
  /** Must equal `PROTOCOL_VERSION`, or the join is refused. */
  readonly protocolVersion: number;
  /** Omitted when creating; required (and validated) when joining. */
  readonly code?: string;
  /** Display name the player asks for; the server sanitises it. */
  readonly name?: string;
  /**
   * The build this player will ask to play when the lobby's match starts.
   * The lobby joins the match on the player's behalf, so the build
   * travels with them here, untyped for the same reason as in
   * `MatchJoinOptions`.
   */
  readonly build?: unknown;
}

/** Pick a team slot, or `null` to become a spectator. */
export interface LobbyChooseTeamMessage {
  readonly team: number | null;
}

/** Toggle this player's ready state. */
export interface LobbyReadyMessage {
  readonly ready: boolean;
}

/** Host-only: change which map the match will use. */
export interface LobbySelectMapMessage {
  readonly mapId: string;
}

/**
 * Sent to each player on a team, and only to them, when the host starts
 * the match. Spectators get nothing and stay in the lobby.
 */
export interface LobbyMatchStartingMessage {
  readonly mapId: string;
  /** This player's seat, reserved by the lobby. Never shared with anyone else. */
  readonly reservation: MatchSeatReservation;
}

/**
 * A seat the server reserved in a match room, as Colyseus describes it;
 * a client takes it with `consumeSeatReservation`. Opaque to the game.
 */
export interface MatchSeatReservation {
  readonly name: string;
  readonly roomId: string;
  readonly sessionId: string;
  readonly processId?: string;
  readonly publicAddress?: string;
  readonly devMode?: boolean;
}

/** The maximum players a single lobby accepts (brief §4: not hardcoded to 8). */
export const MAX_LOBBY_PLAYERS = 16;

/** How many players one Quick Match room holds before a new one opens. */
export const QUICK_MATCH_MAX_PLAYERS = 8;

/**
 * Every message a client is allowed to send during a match.
 *
 * Deliberately a closed discriminated union: adding a new client capability
 * requires touching this type, which forces a protocol-version decision and a
 * server-side validator.
 */
export type ClientIntent =
  MoveIntent | StopIntent | TargetIntent | UseSkillIntent | AttackIntent | CancelAttackIntent;

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

  // Newer than the rest, and strict: nothing but the fields they name.
  if (
    record.kind === "attack" &&
    hasOnlyKeys(record, ["kind", "targetId"]) &&
    typeof record.targetId === "string" &&
    record.targetId !== ""
  ) {
    return { kind: "attack", targetId: record.targetId };
  }

  if (record.kind === "cancel-attack" && hasOnlyKeys(record, ["kind"])) {
    return { kind: "cancel-attack" };
  }

  return undefined;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
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
