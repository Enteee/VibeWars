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
  ChainMarksMessage,
  RechargeMessage,
  RechargeSlot,
  SkillBarSlot,
  WallDescriptor,
} from "./protocol.js";
import {
  CHAIN_ROLES,
  COMPANION_MODES,
  LOBBY_MODES,
  MAX_LOBBY_PLAYERS,
  isLobbyCode,
  MAX_TEAM_LOBBY_SIDE,
  type CompanionMode,
  type LobbyMode,
  type LobbyPhase,
  type WireChainMark,
} from "./protocol.js";
import { ASCENT_ROUNDS, inPartyOrder, isQueueMode, type QueueMode } from "./queue.js";

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
  "weapon-sets",
  "recharge",
  "adrenaline",
  "chain",
  "ended",
  "bye",
  "lobby-join",
  "lobby-state",
  "lobby-cmd",
  "lobby-note",
  "team-proposal-builds",
  "lobby-hello",
  "lobby-welcome",
  "lobby-leave",
  "stay-together",
  "party-proposal",
  "party-consent",
  "party-formed",
  "party-split",
  "lobby-move",
  "match-start",
  "rejoin-challenge",
  "rejoin-proof",
  "key-challenge",
  "key-proof",
  "key-proven",
  "key-ask",
  "observe",
  "observing",
  "call",
  "calls",
  "traps",
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
 * The most creatures a snapshot carries (#1052): game-core's
 * `MAX_CREATURES` summons plus its `MAX_MAP_CREATURES` map creatures
 * (#1281), mirrored, with a test holding them together.
 */
export const MAX_WIRE_CREATURES = 56;

/**
 * The most ground effects a snapshot carries (#1087): game-core's
 * `MAX_GROUND_EFFECTS`, mirrored, with a test holding the two together.
 */
export const MAX_WIRE_GROUND_EFFECTS = 32;

/** The most bodies a snapshot carries: every player and every creature. */
export const MAX_WIRE_ACTORS = MAX_LOBBY_PLAYERS + MAX_WIRE_CREATURES;

/**
 * What kind of creature a body is (#1052); a priest (#1186), a Guild Lord
 * (#1222), a base guard (#1223) and a Ghostly Hero (#1377) are a map's.
 */
export const CREATURE_KINDS = [
  "spirit",
  "minion",
  "pet",
  "priest",
  "guild-lord",
  "guard",
  "ghostly-hero",
] as const;

/** How a creature is drawn (#1162); game-core's `CREATURE_LOOKS`, mirrored. */
export const CREATURE_LOOKS = [
  "beast",
  "bone-minion",
  "bone-horror",
  "vampiric-horror",
  "flesh-golem",
  "shambling-horror",
  "jagged-horror",
  "spirit",
  "priest",
  "guild-lord",
  "guard",
  "ghostly-hero",
] as const;

/**
 * A guild cape's colours (#1422): the palette of the cape study (#1410,
 * `docs/art/art-direction.md`), apart from both team colours.
 */
export const CAPE_COLOURS = [
  "gold",
  "violet",
  "white",
  "black",
  "lime",
  "orange",
  "teal",
  "pink",
] as const;

/** A guild cape's emblems (#1422): eight plain shapes. */
export const CAPE_EMBLEMS = [
  "disc",
  "bar",
  "chevron",
  "diamond",
  "triangle",
  "cross",
  "ring",
  "half-disc",
] as const;

/** A guild cape (#1422): its cloth, its trim and the emblem on it, in the trim colour. */
export interface WireCape {
  readonly main: (typeof CAPE_COLOURS)[number];
  readonly trim: (typeof CAPE_COLOURS)[number];
  readonly emblem: (typeof CAPE_EMBLEMS)[number];
}

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

/** The highest rank an attribute reaches, runes and headgear included (game-core's MAX_EFFECTIVE_RANK). */
export const MAX_WIRE_RANK = 16;

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

/**
 * The most `"snapshot"` messages one tick's snapshot is split into (#662):
 * enough for 8 players at every status, every creature (#1052) and every
 * shot in flight.
 */
export const MAX_SNAPSHOT_PARTS = 12;

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
  /**
   * The guild tag the player typed (#1406), cut to `MAX_WIRE_TEXT`;
   * `null` for none. The host sanitises it: an invalid one becomes `null`.
   */
  readonly guildTag: string | null;
  /**
   * The guild cape the player designed (#1422); `null` for none, and for
   * anything that is not a cape. The host drops it without a valid tag.
   */
  readonly guildCape: WireCape | null;
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

/**
 * Host to a peer that just arrived (#1681): prove you hold the lobby key,
 * over this nonce. The host sends that peer nothing else until it has.
 */
export interface WireKeyChallenge {
  /** 128 fresh random bits, as 32 lowercase hex digits. */
  readonly nonce: string;
}

/** Peer to host: the answer to a `WireKeyChallenge`. */
export interface WireKeyProof {
  /** The peer's own 128 fresh random bits, as 32 lowercase hex digits. */
  readonly nonce: string;
  /**
   * HMAC-SHA-256 keyed by the key's proof key over both nonces and both
   * peer ids (`keyProofMac` in game-session), as 64 lowercase hex digits.
   */
  readonly mac: string;
}

/** Host to a peer whose `WireKeyProof` held: the host holds the key too. */
export interface WireKeyProven {
  /** As the proof's, with the host's side named in it. */
  readonly mac: string;
}

/**
 * Guest to a host it had proven, back after a drop only the guest saw
 * (#1681): forget me and challenge me again. Its payload is `{}` and
 * not read; only a peer the host holds proven is heard.
 */
export type WireKeyAsk = Record<string, never>;

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
  /** How long the match runs, by its map's mode (#476): the clock counts down from it. */
  readonly timeLimitSeconds: number;
  readonly map: MapDescriptor;
}

/**
 * A lobby spectator to the match host (#480): let me watch `matchId`. The
 * host answers `observing`, or `refuse`. A viewer is never a player: it
 * says this, not `hello`, and has no seat to come back to.
 */
export interface PeerObserve {
  /** `PROTOCOL_VERSION`; the host refuses any other, so it is not checked here. */
  readonly protocolVersion: string;
  readonly matchId: string;
}

/**
 * Host to one viewer: it may watch. What it needs before its first
 * snapshot, which comes `delaySeconds` late, as everything after it does.
 */
export interface PeerObserving {
  readonly protocolVersion: string;
  readonly tickIntervalMs: number;
  /** How long the match runs, by its map's mode (#476): the clock counts down from it. */
  readonly timeLimitSeconds: number;
  /** How far behind the match every snapshot, combat and `ended` it is sent is. */
  readonly delaySeconds: number;
  readonly map: MapDescriptor;
}

/** The reasons a match host turns a peer away. */
export const PEER_REFUSALS = [
  "protocol-mismatch",
  "match-full",
  "match-over",
  // An `observe` (#480) from a peer the lobby has on a team, or not at all;
  // one for a match that is not the one being played.
  "not-a-spectator",
  "wrong-match",
] as const;

/** Host to one client: it is not in, and why. */
export interface PeerRefuse {
  readonly reason: (typeof PEER_REFUSALS)[number];
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
  /** 2–4 letters or digits (#1406), as the host sanitised it; `null` for none and for every bot. */
  readonly guildTag: string | null;
  /** Worn behind the body (#1422); `null` for none, and whenever `guildTag` is. */
  readonly guildCape: WireCape | null;
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
  /** Its corpse was exploited (#466); only ever true while `dead`. */
  readonly corpseExploited: boolean;
  readonly castingSkillId: string | null;
  readonly castRemaining: number;
  /** The current cast's whole length, dazed included; 0 when not casting. */
  readonly castTotal: number;
  /** Seconds left lying down from a knockdown (#468); 0 standing. */
  readonly knockdownRemaining: number;
  /** Seconds left of a shrine raise's invulnerability (#1208, #1233); 0 when not. */
  readonly invulnerableSeconds: number;
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
  /**
   * A creature's owner, kind, look and mode (#1052, #1162, #1110); `null` for a player
   * or a dummy. A creature's `name` is its kind's, and its professions are `null`.
   */
  readonly creature: WireCreature | null;
  /** A lobby's bot plays it (#1193), not a peer. */
  readonly bot: boolean;
}

/** What makes a body a creature (#1052). */
export interface WireCreature {
  /** Whom it answers to; `null` for a map's NPC, as a priest (#1186). */
  readonly ownerId: string | null;
  readonly kind: (typeof CREATURE_KINDS)[number];
  readonly look: (typeof CREATURE_LOOKS)[number];
  /** How a companion fights (#1110); `null` for a creature that is not one. */
  readonly mode: CompanionMode | null;
  /**
   * The pet attack its next blow is armed with (#1167), and the match
   * clock (`elapsedSeconds`) at which it lapses, rounded to 0.1 s; `null`
   * when nothing is armed. The skill id is checked against the catalog
   * where the catalog is known, as `castingSkillId` is.
   */
  readonly armedAttack: WireArmedAttack | null;
  /** Whom a Ghostly Hero follows (#1377); `null` while it stays, and for any other creature. */
  readonly leaderId: string | null;
}

/** A companion's armed pet attack (#1167). */
export interface WireArmedAttack {
  readonly skillId: string;
  readonly endsAt: number;
}

/** One status on a player (#803): what the effects monitor draws. */
export interface WireStatus {
  /**
   * Its index in the sorted status-id table (#632), which
   * `src/wire-schema.json` carries, so a build with another table is refused
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
 * A circle on the ground (#1087): a ward, drawn where it was placed, in
 * its team's colour, until `endsAt`.
 */
export interface WireGroundEffect {
  readonly id: number;
  /** The skill that placed it, for its icon. */
  readonly skillId: string;
  readonly team: 0 | 1;
  readonly x: number;
  readonly y: number;
  /** In (0, `MAX_WIRE_RADIUS`]. */
  readonly radius: number;
  /** Match clock (`elapsedSeconds`) at which it ends, rounded to 0.1 s. */
  readonly endsAt: number;
  /** How long it was placed for, rounded to 0.1 s; > 0. */
  readonly durationSeconds: number;
}

/** Where a Relic Run's relic is (#1374): game-core's `CarriedPlace` kinds, a bundle's three. */
export const RELIC_PLACES = ["spawn", "carried", "ground"] as const;

/** Where a Guild Battle's flag is (#1225): game-core's `FlagPlace` kinds, a bundle's and the stand. */
export const FLAG_PLACES = [...RELIC_PLACES, "stand"] as const;

/** A team's bundle (#1225, #1374), in one of `Place`. */
export interface WireCarried<Place extends string> {
  readonly team: 0 | 1;
  readonly place: Place;
  /** Who carries it, while `carried`; `null` otherwise. */
  readonly carrierId: string | null;
  /** Where it lies, while `ground`; `null` otherwise. */
  readonly x: number | null;
  readonly y: number | null;
}

/** A Guild Battle's flag (#1225): one a team, or none on a map without a stand. */
export type WireFlag = WireCarried<(typeof FLAG_PLACES)[number]>;

/** A Relic Run's relic (#1374): one a team, or none on a map without an altar. */
export type WireRelic = WireCarried<(typeof RELIC_PLACES)[number]>;

/** A Capture Points shrine (#1378): where it is, who owns it, and how far toward whom. */
export interface WireCapturePoint {
  readonly x: number;
  readonly y: number;
  readonly owner: 0 | 1 | null;
  readonly capturer: 0 | 1 | null;
  /** From 0 to 1, toward `capturer`. */
  readonly progress: number;
}

/** The most shrines a map has (#1378). */
const MAX_WIRE_CAPTURE_POINTS = 5;

/** Who holds the flag stand (#1225), and for how long since the taking or the last boost. */
export interface WireStand {
  readonly holder: 0 | 1 | null;
  readonly heldSeconds: number;
}

/**
 * Why a match ended (#846): kill-count's score and time, annihilation's
 * wipe and morale at time, a Guild Battle's slain lord and aggression (#1222).
 */
const END_REASONS = [
  "score",
  "time",
  "annihilation",
  "morale",
  "guild-lord",
  "aggression",
] as const;

type EndReason = (typeof END_REASONS)[number];

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
  readonly endReason: EndReason | null;
  readonly players: readonly WirePlayer[];
  /** Oldest first. */
  readonly projectiles: readonly WireProjectile[];
  /** Oldest first (#1087). */
  readonly groundEffects: readonly WireGroundEffect[];
  /** Every flag (#1225); `[]` on a map without a stand. */
  readonly flags: readonly WireFlag[];
  /** The flag stand (#1225); `null` on a map without one. */
  readonly stand: WireStand | null;
  /** Each team's aggression by team index, rounded (#1226); `[]` but on a Guild Battle. */
  readonly aggression: readonly number[];
  /** Every relic (#1374); `[]` on a map without an altar. */
  readonly relics: readonly WireRelic[];
  /** The altar a relic is run to (#1374), or a ghost claims (#1377); `null` on a map without one. */
  readonly altar: { readonly x: number; readonly y: number } | null;
  /** The team that holds King of the Hill's altar (#1377); `null` for nobody, and off such a map. */
  readonly altarHolder: 0 | 1 | null;
  /** Seconds its holder has kept it since the claim or the last point (#1377); `0` off such a map. */
  readonly altarHeldSeconds: number;
  /** Every Capture Points shrine (#1378); `[]` on a map without them. */
  readonly capturePoints: readonly WireCapturePoint[];
}

/**
 * Host to every client, each tick: one of the `parts` a `WireSnapshot`
 * is split into so that each fits one Trystero frame (#662). Every part
 * repeats the header; `players`, `projectiles` and `groundEffects` are
 * this part's run of the whole lists, in that order.
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
  /** The skill an interrupt or a cancel cut short, or a disable held back (#914). */
  readonly skillId: string | null;
  /** The status applied, removed or expired. */
  readonly statusId: string | null;
  /**
   * How long an applied status, a knockdown or a disable lasts; `null` too for a
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
   * Whom a spreading status was caught from (#765), who could not pay
   * a maintained enchantment's upkeep (#837), or whom a shadow step went
   * to (#988) or a teleport put it beside (#474); `null` for any other kind.
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

/** One carried weapon set, as its owner sees it (#489). */
export interface WireWeaponSet {
  readonly weaponId: string;
  readonly offhandId: string | null;
}

/**
 * Host to one client: the weapon sets it carries and which is in hand
 * (#489). On welcome, and again on the tick the active or queued set
 * changes. Spare sets stay private: others see the swap in
 * `WirePlayer.weaponId`.
 */
export interface WireWeaponSets {
  /** Set 1 first, always four; `null` for an empty set. */
  readonly sets: readonly (WireWeaponSet | null)[];
  readonly active: 0 | 1 | 2 | 3;
  /** A swap waiting for the cast, aftercast, swing or knockdown to end. */
  readonly pending: 0 | 1 | 2 | 3 | null;
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

/**
 * Host to each seated peer of one team, never the other (#1105): that
 * team's traps, at most `MAX_WIRE_GROUND_EFFECTS`, the newest kept, a
 * full replacement list. A foe's trap is hidden information, so it is
 * never in a snapshot (SECURITY.md). Sent on the tick the team's traps
 * change, and after a welcome.
 */
export interface WireTraps {
  readonly traps: readonly WireGroundEffect[];
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

/**
 * One player's line in the match summary (#1057): every player who held a
 * seat, under the name they joined with. Whole numbers.
 */
export interface WireSummaryRow {
  readonly id: string;
  readonly name: string;
  /** The seat's guild tag (#1406); `null` for none. */
  readonly guildTag: string | null;
  readonly team: 0 | 1;
  readonly damage: number;
  readonly healing: number;
  readonly taken: number;
  readonly kills: number;
  readonly deaths: number;
  readonly interrupts: number;
}

/** Host to every client, once: the match is over, and what each player did in it. */
export interface WireEnded {
  readonly winningTeam: 0 | 1 | null;
  readonly endReason: EndReason | "host-left";
  readonly summary: readonly WireSummaryRow[];
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
  /** As `PeerHello.guildTag` (#1406). */
  readonly guildTag: string | null;
  /** As `PeerHello.guildCape` (#1422). */
  readonly guildCape: WireCape | null;
  /**
   * The seat's proof in a queued lobby (#871, ADR-0032 §6); `null` in a
   * coded lobby, which refuses one.
   */
  readonly admission: WireAdmission | null;
}

/**
 * A queued joiner's proof of its seat (#871, #882): `admissionSig` is its
 * seat key's BIP-340 signature of the `vibewars-admit` digest, which
 * names the group, the planned host and the joiner's own peer id, so it
 * is good for that host and that peer alone. The key never leaves it.
 */
export interface WireAdmission {
  /**
   * 64 lowercase hex digits: a solo's ticket id, or a party member's own
   * x-only public key.
   */
  readonly seatKey: string;
  /** 128 lowercase hex digits. */
  readonly admissionSig: string;
}

/**
 * A queued joiner to the room, and to each peer as it arrives (#871):
 * "if you host here, welcome me". It carries nothing, so it may go to
 * the room; the join, with its proof, goes only to a peer whose welcome
 * proved it the planned host.
 */
export type PeerLobbyHello = Readonly<Record<string, never>>;

/**
 * A guest to its lobby's host, as it leaves on purpose (#1764): free my
 * seat now. A peer that only drops sends nothing, and its seat is held.
 */
export type PeerLobbyLeave = Readonly<Record<string, never>>;

/**
 * Queued lobby host to one joiner, and only to it (#871): `hostSig` is
 * the host ticket's signature of the `vibewars-host` digest for that
 * joiner. A queued joiner takes lobby messages only from a peer whose
 * welcome verifies against the planned host.
 */
export interface WireLobbyWelcome {
  readonly hostSig: string;
}

/**
 * A winner of a queued match to its host, while the host holds the lobby
 * open after it (#882): a fresh member key, 64 lowercase hex digits, to
 * stay together as a party, or `null` not to.
 */
export interface PeerStayTogether {
  readonly memberKey: string | null;
}

/**
 * The host to each winner who said yes, and only to it, once every winner
 * did (#1078): the group they won, their keys in party order, and the mode the
 * party queues for (#1766). Each signs its consent to exactly this party,
 * or the party does not form.
 */
export interface WirePartyProposal {
  readonly groupId: string;
  readonly members: readonly string[];
  readonly mode: QueueMode;
}

/**
 * A yes-voter to its host (#1078): `consent`, 128 hex digits, is
 * `memberKey`'s signature over `admissionDigest("vibewars-party",
 * groupId, members.join(""), mode)` for the proposal it answers: a
 * consent to one mode's party is none to another's (#1766). The
 * party's ticket publishes every consent, so nobody can name a member who
 * did not agree to that very party.
 */
export interface PeerPartyConsent {
  readonly memberKey: string;
  readonly consent: string;
}

/**
 * The host to each winner who said yes, and only to it (#882): every
 * winner consented, and these are their keys in party order, with each one's
 * consent, `consents[i]` by `members[i]` (#1078). They queue as one party.
 */
export interface WirePartyFormed {
  readonly groupId: string;
  readonly members: readonly string[];
  readonly consents: readonly string[];
}

/** The host to each winner who said yes (#882): someone did not; queue alone. */
export type WirePartySplit = Readonly<Record<string, never>>;

/**
 * The host to each of its guests, as it leaves for another lobby
 * (#1553): follow it there. `code` is that lobby's key, normalised
 * (#1681), which a guest, a proven peer of this lobby, may be told
 * (ADR-0043); it is never logged or stored.
 */
export interface WireLobbyMove {
  readonly code: string;
}

/**
 * The character a lobby member brings (#580), for the others to see:
 * `null` is a starter build. What it plays with is the match `hello`'s
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
  /** As `WirePlayer.guildTag` (#1406). */
  readonly guildTag: string | null;
  /** As `WirePlayer.guildCape` (#1422). */
  readonly guildCape: WireCape | null;
  /** `null` spectates. */
  readonly team: 0 | 1 | null;
  readonly ready: boolean;
  /** The host's own player: the one who picks the map and starts. */
  readonly isHost: boolean;
  /** A bot the host added (#1193): no peer, always ready, never the host. */
  readonly bot: boolean;
  /** Its peer dropped (#1764): its seat is held while it may come back. */
  readonly away: boolean;
}

/** Lobby host to every peer, on every change: the whole lobby, not a delta. */
export interface WireLobbyState {
  readonly code: string;
  readonly phase: LobbyPhase;
  /** The host's pick (#1526): every member's rail shows it. */
  readonly mode: LobbyMode;
  readonly mapId: string;
  /**
   * Whether a peer with the key may join (#1682): a closed lobby takes
   * nobody new, and keeps those already in. A queued lobby is always open.
   */
  readonly open: boolean;
  /** The peer every lobby and match message comes from. */
  readonly hostId: string;
  /** The match being played, while `phase` is not `"waiting"`. */
  readonly matchId: string | null;
  readonly players: readonly WireLobbyPlayer[];
  /**
   * Whole seconds until a queued lobby's match starts (#871), while
   * `phase` is `"starting"`; `null` otherwise.
   */
  readonly countdownSeconds: number | null;
  /** The Team Lobby (#1458), while `phase` is `"team-lobby"`; `null` otherwise. */
  readonly teamLobby: WireTeamLobby | null;
  /**
   * While `phase` is `"queued"` (#1766), the nonce of this queueing, 64
   * hex digits; `null` otherwise. The party's group is
   * `sha256(roomId ‖ queueNonce)`, which each member works out for itself
   * before it consents. Public: the room id never is.
   */
  readonly queueNonce: string | null;
  /**
   * While `phase` is `"queued"` in Heroes' Ascent (#1996), the round the
   * party queues at, the host's run: every member's ticket is at it.
   * `null` otherwise.
   */
  readonly ascentRound: number | null;
}

/**
 * A Team Lobby (#1458): each side votes on a proposed Team Build, then
 * its players claim its characters. Both sides share one clock and stage.
 */
export interface WireTeamLobby {
  readonly stage: "vote" | "claim";
  /** Whole seconds until the stage ends. */
  readonly secondsLeft: number;
  /** By team; `null` for a side the recipient is not on, which is hidden from it. */
  readonly sides: readonly [WireTeamSide | null, WireTeamSide | null];
}

/** One side of a Team Lobby, as only its own members see it. */
export interface WireTeamSide {
  /**
   * The size every proposal is: a team mode's (#2029). `null` in a Hosted
   * Game, where a side proposes any size up to `MAX_TEAM_LOBBY_SIDE`, no
   * smaller than its humans, and plays the one it chose.
   */
  readonly size: number | null;
  /** Who breaks a tie; `null` for a side with no humans. */
  readonly captainId: string | null;
  /** In `"vote"`, in the order they were proposed, at most one per member; `[]` in `"claim"`. */
  readonly proposals: readonly WireTeamProposal[];
  /** `null` until the vote is over. */
  readonly chosen: WireTeamChoice | null;
  /** In `"claim"`, the peer holding each slot of `chosen`, `null` for free; `[]` in `"vote"`. */
  readonly claims: readonly (string | null)[];
}

/**
 * A proposed Team Build: its members' professions only, which is what a
 * vote is about. The names come with the chosen one.
 */
export interface WireTeamProposal {
  readonly proposerId: string;
  readonly members: readonly { readonly primary: string; readonly secondary: string | null }[];
  readonly voterIds: readonly string[];
}

/** The Team Build a side plays, and why it was picked. */
export interface WireTeamChoice {
  /** `null` for the house team. */
  readonly proposerId: string | null;
  readonly reason: "votes" | "captain" | "random" | "house";
  readonly members: readonly WireLobbyCharacter[];
}

/**
 * Lobby host to a side's members (#1811): each member's skills and
 * weapons of `proposerId`'s proposal, once it stands, so its card can
 * show them. Sent once per proposal, as `lobby-state` goes out on every
 * change and would not hold eight of them.
 */
export interface WireTeamProposalBuilds {
  readonly proposerId: string;
  /** By slot, as the proposal's `members`. */
  readonly builds: readonly WireProposalBuild[];
}

/** A proposed member's bar and set 1 (#1811): ids only, no name or attributes. */
export interface WireProposalBuild {
  /** Exactly `MAX_WIRE_SLOTS`, `null` an empty slot. */
  readonly skills: readonly (string | null)[];
  readonly mainHand: string | null;
  readonly offHand: string | null;
}

/** Peer to lobby host: what the member asks for. The host decides. */
export type WireLobbyCommand =
  | { readonly kind: "choose-team"; readonly team: 0 | 1 | null }
  | { readonly kind: "ready"; readonly ready: boolean }
  | { readonly kind: "select-map"; readonly mapId: string }
  /** Host only (#1526): the lobby's mode; a map outside it moves to the mode's first. */
  | { readonly kind: "select-mode"; readonly mode: LobbyMode }
  | { readonly kind: "start" }
  /**
   * Host only, in a team mode (#1766): the party's Team Lobby, then the
   * queue; `leave-queue` takes it out again, `house-team` plays the house
   * team instead, in this lobby. In Heroes' Ascent it queues at the
   * host's `ascentRound` (#1996), `null` in every other mode.
   */
  | { readonly kind: "find-match"; readonly ascentRound: number | null }
  | { readonly kind: "leave-queue" }
  | { readonly kind: "house-team" }
  /**
   * In a Team Lobby's vote (#1458): slot `slot` of a Team Build of `size`,
   * its build opaque here. One build a message, so a side of large builds
   * still fits: the host collects them, and the proposal stands once all
   * `size` are in. `slot: null` withdraws it.
   */
  | {
      readonly kind: "propose";
      readonly slot: number;
      readonly size: number;
      readonly build: JsonValue;
    }
  | { readonly kind: "propose"; readonly slot: null }
  /** In a Team Lobby's vote: vote for a proposal on one's own side; `null` withdraws. */
  | { readonly kind: "vote"; readonly proposerId: string | null }
  /** In a Team Lobby's claim: take that slot of the chosen build; `null` lets it go. */
  | { readonly kind: "claim"; readonly slot: number | null }
  /**
   * A team mode's party host to its match host (ADR-0042): seat `slot` of
   * its side of `size`, played by the human `memberKey` or, `null`, a
   * bot, with `build`, opaque here. One seat a message, as `propose`,
   * so a whole side of large builds still fits.
   */
  | {
      readonly kind: "team-plan";
      readonly slot: number;
      readonly size: number;
      readonly memberKey: string | null;
      readonly build: JsonValue;
    };

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
export const LOBBY_REFUSALS = [
  "protocol-mismatch",
  "lobby-full",
  "host-left",
  // A queued lobby's (#871): no proof, one that does not verify, or one
  // brought to a coded lobby; a ticket already seated; the group never filled.
  "not-admitted",
  "ticket-used",
  "fell-through",
  // A host's command (a mode, a match search) from anyone but the host.
  "not-host",
  // A map picked outside a Hosted Game (#1994): other modes choose their own.
  "not-pickable",
  // A Team Lobby's (#1458): a proposal not of the side's size or with a
  // build that is not legal; a vote for no proposal of the voter's side;
  // a slot someone holds, or no slot of the chosen build.
  "invalid-proposal",
  "invalid-vote",
  "slot-taken",
  "invalid-slot",
  // A coded lobby its host has closed (#1682), told only after the key proof.
  "closed",
] as const;

export type LobbyRefusal = (typeof LOBBY_REFUSALS)[number];

/**
 * Lobby host to each seated peer, and only to them: the match is on, on
 * `mapId`. The peer then says `hello` to the host on the same transport.
 * `teamPlanRejected`: the peer's party sent a team plan (ADR-0042) that
 * was not whole, so the house team plays for its side.
 */
export interface WireMatchStart {
  readonly mapId: string;
  readonly matchId: string;
  readonly teamPlanRejected: boolean;
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

/** Whether `value` is a Heroes' Ascent round (#1996), or `null` for none. */
function isAscentRound(value: unknown): value is number | null {
  return value === null || (isCount(value) && value < ASCENT_ROUNDS);
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

/** A client's guild tag as typed (#1406), cut to `MAX_WIRE_TEXT`: the host sanitises it. */
function parseRawGuildTag(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value.slice(0, MAX_WIRE_TEXT) : undefined;
}

/** `value` as a cape (#1422) if it is exactly one, else `undefined`. */
export function parseWireCape(value: unknown): WireCape | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    Object.keys(raw).length === 3 &&
    isOneOf(raw.main, CAPE_COLOURS) &&
    isOneOf(raw.trim, CAPE_COLOURS) &&
    isOneOf(raw.emblem, CAPE_EMBLEMS)
    ? { main: raw.main, trim: raw.trim, emblem: raw.emblem }
    : undefined;
}

/** A host's cape (#1422): `null` or a cape; anything else is malformed. */
function parseNullableCape(value: unknown): WireCape | null | undefined {
  return value === null ? null : parseWireCape(value);
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
  const guildTag = parseRawGuildTag(raw.guildTag);
  const build = parseJson(raw.build);
  const rejoin = parseRejoin(raw.rejoin);
  return guildTag === undefined || build === undefined || rejoin === undefined
    ? undefined
    : {
        protocolVersion: raw.protocolVersion,
        name: raw.name.slice(0, MAX_WIRE_TEXT),
        guildTag,
        // A client's: what is not a cape is no cape, never a refused join.
        guildCape: parseWireCape(raw.guildCape) ?? null,
        build,
        rejoin,
      };
}

export function parsePeerObserve(value: unknown): PeerObserve | undefined {
  const raw = fields(value);
  return raw !== undefined && isString(raw.protocolVersion) && isString(raw.matchId)
    ? { protocolVersion: raw.protocolVersion, matchId: raw.matchId }
    : undefined;
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

export function parseWireKeyChallenge(value: unknown): WireKeyChallenge | undefined {
  const raw = fields(value);
  return raw !== undefined && isRejoinToken(raw.nonce) ? { nonce: raw.nonce } : undefined;
}

export function parseWireKeyProof(value: unknown): WireKeyProof | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isRejoinToken(raw.nonce) &&
    typeof raw.mac === "string" &&
    REJOIN_PROOF.test(raw.mac)
    ? { nonce: raw.nonce, mac: raw.mac }
    : undefined;
}

export function parseWireKeyProven(value: unknown): WireKeyProven | undefined {
  const raw = fields(value);
  return raw !== undefined && typeof raw.mac === "string" && REJOIN_PROOF.test(raw.mac)
    ? { mac: raw.mac }
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

export function parseWireTraps(value: unknown): WireTraps | undefined {
  const raw = fields(value);
  const traps =
    raw === undefined
      ? undefined
      : parseArray(raw.traps, MAX_WIRE_GROUND_EFFECTS, parseGroundEffect);
  return traps === undefined ? undefined : { traps };
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
    raw.elapsedSeconds < 0 ||
    !isNumber(raw.timeLimitSeconds) ||
    raw.timeLimitSeconds <= 0
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
        timeLimitSeconds: raw.timeLimitSeconds,
        map,
      };
}

export function parsePeerObserving(value: unknown): PeerObserving | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.protocolVersion) ||
    !isNumber(raw.tickIntervalMs) ||
    raw.tickIntervalMs <= 0 ||
    !isNumber(raw.timeLimitSeconds) ||
    raw.timeLimitSeconds <= 0 ||
    !isNumber(raw.delaySeconds) ||
    raw.delaySeconds < 0
  ) {
    return undefined;
  }
  const map = parseMap(raw.map);
  return map === undefined
    ? undefined
    : {
        protocolVersion: raw.protocolVersion,
        tickIntervalMs: raw.tickIntervalMs,
        timeLimitSeconds: raw.timeLimitSeconds,
        delaySeconds: raw.delaySeconds,
        map,
      };
}

