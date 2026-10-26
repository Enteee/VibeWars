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
  "ended",
  "bye",
  "lobby-join",
  "lobby-state",
  "lobby-cmd",
  "lobby-note",
  "match-start",
] as const;

export type Channel = (typeof CHANNELS)[number];

/** The longest id, name or reason a message may carry. */
export const MAX_WIRE_STRING = 64;

/** The longest sentence a player is shown, such as a refusal's `message`. */
export const MAX_WIRE_TEXT = 256;

/** The most statuses one player carries in a snapshot. */
export const MAX_WIRE_STATUSES = 32;

/** The most events one combat message carries. */
export const MAX_WIRE_EVENTS = 64;

/** The most slots a skill bar or a recharge list holds. */
export const MAX_WIRE_SLOTS = 8;

/** The most walls a map holds, and points a polygon wall holds. */
export const MAX_WIRE_WALLS = 1024;
export const MAX_WIRE_POINTS = 256;

/** The widest area a combat message may draw. */
export const MAX_WIRE_RADIUS = 200;

/** The most combat entries one tick's `"combat"` message carries. */
export const MAX_WIRE_COMBATS = 64;

/** The most shots in flight one snapshot carries. */
export const MAX_WIRE_PROJECTILES = 256;

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

/** A rejoin token: 128 random bits, as 32 lowercase hex digits. */
const REJOIN_TOKEN = /^[0-9a-f]{32}$/;

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
   * The seat this peer held before it dropped, and the token the host gave
   * it for that seat; `null` for a fresh join. A peer id lasts one page
   * load, so this is how a returning player is known.
   */
  readonly rejoin: { readonly playerId: string; readonly token: string } | null;
}

/** Host to one client: it is in, as `playerId`, on `map`. */
export interface PeerWelcome {
  readonly protocolVersion: string;
  readonly playerId: string;
  /** What this peer sends in `PeerHello.rejoin` to take its seat back after a drop. */
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
  readonly adrenaline: number;
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
  readonly statuses: readonly string[];
}

/** A ranged weapon's shot in flight, from `from` to `to` over `flightSeconds` from `launchedAt` (#160). */
export interface WireProjectile {
  readonly id: number;
  readonly attackerId: string;
  readonly weaponId: string;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  /** The match clock (`elapsedSeconds`) at release. */
  readonly launchedAt: number;
  readonly flightSeconds: number;
}

/** Host to every client, each tick: the whole match, not a delta. */
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

/** One thing a combat resolution did, flattened so this package needs no game-core. */
export interface WireCombatEvent {
  readonly kind: string;
  readonly targetId: string | null;
  readonly amount: number | null;
  /** The skill an interrupt or a cancel cut short. */
  readonly skillId: string | null;
  /** The status applied, removed or expired. */
  readonly statusId: string | null;
  /** How long an applied status lasts. */
  readonly durationSeconds: number | null;
}

/** One cast, swing or status tick, and what it did. */
export interface WireCombat {
  readonly casterId: string;
  readonly cause: "skill" | "weapon" | "degeneration";
  /** The skill, when `cause` is `"skill"`; `""` otherwise. */
  readonly skillId: string;
  /** The weapon, when `cause` is `"weapon"`; `""` otherwise. */
  readonly weaponId: string;
  /** Where an area skill landed, and how far it reached (#5). */
  readonly area: { readonly x: number; readonly y: number; readonly radius: number } | null;
  readonly events: readonly WireCombatEvent[];
}

/** Host to one client: its bar, every slot in its place, `null` where empty (#347). */
export interface WireSkillBar {
  readonly slots: readonly (SkillBarSlot | null)[];
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
  readonly kind: "start-rejected" | "refused";
  /**
   * For `"start-rejected"`, the words the host is shown. For `"refused"`,
   * one of `LOBBY_REFUSALS`.
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
  return raw !== undefined && isString(raw.playerId) && isRejoinToken(raw.token)
    ? { playerId: raw.playerId, token: raw.token }
    : undefined;
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
    !isNumber(raw.adrenaline) ||
    !isNumber(raw.armor) ||
    !isNullableString(raw.weaponId) ||
    !isNullableString(raw.offhandId) ||
    !isNullableString(raw.primaryProfession) ||
    !isNullableString(raw.secondaryProfession) ||
    typeof raw.dead !== "boolean" ||
    !isNullableString(raw.castingSkillId) ||
    !isNumber(raw.castRemaining) ||
    !isNumber(raw.castTotal)
  ) {
    return undefined;
  }
  const statuses = parseArray(raw.statuses, MAX_WIRE_STATUSES, parseString);
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
        adrenaline: raw.adrenaline,
        armor: raw.armor,
        weaponId: raw.weaponId,
        offhandId: raw.offhandId,
        primaryProfession: raw.primaryProfession,
        secondaryProfession: raw.secondaryProfession,
        dead: raw.dead,
        castingSkillId: raw.castingSkillId,
        castRemaining: raw.castRemaining,
        castTotal: raw.castTotal,
        statuses,
      };
}

function parseProjectile(value: unknown): WireProjectile | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isCount(raw.id) ||
    !isString(raw.attackerId) ||
    !isString(raw.weaponId) ||
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
        weaponId: raw.weaponId,
        from,
        to,
        launchedAt: raw.launchedAt,
        flightSeconds: raw.flightSeconds,
      };
}

export function parseWireSnapshot(value: unknown): WireSnapshot | undefined {
  const raw = fields(value);
  const score = raw === undefined ? undefined : parseArray(raw.score, 2, parseScore);
  if (
    raw === undefined ||
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
    (raw.durationSeconds === null || isNumber(raw.durationSeconds))
    ? {
        kind: raw.kind,
        targetId: raw.targetId,
        amount: raw.amount,
        skillId: raw.skillId,
        statusId: raw.statusId,
        durationSeconds: raw.durationSeconds,
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
    !isOneOf(raw.cause, ["skill", "weapon", "degeneration"] as const) ||
    !isString(raw.skillId) ||
    !isString(raw.weaponId)
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
        area,
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

export function parseWireSkillBar(value: unknown): WireSkillBar | undefined {
  const slots = parseArray(fields(value)?.slots, MAX_WIRE_SLOTS, parseSlot);
  return slots === undefined ? undefined : { slots };
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

/** The `"lobby-join"` channel. */
export function parsePeerLobbyJoin(value: unknown): PeerLobbyJoin | undefined {
  const raw = fields(value);
  if (raw === undefined || !isString(raw.protocolVersion) || typeof raw.name !== "string") {
    return undefined;
  }
  return { protocolVersion: raw.protocolVersion, name: raw.name.slice(0, MAX_WIRE_TEXT) };
}

function parseLobbyTeam(value: unknown): 0 | 1 | null | undefined {
  return value === null || isTeam(value) ? value : undefined;
}

function parseLobbyPlayer(value: unknown): WireLobbyPlayer | undefined {
  const raw = fields(value);
  const team = parseLobbyTeam(raw?.team);
  return raw !== undefined &&
    isString(raw.id) &&
    isString(raw.name) &&
    team !== undefined &&
    typeof raw.ready === "boolean" &&
    typeof raw.isHost === "boolean"
    ? { id: raw.id, name: raw.name, team, ready: raw.ready, isHost: raw.isHost }
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
    isOneOf(raw.kind, ["start-rejected", "refused"] as const) &&
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
