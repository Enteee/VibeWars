/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/** What a client is told when its `protocolVersion` does not match. */
export const PROTOCOL_MISMATCH_MESSAGE =
  "This tab is running an outdated version of VibeWars. Reload the page.";

/** Lobby phases, in order. A lobby only ever moves forward through these. */
export type LobbyPhase = "waiting" | "starting" | "in-match";

/**
 * Lobby codes are read aloud across a room at a LAN party, so the alphabet
 * excludes characters that are easy to mishear or misread:
 * `0`/`O`, `1`/`I`/`L`, `2`/`Z`, `5`/`S`, `8`/`B`, `U`/`V`.
 */
export const LOBBY_CODE_ALPHABET = "ACDEFGHJKMNPQRTWXY34679";

/**
 * In peer-to-peer play the code is both the room on public relays and its
 * password (#15, #379): 23⁴ ≈ 280 k codes can be enumerated, 23⁶ ≈ 148 M
 * are not worth the trouble. Shown as `ABC-DEF`; `normalizeLobbyCode`
 * strips the dash.
 */
export const LOBBY_CODE_LENGTH = 6;

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
 * into reach, then swing (#160). Moving, `CancelIntent` or the
 * target dying ends it.
 */
export interface AttackIntent {
  readonly kind: "attack";
  readonly targetId: string;
}

/**
 * Cancel Action, Esc in GW1 (#300): stop the cast and the attack in
 * progress, whichever are running.
 */
export interface CancelIntent {
  readonly kind: "cancel";
}

/**
 * Walk to a point on the ground, round walls, and stop there (#310): a
 * left-click on the ground. In world units. Any finite point is a fair
 * request: the server walks to the nearest spot on the map a body fits
 * on, since only it knows the map.
 */
export interface WalkToIntent {
  readonly kind: "walk-to";
  readonly x: number;
  readonly y: number;
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

/**
 * Sent as `"adrenaline"` to one player alone (#463): their own adrenaline
 * is nobody else's business, as GW1 shows no foe's. Units per bar slot,
 * 0 for an empty or non-adrenaline slot. Sent on join, rejoin and reset,
 * whenever it changes, and whenever the out-of-combat window starts again
 * while any slot holds some (#828).
 */
export interface AdrenalineMessage {
  readonly slots: readonly number[];
  /**
   * Seconds from this message's arrival until every slot empties out of
   * combat (#828), counted down like a recharge; `null` when every slot is
   * already empty.
   */
  readonly lossInSeconds: number | null;
}

/** The maximum players a single lobby accepts (brief §4: not hardcoded to 8). */
export const MAX_LOBBY_PLAYERS = 16;

/**
 * Every message a client is allowed to send during a match.
 *
 * Deliberately a closed discriminated union: adding a new client capability
 * requires touching this type, which forces a protocol-version decision and a
 * server-side validator.
 */
export type ClientIntent =
  | MoveIntent
  | StopIntent
  | TargetIntent
  | UseSkillIntent
  | AttackIntent
  | CancelIntent
  | WalkToIntent;

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

  if (record.kind === "cancel" && hasOnlyKeys(record, ["kind"])) {
    return { kind: "cancel" };
  }

  if (
    record.kind === "walk-to" &&
    hasOnlyKeys(record, ["kind", "x", "y"]) &&
    typeof record.x === "number" &&
    typeof record.y === "number" &&
    Number.isFinite(record.x) &&
    Number.isFinite(record.y)
  ) {
    return { kind: "walk-to", x: record.x, y: record.y };
  }

  return undefined;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
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

/** One slot of a `SkillBarMessage`: what the HUD needs to draw it. */
export interface SkillBarSlot {
  readonly id: string;
  readonly name: string;
  readonly energyCost: number;
  readonly adrenalineCost: number;
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
}

/**
 * One resolution in a `"combat"` batch: a cast, a status tick or a
 * weapon swing, and everything it did. Generic over the event so this
 * package stays dependency-free; the server and the client both
 * instantiate it with game-core's `CombatEvent`.
 */
export interface CombatMessage<Event> {
  readonly casterSessionId: string;
  /** What this was. Read this, never `skillId === ""`, to tell them apart. */
  readonly cause: "skill" | "weapon" | "degeneration" | "attribute";
  /** The skill, when `cause` is `"skill"`; `""` otherwise. */
  readonly skillId: string;
  /** The weapon, when `cause` is `"weapon"`; `""` otherwise (#162). */
  readonly weaponId: string;
  /** The primary attribute, when `cause` is `"attribute"`; `""` otherwise (#633). */
  readonly attributeId: string;
  /** Where an area skill landed, and how far it reached (#5). */
  readonly area?: { readonly x: number; readonly y: number; readonly radius: number };
  /** A weapon swing that struck twice (#561); `false` on everything else. */
  readonly doubleStrike: boolean;
  readonly events: readonly Event[];
}

/** What one `"combat"` broadcast carries: a tick's entries, in combat-log order (#288). */
export interface CombatBatchMessage<Event> {
  readonly entries: readonly CombatMessage<Event>[];
}