export function parsePeerRefuse(value: unknown): PeerRefuse | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isOneOf(raw.reason, PEER_REFUSALS) &&
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
    !isNullableString(raw.guildTag) ||
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
    typeof raw.corpseExploited !== "boolean" ||
    // Only a corpse can have been exploited: malformed, not old.
    (raw.corpseExploited && !raw.dead) ||
    !isNullableString(raw.castingSkillId) ||
    !isNumber(raw.castRemaining) ||
    !isNumber(raw.castTotal) ||
    !isNumber(raw.swingElapsed) ||
    !isNumber(raw.swingTotal) ||
    !isNumber(raw.knockdownRemaining) ||
    !isNumber(raw.invulnerableSeconds) ||
    !isPips(raw.healthPips) ||
    !isPips(raw.energyPips) ||
    typeof raw.bot !== "boolean"
  ) {
    return undefined;
  }
  const statuses = parseArray(raw.statuses, MAX_WIRE_STATUSES, parseStatus);
  const creature = raw.creature === null ? null : parseCreature(raw.creature);
  const guildCape = parseNullableCape(raw.guildCape);
  return statuses === undefined || creature === undefined || guildCape === undefined
    ? undefined
    : {
        id: raw.id,
        name: raw.name,
        guildTag: raw.guildTag,
        guildCape,
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
        corpseExploited: raw.corpseExploited,
        castingSkillId: raw.castingSkillId,
        castRemaining: raw.castRemaining,
        castTotal: raw.castTotal,
        swingElapsed: raw.swingElapsed,
        swingTotal: raw.swingTotal,
        knockdownRemaining: raw.knockdownRemaining,
        invulnerableSeconds: raw.invulnerableSeconds,
        healthPips: raw.healthPips,
        energyPips: raw.energyPips,
        statuses,
        creature,
        bot: raw.bot,
      };
}

