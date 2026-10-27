/**
 * The peer-to-peer match messages (#15, #82): what a host and its clients
 * say to each other over a `Transport`, one channel per message.
 *
 * Everything that arrives is `unknown` until a `parse*` below accepts it.
 * That holds for clients too: the host is trusted for outcomes, not for
 * well-formed bytes. Each parser returns a fresh object holding only the
 * fields it knows, so unknown fields are ignored rather than rejected, and
 * returns `undefined` for anything malformed, never throwing. Every field
 * is present: an empty value is `null`, never absent, so a message
 * survives a JSON round trip unchanged.
 */

import type {
  CastRefusedMessage,
  MapDescriptor,
  AdrenalineMessage,
  RechargeMessage,
  RechargeSlot,
  SkillBarSlot,
  WallDescriptor,
} from "./protocol.js";
import { MAX_LOBBY_PLAYERS, type LobbyPhase } from "./protocol.js";

/**
 * The channels a lobby and its match use. Trystero caps an action name at
 * 32 bytes (#16), so each fits.
 */
export const CHANNELS = [
  "hello",
  "welcome",
  "refuse",
  "intent",
  "snapshot",
  "combat",
  "refused",
  "skill-bar",
  "recharge",
  "adrenaline",
  "ended",
  "bye",
  "lobby-join",
  "lobby-state",
  "lobby-cmd",
  "lobby-note",
  "match-start",
  "rejoin-challenge",
  "rejoin-proof",
  "call",
  "calls",
  "chat",
  "chat-line",
] as const;

export type Channel = (typeof CHANNELS)[number];

/** The longest id, name or reason a message may carry. */
export const MAX_WIRE_STRING = 64;

/** The longest sentence a player is shown, such as a refusal's `message`. */
export const MAX_WIRE_TEXT = 256;

/** The most statuses one player carries in a snapshot. */
export const MAX_WIRE_STATUSES = 32;

/**
 * The largest status index a snapshot may carry (#632): a bound of its
 * own, so this package needs no status catalogue.
 */
export const MAX_WIRE_STATUS_INDEX = 1023;

/** The most events one combat message carries. */
export const MAX_WIRE_EVENTS = 64;

/** The most slots a skill bar or a recharge list holds. */
export const MAX_WIRE_SLOTS = 8;

/** The most attributes a skill bar's ranks name. */
export const MAX_WIRE_RANKS = 16;

/** The highest rank an attribute reaches, runes included (game-core's MAX_EFFECTIVE_RANK). */
export const MAX_WIRE_RANK = 15;

/** The most pings a team's calls carry at once, the newest kept (#443). */
export const MAX_WIRE_PINGS = 32;

/** The most graphemes a chat line keeps (#479); the host cuts the rest. */
export const MAX_CHAT_GRAPHEMES = 200;

/**
 * The longest chat text on the wire, in UTF-16 units (#479): room for
 * `MAX_CHAT_GRAPHEMES` of nearly anything. Longer is malformed and
 * dropped whole; the host's clamp is what keeps a line short. Small
 * enough that a line of control characters, six bytes each once
 * JSON-escaped, still fits one message (#403).
 */
export const MAX_WIRE_CHAT_TEXT = 2048;

/** The most net pips either way (game-core's MAX_PIPS, #504). */
export const MAX_WIRE_PIPS = 10;

/** Morale's range, in percent (game-core's MORALE_FLOOR and MORALE_CEILING, #843). */
export const MIN_WIRE_MORALE = -60;
export const MAX_WIRE_MORALE = 10;

/** The most walls a map holds, and points a polygon wall holds. */
export const MAX_WIRE_WALLS = 1024;
export const MAX_WIRE_POINTS = 256;

/** The widest area a combat message may draw. */
export const MAX_WIRE_RADIUS = 200;

/** The most combat entries one tick's `"combat"` message carries. */
export const MAX_WIRE_COMBATS = 64;

/** The most shots in flight one snapshot carries. */
export const MAX_WIRE_PROJECTILES = 256;

/** The most `"snapshot"` messages one tick's snapshot is split into (#662). */
export const MAX_SNAPSHOT_PARTS = 8;

/**
 * The deepest nesting, and the most values in all, an opaque JSON field
 * such as a hello's build may hold. A real build is a few levels deep and
 * a few hundred values; past either, a peer is attacking the parser.
 */
export const MAX_WIRE_JSON_DEPTH = 16;
export const MAX_WIRE_JSON_VALUES = 4096;

/**
 * Plain JSON: what every message on a `Transport` is (#16). A value that
 * is not, such as `undefined` or a `Map`, would not survive the trip.
 */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** A rejoin token, or a rejoin challenge's nonce: 128 random bits, as 32 lowercase hex digits. */
const REJOIN_TOKEN = /^[0-9a-f]{32}$/;

/** A rejoin proof: an HMAC-SHA-256, as 64 lowercase hex digits. */
const REJOIN_PROOF = /^[0-9a-f]{64}$/;

/** Client to host, first: who is joining, and with what build. */
export interface PeerHello {
  /** `PROTOCOL_VERSION`; the host refuses any other, so it is not checked here. */
  readonly protocolVersion: string;
  /**
   * As the player typed it, cut to `MAX_WIRE_TEXT`: the host sanitises
   * it, so a long one is shortened rather than refused.
   */
  readonly name: string;
  /** Opaque here: the host validates it by the build-join rules. */
  readonly build: JsonValue;
  /**
   * The seat this peer held before it dropped; `null` for a fresh join. A
   * peer id lasts one page load, so this is how a returning player is
   * known. It carries no token: the host answers with a
   * `PeerRejoinChallenge`, and the token never leaves the guest (#593).
   */
  readonly rejoin: { readonly playerId: string } | null;
}

