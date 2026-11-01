/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/** What a client is told when its `protocolVersion` does not match. */
export const PROTOCOL_MISMATCH_MESSAGE =
  "This tab is running an outdated version of VibeWars. Reload the page.";

/** Lobby phases, in order. A lobby only ever moves forward through these. */
export type LobbyPhase = "waiting" | "team-lobby" | "queued" | "starting" | "in-match";

/**
 * What a lobby is for (#1526, ADR-0041): the mode its host picked on the
 * rail, which every member's rail follows. The rail's order.
 */
export const LOBBY_MODES = [
  "random-arena",
  "team-arena",
  "heroes-ascent",
  "gvg",
  "hosted-game",
] as const;

export type LobbyMode = (typeof LOBBY_MODES)[number];

/**
 * A lobby key is a secret (#2100, ADR-0048): 32 random bytes written as
 * base64url without padding, 43 case-sensitive characters, 2²⁵⁶ keys.
 * Nobody types or reads it: it travels only inside an invite URL
 * (`#lobby=<key>`), and relays see only a derivation of it, never the key.
 */
export const LOBBY_CODE_LENGTH = 43;

/**
 * The lobby key's derivation (ADR-0048): HKDF-SHA-256 over the key's
 * bytes with this fixed salt, so one key names one room for every peer.
 * Part of the protocol: changing it moves every room.
 */
export const LOBBY_KEY_SALT = "vibewars-lobby-key";

/**
 * 43 base64url characters. The last one holds the final 4 bits and 2 zero
 * padding bits, so each key has exactly one spelling.
 */
const LOBBY_CODE_PATTERN = new RegExp(
  `^[A-Za-z0-9_-]{${String(LOBBY_CODE_LENGTH - 1)}}[AEIMQUYcgkosw048]$`,
);

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
 * End an enchantment the sender maintains (#838): a double-click on its
 * icon in the effects monitor. The caster is the sender, never a field;
 * the host refuses quietly anything that is not theirs to end.
 */
export interface EndUpkeepIntent {
  readonly kind: "end-upkeep";
  readonly targetId: string;
  /** The status id, e.g. `"mending"`. */
  readonly status: string;
}

/**
 * Swap to weapon set `set` (#489), numbered 0-3 for F1-F4: at once, or
 * queued behind a cast, an aftercast, a swing or a knockdown. An empty
 * set is refused quietly, as GW1 says nothing for one.
 */
export interface WeaponSetIntent {
  readonly kind: "weapon-set";
  readonly set: 0 | 1 | 2 | 3;
}

/** Drop the flag carried where you stand (#1225): GW1's Drop button. */
export interface DropBundleIntent {
  readonly kind: "drop-bundle";
}

/** How a companion fights (#1110, GW1 pet control): Guard is the default. */
export type CompanionMode = "guard" | "fight" | "heel";
export const COMPANION_MODES: readonly CompanionMode[] = ["guard", "fight", "heel"];

/** What an owner may tell a creature of theirs (#1046). NPC heroes add `{ kind: "flag"; x; y }`. */
export interface CreatureOrder {
  readonly kind: "mode";
  readonly mode: CompanionMode;
}

/**
 * Command `creatureId`, which must be the sender's own companion (#1110):
 * the host drops anything else quietly, as it does `end-upkeep`.
 */
export interface CommandIntent {
  readonly kind: "command";
  readonly creatureId: string;
  readonly order: CreatureOrder;
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
  /**
   * The slots spent until a morale boost (#474): Resurrection Signet's,
   * used and not recharging by time. A slot may be here and in `slots`,
   * disabled too, and waits for both.
   */
  readonly spent: readonly number[];
  /**
   * The slot pressed during an activation or an aftercast and waiting to
   * go next (#1722), `null` for none: what the bar pulses.
   */
  readonly queued: number | null;
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

/** A dagger chain mark's place in its chain (#831), as game-core's `ChainRole`. */
export const CHAIN_ROLES = ["lead", "off-hand", "dual"] as const;

export type WireChainRole = (typeof CHAIN_ROLES)[number];

/** One chain mark a player left on one target (#916). */
export interface WireChainMark {
  readonly targetId: string;
  readonly role: WireChainRole;
  /** Seconds from this message's arrival until it runs out, counted down like a recharge. */
  readonly remainingSeconds: number;
}

/**
 * Sent as `"chain"` to one player alone (#916): the chain marks they
 * placed, a full replacement list; a target absent from it bears none of
 * theirs. Sent on join and rejoin, and whenever the marks change in a way
 * the client cannot predict by counting down: a new mark, a new role, a
 * refresh, or one gone early with a death.
 */
export interface ChainMarksMessage {
  readonly marks: readonly WireChainMark[];
}

/** The maximum players a single lobby accepts (brief §4: not hardcoded to 8). */
export const MAX_LOBBY_PLAYERS = 16;

/**
 * The most a side of a Team Lobby (#1458) may be, humans and bots: a GW1
 * team. It bounds what one side's proposals put on the wire.
 */
export const MAX_TEAM_LOBBY_SIDE = 8;

/** How long each stage of a Team Lobby (#1458) lasts, on the lobby's clock. */
export const TEAM_LOBBY_STAGE_SECONDS = 60;

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
  | WalkToIntent
  | EndUpkeepIntent
  | WeaponSetIntent
  | DropBundleIntent
  | CommandIntent;

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

  if (record.kind === "drop-bundle" && hasOnlyKeys(record, ["kind"])) {
    return { kind: "drop-bundle" };
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

  if (
    record.kind === "end-upkeep" &&
    hasOnlyKeys(record, ["kind", "targetId", "status"]) &&
    isIntentId(record.targetId) &&
    isIntentId(record.status)
  ) {
    return { kind: "end-upkeep", targetId: record.targetId, status: record.status };
  }

  if (
    record.kind === "weapon-set" &&
    hasOnlyKeys(record, ["kind", "set"]) &&
    isWeaponSetNumber(record.set)
  ) {
    return { kind: "weapon-set", set: record.set };
  }

  if (
    record.kind === "command" &&
    hasOnlyKeys(record, ["kind", "creatureId", "order"]) &&
    isIntentId(record.creatureId)
  ) {
    const order = parseCreatureOrder(record.order);
    if (order !== undefined) {
      return { kind: "command", creatureId: record.creatureId, order };
    }
  }

  return undefined;
}

/** The longest id an intent may name: as long as any string on the wire (`MAX_WIRE_STRING`). */
const MAX_INTENT_ID = 64;

function isIntentId(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value.length <= MAX_INTENT_ID;
}

function isWeaponSetNumber(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).every((key) => keys.includes(key));
}

function parseCreatureOrder(value: unknown): CreatureOrder | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const order = value as Record<string, unknown>;
  const mode = COMPANION_MODES.find((known) => known === order.mode);
  return order.kind === "mode" && hasOnlyKeys(order, ["kind", "mode"]) && mode !== undefined
    ? { kind: "mode", mode }
    : undefined;
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
  /**
   * Match clock (`elapsedSeconds`) at which the echo's copy standing in
   * this slot ends (#1154), rounded to 0.1 s; `null` for a build slot.
   */
  readonly copyEndsAt: number | null;
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
