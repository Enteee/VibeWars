/**
 * Wire vocabulary shared by the browser client and the authoritative server.
 */

/** What a client is told when its `protocolVersion` does not match. */
export const PROTOCOL_MISMATCH_MESSAGE =
  "This tab is running an outdated version of VibeWars. Reload the page.";

/**
 * The error code of a room the server would not create because it holds as
 * many as it can (#114). Matchmaking hands it to the client with
 * `SERVER_FULL_MESSAGE`. An HTTP status, because Colyseus answers the
 * matchmaking request with the error's code as its status: 503, Service
 * Unavailable, which a full server is.
 */
export const ROOM_LIMIT = 503;

/** What a player is told when the server holds all the rooms it can. */
export const SERVER_FULL_MESSAGE = "The server is full. Try again in a minute.";

/**
 * The error code of a join refused because the server holds as many
 * players as it can (#265). Told on the socket, after matchmaking, so it
 * need not be an HTTP status; the player sees `SERVER_FULL_MESSAGE`.
 */
export const CLIENT_LIMIT = 4503;

/**
 * The error code of a matchmaking request refused because one network
 * address sent too many at once (#265, #282). An HTTP status, 429 Too Many
 * Requests, because the HTTP gate answers the request with it; the player
 * sees `RATE_LIMIT_MESSAGE`.
 */
export const RATE_LIMIT = 429;

/** What a player is told when their network sent too many requests at once. */
export const RATE_LIMIT_MESSAGE = "Too many requests from your network. Try again in a moment.";

/**
 * The error code of a join refused because one network address holds too
 * many sockets (#265). Told on the socket, after matchmaking, like
 * `CLIENT_LIMIT`, so it need not be an HTTP status.
 */
export const ADDRESS_LIMIT = 4429;

/** What a player is told when their network address is over its share. */
export const ADDRESS_LIMIT_MESSAGE =
  "Too many connections from your network. Close other VibeWars tabs and try again.";

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

/** Options a client passes when creating or joining a match room. */
export interface MatchJoinOptions {
  /** Must equal `PROTOCOL_VERSION`, or the join is refused. */
  readonly protocolVersion: string;
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
  readonly protocolVersion: string;
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

/** Host-only: start the lobby's match. Carries nothing. */
export type LobbyStartMatchMessage = Record<string, never>;

/** Sent as `"start-rejected"` to the host alone when the match cannot start. */
export interface LobbyStartRejectedMessage {
  /** Why, in words the host is shown as they are. */
  readonly reason: string;
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

/* -------------------------------------------------------------------------- */
/* Server -> client                                                            */
/* -------------------------------------------------------------------------- */

/** Sent once on join, before any state patch. */
export interface ServerHello {
  /** `PROTOCOL_VERSION`. */
  readonly protocolVersion: string;
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
 * Sent as `"skill-bar"` on join: the bar the server resolved for
 * this player, every slot in its place, `null` where it is empty (#347).
 */
export interface SkillBarMessage {
  readonly slots: readonly (SkillBarSlot | null)[];
  /**
   * Attribute id to effective rank, as the server resolved the build,
   * house loadout included: what the HUD's tooltips describe (#485).
   */
  readonly ranks: Readonly<Record<string, number>>;
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

/** Broadcast as `"match-ended"`, once, when the match finishes. */
export interface MatchEndedMessage {
  /** The winning team, or `null` for a draw. */
  readonly winningTeam: number | null;
  readonly reason: "score" | "time" | null;
  readonly scoreTeam0: number;
  readonly scoreTeam1: number;
}

/* -------------------------------------------------------------------------- */
/* The message tables                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What a client may send, by message name, to its payload. Both sides send
 * through helpers typed by these tables, never a raw `send("name", ...)`,
 * so the wire schema snapshot that hashes them is what really crosses the
 * socket (#303). The server still parses every client payload as
 * `unknown` (brief §32); this says what a well-formed one is.
 */
export interface ClientMessages {
  readonly intent: ClientIntent;
  readonly "choose-team": LobbyChooseTeamMessage;
  readonly ready: LobbyReadyMessage;
  readonly "select-map": LobbySelectMapMessage;
  readonly "start-match": LobbyStartMatchMessage;
}

/** What the server sends, by message name, to its payload; `Event` as in `CombatMessage`. */
export interface ServerMessages<Event> {
  readonly hello: ServerHello;
  readonly map: MapDescriptor;
  readonly "skill-bar": SkillBarMessage;
  readonly recharge: RechargeMessage;
  readonly "cast-refused": CastRefusedMessage;
  readonly combat: CombatBatchMessage<Event>;
  readonly "match-ended": MatchEndedMessage;
  readonly "match-starting": LobbyMatchStartingMessage;
  readonly "start-rejected": LobbyStartRejectedMessage;
}