/** Host to a peer asking for a held seat back: prove it with this nonce. */
export interface PeerRejoinChallenge {
  readonly playerId: string;
  /** 128 fresh random bits, as 32 lowercase hex digits. */
  readonly nonce: string;
}

/** Peer to host: the answer to a `PeerRejoinChallenge`. */
export interface PeerRejoinProof {
  readonly playerId: string;
  /**
   * HMAC-SHA-256 keyed by the seat's rejoin token over the nonce, the
   * player id and the peer's own id (`rejoinProof` in game-session), as
   * 64 lowercase hex digits.
   */
  readonly proof: string;
}

/** Host to one client: it is in, as `playerId`, on `map`. */
export interface PeerWelcome {
  readonly protocolVersion: string;
  readonly playerId: string;
  /** What this peer proves it holds to take its seat back after a drop; never sent back. */
  readonly rejoinToken: string;
  readonly tickIntervalMs: number;
  /**
   * The match time it was sent at: the client's clock until its first
   * snapshot, so a recharge told along with it counts down from now, not
   * from the start of the match.
   */
  readonly elapsedSeconds: number;
  readonly map: MapDescriptor;
}

/** Host to one client: it is not in, and why. */
export interface PeerRefuse {
  readonly reason: "protocol-mismatch" | "match-full" | "match-over";
  /** What the player is shown. */
  readonly message: string;
}

/**
 * One player as a snapshot carries it. Every field of the client's
 * `PlayerSnapshot` has one here, `undefined` there being `null` here: a
 * client builds the one from the other, and a test holds the two key sets
 * together, so a field added to one cannot be forgotten in the other.
 */
export interface WirePlayer {
  readonly id: string;
  readonly name: string;
  readonly team: 0 | 1;
  readonly x: number;
  readonly y: number;
  /** Radians, `atan2` convention, 0 = +x (#187). */
  readonly facing: number;
  readonly targetId: string | null;
  /** Who this player is attacking with their weapon (#160). */
  readonly attackTargetId: string | null;
  /** Walking to a clicked point (#310, #342), or in to cast a skill pressed out of range (#499). */
  readonly walking: boolean;
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  /** Maximum energy lost to overcast (#461); energy fills to `maxEnergy − overcast`. */
  readonly overcast: number;
  /** Morale in percent (#843): an integer in [`MIN_WIRE_MORALE`, `MAX_WIRE_MORALE`]. */
  readonly morale: number;
  readonly armor: number;
  readonly weaponId: string | null;
  readonly offhandId: string | null;
  readonly primaryProfession: string | null;
  readonly secondaryProfession: string | null;
  readonly dead: boolean;
  readonly castingSkillId: string | null;
  readonly castRemaining: number;
  /** The current cast's whole length, dazed included; 0 when not casting. */
  readonly castTotal: number;
  /** Seconds left lying down from a knockdown (#468); 0 standing. */
  readonly knockdownRemaining: number;
  /**
   * Net health and energy regeneration (+) or degeneration (−), in pips,
   * as the host applies them (#504): integers in ±`MAX_WIRE_PIPS`, 0 dead.
   */
  readonly healthPips: number;
  readonly energyPips: number;
  /**
   * The swing under way (#560): seconds into it, and its whole length, the
   * hit landing at the end. `swingTotal` is 0 when not attacking. The
   * weapon mark's pose follows them; nothing is predicted.
   */
  readonly swingElapsed: number;
  readonly swingTotal: number;
  /** Its statuses, in the order applied, oldest first (#803). */
  readonly statuses: readonly WireStatus[];
}

/** One status on a player (#803): what the effects monitor draws. */
export interface WireStatus {
  /**
   * Its index in the sorted status-id table (#632), which
   * `wire-schema.json` carries, so a build with another table is refused
   * at join.
   */
  readonly status: number;
  /**
   * Match clock (`elapsedSeconds`) at which it runs out, rounded to 0.1 s;
   * `null` for a maintained enchantment (#837), which has no end.
   */
  readonly endsAt: number | null;
  /**
   * The length of the application that set it, rounded to 0.1 s; > 0.
   * `null` exactly when `endsAt` is.
   */
  readonly durationSeconds: number | null;
  /** Who applied it. */
  readonly casterId: string;
}

/** A ranged weapon's shot in flight, from `from` to `to` over `flightSeconds` from `launchedAt` (#160). */
export interface WireProjectile {
  readonly id: number;
  readonly attackerId: string;
  /**
   * The spell it carries (#535); `null` for a weapon's shot, which is
   * drawn from its shooter's weapon. Once weapons swap mid-match (#489),
   * an arrow in flight takes the new weapon's sprite; that is acceptable.
   */
  readonly skillId: string | null;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  /** The match clock (`elapsedSeconds`) at release. */
  readonly launchedAt: number;
  readonly flightSeconds: number;
}

/**
 * The whole match at one tick, not a delta: what a client assembles from
 * that tick's `WireSnapshotPart`s. Never sent as it is.
 */
export interface WireSnapshot {
  /** Only ever grows; a client drops a snapshot whose tick is not above the last it kept. */
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly score: readonly [number, number];
  readonly phase: "active" | "finished";
  readonly winningTeam: 0 | 1 | null;
  readonly endReason: "score" | "time" | null;
  readonly players: readonly WirePlayer[];
  /** Oldest first. */
  readonly projectiles: readonly WireProjectile[];
}