function parseCreature(value: unknown): WireCreature | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !(raw.ownerId === null || isString(raw.ownerId)) ||
    !isOneOf(raw.kind, CREATURE_KINDS) ||
    !isOneOf(raw.look, CREATURE_LOOKS) ||
    !(raw.mode === null || isOneOf(raw.mode, COMPANION_MODES)) ||
    !(raw.leaderId === null || isString(raw.leaderId))
  ) {
    return undefined;
  }
  const armedAttack = raw.armedAttack === null ? null : parseArmedAttack(raw.armedAttack);
  return armedAttack === undefined
    ? undefined
    : {
        ownerId: raw.ownerId,
        kind: raw.kind,
        look: raw.look,
        mode: raw.mode,
        armedAttack,
        leaderId: raw.leaderId,
      };
}

function parseArmedAttack(value: unknown): WireArmedAttack | undefined {
  const raw = fields(value);
  return raw !== undefined && isString(raw.skillId) && isNumber(raw.endsAt)
    ? { skillId: raw.skillId, endsAt: raw.endsAt }
    : undefined;
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

function parseGroundEffect(value: unknown): WireGroundEffect | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isCount(raw.id) &&
    isString(raw.skillId) &&
    isTeam(raw.team) &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    isNumber(raw.radius) &&
    raw.radius > 0 &&
    raw.radius <= MAX_WIRE_RADIUS &&
    isNumber(raw.endsAt) &&
    isNumber(raw.durationSeconds) &&
    raw.durationSeconds > 0
    ? {
        id: raw.id,
        skillId: raw.skillId,
        team: raw.team,
        x: raw.x,
        y: raw.y,
        radius: raw.radius,
        endsAt: raw.endsAt,
        durationSeconds: raw.durationSeconds,
      }
    : undefined;
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
    !(raw.endReason === null || isOneOf(raw.endReason, END_REASONS))
  ) {
    return undefined;
  }
  const players = parseArray(raw.players, MAX_WIRE_ACTORS, parsePlayer);
  const projectiles = parseArray(raw.projectiles, MAX_WIRE_PROJECTILES, parseProjectile);
  const groundEffects = parseArray(raw.groundEffects, MAX_WIRE_GROUND_EFFECTS, parseGroundEffect);
  const flags = parseArray(raw.flags, 2, parseCarried(FLAG_PLACES));
  const stand = raw.stand === null ? null : parseStand(raw.stand);
  const aggression = parseArray(raw.aggression, 2, parseScore);
  const relics = parseArray(raw.relics, 2, parseCarried(RELIC_PLACES));
  const altar = raw.altar === null ? null : parsePoint(raw.altar);
  const capturePoints = parseArray(raw.capturePoints, MAX_WIRE_CAPTURE_POINTS, parseCapturePoint);
  const [team0 = 0, team1 = 0] = score;
  const { altarHolder, altarHeldSeconds } = raw;
  return !(altarHolder === null || isTeam(altarHolder)) ||
    !isNumber(altarHeldSeconds) ||
    altarHeldSeconds < 0 ||
    players === undefined ||
    projectiles === undefined ||
    groundEffects === undefined ||
    flags === undefined ||
    stand === undefined ||
    aggression === undefined ||
    relics === undefined ||
    altar === undefined ||
    capturePoints === undefined
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
        groundEffects,
        flags,
        stand,
        aggression,
        relics,
        altar,
        altarHolder,
        altarHeldSeconds,
        capturePoints,
      };
}