/**
 * Host to every client, each tick: one of the `parts` a `WireSnapshot`
 * is split into so that each fits one Trystero frame (#662). Every part
 * repeats the header; `players` and `projectiles` are this part's run of
 * the whole lists, players first, in order.
 */
export interface WireSnapshotPart extends WireSnapshot {
  /** Which part this is, from 0. */
  readonly part: number;
  /** How many parts this tick's snapshot has, 1 to `MAX_SNAPSHOT_PARTS`. */
  readonly parts: number;
}

/** One thing a combat resolution did, flattened so this package needs no game-core. */
export interface WireCombatEvent {
  readonly kind: string;
  readonly targetId: string | null;
  readonly amount: number | null;
  /** The skill an interrupt or a cancel cut short. */
  readonly skillId: string | null;
  /** The status applied, removed or expired. */
  readonly statusId: string | null;
  /**
   * How long an applied status or a knockdown lasts; `null` too for a
   * maintained enchantment applied (#837), which lasts until ended.
   */
  readonly durationSeconds: number | null;
  /**
   * Whether a damage event was a critical hit (#533); `null` for any other
   * kind. Short because every event carries it, and the worst-case combat
   * batch must fit in one message.
   */
  readonly crit: boolean | null;
  /**
   * Whom a spreading status was caught from (#765), or who could not pay
   * a maintained enchantment's upkeep (#837); `null` for any other kind.
   */
  readonly fromId: string | null;
  /**
   * The share of maximum energy a resurrection gives back, 0..1 (#812),
   * its health share riding in `amount`; `null` for any other kind.
   */
  readonly energy: number | null;
}

/** One cast, swing or status tick, and what it did. */
export interface WireCombat {
  readonly casterId: string;
  readonly cause: "skill" | "weapon" | "degeneration" | "attribute";
  /** The skill, when `cause` is `"skill"`; `""` otherwise. */
  readonly skillId: string;
  /** The weapon, when `cause` is `"weapon"`; `""` otherwise. */
  readonly weaponId: string;
  /** The primary attribute, when `cause` is `"attribute"`; `""` otherwise (#633). */
  readonly attributeId: string;
  /** Where an area skill landed, and how far it reached (#5). */
  readonly area: { readonly x: number; readonly y: number; readonly radius: number } | null;
  /** A weapon swing that struck twice, so the off hand stabs too (#561); `false` otherwise. */
  readonly doubleStrike: boolean;
  readonly events: readonly WireCombatEvent[];
}

/**
 * Host to one client: its bar, every slot in its place, `null` where empty
 * (#347). On welcome, and again on the tick a slot changes, such as a cost
 * a glyph lowers (#637).
 */
export interface WireSkillBar {
  readonly slots: readonly (SkillBarSlot | null)[];
  /** Attribute id to effective rank, as the host resolved the build (#485). */
  readonly ranks: Readonly<Record<string, number>>;
}

/**
 * Host to every client, each tick that logged anything: that tick's
 * entries, in combat-log order (#288).
 */
export type WireCombatBatch = readonly WireCombat[];

/**
 * Client to host, last: the player meant to go, so the seat is freed at
 * once. A peer that drops without it keeps its seat for the reconnect
 * window.
 */
export type PeerBye = Readonly<Record<string, never>>;

/**
 * Client to host (#443): call a foe for your team, or ping a spot. Not a
 * `ClientIntent`: it changes nothing in the simulation, only what your
 * team is shown.
 */
export type PeerCall =
  | { readonly kind: "target"; readonly targetId: string }
  | { readonly kind: "ping"; readonly x: number; readonly y: number };

/** One ping, as its team is shown it. */
export interface WirePing {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Who pinged. */
  readonly byId: string;
  /** Seconds left of it, when sent. */
  readonly remaining: number;
}

/**
 * Host to each seated peer of one team, never the other (#443): the foe
 * that team has called, if any, and its live pings, at most
 * `MAX_WIRE_PINGS`. Sent on the tick either changes (#730), and after a welcome.
 */
export interface WireCalls {
  readonly target: { readonly targetId: string; readonly callerId: string } | null;
  readonly pings: readonly WirePing[];
}

/** Who a chat line reaches (#479): everyone in the lobby, or your team. */
export const CHAT_CHANNELS = ["all", "team"] as const;

export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/**
 * Peer to its lobby host (#479), in the lobby and through its match: a
 * line for `channel`. Peers never send chat to each other; the host
 * checks, cleans and routes it.
 */
export interface PeerChat {
  readonly channel: ChatChannel;
  readonly text: string;
}

/**
 * Lobby host to each peer a line reaches, one send each, never a
 * broadcast (#479): team chat goes to that team alone. `name` and
 * `team` are the sender's as it was sent, so a line keeps them.
 */
export interface WireChatLine {
  readonly channel: ChatChannel;
  readonly fromId: string;
  readonly name: string;
  /** `null`: a spectator, who speaks on all chat only. */
  readonly team: 0 | 1 | null;
  readonly text: string;
}

/** Host to every client, once: the match is over. */
export interface WireEnded {
  readonly winningTeam: 0 | 1 | null;
  readonly endReason: "score" | "time" | "host-left";
}

/**
 * Peer to lobby host, first (#379): who is joining. Nothing a peer sends
 * before it is acted on. The build comes later, in the match `hello`.
 */
export interface PeerLobbyJoin {
  /** `PROTOCOL_VERSION`; the host refuses any other, so it is not checked here. */
  readonly protocolVersion: string;
  /** As the player typed it, cut to `MAX_WIRE_TEXT`; the host sanitises it. */
  readonly name: string;
  readonly character: WireLobbyCharacter | null;
}

/**
 * The character a lobby member brings (#580), for the others to see:
 * `null` is the house loadout. What it plays with is the match `hello`'s
 * build; this is only its name and professions.
 */
export interface WireLobbyCharacter {
  /** In a join, cut to `MAX_WIRE_TEXT`; the host sanitises it. */
  readonly name: string;
  /** A `ProfessionId`, which the host checks. */
  readonly primary: string;
  readonly secondary: string | null;
}

/** One lobby member, as `lobby-state` lists them. */
export interface WireLobbyPlayer {
  /** The member's peer id. */
  readonly id: string;
  readonly name: string;
  /** `null` spectates. */
  readonly team: 0 | 1 | null;
  readonly ready: boolean;
  /** The host's own player: the one who picks the map and starts. */
  readonly isHost: boolean;
  readonly character: WireLobbyCharacter | null;
}

/** Lobby host to every peer, on every change: the whole lobby, not a delta. */
export interface WireLobbyState {
  readonly code: string;
  readonly phase: LobbyPhase;
  readonly mapId: string;
  /** The peer every lobby and match message comes from. */
  readonly hostId: string;
  /** The match being played, while `phase` is not `"waiting"`. */
  readonly matchId: string | null;
  readonly players: readonly WireLobbyPlayer[];
}

/** Peer to lobby host: what the member asks for. The host decides. */
export type WireLobbyCommand =
  | { readonly kind: "choose-team"; readonly team: 0 | 1 | null }
  | { readonly kind: "ready"; readonly ready: boolean }
  | { readonly kind: "select-map"; readonly mapId: string }
  | { readonly kind: "start" };

/** Lobby host to one peer: a start it turned down, or a member it turned away. */
export interface WireLobbyNote {
  readonly kind: "start-rejected" | "refused" | "chat-throttled";
  /**
   * For `"start-rejected"`, the words the host is shown. For `"refused"`,
   * one of `LOBBY_REFUSALS`. For `"chat-throttled"` (#479), empty: this
   * peer's chat lines are being dropped, too many too fast.
   */
  readonly reason: string;
}

/** Why a lobby host turns a peer away, or sends everyone off. */
export const LOBBY_REFUSALS = ["protocol-mismatch", "lobby-full", "host-left"] as const;

export type LobbyRefusal = (typeof LOBBY_REFUSALS)[number];

/**
 * Lobby host to each seated peer, and only to them: the match is on, on
 * `mapId`. The peer then says `hello` to the host on the same transport.
 */
export interface WireMatchStart {
  readonly mapId: string;
  readonly matchId: string;
}

type Fields = Record<string, unknown>;

function fields(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function isString(value: unknown, max = MAX_WIRE_STRING): value is string {
  return typeof value === "string" && value.length <= max;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isPips(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && Math.abs(value) <= MAX_WIRE_PIPS;
}

function isMorale(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= MIN_WIRE_MORALE &&
    value <= MAX_WIRE_MORALE
  );
}

/** A skill-bar slot index. */
function isSlot(value: unknown): value is number {
  return isCount(value) && value < MAX_WIRE_SLOTS;
}

function isTeam(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value);
}

/**
 * Each element of `value` through `parse`, or `undefined` if `value` is not
 * an array of at most `max`, or any element fails.
 */
function parseArray<T>(
  value: unknown,
  max: number,
  parse: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value) || value.length > max) {
    return undefined;
  }
  const parsed: T[] = [];
  for (const item of value as unknown[]) {
    const one = parse(item);
    if (one === undefined) {
      return undefined;
    }
    parsed.push(one);
  }
  return parsed;
}

function parseStatus(value: unknown): WireStatus | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isCount(raw.status) ||
    raw.status > MAX_WIRE_STATUS_INDEX ||
    !isString(raw.casterId)
  ) {
    return undefined;
  }
  // Both times, or neither: a maintained enchantment's (#837).
  if (raw.endsAt === null && raw.durationSeconds === null) {
    return { status: raw.status, endsAt: null, durationSeconds: null, casterId: raw.casterId };
  }
  if (
    !isNumber(raw.endsAt) ||
    raw.endsAt < 0 ||
    !isNumber(raw.durationSeconds) ||
    raw.durationSeconds <= 0
  ) {
    return undefined;
  }
  return {
    status: raw.status,
    endsAt: raw.endsAt,
    durationSeconds: raw.durationSeconds,
    casterId: raw.casterId,
  };
}

function parseString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

function isRejoinToken(value: unknown): value is string {
  return typeof value === "string" && REJOIN_TOKEN.test(value);
}

function parseRejoin(value: unknown): PeerHello["rejoin"] | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined && isString(raw.playerId) ? { playerId: raw.playerId } : undefined;
}

/**
 * A copy of `value` if it is plain JSON: no `undefined`, no non-finite
 * number, no prototype other than an array's or an object's, at most
 * `MAX_WIRE_JSON_DEPTH` deep and `MAX_WIRE_JSON_VALUES` in all. Past
 * either it is `undefined`, never a thrown stack overflow.
 */