function parseCapturePoint(value: unknown): WireCapturePoint | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isNumber(raw.x) &&
    isNumber(raw.y) &&
    (raw.owner === null || isTeam(raw.owner)) &&
    (raw.capturer === null || isTeam(raw.capturer)) &&
    isNumber(raw.progress) &&
    raw.progress >= 0 &&
    raw.progress <= 1
    ? {
        x: raw.x,
        y: raw.y,
        owner: raw.owner,
        capturer: raw.capturer,
        progress: raw.progress,
      }
    : undefined;
}

/**
 * A parser of bundles in one of `places`, a flag's or a relic's: whose
 * fields say what its place has, and nothing else (#1225, #1374).
 */
function parseCarried<Place extends string>(
  places: readonly Place[],
): (value: unknown) => WireCarried<Place> | undefined {
  return (value) => {
    const raw = fields(value);
    return raw === undefined || !isTeam(raw.team) || !isOneOf(raw.place, places)
      ? undefined
      : carriedFields(raw.team, raw.place, raw);
  };
}

/** A bundle's carrier and spot, as its `place` has them. */
function carriedFields<Place extends string>(
  team: 0 | 1,
  place: Place,
  raw: Fields,
): WireCarried<Place> | undefined {
  const { carrierId, x, y } = raw;
  const kind: string = place;
  const carrier = kind === "carried" ? (isString(carrierId) ? carrierId : undefined) : null;
  const spot =
    kind === "ground"
      ? isNumber(x) && isNumber(y)
        ? { x, y }
        : undefined
      : x === null && y === null
        ? { x: null, y: null }
        : undefined;
  return carrier === undefined || (carrier === null && carrierId !== null) || spot === undefined
    ? undefined
    : { team, place, carrierId: carrier, ...spot };
}