function parseJson(value: unknown): JsonValue | undefined {
  let budget = MAX_WIRE_JSON_VALUES;
  const parse = (item: unknown, depth: number): JsonValue | undefined => {
    budget -= 1;
    if (budget < 0) {
      return undefined;
    }
    if (item === null || typeof item === "boolean" || typeof item === "string") {
      return item;
    }
    if (typeof item === "number") {
      return Number.isFinite(item) ? item : undefined;
    }
    if (depth >= MAX_WIRE_JSON_DEPTH) {
      return undefined;
    }
    if (Array.isArray(item)) {
      const items: JsonValue[] = [];
      for (const element of item as unknown[]) {
        const one = parse(element, depth + 1);
        if (one === undefined) {
          return undefined;
        }
        items.push(one);
      }
      return items;
    }
    const raw = fields(item);
    if (raw === undefined || Object.getPrototypeOf(raw) !== Object.prototype) {
      return undefined;
    }
    const entries: [string, JsonValue][] = [];
    for (const [key, field] of Object.entries(raw)) {
      const one = parse(field, depth + 1);
      if (one === undefined) {
        return undefined;
      }
      entries.push([key, one]);
    }
    // Not `out[key] = one`: for a "__proto__" key, which JSON.parse makes
    // an own key, that runs the prototype setter and the key is lost.
    return Object.fromEntries(entries);
  };
  return parse(value, 0);
}

/**
 * The `protocolVersion` a hello or a lobby-join carries, read before the rest is parsed,
 * so a client of another version is told so whatever else it sent.
 */
export function helloProtocolVersion(value: unknown): string | undefined {
  return parseString(fields(value)?.protocolVersion);
}

export function parsePeerHello(value: unknown): PeerHello | undefined {
  const raw = fields(value);
  if (raw === undefined || !isString(raw.protocolVersion) || typeof raw.name !== "string") {
    return undefined;
  }
  const build = parseJson(raw.build);
  const rejoin = parseRejoin(raw.rejoin);
  return build === undefined || rejoin === undefined
    ? undefined
    : {
        protocolVersion: raw.protocolVersion,
        name: raw.name.slice(0, MAX_WIRE_TEXT),
        build,
        rejoin,
      };
}

export function parsePeerRejoinChallenge(value: unknown): PeerRejoinChallenge | undefined {
  const raw = fields(value);
  return raw !== undefined && isString(raw.playerId) && isRejoinToken(raw.nonce)
    ? { playerId: raw.playerId, nonce: raw.nonce }
    : undefined;
}

export function parsePeerRejoinProof(value: unknown): PeerRejoinProof | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.playerId) &&
    typeof raw.proof === "string" &&
    REJOIN_PROOF.test(raw.proof)
    ? { playerId: raw.playerId, proof: raw.proof }
    : undefined;
}

export function parsePeerCall(value: unknown): PeerCall | undefined {
  const raw = fields(value);
  if (raw?.kind === "target") {
    return isString(raw.targetId) ? { kind: "target", targetId: raw.targetId } : undefined;
  }
  if (raw?.kind === "ping") {
    return isNumber(raw.x) && isNumber(raw.y) ? { kind: "ping", x: raw.x, y: raw.y } : undefined;
  }
  return undefined;
}

function parseWirePing(value: unknown): WirePing | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isCount(raw.id) &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    isString(raw.byId) &&
    isNumber(raw.remaining) &&
    raw.remaining >= 0
    ? { id: raw.id, x: raw.x, y: raw.y, byId: raw.byId, remaining: raw.remaining }
    : undefined;
}

export function parseWireCalls(value: unknown): WireCalls | undefined {
  const raw = fields(value);
  if (raw === undefined) {
    return undefined;
  }
  const target = fields(raw.target);
  const pings = parseArray(raw.pings, MAX_WIRE_PINGS, parseWirePing);
  if (pings === undefined) {
    return undefined;
  }
  if (raw.target === null) {
    return { target: null, pings };
  }
  return target !== undefined && isString(target.targetId) && isString(target.callerId)
    ? { target: { targetId: target.targetId, callerId: target.callerId }, pings }
    : undefined;
}

export function parsePeerChat(value: unknown): PeerChat | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isOneOf(raw.channel, CHAT_CHANNELS) &&
    isString(raw.text, MAX_WIRE_CHAT_TEXT)
    ? { channel: raw.channel, text: raw.text }
    : undefined;
}

export function parseWireChatLine(value: unknown): WireChatLine | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isOneOf(raw.channel, CHAT_CHANNELS) &&
    isString(raw.fromId) &&
    isString(raw.name) &&
    (raw.team === null || isTeam(raw.team)) &&
    isString(raw.text, MAX_WIRE_CHAT_TEXT)
    ? { channel: raw.channel, fromId: raw.fromId, name: raw.name, team: raw.team, text: raw.text }
    : undefined;
}

export function parsePeerBye(value: unknown): PeerBye | undefined {
  const raw = fields(value);
  return raw !== undefined && Object.keys(raw).length === 0 ? {} : undefined;
}

function parseWall(value: unknown): WallDescriptor | undefined {
  const raw = fields(value);
  if (raw?.kind === "rect") {
    return isNumber(raw.x) && isNumber(raw.y) && isNumber(raw.width) && isNumber(raw.height)
      ? { kind: "rect", x: raw.x, y: raw.y, width: raw.width, height: raw.height }
      : undefined;
  }
  if (raw?.kind === "polygon") {
    const points = parseArray(raw.points, MAX_WIRE_POINTS, parsePoint);
    return points === undefined ? undefined : { kind: "polygon", points };
  }
  return undefined;
}

function parsePoint(value: unknown): { x: number; y: number } | undefined {
  const raw = fields(value);
  return raw !== undefined && isNumber(raw.x) && isNumber(raw.y)
    ? { x: raw.x, y: raw.y }
    : undefined;
}

function parseMap(value: unknown): MapDescriptor | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.id) ||
    !isString(raw.name) ||
    !isNumber(raw.width) ||
    !isNumber(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  ) {
    return undefined;
  }
  const walls = parseArray(raw.walls, MAX_WIRE_WALLS, parseWall);
  return walls === undefined
    ? undefined
    : { id: raw.id, name: raw.name, width: raw.width, height: raw.height, walls };
}

export function parsePeerWelcome(value: unknown): PeerWelcome | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.protocolVersion) ||
    !isString(raw.playerId) ||
    !isRejoinToken(raw.rejoinToken) ||
    !isNumber(raw.tickIntervalMs) ||
    raw.tickIntervalMs <= 0 ||
    !isNumber(raw.elapsedSeconds) ||
    raw.elapsedSeconds < 0
  ) {
    return undefined;
  }
  const map = parseMap(raw.map);
  return map === undefined
    ? undefined
    : {
        protocolVersion: raw.protocolVersion,
        playerId: raw.playerId,
        rejoinToken: raw.rejoinToken,
        tickIntervalMs: raw.tickIntervalMs,
        elapsedSeconds: raw.elapsedSeconds,
        map,
      };
}

export function parsePeerRefuse(value: unknown): PeerRefuse | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isOneOf(raw.reason, ["protocol-mismatch", "match-full", "match-over"] as const) &&
    isString(raw.message, MAX_WIRE_TEXT)
    ? { reason: raw.reason, message: raw.message }
    : undefined;
}

function parsePlayer(value: unknown): WirePlayer | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.id) ||
    !isString(raw.name) ||
    !isTeam(raw.team) ||
    !isNumber(raw.x) ||
    !isNumber(raw.y) ||
    !isNumber(raw.facing) ||
    !isNullableString(raw.targetId) ||
    !isNullableString(raw.attackTargetId) ||
    typeof raw.walking !== "boolean" ||
    !isNumber(raw.health) ||
    !isNumber(raw.maxHealth) ||
    !isNumber(raw.energy) ||
    !isNumber(raw.maxEnergy) ||
    !isNumber(raw.overcast) ||
    !isMorale(raw.morale) ||
    !isNumber(raw.armor) ||
    !isNullableString(raw.weaponId) ||
    !isNullableString(raw.offhandId) ||
    !isNullableString(raw.primaryProfession) ||
    !isNullableString(raw.secondaryProfession) ||
    typeof raw.dead !== "boolean" ||
    !isNullableString(raw.castingSkillId) ||
    !isNumber(raw.castRemaining) ||
    !isNumber(raw.castTotal) ||
    !isNumber(raw.swingElapsed) ||
    !isNumber(raw.swingTotal) ||
    !isNumber(raw.knockdownRemaining) ||
    !isPips(raw.healthPips) ||
    !isPips(raw.energyPips)
  ) {
    return undefined;
  }
  const statuses = parseArray(raw.statuses, MAX_WIRE_STATUSES, parseStatus);
  return statuses === undefined
    ? undefined
    : {
        id: raw.id,
        name: raw.name,
        team: raw.team,
        x: raw.x,
        y: raw.y,
        facing: raw.facing,
        targetId: raw.targetId,
        attackTargetId: raw.attackTargetId,
        walking: raw.walking,
        health: raw.health,
        maxHealth: raw.maxHealth,
        energy: raw.energy,
        maxEnergy: raw.maxEnergy,
        overcast: raw.overcast,
        morale: raw.morale,
        armor: raw.armor,
        weaponId: raw.weaponId,
        offhandId: raw.offhandId,
        primaryProfession: raw.primaryProfession,
        secondaryProfession: raw.secondaryProfession,
        dead: raw.dead,
        castingSkillId: raw.castingSkillId,
        castRemaining: raw.castRemaining,
        castTotal: raw.castTotal,
        swingElapsed: raw.swingElapsed,
        swingTotal: raw.swingTotal,
        knockdownRemaining: raw.knockdownRemaining,
        healthPips: raw.healthPips,
        energyPips: raw.energyPips,
        statuses,
      };
}

function parseProjectile(value: unknown): WireProjectile | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isCount(raw.id) ||
    !isString(raw.attackerId) ||
    !isNullableString(raw.skillId) ||
    !isNumber(raw.launchedAt) ||
    !isNumber(raw.flightSeconds) ||
    raw.flightSeconds <= 0
  ) {
    return undefined;
  }
  const from = parsePoint(raw.from);
  const to = parsePoint(raw.to);
  return from === undefined || to === undefined
    ? undefined
    : {
        id: raw.id,
        attackerId: raw.attackerId,
        skillId: raw.skillId,
        from,
        to,
        launchedAt: raw.launchedAt,
        flightSeconds: raw.flightSeconds,
      };
}

export function parseWireSnapshotPart(value: unknown): WireSnapshotPart | undefined {
  const raw = fields(value);
  const snapshot = raw === undefined ? undefined : parseSnapshot(raw);
  return raw === undefined ||
    snapshot === undefined ||
    !isCount(raw.parts) ||
    raw.parts < 1 ||
    raw.parts > MAX_SNAPSHOT_PARTS ||
    !isCount(raw.part) ||
    raw.part >= raw.parts
    ? undefined
    : { ...snapshot, part: raw.part, parts: raw.parts };
}