function parseStand(value: unknown): WireStand | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    (raw.holder === null || isTeam(raw.holder)) &&
    isNumber(raw.heldSeconds) &&
    raw.heldSeconds >= 0
    ? { holder: raw.holder, heldSeconds: raw.heldSeconds }
    : undefined;
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
    isNumber(raw.rechargeSeconds) &&
    (raw.copyEndsAt === null || isNumber(raw.copyEndsAt))
    ? {
        id: raw.id,
        name: raw.name,
        energyCost: raw.energyCost,
        adrenalineCost: raw.adrenalineCost,
        activationSeconds: raw.activationSeconds,
        rechargeSeconds: raw.rechargeSeconds,
        copyEndsAt: raw.copyEndsAt,
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

/**
 * Exactly four sets, set 1 carried, and `active` and `pending` each naming
 * a carried set.
 */
export function parseWireWeaponSets(value: unknown): WireWeaponSets | undefined {
  const raw = fields(value);
  const sets = parseArray(raw?.sets, WEAPON_SET_COUNT, parseWeaponSetOrEmpty);
  if (raw === undefined || sets?.length !== WEAPON_SET_COUNT) {
    return undefined;
  }
  const carried = (index: unknown): index is 0 | 1 | 2 | 3 =>
    (index === 0 || index === 1 || index === 2 || index === 3) && sets[index] !== null;
  const { active, pending } = raw;
  return carried(0) && carried(active) && (pending === null || carried(pending))
    ? { sets, active, pending }
    : undefined;
}

const WEAPON_SET_COUNT = 4;

function parseWeaponSetOrEmpty(value: unknown): WireWeaponSet | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined && isString(raw.weaponId) && isNullableString(raw.offhandId)
    ? { weaponId: raw.weaponId, offhandId: raw.offhandId }
    : undefined;
}

function parseSummaryRow(value: unknown): WireSummaryRow | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.id) &&
    typeof raw.name === "string" &&
    isNullableString(raw.guildTag) &&
    isTeam(raw.team) &&
    isCount(raw.damage) &&
    isCount(raw.healing) &&
    isCount(raw.taken) &&
    isCount(raw.kills) &&
    isCount(raw.deaths) &&
    isCount(raw.interrupts)
    ? {
        id: raw.id,
        name: raw.name.slice(0, MAX_WIRE_TEXT),
        guildTag: raw.guildTag,
        team: raw.team,
        damage: raw.damage,
        healing: raw.healing,
        taken: raw.taken,
        kills: raw.kills,
        deaths: raw.deaths,
        interrupts: raw.interrupts,
      }
    : undefined;
}

export function parseWireEnded(value: unknown): WireEnded | undefined {
  const raw = fields(value);
  const summary = parseArray(raw?.summary, MAX_LOBBY_PLAYERS, parseSummaryRow);
  return raw !== undefined &&
    (raw.winningTeam === null || isTeam(raw.winningTeam)) &&
    isOneOf(raw.endReason, [...END_REASONS, "host-left"] as const) &&
    summary !== undefined
    ? { winningTeam: raw.winningTeam, endReason: raw.endReason, summary }
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
  const raw = fields(value);
  const slots = parseArray(raw?.slots, MAX_WIRE_SLOTS, parseRechargeSlot);
  const spent = parseArray(raw?.spent, MAX_WIRE_SLOTS, (slot) => (isSlot(slot) ? slot : undefined));
  const queued = raw?.queued;
  return slots === undefined || spent === undefined || !(queued === null || isSlot(queued))
    ? undefined
    : { slots, spent, queued };
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

function parseChainMark(value: unknown): WireChainMark | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.targetId) &&
    isOneOf(raw.role, CHAIN_ROLES) &&
    isNumber(raw.remainingSeconds) &&
    raw.remainingSeconds >= 0
    ? { targetId: raw.targetId, role: raw.role, remainingSeconds: raw.remainingSeconds }
    : undefined;
}