function parseSnapshot(raw: Fields): WireSnapshot | undefined {
  const score = parseArray(raw.score, 2, parseScore);
  if (
    !isCount(raw.tick) ||
    !isNumber(raw.elapsedSeconds) ||
    score?.length !== 2 ||
    !isOneOf(raw.phase, ["active", "finished"] as const) ||
    !(raw.winningTeam === null || isTeam(raw.winningTeam)) ||
    !(raw.endReason === null || isOneOf(raw.endReason, ["score", "time"] as const))
  ) {
    return undefined;
  }
  const players = parseArray(raw.players, MAX_LOBBY_PLAYERS, parsePlayer);
  const projectiles = parseArray(raw.projectiles, MAX_WIRE_PROJECTILES, parseProjectile);
  const [team0 = 0, team1 = 0] = score;
  return players === undefined || projectiles === undefined
    ? undefined
    : {
        tick: raw.tick,
        elapsedSeconds: raw.elapsedSeconds,
        score: [team0, team1],
        phase: raw.phase,
        winningTeam: raw.winningTeam,
        endReason: raw.endReason,
        players,
        projectiles,
      };
}

function parseScore(value: unknown): number | undefined {
  return isCount(value) ? value : undefined;
}

function parseCombatEvent(value: unknown): WireCombatEvent | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.kind) &&
    isNullableString(raw.targetId) &&
    (raw.amount === null || isNumber(raw.amount)) &&
    isNullableString(raw.skillId) &&
    isNullableString(raw.statusId) &&
    (raw.durationSeconds === null || isNumber(raw.durationSeconds)) &&
    (raw.crit === null || typeof raw.crit === "boolean") &&
    isNullableString(raw.fromId) &&
    (raw.energy === null || isNumber(raw.energy))
    ? {
        kind: raw.kind,
        targetId: raw.targetId,
        amount: raw.amount,
        skillId: raw.skillId,
        statusId: raw.statusId,
        durationSeconds: raw.durationSeconds,
        crit: raw.crit,
        fromId: raw.fromId,
        energy: raw.energy,
      }
    : undefined;
}

function parseArea(value: unknown): WireCombat["area"] | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    isNumber(raw.radius) &&
    raw.radius > 0 &&
    raw.radius <= MAX_WIRE_RADIUS
    ? { x: raw.x, y: raw.y, radius: raw.radius }
    : undefined;
}

function parseWireCombat(value: unknown): WireCombat | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.casterId) ||
    !isOneOf(raw.cause, ["skill", "weapon", "degeneration", "attribute"] as const) ||
    !isString(raw.skillId) ||
    !isString(raw.weaponId) ||
    !isString(raw.attributeId) ||
    (raw.cause === "attribute") !== (raw.attributeId !== "") ||
    typeof raw.doubleStrike !== "boolean" ||
    (raw.doubleStrike && raw.cause !== "weapon")
  ) {
    return undefined;
  }
  const area = parseArea(raw.area);
  const events = parseArray(raw.events, MAX_WIRE_EVENTS, parseCombatEvent);
  return area === undefined || events === undefined
    ? undefined
    : {
        casterId: raw.casterId,
        cause: raw.cause,
        skillId: raw.skillId,
        weaponId: raw.weaponId,
        attributeId: raw.attributeId,
        area,
        doubleStrike: raw.doubleStrike,
        events,
      };
}

/** The `"combat"` channel: one tick's entries, in log order. */
export function parseWireCombatBatch(value: unknown): WireCombatBatch | undefined {
  return parseArray(value, MAX_WIRE_COMBATS, parseWireCombat);
}

function parseSlot(value: unknown): SkillBarSlot | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.id) &&
    isString(raw.name) &&
    isNumber(raw.energyCost) &&
    isNumber(raw.adrenalineCost) &&
    isNumber(raw.activationSeconds) &&
    isNumber(raw.rechargeSeconds)
    ? {
        id: raw.id,
        name: raw.name,
        energyCost: raw.energyCost,
        adrenalineCost: raw.adrenalineCost,
        activationSeconds: raw.activationSeconds,
        rechargeSeconds: raw.rechargeSeconds,
      }
    : undefined;
}

/** An attribute id, `<profession>.<attribute>`: never `__proto__` or the like. */
const ATTRIBUTE_ID = /^[a-z]+\.[a-z-]+$/;

function parseRanks(value: unknown): Record<string, number> | undefined {
  const raw = fields(value);
  if (raw === undefined) {
    return undefined;
  }
  const entries = Object.entries(raw);
  if (entries.length > MAX_WIRE_RANKS) {
    return undefined;
  }
  const ranks: Record<string, number> = {};
  for (const [attributeId, rank] of entries) {
    if (!isString(attributeId) || !ATTRIBUTE_ID.test(attributeId)) {
      return undefined;
    }
    if (!isCount(rank) || rank > MAX_WIRE_RANK) {
      return undefined;
    }
    ranks[attributeId] = rank;
  }
  return ranks;
}

export function parseWireSkillBar(value: unknown): WireSkillBar | undefined {
  const raw = fields(value);
  const slots = parseArray(raw?.slots, MAX_WIRE_SLOTS, parseSlot);
  const ranks = parseRanks(raw?.ranks);
  return slots === undefined || ranks === undefined ? undefined : { slots, ranks };
}

export function parseWireEnded(value: unknown): WireEnded | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    (raw.winningTeam === null || isTeam(raw.winningTeam)) &&
    isOneOf(raw.endReason, ["score", "time", "host-left"] as const)
    ? { winningTeam: raw.winningTeam, endReason: raw.endReason }
    : undefined;
}