/**
 * The `"chain"` channel: a `ChainMarksMessage`, to one player alone
 * (#916). At most one mark per other player in the lobby.
 */
export function parseChainMarks(value: unknown): ChainMarksMessage | undefined {
  const marks = parseArray(fields(value)?.marks, MAX_LOBBY_PLAYERS, parseChainMark);
  return marks === undefined ? undefined : { marks };
}

/** A lobby character; `null` is a starter build, a missing one is malformed. */
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

const TICKET_ID = /^[0-9a-f]{64}$/;
const TICKET_SIG = /^[0-9a-f]{128}$/;

function isTicketId(value: unknown): value is string {
  return typeof value === "string" && TICKET_ID.test(value);
}

function isTicketSig(value: unknown): value is string {
  return typeof value === "string" && TICKET_SIG.test(value);
}

/** An admission; `null` is none, a malformed one is `undefined`. */
function parseAdmission(value: unknown): WireAdmission | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  return raw !== undefined && isTicketId(raw.seatKey) && isTicketSig(raw.admissionSig)
    ? { seatKey: raw.seatKey, admissionSig: raw.admissionSig }
    : undefined;
}

/** The `"lobby-join"` channel. */
export function parsePeerLobbyJoin(value: unknown): PeerLobbyJoin | undefined {
  const raw = fields(value);
  const guildTag = parseRawGuildTag(raw?.guildTag);
  const admission = parseAdmission(raw?.admission);
  if (
    raw === undefined ||
    !isString(raw.protocolVersion) ||
    typeof raw.name !== "string" ||
    guildTag === undefined ||
    admission === undefined
  ) {
    return undefined;
  }
  return {
    protocolVersion: raw.protocolVersion,
    name: raw.name.slice(0, MAX_WIRE_TEXT),
    guildTag,
    // As the hello's.
    guildCape: parseWireCape(raw.guildCape) ?? null,
    admission,
  };
}

/** The `"lobby-hello"` channel. */
export function parsePeerLobbyHello(value: unknown): PeerLobbyHello | undefined {
  const raw = fields(value);
  return raw !== undefined && Object.keys(raw).length === 0 ? {} : undefined;
}

/** The `"lobby-leave"` channel. */
export function parsePeerLobbyLeave(value: unknown): PeerLobbyLeave | undefined {
  const raw = fields(value);
  return raw !== undefined && Object.keys(raw).length === 0 ? {} : undefined;
}

/** The `"lobby-welcome"` channel. */
export function parseWireLobbyWelcome(value: unknown): WireLobbyWelcome | undefined {
  const raw = fields(value);
  return raw !== undefined && isTicketSig(raw.hostSig) ? { hostSig: raw.hostSig } : undefined;
}

/** The `"stay-together"` channel. */
export function parsePeerStayTogether(value: unknown): PeerStayTogether | undefined {
  const raw = fields(value);
  return raw !== undefined && (raw.memberKey === null || isTicketId(raw.memberKey))
    ? { memberKey: raw.memberKey }
    : undefined;
}

/** The longest party there is: an 8v8 side (`teamSizeOf`). */
const MAX_PARTY_MEMBERS = 8;

/** A party's members: two or more keys, each once, in party order (`inPartyOrder`). */
function parsePartyMembers(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PARTY_MEMBERS) {
    return undefined;
  }
  const keys: string[] = [];
  for (const member of value as readonly unknown[]) {
    if (!isTicketId(member)) {
      return undefined;
    }
    keys.push(member);
  }
  return inPartyOrder(keys) ? keys : undefined;
}

/** The `"party-proposal"` channel: a group id, the party's members and its mode. */
export function parseWirePartyProposal(value: unknown): WirePartyProposal | undefined {
  const raw = fields(value);
  const groupId: unknown = raw?.groupId;
  const mode: unknown = raw?.mode;
  const members = parsePartyMembers(raw?.members);
  return isTicketId(groupId) && members !== undefined && isQueueMode(mode)
    ? { groupId, members, mode }
    : undefined;
}

/** The `"party-consent"` channel. */
export function parsePeerPartyConsent(value: unknown): PeerPartyConsent | undefined {
  const raw = fields(value);
  return raw !== undefined && isTicketId(raw.memberKey) && isTicketSig(raw.consent)
    ? { memberKey: raw.memberKey, consent: raw.consent }
    : undefined;
}

/**
 * The `"party-formed"` channel: a group id, the party's members, and one
 * consent a member.
 */
export function parseWirePartyFormed(value: unknown): WirePartyFormed | undefined {
  const raw = fields(value);
  const groupId: unknown = raw?.groupId;
  const members = parsePartyMembers(raw?.members);
  const consents: unknown = raw?.consents;
  if (
    !isTicketId(groupId) ||
    members === undefined ||
    !Array.isArray(consents) ||
    consents.length !== members.length
  ) {
    return undefined;
  }
  const signed: string[] = [];
  for (const consent of consents as readonly unknown[]) {
    if (!isTicketSig(consent)) {
      return undefined;
    }
    signed.push(consent);
  }
  return { groupId, members, consents: signed };
}

/** The `"party-split"` channel. */
export function parseWirePartySplit(value: unknown): WirePartySplit | undefined {
  const raw = fields(value);
  return raw !== undefined && Object.keys(raw).length === 0 ? {} : undefined;
}

/** The `"lobby-move"` channel: a well-formed key, or nothing. */
export function parseWireLobbyMove(value: unknown): WireLobbyMove | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    Object.keys(raw).length === 1 &&
    isString(raw.code) &&
    isLobbyCode(raw.code)
    ? { code: raw.code }
    : undefined;
}

function parseLobbyTeam(value: unknown): 0 | 1 | null | undefined {
  return value === null || isTeam(value) ? value : undefined;
}

function parseLobbyPlayer(value: unknown): WireLobbyPlayer | undefined {
  const raw = fields(value);
  const team = parseLobbyTeam(raw?.team);
  const guildCape = parseNullableCape(raw?.guildCape);
  return raw !== undefined &&
    isString(raw.id) &&
    isString(raw.name) &&
    isNullableString(raw.guildTag) &&
    guildCape !== undefined &&
    team !== undefined &&
    typeof raw.ready === "boolean" &&
    typeof raw.isHost === "boolean" &&
    typeof raw.bot === "boolean" &&
    typeof raw.away === "boolean"
    ? {
        id: raw.id,
        name: raw.name,
        guildTag: raw.guildTag,
        guildCape,
        team,
        ready: raw.ready,
        isHost: raw.isHost,
        bot: raw.bot,
        away: raw.away,
      }
    : undefined;
}

function parseProfessions(
  value: unknown,
): { readonly primary: string; readonly secondary: string | null } | undefined {
  const raw = fields(value);
  return raw !== undefined && isString(raw.primary) && isNullableString(raw.secondary)
    ? { primary: raw.primary, secondary: raw.secondary }
    : undefined;
}

function parseTeamProposal(value: unknown): WireTeamProposal | undefined {
  const raw = fields(value);
  const members = parseArray(raw?.members, MAX_TEAM_LOBBY_SIDE, parseProfessions);
  const voterIds = parseArray(raw?.voterIds, MAX_TEAM_LOBBY_SIDE, parseString);
  return raw !== undefined &&
    isString(raw.proposerId) &&
    members !== undefined &&
    voterIds !== undefined
    ? { proposerId: raw.proposerId, members, voterIds }
    : undefined;
}

function parseTeamChoice(value: unknown): WireTeamChoice | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  const members = parseArray(raw?.members, MAX_TEAM_LOBBY_SIDE, (item) =>
    item === null ? undefined : (parseLobbyCharacter(item) ?? undefined),
  );
  return raw !== undefined &&
    isNullableString(raw.proposerId) &&
    isOneOf(raw.reason, ["votes", "captain", "random", "house"] as const) &&
    members !== undefined
    ? { proposerId: raw.proposerId, reason: raw.reason, members }
    : undefined;
}

function parseTeamSide(value: unknown): WireTeamSide | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  if (
    raw === undefined ||
    !(raw.size === null || (isCount(raw.size) && raw.size <= MAX_TEAM_LOBBY_SIDE)) ||
    !isNullableString(raw.captainId)
  ) {
    return undefined;
  }
  const proposals = parseArray(raw.proposals, MAX_TEAM_LOBBY_SIDE, parseTeamProposal);
  const chosen = parseTeamChoice(raw.chosen);
  const claims = parseArray(raw.claims, raw.size ?? MAX_TEAM_LOBBY_SIDE, (item) =>
    item === null ? null : parseString(item),
  );
  return proposals === undefined || chosen === undefined || claims === undefined
    ? undefined
    : { size: raw.size, captainId: raw.captainId, proposals, chosen, claims };
}

function parseTeamLobby(value: unknown): WireTeamLobby | null | undefined {
  if (value === null) {
    return null;
  }
  const raw = fields(value);
  const sides = Array.isArray(raw?.sides) && raw.sides.length === 2 ? raw.sides : undefined;
  const ours = parseTeamSide(sides?.[0]);
  const theirs = parseTeamSide(sides?.[1]);
  return raw !== undefined &&
    isOneOf(raw.stage, ["vote", "claim"] as const) &&
    isCount(raw.secondsLeft) &&
    ours !== undefined &&
    theirs !== undefined
    ? { stage: raw.stage, secondsLeft: raw.secondsLeft, sides: [ours, theirs] }
    : undefined;
}

/** The `"lobby-state"` channel. */
export function parseWireLobbyState(value: unknown): WireLobbyState | undefined {
  const raw = fields(value);
  const teamLobby = parseTeamLobby(raw?.teamLobby);
  if (
    raw === undefined ||
    teamLobby === undefined ||
    !isString(raw.code) ||
    !isOneOf(raw.phase, ["waiting", "team-lobby", "queued", "starting", "in-match"] as const) ||
    !(raw.queueNonce === null || isTicketId(raw.queueNonce)) ||
    !isAscentRound(raw.ascentRound) ||
    !isOneOf(raw.mode, LOBBY_MODES) ||
    !isString(raw.mapId) ||
    typeof raw.open !== "boolean" ||
    !isString(raw.hostId) ||
    !isNullableString(raw.matchId) ||
    !(raw.countdownSeconds === null || isCount(raw.countdownSeconds))
  ) {
    return undefined;
  }
  const players = parseArray(raw.players, MAX_LOBBY_PLAYERS, parseLobbyPlayer);
  return players === undefined
    ? undefined
    : {
        code: raw.code,
        phase: raw.phase,
        mode: raw.mode,
        mapId: raw.mapId,
        open: raw.open,
        hostId: raw.hostId,
        matchId: raw.matchId,
        players,
        countdownSeconds: raw.countdownSeconds,
        teamLobby,
        queueNonce: raw.queueNonce,
        ascentRound: raw.ascentRound,
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
    case "select-mode":
      return isOneOf(raw.mode, LOBBY_MODES) ? { kind: "select-mode", mode: raw.mode } : undefined;
    case "find-match":
      return isAscentRound(raw.ascentRound)
        ? { kind: "find-match", ascentRound: raw.ascentRound }
        : undefined;
    case "start":
    case "leave-queue":
    case "house-team":
      return { kind: raw.kind };
    case "propose": {
      if (raw.slot === null) {
        return { kind: "propose", slot: null };
      }
      const build = parseJson(raw.build);
      return isCount(raw.slot) &&
        isCount(raw.size) &&
        raw.size <= MAX_TEAM_LOBBY_SIDE &&
        raw.slot < raw.size &&
        build !== undefined
        ? { kind: "propose", slot: raw.slot, size: raw.size, build }
        : undefined;
    }
    case "vote":
      return isNullableString(raw.proposerId)
        ? { kind: "vote", proposerId: raw.proposerId }
        : undefined;
    case "claim":
      return raw.slot === null || isNumber(raw.slot)
        ? { kind: "claim", slot: raw.slot }
        : undefined;
    case "team-plan": {
      const build = parseJson(raw.build);
      return isCount(raw.slot) &&
        isCount(raw.size) &&
        raw.size <= MAX_TEAM_LOBBY_SIDE &&
        raw.slot < raw.size &&
        (raw.memberKey === null || isTicketId(raw.memberKey)) &&
        build !== undefined
        ? {
            kind: "team-plan",
            slot: raw.slot,
            size: raw.size,
            memberKey: raw.memberKey,
            build,
          }
        : undefined;
    }
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

function parseProposalBuild(value: unknown): WireProposalBuild | undefined {
  const raw = fields(value);
  const skills = parseArray(raw?.skills, MAX_WIRE_SLOTS, (item) =>
    item === null ? null : parseString(item),
  );
  return raw !== undefined &&
    skills?.length === MAX_WIRE_SLOTS &&
    isNullableString(raw.mainHand) &&
    isNullableString(raw.offHand)
    ? { skills, mainHand: raw.mainHand, offHand: raw.offHand }
    : undefined;
}

/** The `"team-proposal-builds"` channel. */
export function parseWireTeamProposalBuilds(value: unknown): WireTeamProposalBuilds | undefined {
  const raw = fields(value);
  const builds = parseArray(raw?.builds, MAX_TEAM_LOBBY_SIDE, parseProposalBuild);
  return raw !== undefined && isString(raw.proposerId) && builds !== undefined
    ? { proposerId: raw.proposerId, builds }
    : undefined;
}

/** The `"match-start"` channel. */
export function parseWireMatchStart(value: unknown): WireMatchStart | undefined {
  const raw = fields(value);
  return raw !== undefined &&
    isString(raw.mapId) &&
    isString(raw.matchId) &&
    typeof raw.teamPlanRejected === "boolean"
    ? { mapId: raw.mapId, matchId: raw.matchId, teamPlanRejected: raw.teamPlanRejected }
    : undefined;
}