/** The `"refused"` channel: a `CastRefusedMessage`, to the caster alone. */
export function parseCastRefused(value: unknown): CastRefusedMessage | undefined {
  const raw = fields(value);
  if (raw?.kind === "skill") {
    return isSlot(raw.slot) && isString(raw.skillId) && isString(raw.reason)
      ? { kind: "skill", slot: raw.slot, skillId: raw.skillId, reason: raw.reason }
      : undefined;
  }
  if (raw?.kind === "attack") {
    return isString(raw.reason) ? { kind: "attack", reason: raw.reason } : undefined;
  }
  return undefined;
}

function parseRechargeSlot(value: unknown): RechargeSlot | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isSlot(raw.slot) &&
    isNumber(raw.remainingSeconds) &&
    isNumber(raw.totalSeconds)
    ? { slot: raw.slot, remainingSeconds: raw.remainingSeconds, totalSeconds: raw.totalSeconds }
    : undefined;
}

/** The `"recharge"` channel: a `RechargeMessage`, to one player alone (#152). */
export function parseRecharge(value: unknown): RechargeMessage | undefined {
  const slots = parseArray(fields(value)?.slots, MAX_WIRE_SLOTS, parseRechargeSlot);
  return slots === undefined ? undefined : { slots };
}

/** The `"adrenaline"` channel: an `AdrenalineMessage`, to one player alone (#463). */
export function parseAdrenaline(value: unknown): AdrenalineMessage | undefined {
  const raw = fields(value);
  const slots = parseArray(raw?.slots, MAX_WIRE_SLOTS, (slot) =>
    isNumber(slot) && slot >= 0 ? slot : undefined,
  );
  const lossInSeconds = raw?.lossInSeconds;
  if (
    slots === undefined ||
    !(lossInSeconds === null || (isNumber(lossInSeconds) && lossInSeconds >= 0))
  ) {
    return undefined;
  }
  return { slots, lossInSeconds };
}

/** A lobby character; `null` is the house loadout, a missing one is malformed. */
function parseLobbyCharacter(value: unknown): WireLobbyCharacter | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined &&
    typeof raw.name === "string" &&
    isString(raw.primary) &&
    isNullableString(raw.secondary)
    ? { name: raw.name.slice(0, MAX_WIRE_TEXT), primary: raw.primary, secondary: raw.secondary }
    : undefined;
}

/** The `"lobby-join"` channel. */
export function parsePeerLobbyJoin(value: unknown): PeerLobbyJoin | undefined {
  const raw = fields(value);
  const character = parseLobbyCharacter(raw?.character);
  if (
    raw === undefined ||
    !isString(raw.protocolVersion) ||
    typeof raw.name !== "string" ||
    character === undefined
  ) {
    return undefined;
  }
  return {
    protocolVersion: raw.protocolVersion,
    name: raw.name.slice(0, MAX_WIRE_TEXT),
    character,
  };
}

function parseLobbyTeam(value: unknown): 0 | 1 | null | undefined {
  return value === null || isTeam(value) ? value : undefined;
}

function parseLobbyPlayer(value: unknown): WireLobbyPlayer | undefined {
  const raw = fields(value);
  const team = parseLobbyTeam(raw?.team);
  const character = parseLobbyCharacter(raw?.character);
  return raw !== undefined &&
    isString(raw.id) &&
    isString(raw.name) &&
    team !== undefined &&
    typeof raw.ready === "boolean" &&
    typeof raw.isHost === "boolean" &&
    character !== undefined
    ? { id: raw.id, name: raw.name, team, ready: raw.ready, isHost: raw.isHost, character }
    : undefined;
}

/** The `"lobby-state"` channel. */
export function parseWireLobbyState(value: unknown): WireLobbyState | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.code) ||
    !isOneOf(raw.phase, ["waiting", "starting", "in-match"] as const) ||
    !isString(raw.mapId) ||
    !isString(raw.hostId) ||
    !isNullableString(raw.matchId)
  ) {
    return undefined;
  }
  const players = parseArray(raw.players, MAX_LOBBY_PLAYERS, parseLobbyPlayer);
  return players === undefined
    ? undefined
    : {
        code: raw.code,
        phase: raw.phase,
        mapId: raw.mapId,
        hostId: raw.hostId,
        matchId: raw.matchId,
        players,
      };
}

/** The `"lobby-cmd"` channel. */
export function parseWireLobbyCommand(value: unknown): WireLobbyCommand | undefined {
  const raw = fields(value);
  switch (raw?.kind) {
    case "choose-team": {
      const team = parseLobbyTeam(raw.team);
      return team === undefined ? undefined : { kind: "choose-team", team };
    }
    case "ready":
      return typeof raw.ready === "boolean" ? { kind: "ready", ready: raw.ready } : undefined;
    case "select-map":
      return isString(raw.mapId) ? { kind: "select-map", mapId: raw.mapId } : undefined;
    case "start":
      return { kind: "start" };
    default:
      return undefined;
  }
}

/** The `"lobby-note"` channel. */
export function parseWireLobbyNote(value: unknown): WireLobbyNote | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isOneOf(raw.kind, ["start-rejected", "refused", "chat-throttled"] as const) &&
    isString(raw.reason, MAX_WIRE_TEXT)
    ? { kind: raw.kind, reason: raw.reason }
    : undefined;
}

/** The `"match-start"` channel. */
export function parseWireMatchStart(value: unknown): WireMatchStart | undefined {
  const raw = fields(value);
  return raw !== undefined && isString(raw.mapId) && isString(raw.matchId)
    ? { mapId: raw.mapId, matchId: raw.matchId }
    : undefined;
}
