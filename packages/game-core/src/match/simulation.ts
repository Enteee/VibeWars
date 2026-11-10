import type { SkillBar } from "../build.js";
import { isWeaponSetIndex, type WeaponSetIndex } from "../equipment/loadout.js";
import {
  creatureResolvedEquipment,
  type ResolvedEquipment,
  type ResolvedLoadout,
  type ResolvedWeaponSet,
  type ResolvedWeaponSets,
} from "../equipment/resolve.js";
import { wieldsFor, type WeaponId } from "../equipment/weapons.js";
import { spellModComesUp } from "../skills/spell-mods.js";
import {
  distanceWithinRange,
  firstHit,
  hasLineOfSight,
  closestPointOnPolygon,
  pointInPolygon,
  progressAlong,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
  type Polygon,
} from "../geometry.js";
import type { Segment } from "../geometry.js";
import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  RANGE_COMPASS,
  RANGE_NATURE_RITUAL,
  RANGE_SPIRIT,
  SHADOW_STEP_AWAY_DISTANCE,
} from "../distances.js";
import {
  addPoint,
  DEATH_PENALTY_PERCENT,
  DP_GRACE_AFTER_RES_SECONDS,
  emptyScore,
  evaluateMatch,
  KILL_MORALE_PERCENT,
  MATCH_IN_PROGRESS,
  MORALE_CEILING,
  MORALE_FLOOR,
  moraleMaximum,
  POINT_TICK_SECONDS,
  PRIEST_WAVE_SECONDS,
  CAPTURE_WAVE_SECONDS,
  SHRINE_INVULNERABLE_SECONDS,
  soleLeader,
  teamBeaten,
  withLatestTeam,
  teamIds,
  TWO_TEAM_MODES,
  type MatchOutcome,
  type MatchPhase,
  type MatchRules,
  type MatchScore,
  type MatchStanding,
  type TeamCount,
  type TeamStanding,
} from "../match-rules.js";
import { clampInputDirection, integrateMovement } from "../movement.js";
import {
  atObjective,
  deckBlocksSight,
  feelsHeight,
  floorOf,
  floorsAt,
  heightDamageMultiplier,
  heightRange,
  heightStep,
  rampRims,
  sharesFloor,
  type FloorTransition,
} from "./layer-rules.js";
import {
  buildLayeredNavGraph,
  createLayeredPathFinder,
  navGraphFor,
  isStandable,
  nearestStandable,
  type GatedNavGraph,
  type LayeredPathFinder,
  type NavGraph,
  type RouteWaypoint,
  walkIsClear,
} from "../pathing.js";
import {
  LEADERSHIP_ATTRIBUTE,
  leadershipEnergy,
  SOUL_REAPING_ATTRIBUTE,
  soulReapingEnergy,
  soulReapingTrigger,
  SPAWNING_POWER_ATTRIBUTE,
  spawningPowerHealth,
} from "../primary-attributes.js";
import { createRng, seedFromString, type SimulationRng } from "../rng.js";
import { FLASH_LOCKOUT_SECONDS, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import {
  canActivate,
  isResurrectionSkill,
  hasAftercast,
  usableMidAction,
  isAllyOrSelfRule,
  isCompanionRule,
  isSummonedCreature,
  loseActionEnergy,
  payCost,
  skillHealthLoss,
  type ActivationCheck,
  type ActivationRejection,
} from "../skills/activation.js";
import {
  adrenalineLossIn,
  adrenalinePools,
  emptyAdrenaline,
  gainStrikes,
  dropEndedCopyPools,
  gainUnits,
  losesAllAdrenaline,
} from "../skills/adrenaline.js";
import {
  CastState,
  beginRecharge,
  resolvedBar,
  skillIdOfKey,
  slotSkill,
  type ActiveCast,
  type CastRule,
  type SlotSkill,
} from "../skills/cast-state.js";
import { getSkill } from "../skills/catalog.js";
import { conditionRequirementText } from "../skills/describe.js";
import { clearChainMarksOn, tickChainMarks } from "../skills/chain.js";
import {
  applyEffects,
  applyRedirectedDamage,
  applySkillEffects,
  applyStatus,
  closestOwnMinion,
  conditionTaker,
  disableOwnSkills,
  gainEnergy,
  landCaughtCondition,
  loseHealth,
  resolveSkillEffects,
  stateHolds,
  type CombatEvent,
  type SkillOutcome,
  type SkippedEffect,
  type SkillResolution,
  type TakenCreature,
} from "../skills/effects.js";
import {
  aggregateModifiers,
  attacksAgainstMiss,
  clampPips,
  ENERGY_PER_PIP,
  getStatusDefinition,
  isStatusId,
  isUnderAnother,
  MAX_PIPS,
  NO_RANKS,
  ownSkillBoost,
  preventsAttacks,
  reducedRecharge,
  scaledStatusDuration,
  STATUS_DEFINITIONS,
  StatusSet,
  type ActiveStatus,
  type Outbreak,
  type StatusChange,
  type StatusDefinition,
  type StatusId,
} from "../skills/status.js";
import {
  addOvercast,
  effectiveMaxEnergy,
  energyFloor,
  recoverOvercast,
} from "../skills/overcast.js";
import { resolveMagnitude, resolveMagnitudeAtRanks, statAt } from "../skills/scaling.js";
import { nearestSpiritWithin, resolveTargets, spiritsWithin } from "../skills/targeting.js";
import {
  advanceStatuses,
  clampMoveSpeed,
  effectiveActivationSeconds,
  effectiveMaxHealth,
  naturalHealthPips,
  netPips,
  preCapEnergyPips,
  raisedMaxHealth,
  outsideMatch,
  rankOf,
  statusRanks,
  upkeepPips,
  withRankLoan,
  type NetPips,
  type RankLoan,
} from "../skills/tick.js";
import {
  isInvulnerable,
  isSpell,
  PET_ATTACK_SECONDS,
  type Combatant,
  type CorpseRule,
  type Aura,
  type CreateGroundEffect,
  type CreatureTemplate,
  type DeathBurst,
  type DeathInRange,
  type SpiritPulse,
  type GroundAct,
  type PulseEnd,
  type Skill,
  type SkillEffect,
} from "../skills/types.js";
import {
  leadAimPoint,
  PositionHistory,
  trackTarget,
  type Projectile,
  type SkillHit,
  type SpellHit,
} from "../skills/projectile.js";
import {
  aimedAt,
  attackBlockedRiders,
  attackDurationSeconds,
  attackHitRiders,
  attackReached,
  bearerAttacked,
  bearerFailedToHit,
  bearerMissed,
  bearerHit,
  blindMisses,
  lowRankMisses,
  blocks,
  criticalHitRiders,
  landedCritical,
  landBlow,
  nextAttackSkillOf,
  nextAttackSkillRiders,
  PLAIN_BLOW,
  removePreparations,
  resolveAttackSkill,
  resolveAttackSkillOutcome,
  resolveSwing,
  settleBlow,
  skillBlow,
  useNextAttackSkill,
  swingIntervalSeconds,
  releasedStrikes,
  strikeCount,
  unblockableNow,
  weaponSnapshotOf,
  blowKind,
  withEndedStatuses,
} from "../skills/weapon-attack.js";
import {
  breakHex,
  fireChangeTriggers,
  fireCreationTriggers,
  fireDeathTriggers,
  fireEndTriggers,
  fireSourceApartTriggers,
  fireSourceTargetsTriggers,
  fireTriggers,
  type AimedAt,
  type DirectTriggerEvent,
  type FiredTrigger,
  type SpreadGainedCondition,
  type TriggerContext,
} from "../skills/triggers.js";
import { copiesSkill, isEchoStatus } from "../skills/stand-in.js";
import { add, distance, normalize, scale, sub, vec2, ZERO, type Vec2 } from "../vec2.js";
import {
  createCursor,
  decide,
  nearestLiving,
  NO_OBJECTIVES,
  type Behaviour,
  type BehaviourCursor,
  type BotObjectives,
  type ResetPolicy,
} from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { freshCorpsesWithin, nearestFreshCorpse } from "./corpses.js";
import { companionSkills, PET_DEATH_GRACE_SECONDS } from "./companions.js";
import { creatureId } from "./creature-id.js";
import {
  MASTERLESS_TEAM,
  MINION_CAP_ATTRIBUTE,
  minionCap,
  minionDegenerationPips,
} from "./minions.js";
import { directionAngle, showsBackTo, spawnFacing } from "./facing.js";
import {
  GUILD_LORD_HEALTH_PIPS,
  guildLordId,
  guildLordLossCap,
  guildLordSpec,
  type GuildLord,
} from "./guild-lord.js";
import {
  FLAG_STAND_ID,
  fallenDrops,
  isCarriedObjectId,
  type CarriedArrival,
  type CarriedDrop,
  type CarriedPoint,
} from "./carried.js";
import {
  FLAG_CARRIER_SPEED_MULTIPLIER,
  FLAG_MORALE_BOOST,
  FLAG_REACH_UNITS,
  carriedFlag,
  dropFlag,
  flagRefusal,
  flagTargetPoint,
  flagTeamOf,
  initialFlags,
  stepFlags,
  type FlagField,
  type FlagState,
  type FlagsState,
  type StandState,
} from "./flags.js";
import {
  GHOST_PIPS,
  initialCapturePoints,
  onCapturePoint,
  stepCapturePoints,
  type CapturePoint,
  type CapturePointSite,
} from "./capture-points.js";
import {
  cutShotAtGate,
  holdsPlate,
  initialGates,
  stepGate,
  type Gate,
  type GateField,
} from "./gates.js";
import {
  flipSwitch,
  initialSwitches,
  switchIdOf,
  type Switch,
  type SwitchField,
} from "./switches.js";
import {
  carriedRelic,
  initialRelics,
  ALTAR_REACH_UNITS,
  onAltar,
  relicRefusal,
  relicTargetPoint,
  relicTeamOf,
  stepRelics,
  type RelicField,
  type RelicState,
  type RelicsState,
} from "./relics.js";
import { guardSpec, type BaseGuard } from "./guards.js";
import {
  BEACON_STRIKE_RADIUS,
  beaconStrikeArea,
  UNOWNED_BEACON,
  beaconLightning,
  stepBeacon,
  type BeaconState,
} from "./beacon.js";
import { zoneStrike } from "./zone-strike.js";
import {
  ZONE_REHIT_SECONDS,
  ZONE_RULES,
  zonePhaseAt,
  zonePolygonAt,
  zoneReach,
  zoneSourceId,
  zonesHolding,
  zoneWindowAt,
  type MatchZone,
} from "./zones.js";
import { UNCLAIMED_ALTAR, claimant, mayClaim, stepAltar, type AltarState } from "./altar.js";
import {
  CLAIM_SKILL_ID,
  followBehaviour,
  ghostId,
  GHOST_MORALE_BOOST,
  ghostSpec,
  isGhostId,
  onHill,
  stayBehaviour,
  type GhostField,
} from "./ghost.js";
import { priestId, priestSpec, type Shrine } from "./priest.js";
import { steerAround } from "./steering.js";
import { EN_NAMES, EN_WORDS } from "../skills/describe-words.js";

/**
 * One match, steppable, with no transport attached (ADR-0017).
 *
 * This is the only copy of the per-tick rules. The server's `MatchRoom`
 * wraps it in sockets and schema sync, `runHeadlessMatch` drives it with
 * behaviours, and the training arena will run it in the browser. Every
 * game rule is still in the pure functions it calls; what lives here is
 * their order within a tick, which is a rule too, and the one that had
 * drifted while it existed twice.
 *
 * Order within a tick, per participant, in the order they were added:
 * reset policy, respawn countdown (if dead), movement, energy regeneration, statuses,
 * cast resolution, the weapon attack (approach or swing), then the
 * participant's behaviour, if it has one. Projectiles already in flight
 * advance, and land, before anyone acts. Player-driven participants have
 * none: their intents arrive between steps, through `setInputDirection`,
 * `walkTo`, `setTarget`, `requestSkill`, `requestAttack` and `cancelAction`.
 */

/**
 * What kind of non-player body this is (#467); a priest (#1186), a Guild
 * Lord (#1222), a base guard (#1223) and a Ghostly Hero (#1377) are a map's.
 */
export type CreatureKind =
  "spirit" | "minion" | "pet" | "priest" | "guild-lord" | "guard" | "ghostly-hero";

/**
 * How a companion fights (#1110, GW1 pet control): game-protocol's
 * `CompanionMode`, restated (ADR-0001). Guard bites what its owner
 * attacks, Fight what its owner has selected, Heel nothing.
 */
export type CompanionMode = "guard" | "fight" | "heel";

/** What an owner may tell a creature of theirs (#1046): game-protocol's `CreatureOrder`. */
export interface CreatureOrder {
  readonly kind: "mode";
  readonly mode: CompanionMode;
}

/**
 * What a creature looks like (#1162): the glyph on its plate. The wire mirrors it as `CREATURE_LOOKS`, a test holding the two.
 */
export const CREATURE_LOOKS = [
  "beast",
  "bone-minion",
  "bone-horror",
  "bone-fiend",
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
export type CreatureLook = (typeof CREATURE_LOOKS)[number];

/**
 * A spirit's death burst as it arrived: its rate (#1603), the time of
 * the status it gives (#1956), or the Health it raises with (#2478), on
 * its owner's rank.
 */
export type ArrivedDeathBurst =
  | (Omit<Extract<DeathBurst, { effect: "damage" | "heal" }>, "perSecondAlive"> & {
      readonly perSecondAlive: number;
    })
  | (Omit<Extract<DeathBurst, { effect: "apply-status" }>, "durationSeconds"> & {
      readonly durationSeconds: number;
    })
  | (Omit<Extract<DeathBurst, { effect: "resurrect" }>, "healthPercent"> & {
      readonly healthPercent: number;
    });

/** A spirit's answer to a death in its range as it arrived: its damage on its owner's rank (#1886). */
export type ArrivedDeathInRange =
  | (Omit<Extract<DeathInRange, { kind: "damage-same-type" }>, "damage"> & {
      readonly damage: number;
    })
  | Extract<DeathInRange, { kind: "spread-conditions" }>;

/** A spirit's heal pulse as it arrived (#2477): its heal on its owner's rank, and its count. */
export interface ArrivedSpiritPulse extends Omit<SpiritPulse, "heal"> {
  readonly heal: number;
  pulsed: number;
}

/**
 * A body that is not a player (#1052, ADR-0035): a participant that never
 * counts for its team and has no seat. A spirit or minion is gone once it
 * dies or expires; a companion lies where it fell (#1046).
 */
export interface Creature {
  /**
   * Whoever summoned it, and whom it answers to: it leaves with them.
   * `undefined`: a map's NPC, as a priest (#1186), which answers to nobody,
   * or a masterless minion (#2092), on `MASTERLESS_TEAM`. A spirit or
   * minion someone takes control of (#1965) answers to them from then on.
   */
  ownerId: string | undefined;
  /**
   * The owner's status that holds it (#2092): Verata's Aura's. Once the
   * owner no longer bears it, it goes masterless. `undefined`: none.
   */
  bondStatusId: StatusId | undefined;
  readonly kind: CreatureKind;
  /** From the template (#1162): how it is drawn. */
  readonly look: CreatureLook;
  /** Shown in the target frame and the name label, e.g. "Bone Minion". */
  readonly name: string;
  /** Seconds left before it vanishes; `Infinity`: until it is killed. */
  expiresInSeconds: number;
  /** Seconds alive, summed from `dt`: what a minion's rot grows with (#467). */
  ageSeconds: number;
  /** The tick it was summoned: the tie-break of a minion cap (#1130). */
  readonly summonedAtTick: number;
  /** The skill that summoned it (#1064): one spirit of a skill in range. `undefined`: a map's NPC. */
  readonly skillId: string | undefined;
  /** What a spirit projects on whoever is in range (#1064); `undefined`: nothing. */
  readonly aura: Aura | undefined;
  /**
   * From the template (#1046): lies as a body when dead, or vanishes; or
   * lies until its `on-death` reset raises it, a Ghostly Hero's (#1377),
   * with no morale to lose.
   */
  readonly onDeath: "vanish" | "lie" | "rise";
  /** Its owner's bar is disabled this long on its death, read at arrival; 0: never. */
  readonly ownerDisableSeconds: number;
  /**
   * From the template (#1550): what its leaving does round it, its rate
   * read on its owner's rank at arrival (#1603).
   */
  readonly deathBurst: ArrivedDeathBurst | undefined;
  /** From the template (#1886): what another's death in its range does. */
  readonly onDeathInRange: ArrivedDeathInRange | undefined;
  /**
   * From the template (#2477): its heal read on its owner's rank at
   * arrival, and how many it has given.
   */
  readonly pulse: ArrivedSpiritPulse | undefined;
  /** From the template (#1836): who stands up where it falls, its owner's. */
  readonly replacedBy: CreatureTemplate["replacedBy"];
  /**
   * The exploitable corpses it leaves when it dies (#1836), read at
   * summoning; each exploit spends one, and it goes with the last.
   */
  corpsesLeft: number;
  /**
   * The skill on its owner's bar it travels with (#1046): a companion.
   * `undefined`: summoned by a cast.
   */
  readonly companionSkillId: string | undefined;
  /**
   * Whom a Ghostly Hero follows (#1377), in place of an owner;
   * `undefined` while it stays, and for any other creature.
   */
  leaderId: string | undefined;
  /**
   * Its owner's last order (#1110): kept through its death, Comfort Animal
   * and its owner's respawn. Only a companion takes orders.
   */
  mode: CompanionMode;
}

/** A companion's mode (#1110); `null` for a creature that takes no orders. */
export function companionMode(creature: Creature): CompanionMode | null {
  return creature.companionSkillId === undefined ? null : creature.mode;
}

/**
 * A creature's own Health pips: a minion's rot (#467), a Guild Lord's
 * innate regeneration (#1222); 0 for anyone else.
 */
function creaturePips(participant: Participant): number {
  switch (participant.creature?.kind) {
    case "minion":
      return minionDegenerationPips(participant.creature.ageSeconds);
    case "guild-lord":
      return GUILD_LORD_HEALTH_PIPS;
    default:
      return 0;
  }
}

/** Below this past a whole second, the clock is read as on it: dt sums drift (#1223). */
const WHOLE_SECOND_EPSILON = 1e-6;

/**
 * At most this many summoned creatures in a match at once (#1052): a
 * summon past it makes as many as fit. A map's own creatures, its priests,
 * Guild Lords and guards, never take a summon's place (#1281).
 */
export const MAX_CREATURES = 32;

/**
 * A spirit's Energy (#2504), full as it is made: 30, at 4 pips. It casts
 * nothing, so only what drains it reads it, as Spirit Siphon does.
 */
export const SPIRIT_MAX_ENERGY = 30;
const SPIRIT_ENERGY_PIPS = 4;

/** The most creatures a map places itself (#1281): a map with more is refused at setup. */
export const MAX_MAP_CREATURES = 24;

/**
 * A circle on the ground (#1087, ADR-0035): not a body, so nothing can
 * target, kill or move it. It does `act` from where it was placed until
 * it ends: a ward projects an aura, a trap waits to be sprung (#1105), a
 * pulse lands its effects every interval (#1113).
 * Its owner dying does not end it.
 */
export interface GroundEffect {
  /** From 1, in the order they were placed. */
  readonly id: number;
  readonly skillId: string;
  readonly ownerId: string;
  /** The owner's, as it was placed. */
  readonly team: number;
  readonly position: Vec2;
  /** The layer it lies on (ADR-0051), fixed as it was placed. */
  readonly layer: number;
  readonly act: GroundAct;
  /** How long it was placed for. */
  readonly durationSeconds: number;
  remainingSeconds: number;
  /** Pulses it has landed (#1113); 0 for any act but a pulse. */
  pulsed: number;
}

/** At most this many ground effects at once (#1087): past it, the oldest ends early. */
export const MAX_GROUND_EFFECTS = 32;

/** Whether an aura that `affects` this, from a source on `sourceTeam`, reaches a body on `team`. */
function reaches(affects: Aura["affects"], sourceTeam: number, team: number): boolean {
  switch (affects) {
    case "all":
      return true;
    case "allies":
      return team === sourceTeam;
    case "foes":
      return team !== sourceTeam;
  }
}

/**
 * Whether `participant` counts for its team (ADR-0035): its roster,
 * score, morale total and win condition. A creature never does.
 */
export function countsForTeam(participant: Participant): boolean {
  return participant.creature === undefined;
}

/**
 * Whether `participant` has morale (#843): a player, and a companion, a
 * creature that lies when dead (#1133). Keyed on lying, not on pets, so a
 * hero later gets the same rule. A companion's morale never counts for
 * its team.
 */
function hasMorale(participant: Participant): boolean {
  return participant.creature === undefined || participant.creature.onDeath === "lie";
}

/**
 * A map's discrete layers (ADR-0051): `ground` is the ground, everywhere but
 * its pits; the layer under it is its pits and tunnels (#2973).
 */
export interface MatchLayers {
  readonly count: number;
  readonly ground: number;
  /** Each layer's walls, indexed by layer, and without any gate's. */
  readonly walls: readonly (readonly Segment[])[];
  /** Floors over a layer, a tunnel being one of the ground's: they hide and cover what is under them. */
  readonly decks: readonly { readonly layer: number; readonly footprint: Polygon }[];
  /** Holes in the ground, open to the sky, on the layer under it. */
  readonly pits: readonly Polygon[];
  /** Ramps and stairs: inside `area`, a body moves between `from` and `to`, one above, towards `uphill`. */
  readonly transitions: readonly FloorTransition[];
  /**
   * Each layer's deep water (#2983), indexed by layer, as its outline: it
   * stops bodies and paths as a wall does, but never sight or shots.
   */
  readonly deepWater: readonly (readonly Segment[])[];
}

export interface ParticipantSpec {
  readonly id: string;
  readonly team: number;
  readonly skillBar: SkillBar;
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly equipment: ResolvedEquipment;
  readonly spawn: Vec2;
  /** The layer it spawns and respawns on (ADR-0051). Omitted: the ground. */
  readonly layer?: number;
  /** Where it faces at the start and after every reset, in radians (`atan2`, 0 = +x). */
  readonly facing: number;
  /** Defaults to the ruleset's base health. */
  readonly maxHealth?: number;
  /** Defaults to the ruleset's base energy. */
  readonly maxEnergy?: number;
  /** Energy regeneration before statuses, in pips. Defaults to 0: none, as a dummy needs. */
  readonly baseEnergyPips?: number;
  /** Health to start (and reset) at, as a fraction of max. Defaults to 1. */
  readonly startHealthFraction?: number | undefined;
  /**
   * Morale to start at, in percent (#2686): a Heroes' Ascent run carries
   * it from map to map. Clamped to `MORALE_FLOOR`..`MORALE_CEILING`.
   * Defaults to 0.
   */
  readonly startMorale?: number | undefined;
  /** Omitted: driven from outside, like a player. */
  readonly behaviour?: Behaviour | undefined;
  /** Omitted: `never`. Death then follows the match rules' respawn. */
  readonly reset?: ResetPolicy | undefined;
  /** Omitted: a player or a training dummy, not a creature (#1052). */
  readonly creature?: Creature | undefined;
  /**
   * Sets 2-4 (#489), `null` where empty; `equipment` and `maxEnergy`
   * are set 1, in hand at the start. Omitted: none, as dummies,
   * creatures and the headless runner carry.
   */
  readonly spareWeaponSets?: readonly [
    ResolvedWeaponSet | null,
    ResolvedWeaponSet | null,
    ResolvedWeaponSet | null,
  ];
}

/** What `requestWeaponSet` did (#489). */
export type WeaponSetRequest =
  | { readonly kind: "swapped" }
  | { readonly kind: "queued" }
  /** The active set's key: nothing to do, and a queued swap is dropped. */
  | { readonly kind: "kept" }
  | { readonly kind: "refused"; readonly reason: "dead" | "empty-set" | "no-such-set" };

/**
 * The loadout's half of a participant spec, so every caller turns a
 * loadout into one the same way: set 1 in hand, the others spare (#489).
 */
export function loadoutSpec(
  loadout: ResolvedLoadout,
): Pick<
  ParticipantSpec,
  "attributeRanks" | "equipment" | "maxHealth" | "maxEnergy" | "baseEnergyPips" | "spareWeaponSets"
> {
  const [set1, set2, set3, set4] = loadout.weaponSets;
  return {
    attributeRanks: loadout.attributeRanks,
    equipment: set1.equipment,
    maxHealth: set1.maxHealth,
    maxEnergy: set1.maxEnergy,
    baseEnergyPips: set1.baseEnergyPips,
    spareWeaponSets: [set2, set3, set4],
  };
}

export interface Participant {
  readonly id: string;
  readonly combatant: Combatant;
  readonly skillBar: SkillBar;
  readonly spawn: Vec2;
  position: Vec2;
  /** The one layer it is on (ADR-0051): only a ramp changes it, and a respawn. */
  layer: number;
  /**
   * The floors it stands on (ADR-0051): its layer's bit and, inside a ramp,
   * both the ramp connects. What melee and areas read.
   */
  floors: number;
  /**
   * Where it faces, in radians, `atan2` convention, in (−π, π], 0 = +x.
   * Where it last pushed, or at what it is casting at or swinging at,
   * whichever came last in the step. The dead keep the facing they died with.
   */
  facing: number;
  inputDirection: Vec2;
  /**
   * Where a click-to-walk is taking it, round walls and bodies (#310);
   * `undefined` when not walking. Until the next step settles it, the
   * point as clicked.
   */
  walkGoal: Vec2 | undefined;
  /** The layer a click-to-walk named; `undefined` when it named none. Read only while walking. */
  walkLayer: number | undefined;
  /**
   * A targeted skill pressed out of range or out of sight, being walked
   * to (#415, #499); `undefined` when there is none. It goes off on
   * arrival, and nothing is paid until then.
   */
  pendingSkill: PendingSkill | undefined;
  /**
   * The flag, the stand (#1225) or the relic (#1374) Space walks it to,
   * to take, plant or return one on reaching it; `undefined` for none.
   * Any other order ends it.
   */
  interact: { readonly targetId: string; unreachableSeconds: number } | undefined;
  targetId: string | undefined;
  respawnInSeconds: number;
  /**
   * Seconds since it was last in combat, by GW1's list (#460): lost
   * health, swung or used an attack skill, began a cast at a foe, or was
   * the target of a foe's as it began. What natural regeneration waits on.
   */
  readonly outOfCombatSeconds: number;
  /** `undefined`: a player or a training dummy (#1052). */
  readonly creature: Creature | undefined;
  /** Every carried set, set 1 first (#489, ADR-0036). */
  readonly weaponSets: ResolvedWeaponSets;
  /** The set in hand: `combatant.equipment` is `weaponSets[activeWeaponSet].equipment`. */
  readonly activeWeaponSet: WeaponSetIndex;
  /** A swap waiting for the cast, aftercast, swing or knockdown to end; `undefined` for none. */
  readonly pendingWeaponSet: WeaponSetIndex | undefined;
  /**
   * Its corpse was exploited (#466): false while alive, and false for a
   * corpse no skill has used yet. Cleared by every way back to life.
   */
  readonly corpseExploited: boolean;
  /**
   * A companion's next blow, armed by its owner's pet attack (#1046):
   * the skill, and how long it waits. `undefined`: a plain blow. Shown on
   * the pet's party-window row (#1167).
   */
  readonly armedAttack: { readonly skillId: string; readonly remainingSeconds: number } | undefined;
}

/** A skill walking in to its target (#499). */
export interface PendingSkill {
  readonly slot: number;
  readonly targetId: string;
  /** As an attack's: how long the walk has got nowhere (#218). */
  unreachableSeconds: number;
}

/** A rect on a layer: the Elite Zaishen Battle's start line (#2692). */
export interface StartLine {
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MatchSimulationOptions {
  readonly seed: string | number;
  readonly ruleset?: Ruleset;
  /**
   * Scoring, time limit and respawn. Omitted: the match never ends and
   * the dead stay dead, which is what training and the headless runner
   * want.
   */
  readonly matchRules?: MatchRules | undefined;
  /**
   * How many teams play (#2682): every participant's team is one of
   * `teamIds(teamCount)`, but a masterless creature's. Omitted: two.
   */
  readonly teamCount?: TeamCount;
  /** Omitted or `[]`: nothing collides with a wall or blocks line of sight. */
  readonly walls?: readonly Segment[];
  /** Omitted: one layer, the ground, and `walls` is its walls. */
  readonly layers?: MatchLayers | undefined;
  /**
   * The map's size: no body leaves it, and an attack's approach never
   * paths outside it (#211). Omitted: an open field with no edge
   * (headless tools).
   */
  readonly bounds?: { readonly width: number; readonly height: number } | undefined;
  readonly participants?: readonly ParticipantSpec[];
  /**
   * Priest Annihilation's shrines (#1186): a priest of each one's team
   * stands on it from the start, and the team's dead come back there.
   * Omitted or `[]`: no priests.
   */
  readonly shrines?: readonly Shrine[];
  /**
   * The Guild Battle's Guild Lords (#1222): each stands at its post from
   * the start, and in that mode the shrines raise with no priest.
   * Omitted or `[]`: none.
   */
  readonly guildLords?: readonly GuildLord[];
  /**
   * The Guild Battle's flag stand and flag spawns (#1225): each team's
   * flag stands at its spawn from the start. Omitted: no flags.
   */
  readonly flagField?: FlagField | undefined;
  /**
   * A Relic Run's altar and relic spawns (#1374): each team's relic lies
   * at its spawn from the start. Omitted: no relics.
   */
  readonly relicField?: RelicField | undefined;
  /**
   * A map's ghost spawns, and King of the Hill's altar (#1377, #2689):
   * each team's Ghostly Hero stands at its spawn from the start.
   * Omitted: no ghosts.
   */
  readonly ghostField?: GhostField | undefined;
  /**
   * Capture Points' shrines (#1378), each neutral at the start. Omitted
   * or `[]`: none.
   */
  readonly capturePoints?: readonly CapturePointSite[];
  /** The Elite Zaishen Battle's start line (#2692); none if omitted. */
  readonly startLine?: StartLine | undefined;
  /** The map's gates (#2691); none if omitted. */
  readonly gates?: readonly GateField[];
  /** The map's switches (#3025), each naming gates by index; none if omitted. */
  readonly switches?: readonly SwitchField[];
  /** The map's effect zones (ADR-0053, #3024), in its order; none if omitted. */
  readonly zones?: readonly MatchZone[];
  /**
   * The Guild Battle's base guards (#1223), each at its post from the
   * start; a team's Bodyguard cuts the damage to its Guild Lord while it
   * lives. Omitted or `[]`: none.
   */
  readonly guards?: readonly BaseGuard[];
}

export interface StepResult {
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly phase: MatchPhase;
  /** Every resolution this step, in the order it happened. */
  readonly log: readonly CombatLogEntry[];
}

/** What `requestSkill` has to say, if anything. */
export interface SkillRequest {
  readonly skillId: string;
  readonly check: ActivationCheck;
  /**
   * Pressed during an activation or an aftercast, it goes off when they
   * end (#317, #1722); a targeted skill pressed out of range or out of
   * sight, when it is walked into range (#415, #499).
   */
  readonly queued?: true;
}

/** `Participant`, plus what only the simulation may change. */
interface ParticipantRecord extends Participant {
  combatant: Combatant;
  skillBar: SkillBar;
  readonly spec: ParticipantSpec;
  /** A Ghostly Hero's changes as it is told to follow or stay (#1377); every other's is its spec's. */
  behaviour: Behaviour | undefined;
  /** Fresh on a respawn: a bot back from the dead starts its thinking over (#1189). */
  cursor: BehaviourCursor;
  /** `on-interval`: seconds since the last reset. */
  sinceReset: number;
  outOfCombatSeconds: number;
  /** Where it ended its last ticks: what a projectile leads. */
  readonly history: PositionHistory;
  /** How long the walk has got nowhere, as an attack's `unreachableSeconds` counts for its approach. */
  walkStalledSeconds: number;
  /** The shortest way left to the goal the walk has reached so far: what counts as progress. */
  walkLeast: number;
  /** Whether `walkGoal` is settled: pulled onto a spot a body fits on, with a way there. */
  walkSettled: boolean;
  /**
   * Where its behaviour walks it by path (#1153), a creature to its owner,
   * passing `passing`'s body; `undefined` when it does not. Asked anew
   * every tick.
   */
  followGoal:
    | { readonly point: Vec2; readonly layer: number; readonly passing: string | undefined }
    | undefined;
  /**
   * The way an approach, a walk or a follow last planned (#1157), to
   * `goal`; `undefined` until one is asked for, and once its order ends.
   */
  route: { goal: Vec2; layer: number; waypoints: RouteWaypoint[] } | undefined;
  /**
   * Maximum health and energy before morale (#843): the participant's,
   * or its loadout's since the last `rearm`.
   */
  resolvedMaxHealth: number;
  resolvedMaxEnergy: number;
  /** Match time of the last resurrection (#812); `-Infinity` for none. */
  resurrectedAtSeconds: number;
  weaponSets: ResolvedWeaponSets;
  activeWeaponSet: WeaponSetIndex;
  /**
   * Health a swap's floor of 1 held back from its drop (#2007): the next
   * swap up pays it first, so swapping down and up again is never a heal.
   */
  swapHealthDebt: number;
  pendingWeaponSet: WeaponSetIndex | undefined;
  corpseExploited: boolean;
  armedAttack: { readonly skillId: string; remainingSeconds: number } | undefined;
  /**
   * Whether its Energy was at least 1 at the last step's check (#1956):
   * what makes a drop to 0 Famine's, and a body that stays there not.
   */
  hadEnergy: boolean;
}

/**
 * Every rank the combatant has, as `rankOf` reads it now (#1915): what
 * a summon is made at. One it has none of is 0.
 */
function ranksOf(combatant: Combatant): ReadonlyMap<string, number> {
  return new Map(
    [...combatant.attributeRanks.keys()].map((id) => [id, rankOf(combatant, id)] as const),
  );
}

/**
 * Who is behind the degeneration about to tick on `combatant`, split by
 * whether it drains or regenerates.
 *
 * `advanceStatuses` sums every status into one health change, so one
 * damage event can have several causes. The source is named only when
 * there is exactly one; otherwise it is `undefined`, and the tally counts
 * it as unattributed rather than guessing. Splitting `advanceStatuses`
 * per status was rejected: it would change the clamping and death
 * semantics of live combat to improve a readout.
 */
function degenerationSources(combatant: Combatant): {
  draining: string | undefined;
  healing: string | undefined;
} {
  const draining = new Set<string>();
  const healing = new Set<string>();
  for (const status of combatant.statuses.active) {
    const definition = STATUS_DEFINITIONS[status.id];
    const pips = statAt(definition.healthPips, status.ranks);
    if (
      pips < 0 ||
      (definition.whileUnder !== undefined &&
        statAt(definition.whileUnder.healthPips, status.ranks) < 0 &&
        isUnderAnother(combatant.statuses.active, status, definition.whileUnder))
    ) {
      draining.add(status.sourceId);
    } else if (
      pips > 0 ||
      definition.healthPipsPerEnchantment !== undefined ||
      definition.healthPerSecondWhileMoving > 0 ||
      definition.healthPerSecond > 0 ||
      (definition.whileUnder !== undefined &&
        statAt(definition.whileUnder.healthPips, status.ranks) > 0 &&
        isUnderAnother(combatant.statuses.active, status, definition.whileUnder))
    ) {
      healing.add(status.sourceId);
    }
  }
  const only = (sources: Set<string>): string | undefined =>
    sources.size === 1 ? [...sources][0] : undefined;
  return { draining: only(draining), healing: only(healing) };
}

/** How far short of its interval a swing or a flight may be and still land; see `#advanceAttack`. */
const SWING_EPSILON = 1e-9;

/** How close to zero a knockdown may be and count as over: 4 s in 0.05 s ticks leaves a float crumb. */
const KNOCKDOWN_EPSILON = 1e-9;

/** What a use of a skill spares when that skill put nothing on its own user (#999). */
const NONE_SPARED: ReadonlySet<StatusId> = new Set();

/** The ramps of a map without any, shared so `#climb` allocates nothing per body. */
const NO_TRANSITIONS: MatchLayers["transitions"] = [];
/** The decks of a map without any: the deck rule is then nothing to look up. */
const NO_DECKS: MatchLayers["decks"] = [];

/**
 * Each layer's floors and ramps, indexed by layer; the ground's stays
 * empty, being everywhere its rims leave it. Under the ground, its pits
 * and tunnels, the ground's own decks (#2973).
 */
export function walkableAreas(layers: MatchLayers | undefined): readonly (readonly Polygon[])[] {
  if (layers === undefined) {
    return [];
  }
  return Array.from({ length: layers.count }, (_, layer) =>
    layer === layers.ground
      ? []
      : [
          ...(layer === layers.ground - 1 ? layers.pits : []),
          ...layers.decks
            .filter((deck) => deck.layer === (layer < layers.ground ? layers.ground : layer))
            .map((deck) => deck.footprint),
          ...layers.transitions
            .filter((transition) => transition.from === layer || transition.to === layer)
            .map((transition) => transition.area),
        ],
  );
}

/** How far along a ramp a body must walk before it is on the other layer (#2972). */
const RAMP_CLIMBS_FROM = 0.85;
const RAMP_DESCENDS_FROM = 0.15;

/** How near a route's waypoint at a ramp's foot counts as there, in units. */
const RAMP_FOOT_REACHED_UNITS = 8;

/** At most this many push-out passes per move; see `advanceMovement`. */
const MOVEMENT_RELAX_PASSES = 4;

/**
 * How many times the last settle pass (#1837) lands what its own landings
 * owe: redirected damage on a Union bearer charges its spirit, whose
 * death ends what it upholds. Two do for any shipped chain.
 */
const LAST_PASS_LANDINGS = 4;

/**
 * How long a maintained enchantment's bearer may stay beyond compass
 * range of its caster before it ends, s (#839). GW1 says "a short grace
 * period"; this is our tuning.
 */
const UPKEEP_RANGE_GRACE_SECONDS = 5;

/** No body to pass through: a push-out that every body blocks. */
const NOBODY: ReadonlySet<string> = new Set();

/** The relics of a mode without any, shared so a read allocates nothing. */
const NO_RELICS: readonly RelicState[] = [];

/** How deep a body at `position` is inside a living body at `other`, their radii summing to `reach`. */
function penetration(position: Vec2, other: Vec2, reach: number): number {
  return Math.max(0, reach - distance(position, other));
}

/**
 * An approach step that covers less than this share of the distance it was
 * asked to walk made no progress (#277): boxed in by bodies, or pressed
 * into a wall. A tenth leaves room for a slide round a body or along a
 * wall, which is slower than a straight walk but still progress.
 */
const STALL_FRACTION = 0.1;

/** A walk this close to its goal has arrived (#310). */
const ARRIVE_UNITS = 1;

/** Replan once the goal is this far from the one the route was planned to (#1157): a body width. */
export const REPLAN_GOAL_UNITS = 28;

/**
 * Refusals that mean the target is gone, or no longer one the skill can be
 * used on: a skill walking in to it is dropped (#499). Any other waits for
 * the arrival, where it is checked again.
 */
const TARGET_REJECTIONS: ReadonlySet<ActivationRejection> = new Set([
  "no-target",
  "no-companion",
  "invalid-target-creature",
  "invalid-target-dead",
  "invalid-target-alive",
  "invalid-target-self",
  "invalid-target-ally",
  "invalid-target-enemy",
  "invalid-target-untargetable",
  "invalid-target-unenchantable",
  "no-spells",
]);

/** How a step toward a waypoint went; see `#stepToward`. */
type PathStep = "moved" | "stalled" | "held";

/**
 * Where a team's living players stand on average, and every other
 * team's (#2545): sums while placed, then means; a count of 0 for none.
 */
interface TeamCentroids {
  readonly team: { x: number; y: number; count: number };
  readonly foes: { x: number; y: number; count: number };
}

/**
 * What a status on a body that died stands up there (#1986, #2092), at
 * its caster's `ranks`, as the status's `replacedOnDeathBy` says.
 */
type ReplacedOnDeath = NonNullable<StatusDefinition["replacedOnDeathBy"]> & {
  readonly ranks: ReadonlyMap<string, number>;
  readonly skillId: string | undefined;
};

/** Every participant's combatant, without a copy: read each tick (#837). */
function* combatantsOf(records: Iterable<Participant>): Generator<Combatant> {
  for (const record of records) {
    yield record.combatant;
  }
}

/** How far a body walks from `from` along `path`'s waypoints. */
function pathLength(from: Vec2, path: readonly Vec2[]): number {
  let total = 0;
  let at = from;
  for (const next of path) {
    total += distance(at, next);
    at = next;
  }
  return total;
}

/** Turn to face `point`; one exactly underfoot has no direction, so facing stays. */
function faceToward(record: Participant, point: Vec2): void {
  const dx = point.x - record.position.x;
  const dy = point.y - record.position.y;
  if (dx !== 0 || dy !== 0) {
    record.facing = directionAngle(dx, dy);
  }
}

/** The walls of one combination of gates, and the paths round them (#2691). */
interface WallSet {
  readonly walls: readonly Segment[];
  /** One a layer. */
  readonly graphs: readonly NavGraph[];
  readonly paths: LayeredPathFinder;
}

export class MatchSimulation {
  readonly #ruleset: Ruleset;
  readonly #matchRules: MatchRules | undefined;
  /** The map's walls and every closed gate's (#2691); swapped as a gate moves. */
  #walls: readonly Segment[];
  /** Omitted on a map of one layer. */
  readonly #layers: MatchLayers | undefined;
  readonly #zones: readonly MatchZone[];
  /**
   * `#zones` that harm (#3026), each over all the ground it may cover
   * (#3029): what paths cost more through.
   */
  readonly #harmfulZones: readonly MatchZone[];
  /**
   * Each timed or moving zone's blows (#3029), by zone id: the window they
   * fell in, who is in its polygon having been struck, and when each body
   * was last struck.
   */
  readonly #zoneStrikes = new Map<
    string,
    { window: number; struck: Set<string>; lastHit: Map<string, number> }
  >();
  /** Where a body may stand on each layer above the ground: its decks and ramps. */
  readonly #walkable: readonly (readonly Polygon[])[];
  /** Each ramp's way up, as a direction, in `#layers.transitions`' order. */
  /** Each layer's ramp rims (#2975): they stop walking, never sight. */
  readonly #rampRims: readonly (readonly Segment[])[];
  /** The ground's layer (#2973): 0 on a map with nothing under it. */
  readonly #ground: number;
  /** `#walls` for each layer: what sight and shots read, swapped as a gate moves. */
  #layerWalls: readonly (readonly Segment[])[];
  /** `#layerWalls` with each layer's deep water (#2983): what collision reads. */
  #layerBlockers: readonly (readonly Segment[])[];
  readonly #gatedGraphs: readonly GatedNavGraph[];
  /** The map's walls, without any gate's; what `#walls` builds on. */
  readonly #mapWalls: readonly Segment[];
  readonly #bounds: { readonly width: number; readonly height: number } | undefined;
  /** Corners an approach or a walk can path through, one graph a layer (#211). */
  #graphs: readonly NavGraph[];
  /** Paths round this match's walls, for the attack's approach and for a walk (#211, #267, #310). */
  #paths: LayeredPathFinder;
  /** Walls and paths for each open-or-closed combination of the gates (#2691), built once. */
  readonly #wallSets = new Map<number, WallSet>();
  /** Filled in place, so a bot's objectives see each change (#2691). */
  readonly #gates: Gate[];
  readonly #switches: Switch[];
  /** Who reached a switch this step (#3025), in simulation order. */
  #switchArrivals: CarriedArrival[] = [];
  /** The living bodies a path step steers round, refilled for each one rather than allocated (#277). */
  readonly #bodies: Vec2[] = [];
  readonly #rng: SimulationRng;
  /** `options.seed` as a number: the bots' stateless rolls mix it in (#2624). */
  readonly #seed: number;
  readonly #participants = new Map<string, ParticipantRecord>();
  /**
   * What every participant's `StatusSet` shares as spent this tick
   * (#1955), cleared once the tick's last drain is done.
   */
  readonly #spentStatuses = new Set<string>();
  /** Who a status that spares the death penalty killed as it ended (#2311), until its death is recorded. */
  readonly #sparedDeaths = new Set<string>();
  /**
   * Every team anyone was added to (#846): one whose members all left is
   * still in the standing, wiped, rather than gone.
   */
  readonly #teams = new Set<number>();
  /** Teams with a member the host has not seated yet (#2890). */
  #awaitedTeams: ReadonlySet<number> = new Set();
  /** Each team's called foe (#443), which its bots fight (#1193). */
  readonly #calledTargets = new Map<number, string>();
  /** Each team's centroids for its bots (#2545), placed once a tick, reused. */
  readonly #centroids = new Map<number, TeamCentroids>();
  /** The tick `#centroids` were last placed at. */
  #centroidsTick = -1;
  #projectiles: Projectile[] = [];
  #nextProjectileId = 1;

  #tick = 0;
  #elapsedSeconds = 0;
  readonly #teamCount: TeamCount;
  #score: MatchScore;
  #outcome: MatchOutcome = MATCH_IN_PROGRESS;
  /**
   * The entries for the next step to report: its own, and a cast that a
   * move cancelled since the last one, stamped with when it happened.
   */
  #log: CombatLogEntry[] = [];
  /**
   * Soul Reaping's gains this step (#633), reported after everything
   * else in it: a death is recorded before the entry that holds it is
   * logged, and the gain reads after the death.
   */
  #reaped: CombatLogEntry[] = [];
  /**
   * The team of every death this step with `deathPenalty` on (#843): its
   * foes' +2 morale waits for the end of the step, so nobody who died in
   * it gains.
   */
  #moraleKills: number[] = [];
  /**
   * Where every participant stood as this step began (#921): what
   * `Combatant.moving` is read against at its end. A reset puts its spawn
   * here, so being put back is not walking.
   */
  #stepStart = new Map<string, Vec2>();
  /** The `n` of the next creature's id, `<ownerId>/c<n>` (#1052). */
  #nextCreature = 1;
  /**
   * Creatures that died or expired this step (#1052), in that order:
   * removed once, at its end, never mid-loop.
   */
  readonly #leaving = new Set<string>();
  /**
   * Who stands up where a minion fell this step (#1836), after the fallen
   * leave, or where any bearer of Malign Intervention fell (#2092).
   */
  readonly #replacements: {
    /** Whose it is; `undefined`: masterless (#2092), at `ranks`. */
    readonly ownerId: string | undefined;
    readonly skillId: string;
    readonly creature: CreatureTemplate;
    readonly count: number;
    readonly at: Vec2;
    /** Whose ranks it stands up at; `undefined`: its owner's as it does. */
    readonly ranks: ReadonlyMap<string, number> | undefined;
  }[] = [];
  /** Priest Annihilation's shrines (#1186), one a team; `[]` for every other match. */
  readonly #shrines: readonly Shrine[];
  /** Priest waves gone by (#1186): the next is at `PRIEST_WAVE_SECONDS` times one more. */
  #priestWaves = 0;
  /** The teams beaten earlier this match (#2682): out for good, raised by no wave. */
  readonly #eliminated = new Set<number>();
  /** The teams with a Guild Lord in the match (#1222), dead or alive. */
  readonly #guildLordTeams: ReadonlySet<number>;
  /** Damage each team dealt to a foe's Guild Lord (#1222), after armor. */
  readonly #aggression = new Map<number, number>();
  /** The flag stand and spawns (#1225); `undefined` on a map without them. */
  readonly #flagField: FlagField | undefined;
  /** Where every flag is and who holds the stand (#1225); `undefined` without a field. */
  #flagsState: FlagsState | undefined;
  /** Who reached a flag or the stand this step (#1225), in simulation order. */
  #flagArrivals: CarriedArrival[] = [];
  /** Whose Storm Beacon strikes, and how far to its next strike (#2694). */
  #beaconState: BeaconState = UNOWNED_BEACON;
  /** The altar and relic spawns (#1374); `undefined` on a map without them. */
  readonly #relicField: RelicField | undefined;
  /** Where every relic is (#1374); `undefined` without a field. */
  #relicsState: RelicsState | undefined;
  /** Who reached a relic this step (#1374), in simulation order. */
  #relicArrivals: CarriedArrival[] = [];
  #recentKillTeams: readonly number[] = [];
  #recentScoringTeams: readonly number[] = [];
  /** The map's ghost spawns and any altar (#1377, #2689); `undefined` on a map without ghosts. */
  readonly #ghostField: GhostField | undefined;
  /** Who holds the altar (#1377); nobody on a map without a hill. */
  #altarState: AltarState = UNCLAIMED_ALTAR;
  /** The teams whose ghost finished a claim this step (#1377), in simulation order. */
  #claims: number[] = [];
  /** Capture Points' shrines (#1378), who owns each and how far toward whom; `[]` without them. */
  #capturePoints: readonly CapturePoint[];
  readonly #startLine: StartLine | undefined;
  /** When team 0 first entered the start line or a team 1 member first died (#2933); `undefined` until then. */
  #clearClockStartedAt: number | undefined;
  /** What bots play for (#2542), rebuilt when the shrines change. */
  #botObjectives: BotObjectives = NO_OBJECTIVES;
  /** Shrine scorings gone by (#1378): the next is at `POINT_TICK_SECONDS` times one more. */
  #pointTicks = 0;
  /** When each team last led every other alone on shrine points (#2690), match clock. */
  readonly #ledAt = new Map<number, number>();
  /** The whole second of match clock the Guild Lords' loss caps are for (#1223). */
  #lossSecond = 0;
  /** Every ground effect in the match (#1087), in id order. */
  #groundEffects: GroundEffect[] = [];
  /** The id of the next ground effect placed (#1087). */
  #nextGroundEffect = 1;
  /**
   * Whether the last aura pass found a spirit or a ground effect (#1064,
   * #1087): with none now and none then, nobody wears an aura and the
   * pass has nothing to do.
   */
  #auras = false;

  public constructor(options: MatchSimulationOptions) {
    this.#ruleset = options.ruleset ?? MINIMAL_GW_INSPIRED_PVP_V1;
    this.#matchRules = options.matchRules;
    this.#teamCount = options.teamCount ?? 2;
    const victory = this.#matchRules?.victory;
    if (this.#teamCount !== 2 && victory !== undefined && TWO_TEAM_MODES.includes(victory)) {
      throw new Error(`a ${victory} match has two teams, not ${String(this.#teamCount)}`);
    }
    this.#score = emptyScore(teamIds(this.#teamCount));
    this.#bounds = options.bounds;
    this.#gates = initialGates(options.gates ?? []);
    this.#switches = initialSwitches(options.switches ?? []);
    this.#layers = options.layers;
    this.#zones = options.zones ?? [];
    this.#harmfulZones = this.#zones
      .filter((zone) => ZONE_RULES[zone.kind].harmful)
      .map((zone) => ({ ...zone, polygon: zoneReach(zone.polygon, zone.path) }));
    this.#ground = this.#layers?.ground ?? 0;
    this.#walkable = walkableAreas(this.#layers);
    this.#mapWalls = options.walls ?? [];
    this.#rampRims = this.#layers === undefined ? [] : rampRims(this.#layers);
    this.#gatedGraphs = buildLayeredNavGraph(
      this.#layers === undefined
        ? [{ walls: this.#mapWalls, walkable: [], open: [] }]
        : this.#layers.walls.map((walls, layer) => ({
            walls: [...walls, ...(this.#layers?.deepWater[layer] ?? [])],
            walkable: this.#walkable[layer] ?? [],
            open: this.#rampRims[layer] ?? [],
          })),
      this.#gates.map((gate) => ({ layer: gate.layer ?? this.#ground, segments: gate.segments })),
      this.#bounds,
      this.#ruleset.collision.playerRadius,
      this.#harmfulZones,
    );
    const walls = this.#currentWallSet();
    this.#walls = walls.walls;
    this.#graphs = walls.graphs;
    this.#paths = walls.paths;
    this.#layerWalls = this.#wallsByLayer();
    this.#layerBlockers = this.#blockersByLayer();
    this.#seed = typeof options.seed === "string" ? seedFromString(options.seed) : options.seed;
    this.#rng = createRng(this.#seed);
    this.#flagField = options.flagField;
    this.#flagsState = this.#flagField === undefined ? undefined : initialFlags(this.#flagField);
    this.#relicField = options.relicField;
    this.#relicsState =
      this.#relicField === undefined ? undefined : initialRelics(this.#relicField);
    this.#ghostField = options.ghostField;
    this.#capturePoints = initialCapturePoints(options.capturePoints ?? []);
    this.#startLine = options.startLine;
    this.#refreshBotObjectives();
    for (const spec of options.participants ?? []) {
      this.add(spec);
    }
    this.#shrines = options.shrines ?? [];
    const shrinePositions = this.#shrines.map((shrine) => shrine.position);
    // A Guild Battle's shrines raise on their own: no priest stands on one.
    for (const shrine of this.#shrinesRaiseAlone() ? [] : this.#shrines) {
      const foes = this.#shrines.filter((other) => other.team !== shrine.team);
      this.add(
        priestSpec(
          shrine,
          spawnFacing(
            shrine.position,
            foes.map((other) => other.position),
            shrinePositions,
          ),
        ),
      );
    }
    const lords = options.guildLords ?? [];
    this.#guildLordTeams = new Set(lords.map((lord) => lord.team));
    const lordPositions = lords.map((lord) => lord.position);
    const facingFoes = (team: number, position: Vec2): number =>
      spawnFacing(
        position,
        lords.filter((other) => other.team !== team).map((other) => other.position),
        lordPositions,
      );
    for (const lord of lords) {
      this.add(guildLordSpec(lord, facingFoes(lord.team, lord.position)));
    }
    const ghosts = this.#ghostField;
    if (ghosts !== undefined) {
      // A priest wave raises it where priests stand; nothing does where
      // the objective does not need it (#2839).
      const victory = this.#matchRules?.victory;
      const riseSeconds =
        this.#shrines.length === 0 && (victory === "king-of-the-hill" || victory === "relic-run")
          ? PRIEST_WAVE_SECONDS
          : Number.POSITIVE_INFINITY;
      for (const spawn of ghosts.spawns) {
        const others = ghosts.spawns.filter((other) => other.team !== spawn.team);
        this.add(
          ghostSpec(
            spawn,
            ghosts.level,
            spawnFacing(
              spawn.position,
              others.map((other) => other.position),
              ghosts.spawns.map((other) => other.position),
            ),
            riseSeconds,
          ),
        );
      }
    }
    const placed = new Map<number, number>();
    const bodyguards = new Map<number, Combatant>();
    for (const guard of options.guards ?? []) {
      const index = placed.get(guard.team) ?? 0;
      placed.set(guard.team, index + 1);
      const added = this.add(guardSpec(guard, index, facingFoes(guard.team, guard.position)));
      if (guard.role === "bodyguard") {
        bodyguards.set(guard.team, added.combatant);
      }
    }
    for (const lord of lords) {
      const record = this.#participants.get(guildLordId(lord.team));
      if (record !== undefined) {
        record.combatant.lossGuard = {
          bodyguard: bodyguards.get(lord.team),
          remaining: guildLordLossCap(0),
        };
      }
    }
    const mapCreatures = [...this.#participants.values()].filter(
      (record) => record.creature !== undefined && record.creature.ownerId === undefined,
    ).length;
    if (mapCreatures > MAX_MAP_CREATURES) {
      throw new Error(
        `the map places ${String(mapCreatures)} creatures, at most ${String(MAX_MAP_CREATURES)}`,
      );
    }
  }

  public get tick(): number {
    return this.#tick;
  }

  public get elapsedSeconds(): number {
    return this.#elapsedSeconds;
  }

  public get phase(): MatchPhase {
    return this.#outcome.phase;
  }

  /**
   * Seconds on the start line's clock (#2692), `null` on a map without
   * one. It starts when the party crosses the line or the first of team 1
   * dies, whichever comes first (#2933); until then it runs from the
   * match's start.
   */
  public get clearSeconds(): number | null {
    return this.#startLine === undefined
      ? null
      : this.#elapsedSeconds - (this.#clearClockStartedAt ?? 0);
  }

  /** Who won and why, once `phase` is `"finished"`. */
  public get outcome(): MatchOutcome {
    return this.#outcome;
  }

  public get score(): MatchScore {
    return this.#score;
  }

  /** Ranged weapons' shots in flight, oldest first. */
  public get projectiles(): readonly Readonly<Projectile>[] {
    return this.#projectiles;
  }

  /** Every ground effect in the match (#1087), in id order. */
  public get groundEffects(): readonly Readonly<GroundEffect>[] {
    return this.#groundEffects;
  }

  /** Every flag and where it is (#1225); `[]` on a map without them. */
  public get flags(): readonly FlagState[] {
    return this.#flagsState?.flags ?? [];
  }

  /** Who holds the flag stand (#1225); `undefined` on a map without one. */
  public get stand(): StandState | undefined {
    return this.#flagsState?.stand;
  }

  /** Every relic and where it is (#1374); `[]` on a map without them. */
  public get relics(): readonly RelicState[] {
    return this.#relicsState?.relics ?? NO_RELICS;
  }

  /**
   * The altar a relic is run to (#1374), or a Ghostly Hero claims (#1377);
   * `undefined` on a map without one.
   */
  public get altar(): Vec2 | undefined {
    return this.#relicField?.altar ?? this.#ghostField?.altar;
  }

  /** Who holds King of the Hill's altar, and how long since the claim or the last point (#1377). */
  public get altarState(): AltarState {
    return this.#altarState;
  }

  public get gates(): readonly Gate[] {
    return this.#gates;
  }

  /** Every switch (#3025), which way it points and when it may move again; `[]` on a map without them. */
  public get switches(): readonly Switch[] {
    return this.#switches;
  }

  /** Every Capture Points shrine (#1378), where it is and who holds it; `[]` on a map without them. */
  public get capturePoints(): readonly CapturePoint[] {
    return this.#capturePoints;
  }

  /**
   * Whether `id` carries a bundle, a flag (#1225), a relic (#1374) or a
   * Ritualist's ashes (#1434): hands full. Only a flag or a relic slows.
   */
  public carriesBundle(id: string): boolean {
    return this.#carriesFlagOrRelic(id) || this.#holdsAshes(id);
  }

  /** Whether `id` carries a flag (#1225) or a relic (#1374): slower. */
  #carriesFlagOrRelic(id: string): boolean {
    return carriedFlag(this.flags, id) !== undefined || carriedRelic(this.relics, id) !== undefined;
  }

  /** Whether `id` holds a Ritualist's ashes (#1434), an item spell's status. */
  #holdsAshes(id: string): boolean {
    return (
      this.#participants
        .get(id)
        ?.combatant.statuses.active.some(
          (status) => STATUS_DEFINITIONS[status.id].category === "item",
        ) === true
    );
  }

  /** Each team's `aggression` by team index on a Guild Battle (#1226); `[]` on any other match. */
  public get aggressionByTeam(): readonly number[] {
    return this.#matchRules?.victory === "guild-battle"
      ? [this.aggression(0), this.aggression(1)]
      : [];
  }

  /** Damage `team` has dealt to a foe's Guild Lord so far (#1222), after armor. */
  public aggression(team: number): number {
    return this.#aggression.get(team) ?? 0;
  }

  public get(id: string): Participant | undefined {
    return this.#participants.get(id);
  }

  /** A participant's net pips as they stand (#504): what the next tick applies, natural regeneration included. */
  public pips(participant: Participant): NetPips {
    return netPips(
      participant.combatant,
      this.#naturalPips(participant) + creaturePips(participant),
      this.#upkeep(participant.combatant),
    );
  }

  /** Natural regeneration as it stands: none for a minion (#467), which only rots. */
  #naturalPips(participant: Participant): number {
    return participant.creature?.kind === "minion"
      ? 0
      : naturalHealthPips(
          participant.combatant,
          participant.outOfCombatSeconds,
          this.#ruleset.resources,
        );
  }

  public participants(): IterableIterator<Participant> {
    return this.#participants.values();
  }

  public add(spec: ParticipantSpec): Participant {
    if (this.#participants.has(spec.id)) {
      throw new Error(`participant ${spec.id} is already in the match`);
    }
    if (spec.team !== MASTERLESS_TEAM && !teamIds(this.#teamCount).includes(spec.team)) {
      throw new Error(
        `participant ${spec.id}: team ${String(spec.team)} is not one of ${String(this.#teamCount)}`,
      );
    }
    // Either of these resets every tick, which pins the participant at
    // spawn without a word. Refuse it here instead.
    const reset = spec.reset;
    if (reset?.kind === "below-health" && reset.fraction >= (spec.startHealthFraction ?? 1)) {
      throw new Error(
        `participant ${spec.id}: below-health ${String(reset.fraction)} would reset every tick from its start health`,
      );
    }
    if (reset?.kind === "on-interval" && !(reset.everySeconds > 0)) {
      throw new Error(`participant ${spec.id}: on-interval needs everySeconds above 0`);
    }
    const layer = spec.layer ?? this.#ground;
    if (!this.#isLayer(layer)) {
      throw new Error(`participant ${spec.id}: layer ${String(layer)} is not one of the map's`);
    }
    const record: ParticipantRecord = {
      id: spec.id,
      combatant: this.#combatant(spec),
      skillBar: spec.skillBar,
      spawn: spec.spawn,
      position: spec.spawn,
      layer,
      floors: this.#floorsFor(spec.spawn, layer),
      facing: spec.facing,
      inputDirection: ZERO,
      walkGoal: undefined,
      walkLayer: undefined,
      pendingSkill: undefined,
      targetId: undefined,
      respawnInSeconds: 0,
      spec,
      behaviour: spec.behaviour,
      cursor: createCursor(),
      sinceReset: 0,
      outOfCombatSeconds: 0,
      history: new PositionHistory(this.#historyLength()),
      walkStalledSeconds: 0,
      walkLeast: Number.POSITIVE_INFINITY,
      walkSettled: false,
      followGoal: undefined,
      route: undefined,
      resolvedMaxHealth: spec.maxHealth ?? this.#ruleset.combat.baseHealth,
      resolvedMaxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      resurrectedAtSeconds: Number.NEGATIVE_INFINITY,
      creature: spec.creature === undefined ? undefined : { ...spec.creature },
      weaponSets: this.#weaponSets(spec),
      activeWeaponSet: 0,
      swapHealthDebt: 0,
      pendingWeaponSet: undefined,
      corpseExploited: false,
      armedAttack: undefined,
      hadEnergy: false,
      interact: undefined,
    };
    // Full at the carried morale's maxima, as at 0 (#2686).
    if (spec.startMorale !== undefined && spec.startMorale !== 0) {
      this.#setMorale(record, Math.min(MORALE_CEILING, Math.max(MORALE_FLOOR, spec.startMorale)));
      record.combatant.health = record.combatant.maxHealth * (spec.startHealthFraction ?? 1);
      record.combatant.energy = record.combatant.maxEnergy;
    }
    this.#participants.set(spec.id, record);
    if (countsForTeam(record)) {
      this.#teams.add(spec.team);
    }
    // A companion arrives with its owner, right after it (#1046), so the
    // order and the ids are the same every run.
    if (spec.creature === undefined) {
      for (const skill of companionSkills(spec.skillBar)) {
        this.#summon(record, skill.id, skill.companion, 1, record.position, true);
      }
    }
    return record;
  }

  /**
   * Take `team` out for good (#2688), whatever the victory rule: the last
   * of `teams`, every team in the match, seated yet or not, wins at once.
   */
  public forfeit(team: number, teams: ReadonlySet<number>): void {
    if (this.#outcome.phase === "finished") {
      return;
    }
    this.#eliminated.add(team);
    const left = [...teams].filter((other) => !this.#eliminated.has(other));
    if (left.length <= 1) {
      this.#outcome = { phase: "finished", winningTeam: left[0], reason: "annihilation" };
    }
  }

  /** Tell the match which teams still have a member on the way: none of them is empty (#2890). */
  public setAwaitedTeams(teams: ReadonlySet<number>): void {
    this.#awaitedTeams = teams;
  }

  /**
   * Remove a participant, the creatures it owns (#1052), and every target
   * that pointed at any of them.
   */
  public remove(id: string): void {
    // A carrier who leaves drops the bundle where they stood (#1225).
    const carrier = this.#participants.get(id);
    if (carrier !== undefined) {
      this.#dropBundle(carrier);
    }
    const leaving = new Set([id]);
    for (const record of this.#participants.values()) {
      if (record.creature?.ownerId === id) {
        leaving.add(record.id);
      }
    }
    for (const gone of leaving) {
      this.#participants.delete(gone);
      this.#stepStart.delete(gone);
      this.#leaving.delete(gone);
    }
    for (const other of this.#participants.values()) {
      if (other.targetId !== undefined && leaving.has(other.targetId)) {
        other.targetId = undefined;
      }
    }
  }

  /**
   * `count` creatures of `template` at `at`, facing as `owner` does, on its
   * team (#1052): as many as `MAX_CREATURES` leaves room for among the
   * summoned, a map's own creatures aside (#1281). Added to the
   * end of the match, so they act from this very tick, after everyone
   * already there.
   *
   * Minions past their master's cap (#467) die first, weakest first, so the
   * slots they free are free for the new ones. Each is a death: Soul
   * Reaping answers it, and the log names the summoning skill.
   *
   * A spirit made ends every allied spirit of the same `skillId` within
   * the new one's aura radius (#1064): it leaves at the end of the step, as an
   * expiry, so nobody scores. A foe's lives on.
   *
   * Each spirit or minion made fires its owner's `bearer-creates-creature`
   * triggers as it arrives (#1316); one the cap leaves out fires nothing.
   *
   * `companion`: it travels with `skillId` on the owner's bar (#1046),
   * rather than coming from a cast.
   *
   * `ranks`: the owner's, as the skill went off (#1915), so a status the
   * same skill gives, as Aura of the Lich's +1 Death Magic, comes after.
   */
  #summon(
    owner: ParticipantRecord,
    skillId: string,
    template: CreatureTemplate,
    count: number,
    at: Vec2,
    companion: boolean,
    replacement = false,
    ranks: ReadonlyMap<string, number> = ranksOf(owner.combatant),
  ): void {
    if (template.onePerOwner) {
      this.#killOlder(owner, skillId);
    }
    // A replacement takes the fallen one's place, one for one (#1836).
    if (template.kind === "minion" && !replacement) {
      this.#cullMinions(owner, skillId, count);
    }
    const fits = Math.max(0, Math.min(count, MAX_CREATURES - this.#summonedCount()));
    const radius = template.aura?.radius;
    if (fits > 0 && radius !== undefined) {
      for (const record of this.#participants.values()) {
        if (
          record.creature?.kind === "spirit" &&
          record.creature.skillId === skillId &&
          record.combatant.team === owner.combatant.team &&
          !record.combatant.dead &&
          distance(record.position, owner.position) <= radius
        ) {
          this.#leaving.add(record.id);
        }
      }
    }
    for (let i = 0; i < fits; i += 1) {
      const id = creatureId(owner.id, this.#nextCreature);
      this.#nextCreature += 1;
      this.#addCreature(
        id,
        owner.combatant.team,
        owner.id,
        owner.facing,
        skillId,
        template,
        at,
        ranks,
        companion,
      );
      if (template.kind !== "pet") {
        this.#logFired(fireCreationTriggers(owner.combatant, id, this.#triggerContext()));
      }
    }
  }

  /**
   * `count` masterless creatures of `template` at `at` (#2092), numbers
   * read on `ranks`: Malign Intervention's horror. Nobody's, so no cap
   * culls for them and no trigger fires; as many as `MAX_CREATURES`
   * leaves room for. Ids are `masterless/c<n>`.
   */
  #summonMasterless(
    template: CreatureTemplate,
    count: number,
    at: Vec2,
    ranks: ReadonlyMap<string, number>,
    skillId: string,
  ): void {
    const fits = Math.max(0, Math.min(count, MAX_CREATURES - this.#summonedCount()));
    for (let i = 0; i < fits; i += 1) {
      const id = creatureId(undefined, this.#nextCreature);
      this.#nextCreature += 1;
      this.#addCreature(id, MASTERLESS_TEAM, undefined, 0, skillId, template, at, ranks, false);
    }
  }

  /**
   * Adds one creature of `template` at `at` (#1052): `ownerId`'s, on
   * `team`, its numbers read on `ranks`; `undefined` and
   * `MASTERLESS_TEAM` for a masterless one (#2092).
   */
  #addCreature(
    id: string,
    team: number,
    ownerId: string | undefined,
    facing: number,
    skillId: string | undefined,
    template: CreatureTemplate,
    at: Vec2,
    ranks: ReadonlyMap<string, number>,
    companion: boolean,
  ): void {
    this.add({
      id,
      team,
      skillBar: [],
      // The summoner's rank, read once (#467): the creature's weapon mastery.
      attributeRanks:
        template.attack === undefined
          ? new Map()
          : new Map([[template.attack.attributeId, ranks.get(template.attack.attributeId) ?? 0]]),
      equipment: creatureResolvedEquipment(
        resolveMagnitudeAtRanks(template.armor, ranks),
        template.attack,
        template.attack === undefined ? 0 : (ranks.get(template.attack.attributeId) ?? 0),
      ),
      spawn: at,
      // Where its summoner stands (ADR-0051); nobody summoned a masterless one.
      layer: (ownerId === undefined ? undefined : this.#participants.get(ownerId)?.layer) ?? 0,
      facing,
      // Spawning Power is the summoner's (#1098), for what they create: spirits
      // and minions. A pet is charmed, not created, and is not on the wiki's
      // list (#1144).
      maxHealth:
        template.kind === "pet"
          ? resolveMagnitudeAtRanks(template.maxHealth, ranks)
          : spawningPowerHealth(
              ranks.get(SPAWNING_POWER_ATTRIBUTE) ?? 0,
              resolveMagnitudeAtRanks(template.maxHealth, ranks),
            ),
      maxEnergy: template.kind === "spirit" ? SPIRIT_MAX_ENERGY : 0,
      baseEnergyPips: template.kind === "spirit" ? SPIRIT_ENERGY_PIPS : 0,
      behaviour: template.behaviour,
      creature: {
        ownerId,
        kind: template.kind,
        look: template.look,
        name: template.name,
        expiresInSeconds:
          template.durationSeconds === undefined
            ? Number.POSITIVE_INFINITY
            : resolveMagnitudeAtRanks(template.durationSeconds, ranks),
        ageSeconds: 0,
        summonedAtTick: this.#tick,
        skillId,
        aura: template.aura,
        onDeath: template.onDeath,
        ownerDisableSeconds:
          template.ownerDisableOnDeath === undefined
            ? 0
            : resolveMagnitudeAtRanks(template.ownerDisableOnDeath, ranks),
        deathBurst:
          template.deathBurst === undefined
            ? undefined
            : template.deathBurst.effect === "apply-status"
              ? {
                  ...template.deathBurst,
                  durationSeconds: resolveMagnitudeAtRanks(
                    template.deathBurst.durationSeconds,
                    ranks,
                  ),
                }
              : template.deathBurst.effect === "resurrect"
                ? {
                    ...template.deathBurst,
                    healthPercent: resolveMagnitudeAtRanks(
                      template.deathBurst.healthPercent,
                      ranks,
                    ),
                  }
                : {
                    ...template.deathBurst,
                    perSecondAlive: resolveMagnitudeAtRanks(
                      template.deathBurst.perSecondAlive,
                      ranks,
                    ),
                  },
        onDeathInRange:
          template.onDeathInRange?.kind === "damage-same-type"
            ? {
                ...template.onDeathInRange,
                damage: resolveMagnitudeAtRanks(template.onDeathInRange.damage, ranks),
              }
            : template.onDeathInRange,
        pulse:
          template.pulse === undefined
            ? undefined
            : {
                ...template.pulse,
                heal: resolveMagnitudeAtRanks(template.pulse.heal, ranks),
                pulsed: 0,
              },
        replacedBy: template.replacedBy,
        corpsesLeft:
          template.leavesCorpses === undefined
            ? 0
            : Math.round(resolveMagnitudeAtRanks(template.leavesCorpses, ranks)),
        companionSkillId: companion ? skillId : undefined,
        leaderId: undefined,
        mode: "guard",
        bondStatusId: undefined,
      },
    });
  }

  /**
   * Living spirits and minions (#1052), toward `MAX_CREATURES`: anyone's,
   * a masterless minion too (#2092), never a map's. A body lying as
   * corpses (#1836) takes no room.
   */
  #summonedCount(): number {
    let creatures = 0;
    for (const record of this.#participants.values()) {
      if (
        (record.creature?.ownerId !== undefined || record.combatant.team === MASTERLESS_TEAM) &&
        record.creature !== undefined &&
        !record.combatant.dead &&
        !this.#leaving.has(record.id)
      ) {
        creatures += 1;
      }
    }
    return creatures;
  }

  /**
   * Kills `owner`'s living creatures of `skillId` (#1836): Flesh Golem's
   * one at a time, the old one dying as the new one comes. Each is a
   * death, logged as the skill, as a culled minion's. A body an older one
   * left lying goes now, so each owner has at most one lying.
   */
  #killOlder(owner: ParticipantRecord, skillId: string): void {
    const events: CombatEvent[] = [];
    for (const record of this.#participants.values()) {
      if (
        record.creature?.ownerId !== owner.id ||
        record.creature.skillId !== skillId ||
        this.#leaving.has(record.id)
      ) {
        continue;
      }
      if (record.combatant.dead) {
        this.#leaving.add(record.id);
      } else {
        record.combatant.health = 0;
        record.combatant.dead = true;
        events.push({ kind: "death", targetId: record.id });
      }
    }
    if (events.length === 0) {
      return;
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: owner.id,
      skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * `owner` takes control of a spirit (#1965) or a minion (#2092): Signet
   * of Binding's, Verata's Aura's. It answers to `owner` and is on its
   * team from now on, and leaves with it; it keeps its Health, its time
   * left, its statuses and the ranks it arrived with. The aura pass reads
   * its team each step. A gazed minion with a master goes masterless
   * instead. Never a cull: the cap is checked at `owner`'s next raise.
   */
  #takeControl(owner: ParticipantRecord, taken: TakenCreature): void {
    const record = this.#participants.get(taken.id);
    const creature = record?.creature;
    if (
      record === undefined ||
      (creature?.kind !== "spirit" && creature?.kind !== "minion") ||
      record.combatant.dead ||
      this.#leaving.has(taken.id)
    ) {
      return;
    }
    if (taken.kind === "gaze" && creature.ownerId !== undefined) {
      this.#makeMasterless(record, creature);
      return;
    }
    creature.ownerId = owner.id;
    creature.bondStatusId = taken.bondStatusId;
    creature.leaderId = undefined;
    creature.mode = "guard";
    record.combatant.team = owner.combatant.team;
    record.targetId = undefined;
    // Its swing was at its new side.
    record.combatant.attack = undefined;
  }

  /**
   * A minion answers to nobody from now on (#2092): Verata's Gaze broke
   * it off, or the status that bound it ended. On `MASTERLESS_TEAM`, a
   * foe to everyone, it goes on rotting and fights whoever is nearest.
   */
  #makeMasterless(record: ParticipantRecord, creature: Creature): void {
    creature.ownerId = undefined;
    creature.bondStatusId = undefined;
    creature.leaderId = undefined;
    record.combatant.team = MASTERLESS_TEAM;
    record.targetId = undefined;
    record.combatant.attack = undefined;
  }

  /**
   * Every creature bound to a status its owner no longer bears goes
   * masterless (#2092): Verata's Aura's minions, as it expires, is
   * removed, or its owner dies.
   */
  #breakBonds(): void {
    for (const record of this.#participants.values()) {
      const creature = record.creature;
      if (creature?.bondStatusId === undefined || creature.ownerId === undefined) {
        continue;
      }
      const bond = creature.bondStatusId;
      const owner = this.#participants.get(creature.ownerId);
      const held = owner?.combatant.statuses.active.some(
        (status) => status.id === bond && status.remainingSeconds > 0,
      );
      if (held !== true) {
        this.#makeMasterless(record, creature);
      }
    }
  }

  /**
   * Kills `owner`'s weakest minions until `count` more fit under its cap
   * (#467, #1130, GW1): the cap is `minionCap` of its Death Magic as it
   * raises. Weakest is the least Health left, absolute, not a share of
   * its max; ties go to the oldest, then to match order, which is summon
   * order.
   */
  #cullMinions(owner: ParticipantRecord, skillId: string, count: number): void {
    const cap = minionCap(rankOf(owner.combatant, MINION_CAP_ATTRIBUTE));
    const mine = [...this.#participants.values()].flatMap((record) =>
      record.creature?.kind === "minion" &&
      record.creature.ownerId === owner.id &&
      !record.combatant.dead &&
      !this.#leaving.has(record.id)
        ? [{ record, summonedAtTick: record.creature.summonedAtTick }]
        : [],
    );
    const excess = mine.length + count - cap;
    if (excess <= 0) {
      return;
    }
    // A stable sort: equal Health and tick keep match order.
    mine.sort(
      (a, b) =>
        a.record.combatant.health - b.record.combatant.health ||
        a.summonedAtTick - b.summonedAtTick,
    );
    const events: CombatEvent[] = mine.slice(0, excess).map(({ record }) => {
      record.combatant.health = 0;
      record.combatant.dead = true;
      return { kind: "death", targetId: record.id };
    });
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: owner.id,
      skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * A ground effect left at `position`, on `owner`'s team (#1087). Past
   * `MAX_GROUND_EFFECTS`, the oldest ends now: a ward always lands.
   */
  #placeGroundEffect(
    owner: ParticipantRecord,
    skillId: string,
    effect: CreateGroundEffect,
    anchor: ParticipantRecord,
  ): void {
    this.#addGroundEffect({
      skillId,
      ownerId: owner.id,
      team: owner.combatant.team,
      position: anchor.position,
      layer: anchor.layer,
      act: effect.act,
      durationSeconds: resolveMagnitude(effect.durationSeconds, owner.combatant),
      pulsed: 0,
    });
  }

  /** `effect`, numbered and with its whole time left; past the cap, the oldest ends now. */
  #addGroundEffect(effect: Omit<GroundEffect, "id" | "remainingSeconds">): void {
    this.#groundEffects.push({
      ...effect,
      id: this.#nextGroundEffect,
      remainingSeconds: effect.durationSeconds,
    });
    this.#nextGroundEffect += 1;
    if (this.#groundEffects.length > MAX_GROUND_EFFECTS) {
      const ended = this.#groundEffects.shift();
      // Ended early, a pulse effect still lands its end (#2329).
      const owner = ended === undefined ? undefined : this.#participants.get(ended.ownerId);
      if (ended?.act.kind === "pulse" && ended.act.atEnd !== undefined && owner !== undefined) {
        this.#landPulse(
          owner,
          ended.skillId,
          ended.position,
          ended.layer,
          ended.act.atEnd,
          ended.pulsed,
        );
      }
    }
  }

  /**
   * The body a ground effect `owner` leaves is anchored at (#1104): the
   * one standing there, whose position and layer it takes (ADR-0051):
   * itself, the corpse its skill exploited, or its target (#1113), as they
   * are now. A well or a symbol does not follow a body that later moves,
   * stands up or respawns. Nobody, when a target anchor has no target.
   */
  #groundAnchor(
    owner: ParticipantRecord,
    effect: CreateGroundEffect,
    corpse: ParticipantRecord | undefined,
    primary: ParticipantRecord | undefined,
  ): ParticipantRecord | undefined {
    switch (effect.anchor) {
      case "caster":
        return owner;
      case "corpse":
        // A corpse skill with neither a corpse nor a well's sacrifice
        // (#1730) never resolves, so this is a bug.
        if (corpse === undefined) {
          throw new Error(`${owner.id}: a corpse-anchored ground effect with no corpse`);
        }
        return corpse;
      case "target":
        return primary;
    }
  }

  /**
   * Every ground effect counts down `dt` (#1087); one at zero is gone,
   * except a trap that springs as its time runs out (#1113): this step's
   * `#springTraps` springs it, and a pulse effect that lands its end
   * (#2329): this step's `#pulseGroundEffects` lands it.
   */
  #advanceGroundEffects(dt: number): void {
    if (this.#groundEffects.length === 0) {
      return;
    }
    for (const effect of this.#groundEffects) {
      effect.remainingSeconds -= dt;
    }
    this.#groundEffects = this.#groundEffects.filter(
      (effect) =>
        effect.remainingSeconds > 0 ||
        (effect.act.kind === "trap" && effect.act.trap.springsAtEnd) ||
        (effect.act.kind === "pulse" && effect.act.atEnd !== undefined),
    );
  }

  /**
   * Every trap a living foe stands on springs (#1105), once everyone has
   * moved this step, in id order, as does one whose time ran out if it
   * springs at its end (#1113). Its first pulse lands at once from its
   * owner, alive or dead, and it is gone; with more pulses to come, a
   * pulse effect takes its place, which everyone sees. A foe is a body of
   * another team that is not a spirit, its centre within the trigger
   * radius; walls do not matter. A trap whose owner has left the match is
   * gone with no effect.
   */
  #springTraps(): void {
    if (!this.#groundEffects.some((effect) => effect.act.kind === "trap")) {
      return;
    }
    const sprung = new Set<number>();
    const pulsing: GroundEffect[] = [];
    for (const effect of this.#groundEffects) {
      if (effect.act.kind !== "trap") {
        continue;
      }
      const owner = this.#participants.get(effect.ownerId);
      if (owner === undefined) {
        sprung.add(effect.id);
        continue;
      }
      const { trap } = effect.act;
      const triggered =
        (trap.springsAtEnd && effect.remainingSeconds <= 0) ||
        [...this.#participants.values()].some(
          (body) =>
            !body.combatant.dead &&
            body.creature?.kind !== "spirit" &&
            body.combatant.team !== effect.team &&
            sharesFloor(body.floors, floorOf(effect.layer)) &&
            distance(body.position, effect.position) <= trap.triggerRadius,
        );
      if (!triggered) {
        continue;
      }
      sprung.add(effect.id);
      this.#landPulse(owner, effect.skillId, effect.position, effect.layer, trap.spring, 1);
      if (trap.spring.count > 1) {
        pulsing.push(effect);
      }
    }
    if (sprung.size > 0) {
      this.#groundEffects = this.#groundEffects.filter((effect) => !sprung.has(effect.id));
    }
    for (const trap of pulsing) {
      if (trap.act.kind !== "trap") {
        continue;
      }
      const { spring } = trap.act.trap;
      this.#addGroundEffect({
        skillId: trap.skillId,
        ownerId: trap.ownerId,
        team: trap.team,
        position: trap.position,
        layer: trap.layer,
        act: { kind: "pulse", pulse: spring },
        durationSeconds: spring.count * spring.everySeconds,
        pulsed: 1,
      });
    }
  }

  /**
   * Every pulse effect whose next pulse is due lands it (#1113), after
   * traps spring, in id order: at most one each a step, the first the step
   * its age reaches its delay (#1270), then one every interval after.
   * One whose time has run out lands its end after that, once, and is
   * gone (#2329). One whose owner has left the match is gone with no effect.
   */
  #pulseGroundEffects(): void {
    if (!this.#groundEffects.some((effect) => effect.act.kind === "pulse")) {
      return;
    }
    const gone = new Set<number>();
    for (const effect of this.#groundEffects) {
      if (effect.act.kind !== "pulse") {
        continue;
      }
      const owner = this.#participants.get(effect.ownerId);
      if (owner === undefined) {
        gone.add(effect.id);
        continue;
      }
      const { pulse, atEnd } = effect.act;
      const age = effect.durationSeconds - effect.remainingSeconds;
      if (
        effect.pulsed < pulse.count &&
        age >= pulse.delaySeconds + effect.pulsed * pulse.everySeconds - SWING_EPSILON
      ) {
        effect.pulsed += 1;
        this.#landPulse(owner, effect.skillId, effect.position, effect.layer, pulse, effect.pulsed);
      }
      if (atEnd !== undefined && effect.remainingSeconds <= SWING_EPSILON) {
        gone.add(effect.id);
        this.#landPulse(owner, effect.skillId, effect.position, effect.layer, atEnd, effect.pulsed);
      }
    }
    if (gone.size > 0) {
      this.#groundEffects = this.#groundEffects.filter((effect) => !gone.has(effect.id));
    }
  }

  /**
   * Every spirit heal that came due this step (#2477), in participant
   * order: Preservation's, on the living non-spirit ally within its
   * radius with the lowest share of its Health, the lowest id among
   * equals, logged as its skill. Nobody hurt: no heal, the pulse spent.
   */
  #pulseSpirits(): void {
    for (const record of this.#participants.values()) {
      const pulse = record.creature?.pulse;
      if (
        pulse === undefined ||
        record.creature?.skillId === undefined ||
        record.combatant.dead ||
        this.#leaving.has(record.id) ||
        record.creature.ageSeconds < (pulse.pulsed + 1) * pulse.everySeconds - SWING_EPSILON
      ) {
        continue;
      }
      pulse.pulsed += 1;
      let pick: ParticipantRecord | undefined;
      let share = 1;
      for (const body of this.#participants.values()) {
        if (
          body.combatant.dead ||
          body.combatant.team !== record.combatant.team ||
          body.creature?.kind === "spirit" ||
          !sharesFloor(body.floors, floorOf(record.layer)) ||
          distance(record.position, body.position) > pulse.radius
        ) {
          continue;
        }
        const ratio = body.combatant.health / effectiveMaxHealth(body.combatant);
        if (ratio < share || (ratio === share && pick !== undefined && body.id < pick.id)) {
          pick = body;
          share = ratio;
        }
      }
      if (pick === undefined) {
        continue;
      }
      const events = applyEffects([{ kind: "heal", amount: { flat: pulse.heal } }], {
        caster: record.combatant,
        target: pick.combatant,
        rng: this.#rng,
        rules: this.#ruleset.combat,
        surroundings: this.#participants,
      });
      this.#logFired([{ sourceId: record.id, skillId: record.creature.skillId, events }]);
    }
  }

  /**
   * Every status damage pulse that came due this step (#1501), in
   * participant order: damage of its type from the status's source to the
   * source's foes within its radius of the bearer, and to the bearer if
   * it `hitsBearer` (#1754), logged as the status's skill. A bearer that died since takes none,
   * and a source that has left the match deals none. An effect pulse
   * (#2187) runs its effects from the source on the bearer, as its skill,
   * at the status's ranks; one that cost the bearer Health charges its
   * source (#2275): Agony's spirit pays for each foe it hurt, and one
   * that healed it (#2477), Rejuvenation's for each ally it healed.
   */
  #pulseStatuses(): void {
    for (const record of this.#participants.values()) {
      for (const { id, sourceId, ranks } of record.combatant.statuses.drainEffectPulses()) {
        const source = this.#participants.get(sourceId);
        const pulse = STATUS_DEFINITIONS[id].pulse;
        if (record.combatant.dead || source === undefined || pulse === undefined) {
          continue;
        }
        const ranksFrom = outsideMatch(ranks);
        const events = applyEffects(pulse.effects, {
          caster: source.combatant,
          target: record.combatant,
          ranksFrom,
          rng: this.#rng,
          rules: this.#ruleset.combat,
          surroundings: this.#participants,
        });
        this.#logFired([{ sourceId, skillId: pulse.skillId, events }]);
        const hurt = events.some(
          (event) =>
            event.kind === "health-loss" && event.targetId === record.id && event.amount > 0,
        );
        if (hurt && pulse.chargesSourcePerHit !== undefined) {
          this.#landCharge(sourceId, id, Math.round(statAt(pulse.chargesSourcePerHit, ranks)));
        }
        // Rejuvenation's (#2477): one the pulse healed costs its spirit.
        const healed = events.some(
          (event) => event.kind === "heal" && event.targetId === record.id && event.amount > 0,
        );
        if (healed && pulse.chargesSourcePerHeal !== undefined) {
          this.#landCharge(sourceId, id, Math.round(statAt(pulse.chargesSourcePerHeal, ranks)));
        }
      }
      for (const { id, sourceId, damage } of record.combatant.statuses.drainPulses()) {
        const source = this.#participants.get(sourceId);
        const pulse = STATUS_DEFINITIONS[id].damagePulse;
        if (record.combatant.dead || source === undefined || pulse === undefined) {
          continue;
        }
        const hit: SkillEffect = {
          kind: "damage",
          amount: { flat: damage },
          type: pulse.type,
          armorPenetration: 0,
        };
        const effects: readonly SkillEffect[] = [
          ...(pulse.hitsBearer ? [hit] : []),
          {
            kind: "splash",
            hits: "foes",
            radius: pulse.radius,
            maxTargets: undefined,
            effects: [hit],
          },
        ];
        this.#logFired([
          {
            sourceId,
            skillId: pulse.skillId,
            events: applyEffects(effects, {
              caster: source.combatant,
              target: record.combatant,
              rng: this.#rng,
              rules: this.#ruleset.combat,
              surroundings: this.#participants,
            }),
          },
        ]);
      }
    }
  }

  /**
   * Every living bearer with no energy left answers it (#1583), in
   * participant order, after upkeep has taken its share: Wither's damage.
   * One whose whole Energy fell from at least 1 at the last check to 0
   * answers its drop (#1956), Famine's: Energy regenerates continuously,
   * so a 1-Energy skill paid at 1.03 leaves 0.03, which GW1 shows as 0.
   */
  #fireEnergyEmpty(): void {
    for (const record of this.#participants.values()) {
      const hadEnergy = record.hadEnergy;
      record.hadEnergy = record.combatant.energy >= 1;
      if (record.combatant.dead) {
        continue;
      }
      if (record.combatant.energy <= 0) {
        this.#fireTriggers(record, "bearer-energy-empty", NONE_SPARED);
      }
      if (hadEnergy && !record.hadEnergy) {
        this.#fireTriggers(record, "bearer-energy-drops-empty", NONE_SPARED);
      }
    }
  }

  /**
   * Every living bearer whose status's living source stands farther from
   * it than the status's trigger says answers it (#2504), in participant
   * order: Scorpion Wire's step and knockdown. A dead or departed source
   * answers nothing, so the hex just runs out. A bearer with no such
   * trigger is skipped before anything is built (#2520).
   */
  #fireSourceApart(): void {
    for (const record of this.#participants.values()) {
      if (record.combatant.dead || !record.combatant.statuses.hasTriggerOn("source-bearer-apart")) {
        continue;
      }
      const apart = (sourceId: string, beyond: number): boolean => {
        const source = this.#participants.get(sourceId);
        return (
          source !== undefined &&
          !source.combatant.dead &&
          distance(source.position, record.position) > beyond
        );
      };
      this.#logFired(fireSourceApartTriggers(record.combatant, apart, this.#triggerContext()));
    }
  }

  /**
   * One pulse of `rule` at `position` (#1113), or its end (#2329): its effects land from
   * `owner` on whoever its area takes there, in line of sight of it, and
   * it is logged as a cast is, even when it hits nobody. A pulse's
   * interrupt comes free with what it lands, untimed, as Maelstrom's
   * (#1367): finding nothing to interrupt is no miss, so it says nothing.
   * Its `held-seconds` count is `pulsed`, this pulse among them (#2459):
   * Savannah Heat's "for each second this spell has been in effect".
   */
  #landPulse(
    owner: ParticipantRecord,
    skillId: string,
    position: Vec2,
    layer: number,
    rule: PulseEnd,
    pulsed: number,
  ): void {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return;
    }
    const pulsing = { ...skill, area: rule.area, effects: rule.effects };
    const resolved = resolveSkillEffects({
      skill: pulsing,
      caster: owner.combatant,
      targets: resolveTargets({
        skill: pulsing,
        caster: owner.combatant,
        casterPosition: position,
        casterLayer: layer,
        primary: undefined,
        candidates: [...this.#participants.values()],
        losBlockers: this.#wallsOn(layer),
      }),
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
      heldSeconds: pulsed,
    });
    const events = resolved.events.filter((event) => event.kind !== "interrupt-missed");
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: owner.id,
      skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: { x: position.x, y: position.y, radius: rule.area.radius },
      doubleStrike: false,
      events,
    });
    this.#chargeFromDamage(owner.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
  }

  /**
   * What every living spirit, every ground effect and every bearer of a
   * projecting status projects (#1064, #1087, #2096), settled once a step
   * before anyone acts, so a hit this step sees this step's auras. Every
   * living body that is not a spirit wears an aura's status exactly while
   * some source with it, on a side it reaches, stands within its radius,
   * unless the aura spares its source and the body is it; one worn from
   * two sources is worn once, named for the first. A source gone since the
   * last step is gone from everyone now: one step late at worst. Spirits
   * in the order they were summoned, then bearers in match order, then
   * ground effects in id order; bodies in match order. One pass for all,
   * as a second would strip what the first projected.
   */
  #projectAuras(): void {
    const sources: {
      readonly sourceId: string;
      readonly team: number;
      readonly position: Vec2;
      /** The one floor it reaches (ADR-0051): its bearer's layer, or a ward's. */
      readonly floors: number;
      readonly aura: Aura;
      /** Its owner's, as the status lands (#1976): a spirit's summoner, a ward's caster. */
      readonly ranks: ReadonlyMap<string, number>;
    }[] = [];
    for (const record of this.#participants.values()) {
      const aura = record.creature?.aura;
      if (aura !== undefined && !record.combatant.dead) {
        const ownerId = record.creature?.ownerId;
        const owner = ownerId === undefined ? undefined : this.#participants.get(ownerId);
        sources.push({
          sourceId: record.id,
          team: record.combatant.team,
          position: record.position,
          floors: floorOf(record.layer),
          aura,
          ranks: statusRanks(aura.statusId, (owner ?? record).combatant),
        });
      }
    }
    // A status that projects one (#2096) makes its living bearer a source,
    // at the bearer's ranks.
    for (const record of this.#participants.values()) {
      if (record.combatant.dead) {
        continue;
      }
      for (const { id } of record.combatant.statuses.active) {
        const aura = getStatusDefinition(id).projectsAura;
        if (aura !== undefined) {
          sources.push({
            sourceId: record.id,
            team: record.combatant.team,
            position: record.position,
            floors: floorOf(record.layer),
            aura,
            ranks: statusRanks(aura.statusId, record.combatant),
          });
        }
      }
    }
    // A ward's status names its owner: whoever cast it. A trap projects nothing.
    for (const effect of this.#groundEffects) {
      if (effect.act.kind === "aura") {
        const owner = this.#participants.get(effect.ownerId);
        sources.push({
          sourceId: effect.ownerId,
          team: effect.team,
          position: effect.position,
          floors: floorOf(effect.layer),
          aura: effect.act.aura,
          ranks:
            owner === undefined ? NO_RANKS : statusRanks(effect.act.aura.statusId, owner.combatant),
        });
      }
    }
    if (sources.length === 0 && !this.#auras) {
      return;
    }
    this.#auras = sources.length > 0;
    for (const body of this.#participants.values()) {
      if (body.combatant.dead || body.creature?.kind === "spirit") {
        continue;
      }
      const wears = new Map<StatusId, { sourceId: string; ranks: ReadonlyMap<string, number> }>();
      for (const { sourceId, team, position, floors, aura, ranks } of sources) {
        if (
          !wears.has(aura.statusId) &&
          !(aura.excludesSource === true && sourceId === body.id) &&
          reaches(aura.affects, team, body.combatant.team) &&
          sharesFloor(floors, body.floors) &&
          distance(position, body.position) <= aura.radius &&
          (!getStatusDefinition(aura.statusId).onlyWhileHoldingItem || this.carriesBundle(body.id))
        ) {
          wears.set(aura.statusId, { sourceId, ranks });
        }
      }
      const { statuses } = body.combatant;
      for (const status of statuses.active) {
        if (status.projected !== null && !wears.has(status.id)) {
          statuses.remove(status.id);
        }
      }
      for (const [statusId, { sourceId, ranks }] of wears) {
        statuses.project(statusId, sourceId, ranks);
      }
    }
  }

  /** A body's radius (#1052): a creature's is smaller than a player's. */
  #radiusOf(participant: Participant): number {
    return participant.creature === undefined
      ? this.#ruleset.collision.playerRadius
      : this.#ruleset.collision.creatureRadius;
  }

  /**
   * Every creature leaving this step with a death burst (#1550) bursts as
   * it goes, killed, destroyed or expired alike: each living non-spirit
   * of its `affects` within its radius takes, or is healed, its rate
   * times the whole seconds it lived, capped, from its owner, logged as
   * its skill. A creature a burst kills leaves too, and bursts nothing:
   * only a spirit has one, and a burst passes spirits by. A status burst
   * (#1956) gives its status instead, to each one under its Health line.
   * A resurrecting one (#2478) raises each dead party member instead.
   */
  #burstLeaving(): void {
    for (const id of [...this.#leaving]) {
      const spirit = this.#participants.get(id);
      const creature = spirit?.creature;
      const burst = creature?.deathBurst;
      const owner =
        creature?.ownerId === undefined ? undefined : this.#participants.get(creature.ownerId);
      if (
        spirit === undefined ||
        creature?.skillId === undefined ||
        burst === undefined ||
        owner === undefined
      ) {
        continue;
      }
      const amount =
        burst.effect === "apply-status"
          ? burst.durationSeconds
          : burst.effect === "resurrect"
            ? burst.healthPercent
            : Math.min(
                burst.perSecondAlive * Math.floor(creature.ageSeconds + SWING_EPSILON),
                burst.max ?? Number.POSITIVE_INFINITY,
              );
      if (amount <= 0) {
        continue;
      }
      const effect: SkillEffect =
        burst.effect === "apply-status"
          ? { kind: "apply-status", statusId: burst.statusId, durationSeconds: { flat: amount } }
          : burst.effect === "resurrect"
            ? {
                kind: "resurrect",
                health: { kind: "percent", percent: { flat: amount } },
                energyPercent: { flat: 0 },
                perPartyMemberWithin: undefined,
                at: "corpse",
              }
            : burst.effect === "damage"
              ? { kind: "damage", amount: { flat: amount }, type: "typeless", armorPenetration: 0 }
              : { kind: "heal", amount: { flat: amount } };
      const events: CombatEvent[] = [];
      for (const other of this.#participants.values()) {
        const ally = other.combatant.team === spirit.combatant.team;
        if (
          // Restoration's raises only dead party members (#2478), no
          // creature; the rest touch only the living.
          other.combatant.dead !== (burst.effect === "resurrect") ||
          (burst.effect === "resurrect" && other.creature !== undefined) ||
          other.creature?.kind === "spirit" ||
          (burst.affects !== "all" && ally !== (burst.affects === "allies")) ||
          !sharesFloor(other.floors, floorOf(spirit.layer)) ||
          distance(other.position, spirit.position) > burst.radius ||
          (burst.effect === "apply-status" &&
            other.combatant.health >=
              burst.belowHealthFraction * effectiveMaxHealth(other.combatant))
        ) {
          continue;
        }
        events.push(
          ...applyEffects([effect], {
            caster: owner.combatant,
            target: other.combatant,
            rng: this.#rng,
            rules: this.#ruleset.combat,
            surroundings: this.#participants,
          }),
        );
      }
      this.#logFired([{ sourceId: owner.id, skillId: creature.skillId, events }]);
    }
  }

  /** Every creature that died or expired this step leaves, in that order (#1052). */
  #removeLeaving(): void {
    for (const id of [...this.#leaving]) {
      this.remove(id);
    }
    this.#leaving.clear();
  }

  /**
   * Swap a participant's gear and skills in place: same id, team and
   * position, at the same fraction of their health and full energy, with
   * nothing active and nothing recharging. The loadout carries no skill
   * bar, so it comes separately.
   *
   * The health *fraction* carries over, not the starting health: a build
   * change that moves max health must not be a free heal, and a corpse
   * stays a corpse until its respawn.
   */
  public rearm(id: string, loadout: ResolvedLoadout, skillBar: SkillBar): void {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return;
    }
    const before = record.combatant;
    // Against the raised maximum: Endure Pain must not carry over as health
    // above the fresh, unbuffed maximum.
    const raised = raisedMaxHealth(before);
    const fraction = raised > 0 ? before.health / raised : 0;
    const spec: ParticipantSpec = { ...record.spec, skillBar, ...loadoutSpec(loadout) };
    record.combatant = this.#combatant(spec);
    record.resolvedMaxHealth = loadout.weaponSets[0].maxHealth;
    record.resolvedMaxEnergy = loadout.weaponSets[0].maxEnergy;
    // Back to set 1, as a fresh build starts (#489).
    record.weaponSets = this.#weaponSets(spec);
    record.activeWeaponSet = 0;
    record.swapHealthDebt = 0;
    record.pendingWeaponSet = undefined;
    this.#setMorale(record, before.morale);
    record.combatant.health = record.combatant.maxHealth * fraction;
    record.combatant.dead = before.dead;
    record.combatant.soulReapingTriggers = before.soulReapingTriggers;
    record.skillBar = skillBar;
    record.pendingSkill = undefined;
    this.#rearmCompanions(record);
  }

  /**
   * A bar that keeps a companion's skill keeps the companion as it is,
   * alive or dead; one that drops it sends it away; one that gains it
   * brings a fresh one beside its owner (#1046).
   */
  #rearmCompanions(record: ParticipantRecord): void {
    if (record.creature !== undefined) {
      return;
    }
    const wanted = companionSkills(record.skillBar);
    for (const other of [...this.#participants.values()]) {
      const skillId = other.creature?.companionSkillId;
      if (
        other.creature?.ownerId === record.id &&
        skillId !== undefined &&
        !wanted.some((skill) => skill.id === skillId)
      ) {
        this.remove(other.id);
      }
    }
    for (const skill of wanted) {
      if (this.#companionOf(record, skill.id) === undefined) {
        this.#summon(record, skill.id, skill.companion, 1, record.position, true);
      }
    }
  }

  /** Everyone's living minions, spirits (#1188) and pets (#1206), for this tick's armor. */
  #countControlled(): void {
    for (const record of this.#participants.values()) {
      record.combatant.controlled.minion = 0;
      record.combatant.controlled.spirit = 0;
      record.combatant.controlled.pet = 0;
    }
    for (const record of this.#participants.values()) {
      const creature = record.creature;
      if (
        creature === undefined ||
        creature.kind === "priest" ||
        creature.kind === "guild-lord" ||
        creature.kind === "guard" ||
        creature.kind === "ghostly-hero" ||
        record.combatant.dead
      ) {
        continue;
      }
      const owner =
        creature.ownerId === undefined ? undefined : this.#participants.get(creature.ownerId);
      if (owner !== undefined) {
        owner.combatant.controlled[creature.kind] += 1;
      }
    }
  }

  /** `owner`'s companion, alive or dead (#1046): of `skillId`, or the first. */
  #companionOf(owner: ParticipantRecord, skillId?: string): ParticipantRecord | undefined {
    for (const record of this.#participants.values()) {
      const creature = record.creature;
      if (
        creature?.ownerId === owner.id &&
        creature.companionSkillId !== undefined &&
        (skillId === undefined || creature.companionSkillId === skillId)
      ) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Swap to `set` (#489, ADR-0036), numbered 0-3 for F1-F4: at once, or
   * queued until the cast, aftercast, swing in progress or knockdown
   * ends. Pressing another set while one is queued replaces it; the
   * active set's key drops it. `undefined`: no such participant.
   */
  public requestWeaponSet(id: string, set: number): WeaponSetRequest | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }
    if (record.combatant.dead) {
      return { kind: "refused", reason: "dead" };
    }
    if (!isWeaponSetIndex(set)) {
      return { kind: "refused", reason: "no-such-set" };
    }
    if (record.weaponSets[set] === null) {
      return { kind: "refused", reason: "empty-set" };
    }
    if (set === record.activeWeaponSet) {
      record.pendingWeaponSet = undefined;
      return { kind: "kept" };
    }
    // Reaching for another set drops the bundle (#1225, GW1), ashes too (#1434).
    this.#dropBundle(record);
    this.#dropAshes(record);
    if (this.#swapBlocked(record)) {
      record.pendingWeaponSet = set;
      return { kind: "queued" };
    }
    this.#swapWeapons(record, set);
    return { kind: "swapped" };
  }

  /**
   * Drop the flag (#1225), relic (#1374) or ashes (#1434) `id` carries
   * where they stand: GW1's Drop button. Nothing for a player with none.
   */
  public dropBundle(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#dropBundle(record);
      this.#dropAshes(record);
    }
  }

  /**
   * `record`'s ashes (#1434), if it holds any, fall now, where it stands:
   * their drop effect, the item status's `ends` trigger, fires at once, not
   * at the tick's drain, so a shadow step drops them before it moves. The
   * maximum Health and Energy they raised go first.
   */
  #dropAshes(record: ParticipantRecord): void {
    const dropped = record.combatant.statuses.dropItem();
    if (dropped === undefined) {
      return;
    }
    const change: StatusChange = {
      kind: "ended",
      ...dropped,
      expired: false,
      death: false,
      returnPoint: null,
      stepTargetId: null,
    };
    this.#loseRaisedMaxima(record, change);
    this.#logFired(
      fireChangeTriggers(record.combatant, change, this.#spread, this.#triggerContext()),
    );
  }

  /** `record`'s flag or relic, if it carries one, lies where it is (#1225, #1374). */
  #dropBundle(record: ParticipantRecord): void {
    if (this.#flagsState !== undefined) {
      this.#flagsState = dropFlag(this.#flagsState, record.id, record.position, record.layer);
    }
    if (this.#relicsState !== undefined && this.#relicField !== undefined) {
      this.#relicsState = stepRelics(this.#relicField, this.#relicsState, [
        { kind: "drop", carrierId: record.id, position: record.position, layer: record.layer },
      ]).state;
      this.#refreshBotObjectives();
    }
  }

  /** Put a participant back as they started, exactly as a respawn does. */
  public resetParticipant(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#reset(record, "reset");
    }
  }

  /**
   * Walk. Any direction but none cancels the attack and the cast, as
   * moving does in GW1 (#279). The cast stays paid for and does not
   * recharge. Only a new direction cancels: one held as a cast begins was
   * dropped by `requestSkill`, and the client sends only changes. An
   * instant skill waits for the next step to resolve, but it has no cast
   * to walk out of, so a move leaves it alone.
   *
   * Any direction, none included (`stop`), ends a click-to-walk (#310).
   *
   * Knocked down, nothing moves (#468), but the direction is still kept:
   * it mirrors the keyboard, so a key held through the knockdown walks on
   * the tick the body rises. There is nothing to interrupt while down.
   */
  public setInputDirection(id: string, direction: Vec2): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      record.inputDirection = clampInputDirection(direction);
      record.walkGoal = undefined;
      const moving = record.inputDirection.x !== 0 || record.inputDirection.y !== 0;
      if (moving && record.combatant.knockdownRemaining <= 0) {
        this.#moveInterrupts(record);
      }
    }
  }

  /**
   * Walk to `point`, round walls and bodies, and stop there (#310): a
   * left-click on the ground. It interrupts what a move does, the attack
   * and a cast (#279), and keeps the target, so Space resumes the attack.
   *
   * A point a body cannot stand on, inside a wall or off the map, walks
   * to the nearest one that it can. A goal with no way there at all is
   * no walk; the hero only stops.
   *
   * Knocked down, the click is refused, not kept for rising (#468).
   *
   * `layer` is the layer the click names (ADR-0051). One the point is not
   * on is refused and the body stands. Omitted, no layer is named, and a
   * ramp takes the body the way it is walking.
   *
   * Only the point is kept here. The next step settles it, once however
   * many clicks arrived since: settling costs a path search, and a client
   * may send hundreds of clicks a second.
   */
  public walkTo(id: string, point: Vec2, layer?: number): void {
    const record = this.#participants.get(id);
    if (record === undefined || record.combatant.dead || record.combatant.knockdownRemaining > 0) {
      return;
    }
    record.inputDirection = ZERO;
    if (layer !== undefined && !this.#isOnLayer(point, layer)) {
      record.walkGoal = undefined;
      record.route = undefined;
      return;
    }
    this.#moveInterrupts(record);
    record.walkGoal = point;
    record.walkLayer = layer;
    record.route = undefined;
    record.walkSettled = false;
    record.walkStalledSeconds = 0;
    record.walkLeast = Number.POSITIVE_INFINITY;
  }

  /**
   * Moving cancels the attack, a skill walking in (#499) and a cast with
   * a cast time, as in GW1 (#279). In the aftercast it drops the skill
   * queued for after it, so the walk goes when the aftercast ends instead
   * of being swallowed by the queued cast (#317).
   */
  #moveInterrupts(record: ParticipantRecord): void {
    record.combatant.attack = undefined;
    record.interact = undefined;
    record.pendingSkill = undefined;
    this.#cancelCast(record);
    record.combatant.cast.clearQueue();
  }

  /**
   * Cancel Action, Esc in GW1 (#300): stop the cast, the attack and a
   * walk to a clicked point (#310) in one press, whichever are running.
   * The cast ends as walking ends it, paid for and not recharging. A skill
   * queued for after the aftercast, or walking in (#499), is dropped too
   * (#317). With none of these, nothing happens.
   */
  public cancelAction(id: string): void {
    const record = this.#participants.get(id);
    if (record !== undefined) {
      this.#cancelCast(record);
      record.combatant.attack = undefined;
      record.pendingSkill = undefined;
      record.combatant.cast.clearQueue();
      record.walkGoal = undefined;
      record.interact = undefined;
    }
  }

  /**
   * End an enchantment `casterId` maintains on `targetId` (#838): a
   * double-click on its icon in GW1. It leaves the bearer at once, for
   * free, with no log row, and the upkeep stops with it. Anything but a
   * maintained `statusId` of the caster's own on that target is refused
   * quietly, so a click that raced a drop does nothing. Whether it ended.
   */
  public endUpkeep(casterId: string, targetId: string, statusId: string): boolean {
    const bearer = this.#participants.get(targetId)?.combatant;
    if (bearer === undefined || !isStatusId(statusId)) {
      return false;
    }
    const status = bearer.statuses.get(statusId);
    if (status === undefined || status.maintained === null || status.sourceId !== casterId) {
      return false;
    }
    return bearer.statuses.remove(statusId);
  }

  /**
   * `ownerId` tells its companion `creatureId` how to fight (#1110), from
   * the party window. Anything but the owner's own companion, a minion
   * above all, is refused quietly; a dead owner may still order. Heel
   * drops the attack at once, mid-swing or not. Whether it was taken.
   */
  public commandCreature(ownerId: string, creatureId: string, order: CreatureOrder): boolean {
    const record = this.#participants.get(creatureId);
    const creature = record?.creature;
    if (
      record === undefined ||
      creature?.ownerId !== ownerId ||
      creature.companionSkillId === undefined
    ) {
      return false;
    }
    creature.mode = order.mode;
    if (order.mode === "heel") {
      record.combatant.attack = undefined;
    }
    return true;
  }

  /**
   * Abandon `record`'s cast and log it as `"cancelled"`. An instant skill
   * has no cast to give up, so it is left to resolve.
   */
  #cancelCast(record: ParticipantRecord): void {
    const cast = record.combatant.cast.activeCast;
    if (cast !== undefined && cast.totalSeconds > 0) {
      record.combatant.cast.cancelCast();
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: cast.skillId,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: [{ kind: "cancelled", targetId: record.id, skillId: cast.skillId }],
      });
    }
  }

  /**
   * Attack `targetId` with the equipped weapon until told otherwise
   * (ADR-0026): walk into reach, then swing at the weapon's rate.
   *
   * Asking again for the same target keeps the swing in progress; a new
   * target starts a fresh one. Refused, with the reason a cast at it
   * would get, unless the target is a living enemy and the attacker is
   * alive. Range and line of sight are not checked: approach closes the
   * one, and a ranged swing checks the other as it is released, so an
   * attack can start behind a corner and walk out.
   *
   * An attack allowed ends a click-to-walk, and its approach takes over
   * (#310); one refused leaves the walk going. One at anyone but the
   * target of a skill walking in drops that skill (#499).
   *
   * At a flag, the stand (#1225), a relic (#1374) or your own team's
   * Ghostly Hero (#1377), it is GW1's Interact instead: see
   * `#requestInteract`. A foe's ghost is attacked as any foe is.
   */
  public requestAttack(id: string, targetId: string): ActivationCheck | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }
    if (
      isCarriedObjectId(targetId) ||
      switchIdOf(targetId) !== undefined ||
      this.#isAllyGhost(record, targetId)
    ) {
      return this.#requestInteract(record, targetId);
    }
    const check = this.#attackCheck(record, targetId);
    if (check.ok) {
      record.interact = undefined;
      record.walkGoal = undefined;
      if (record.pendingSkill?.targetId !== targetId) {
        record.pendingSkill = undefined;
      }
      if (record.combatant.attack?.targetId !== targetId) {
        record.combatant.attack = { targetId, swingElapsed: 0, unreachableSeconds: 0 };
        record.route = undefined;
      }
    }
    return check;
  }

  /**
   * Walk to a flag or the stand and, on reaching it, take up the flag or
   * plant the one carried (#1225, GW1's Interact); or to a relic, to take
   * up your own or return a foe's (#1374). Refused at once for a foe's
   * flag, a bundle not lying anywhere, or the stand with no flag in hand;
   * and when dead. Knocked down or casting, the walk waits. It ends the
   * attack, a skill walking in and a click-to-walk, as an attack does.
   * Or to your team's living Ghostly Hero, to tell it to follow you or
   * stay (#1377).
   */
  #requestInteract(record: ParticipantRecord, targetId: string): ActivationCheck {
    if (record.combatant.dead) {
      return { ok: false, reason: "caster-dead" };
    }
    const refusal = this.#interactRefusal(record, targetId);
    if (refusal !== undefined) {
      return { ok: false, reason: refusal };
    }
    record.walkGoal = undefined;
    record.pendingSkill = undefined;
    record.combatant.attack = undefined;
    record.route = undefined;
    if (record.interact?.targetId !== targetId) {
      record.interact = { targetId, unreachableSeconds: 0 };
    }
    return { ok: true };
  }

  /**
   * Validate and apply a target selection (brief §5).
   *
   * Only existence is required here; range and line of sight are checked
   * at *cast* time, since this genre lets you target anything you can see
   * regardless of whether you can currently reach it.
   *
   * @returns whether the selection was applied
   */
  public setTarget(id: string, targetId: string | undefined): boolean {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return false;
    }
    if (targetId === undefined) {
      record.targetId = undefined;
      return true;
    }
    // A flag is targeted as a body is, and the stand (#1225), and a relic (#1374).
    const bundle =
      (this.#flagField !== undefined &&
        (targetId === FLAG_STAND_ID ||
          this.flags.some(({ team }) => team === flagTeamOf(targetId)))) ||
      this.relics.some(({ team }) => team === relicTeamOf(targetId)) ||
      this.#switchOf(targetId) !== undefined;
    if (!bundle && !this.#participants.has(targetId)) {
      return false;
    }
    record.targetId = targetId;
    return true;
  }

  /**
   * The foe `team` called (#443), or none: its bots fight that one while
   * it lives (#1193). The match host says so whenever the call changes.
   */
  public setCalledTarget(team: number, targetId: string | undefined): void {
    if (targetId === undefined) {
      this.#calledTargets.delete(team);
    } else {
      this.#calledTargets.set(team, targetId);
    }
  }

  /**
   * Begin casting the skill in `slot`, if every activation rule passes.
   *
   * The whole validation gate lives in `canActivate`; this method only
   * gathers the inputs it needs. A participant that asks for an illegal
   * cast does not get one, and the returned check says why.
   *
   * A slot with no skill in it returns nothing to say: the client draws
   * only the slots it was sent, so asking for another one is not a player
   * pressing a key.
   *
   * With no target, an enemy-targeted skill targets the nearest living
   * enemy first, picked exactly as a behaviour picks one. That target
   * stays selected, whether or not the cast is then allowed.
   *
   * An ally-targeted skill with nothing or an enemy selected goes to the
   * caster, as in GW1 (#52). The enemy stays selected, so a monk can heal
   * themself mid-fight without losing the target.
   */
  public requestSkill(id: string, slot: number): SkillRequest | undefined {
    const record = this.#participants.get(id);
    if (record === undefined) {
      return undefined;
    }

    // A copy standing in the slot (#469) is what the slot holds.
    const used = slotSkill(record.skillBar, record.combatant.cast, slot);
    const skill = used === undefined ? undefined : getSkill(used.skillId);
    if (used === undefined || skill === undefined) {
      return undefined;
    }
    // The slot being activated, pressed again, does nothing (#1733, GW1):
    // a skill already queued stays queued, and nothing is told.
    if (record.combatant.cast.activeCast?.key === used.key) {
      return { skillId: skill.id, check: { ok: true } };
    }

    if (skill.target === "single-enemy" && record.targetId === undefined) {
      const team = record.combatant.team;
      record.targetId = nearestLiving(
        record,
        this.#participants.values(),
        (other) => other.combatant.team !== team,
      );
    }

    const castTargetId = skill.target === "self" ? id : this.#castTarget(record, skill);
    // Checked as if nothing were casting: a press during an activation
    // queues (#1722).
    const check = this.#check(record, skill, castTargetId, used.key, false);
    if (skill.type === "pet-attack") {
      if (check.ok) {
        this.#armPetAttack(record, skill, used.key);
      }
      return { skillId: skill.id, check };
    }
    // A shout or a stance goes off at once in the middle of an activation,
    // an aftercast or a knockdown (#1725, GW1), and touches none of them.
    // Out of range or sight, it is refused: nothing walks in mid-action.
    const { cast } = record.combatant;
    if (
      usableMidAction(skill) &&
      (cast.isCasting || cast.inAftercast || record.combatant.knockdownRemaining > 0)
    ) {
      if (check.ok) {
        this.#useMidAction(record, skill, used.key, castTargetId);
      }
      return { skillId: skill.id, check };
    }
    // Pressed during an activation, a skill goes next, as in GW1 (#1722):
    // queued, replacing one already waiting, and paid for nothing yet. It
    // is requested again when the activation, or the aftercast after it,
    // ends; out of range or sight then, it walks in as any press does.
    if (record.combatant.cast.isCasting) {
      if (!check.ok && check.reason !== "out-of-range" && check.reason !== "no-line-of-sight") {
        return { skillId: skill.id, check };
      }
      record.combatant.cast.queue(slot);
      return { skillId: skill.id, check: { ok: true }, queued: true };
    }
    // Out of range or out of sight, a skill walks in and goes off there,
    // as Space does (#415, operator Q61). Range and line of sight are
    // checked last, so everything else has passed; it is all checked
    // again on arrival. An attack skill turns on its target with the
    // weapon as it goes; any other leaves the attack to pause and resume.
    if (
      !check.ok &&
      (check.reason === "out-of-range" || check.reason === "no-line-of-sight") &&
      castTargetId !== undefined
    ) {
      record.walkGoal = undefined;
      record.combatant.cast.clearQueue();
      record.pendingSkill = { slot, targetId: castTargetId, unreachableSeconds: 0 };
      record.route = undefined;
      if (skill.attack !== undefined) {
        record.combatant.attack = {
          targetId: castTargetId,
          swingElapsed: 0,
          unreachableSeconds: 0,
        };
      }
      return { skillId: skill.id, check: { ok: true }, queued: true };
    }
    return this.#useSkill(record, slot, skill, used.key, castTargetId, check);
  }

  /**
   * A pet attack, allowed (#1046): its owner pays and it starts
   * recharging, and its owner's companion's next blow within
   * `PET_ATTACK_SECONDS` is it, replacing one still waiting, whose energy
   * is lost. No cast: the owner's cast, aftercast and swing go on. With a
   * living foe selected, the pet goes for it, as when its owner attacks
   * one, unless it is on Heel, which never engages (#1110).
   */
  #armPetAttack(record: ParticipantRecord, skill: Skill, key: string): void {
    const pet = this.#companionOf(record);
    if (pet === undefined) {
      return;
    }
    const { rule } = this.#payForUse(record, skill, key, undefined);
    // Serpent's Quickness (#1539) is any skill's, a pet attack's too.
    const faster = Math.max(
      aggregateModifiers(record.combatant.statuses.active).skillRechargeFaster,
      rule.own.rechargeFaster,
    );
    beginRecharge(
      record.combatant.cast,
      skill,
      reducedRecharge(skill.rechargeSeconds, faster) * (1 + rule.own.rechargeSlower),
      key,
    );
    pet.armedAttack = { skillId: skill.id, remainingSeconds: PET_ATTACK_SECONDS };
    const foe = record.targetId === undefined ? undefined : this.#participants.get(record.targetId);
    if (
      foe !== undefined &&
      !foe.combatant.dead &&
      foe.combatant.team !== record.combatant.team &&
      pet.creature?.mode !== "heel" &&
      pet.behaviour?.kind === "follow-and-attack" &&
      distance(foe.position, pet.position) <= pet.behaviour.aggroUnits
    ) {
      this.requestAttack(pet.id, foe.id);
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: record.id,
      skillId: skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events: [],
    });
    this.#loseSkillHealth(record);
  }

  /**
   * A shout or a stance used mid-action (#1725): paid, and resolved now
   * as an instant that finished its activation, by the one path every
   * cast resolves by, which starts its recharge and answers its use. The
   * cast in progress, the aftercast, the queue, the swing and the
   * knockdown are left as they were.
   */
  #useMidAction(
    record: ParticipantRecord,
    skill: Skill,
    key: string,
    castTargetId: string | undefined,
  ): void {
    const { rule } = this.#payForUse(record, skill, key, castTargetId);
    this.#castBegun(record, skill, castTargetId);
    // An instant flies nowhere, so no time passes for it.
    this.resolveCast(
      record,
      {
        skillId: skill.id,
        key,
        targetId: castTargetId,
        totalSeconds: 0,
        remainingSeconds: 0,
        whileActivating: undefined,
        rule,
        targetHadLessHealth: this.#hasLessHealth(record, castTargetId),
        ordinal: record.combatant.cast.nextOrdinal(),
      },
      0,
    );
    this.#loseSkillHealth(record);
  }

  /**
   * A skill used, at once or as it begins: its cost, and what it uses up
   * of a glyph, the chants on its user, or a status counting its next
   * skills of a kind (#1761). Returns what they give it. `castTargetId`
   * is whose statuses may cut an enchantment's cost (#1975).
   */
  #payForUse(
    record: ParticipantRecord,
    skill: Skill,
    key: string,
    castTargetId: string | undefined,
  ): { rule: CastRule; castsInstantly: boolean } {
    // Read before anything is spent: Extend Enchantments lengthens the
    // enchantment that uses it up.
    const own = ownSkillBoost(record.combatant.statuses.active, skill);
    const causedOvercast = payCost(
      skill,
      record.combatant,
      key,
      castTargetId === undefined ? undefined : this.#participants.get(castTargetId)?.combatant,
    );
    // Iron Mist's Overcast (#2311), as the use begins.
    addOvercast(record.combatant, own.overcast);
    const glyph = this.#useGlyph(record, skill);
    this.#logSpent(record, skill, record.combatant.statuses.useOwnSkillModifiers(skill));
    // Heket's Rampage (#1869) ends before the attack skill is timed.
    if (skill.type === "attack") {
      this.#logSpent(record, skill, record.combatant.statuses.endOnBearerStartAttackSkill());
    }
    const { rule, castsInstantly, losesAllEnergy, spent } = this.#useNextSkillRules(record, skill);
    // Glyph of Essence's price (#1730), once the cost is paid.
    if (losesAllEnergy) {
      record.combatant.energy = 0;
    }
    // A glyph or a rule this start spent still boosts the skill (#1941).
    const heldAttributeDeltas = [...glyph.ended, ...spent].flatMap(
      (id) => getStatusDefinition(id).attributeDeltas,
    );
    return {
      rule: {
        ...rule,
        rechargeFaster: Math.max(rule.rechargeFaster, glyph.rechargeFaster),
        projectileSpeedMultiplier: glyph.projectileSpeedMultiplier,
        heldAttributeDeltas,
        own,
        causedOvercast,
      },
      castsInstantly,
    };
  }

  /**
   * The rest of `requestSkill`, once its target is known and `check`
   * made: queue it behind an aftercast, or pay for it and begin it. Also
   * how a skill walking in goes off on arrival (#415, #499).
   */
  #useSkill(
    record: ParticipantRecord,
    slot: number,
    skill: Skill,
    key: string,
    castTargetId: string | undefined,
    check: ActivationCheck,
  ): SkillRequest {
    if (!check.ok) {
      return { skillId: skill.id, check };
    }
    // Another skill, accepted, drops one walking in: the press replaces it.
    record.pendingSkill = undefined;
    // During an aftercast a skill with an activation time, or an attack
    // skill, which takes its weapon's, waits for it to end, as in GW1
    // (#317): checked now, so one that could never go off is refused at
    // once, and tried again for real when it fires. An instant goes off at
    // once.
    if (
      record.combatant.cast.inAftercast &&
      (skill.activationSeconds > 0 || skill.attack !== undefined)
    ) {
      record.combatant.cast.queue(slot);
      return { skillId: skill.id, check, queued: true };
    }

    // Timed before it is paid for, so a status its use spends (#1761)
    // still hastens it. Adept's chance (#2011) halves it after the rest.
    const scaled =
      skill.attack === undefined
        ? effectiveActivationSeconds(
            skill,
            record.combatant,
            castTargetId === undefined
              ? undefined
              : this.#participants.get(castTargetId)?.combatant,
          )
        : undefined;
    const timed =
      scaled !== undefined &&
      scaled > 0 &&
      spellModComesUp(record.combatant.equipment.spellMods.castHalves, skill, this.#rng)
        ? scaled / 2
        : scaled;
    const { rule, castsInstantly } = this.#payForUse(record, skill, key, castTargetId);
    // The swing in progress is lost, as in GW1; the attack itself resumes
    // once the skill is done. A flash enchantment keeps it (#1421).
    if (record.combatant.attack !== undefined && !skill.flash) {
      record.combatant.attack.swingElapsed = 0;
    }
    if (skill.flash) {
      this.#lockOutFlash(record, skill.id, key);
    }
    const activationSeconds = castsInstantly ? 0 : (timed ?? this.#attackHitSeconds(record, skill));
    record.combatant.cast.beginCast(
      skill.id,
      castTargetId,
      activationSeconds,
      skill.whileActivating,
      key,
      rule,
      this.#hasLessHealth(record, castTargetId),
    );
    this.#castBegun(record, skill, castTargetId);
    // Casting stops you (operator Q33): a key held as the cast begins
    // does not walk, and only the next move cancels the cast. An instant
    // has no cast, so it leaves the walk alone. A click-to-walk stops the
    // same way (#310).
    if (activationSeconds > 0) {
      record.inputDirection = ZERO;
      record.walkGoal = undefined;
    }
    this.#loseSkillHealth(record);
    return { skillId: skill.id, check };
  }

  /**
   * Tainted water's price for a skill paid for (#3028): health loss, once
   * the use has begun, so a death it causes ends the cast as any death
   * does. Logged as a status tick, from the ground that put it on.
   */
  #loseSkillHealth(record: ParticipantRecord): void {
    const { combatant } = record;
    const amount = skillHealthLoss(combatant);
    if (amount <= 0) {
      return;
    }
    const events: CombatEvent[] = [];
    loseHealth(combatant, amount, "health-loss", events);
    if (events.length === 0) {
      return;
    }
    const taint = combatant.statuses.active.find(
      ({ id }) => getStatusDefinition(id).healthLossOnSkill > 0,
    );
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "degeneration",
      sourceId: taint?.sourceId,
      skillId: undefined,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * A flash enchantment used disables its caster's other flash skills for
   * `FLASH_LOCKOUT_SECONDS` (#1421), as GW1's rule of the type rather than
   * an effect each skill lists. A longer recharge is kept, and logs no
   * disable.
   */
  #lockOutFlash(record: ParticipantRecord, usedId: string, usedKey: string): void {
    const { combatant } = record;
    const events: CombatEvent[] = [];
    for (const slot of resolvedBar(record.skillBar, combatant.cast)) {
      if (slot === null || slot.key === usedKey || getSkill(slot.skillId)?.flash !== true) {
        continue;
      }
      if (combatant.cast.disable(slot.key, FLASH_LOCKOUT_SECONDS)) {
        events.push({
          kind: "skill-disabled",
          targetId: record.id,
          skillId: slot.skillId,
          seconds: FLASH_LOCKOUT_SECONDS,
        });
      }
    }
    if (events.length > 0) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: usedId,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events,
      });
    }
  }

  /**
   * A spell starting, paid for, uses up one of the next spells an active
   * glyph holds (#526): an interrupt or a cancel after this does not give
   * it back, as in GW1. A glyph spent logs its end.
   * What the holding glyphs do to the spell is taken first (#2453): Glyph
   * of Swiftness' last spell still recharges faster and flies faster.
   */
  #useGlyph(
    record: ParticipantRecord,
    skill: Skill,
  ): {
    ended: readonly StatusId[];
    rechargeFaster: number;
    projectileSpeedMultiplier: number;
  } {
    if (!isSpell(skill.type)) {
      return { ended: [], rechargeFaster: 0, projectileSpeedMultiplier: 1 };
    }
    const holding = record.combatant.statuses.active.flatMap(({ id }) => {
      const next = getStatusDefinition(id).nextSpells;
      return next === undefined ? [] : [next];
    });
    const ended = record.combatant.statuses.countSpellStarted();
    this.#logSpent(record, skill, ended);
    return {
      ended,
      rechargeFaster: Math.max(0, ...holding.map((next) => next.rechargeFaster)),
      projectileSpeedMultiplier: Math.max(
        1,
        ...holding.map((next) => next.projectileSpeedMultiplier),
      ),
    };
  }

  /** The statuses `skill`'s use spent, each logged as ended under it. */
  #logSpent(record: ParticipantRecord, skill: Skill, ended: readonly StatusId[]): void {
    if (ended.length > 0) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: skill.id,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: ended.map((statusId) => ({
          kind: "status-expired",
          targetId: record.id,
          statusId,
        })),
      });
    }
  }

  /**
   * A skill starting, paid for, uses up every chant that holds how the
   * next skill of its kind goes (#1505), as a glyph is: an interrupt or a
   * cancel after this does not give it back. Returns what they give the
   * cast; each spent logs its end under its chant.
   */
  #useNextSkillRules(
    record: ParticipantRecord,
    skill: Skill,
  ): {
    rule: Omit<
      CastRule,
      "own" | "heldAttributeDeltas" | "causedOvercast" | "projectileSpeedMultiplier"
    >;
    castsInstantly: boolean;
    losesAllEnergy: boolean;
    spent: readonly StatusId[];
  } {
    const all = record.combatant.statuses.useNextSkillRules(skill);
    const used = all.filter(({ answered }) => answered);
    const cost = skill.cost?.kind === "energy" ? skill.cost.amount : 0;
    this.#logFired(
      all.map(({ statusId, rule, answered, ranks }) => {
        // Auspicious Incantation's share of the cost (#2502), at its
        // source's ranks, once the skill is paid for.
        const events: CombatEvent[] = [];
        if (answered) {
          gainEnergy(
            record.combatant,
            Math.round(cost * statAt(rule.energyGainOfCost, ranks)),
            events,
          );
        }
        return {
          sourceId: record.id,
          skillId: rule.skillId,
          events: [...events, { kind: "status-expired" as const, targetId: record.id, statusId }],
        };
      }),
    );
    return {
      rule: {
        uninterruptible: used.some(({ rule }) => rule.uninterruptible),
        unblockable: used.some(({ rule }) => rule.unblockable),
        rechargesInstantly: used.some(({ rule }) => rule.rechargesInstantly),
        // Auspicious Incantation's at its source's ranks (#2502), whole seconds.
        extraRechargeSeconds: used.reduce(
          (sum, { rule, ranks }) => sum + Math.round(statAt(rule.extraRechargeSeconds, ranks)),
          0,
        ),
        // Ritual Lord's on a binding ritual (#1941).
        rechargeFaster: Math.max(
          0,
          ...used.map(({ rule }) =>
            rule.rechargeFasterIfType?.type === skill.type ? rule.rechargeFasterIfType.fraction : 0,
          ),
        ),
        resetsRecharge: used.flatMap(({ rule }) =>
          rule.resetsOwnRechargeIfType === skill.type ? [rule.skillId] : [],
        ),
      },
      castsInstantly: used.some(({ rule }) => rule.castsInstantly),
      losesAllEnergy: used.some(({ rule }) => rule.losesAllEnergy),
      spent: used.map(({ statusId }) => statusId),
    };
  }

  /**
   * A cast beginning puts its caster in combat if it is an attack skill
   * or at a foe, and that foe too: cancelled or interrupted later, it
   * still counted (GW1). A self-heal or a skill on an ally does not.
   */
  /**
   * A blow or attack skill started keeps adrenaline (#828) for its
   * attacker and its foe: a hit for 0, which logs no damage, or one that
   * is blocked is still a fight.
   */
  #blowStarted(record: ParticipantRecord, target: ParticipantRecord | undefined): void {
    record.combatant.lastCombatAt = this.#elapsedSeconds;
    if (target !== undefined && target.combatant.team !== record.combatant.team) {
      target.combatant.lastCombatAt = this.#elapsedSeconds;
    }
  }

  /** Whether `targetId` has less Health than `record` now (#2282): Spoil Victor's read. */
  #hasLessHealth(record: ParticipantRecord, targetId: string | undefined): boolean {
    const target = targetId === undefined ? undefined : this.#participants.get(targetId);
    return target !== undefined && target.combatant.health < record.combatant.health;
  }

  #castBegun(record: ParticipantRecord, skill: Skill, castTargetId: string | undefined): void {
    const target = castTargetId === undefined ? undefined : this.#participants.get(castTargetId);
    const atFoe = target !== undefined && target.combatant.team !== record.combatant.team;
    if (skill.attack !== undefined || atFoe) {
      record.outOfCombatSeconds = 0;
    }
    // Only an attack skill keeps adrenaline (#828), its own and its foe's,
    // as a blow does; a spell at a foe does not.
    if (skill.type === "attack") {
      this.#blowStarted(record, target);
      this.#attackBegins(record);
    }
    if (atFoe) {
      target.outOfCombatSeconds = 0;
    }
  }

  public step(dt: number): StepResult {
    // A finished match stops simulating, so everyone can read the result.
    if (this.phase !== "active") {
      return this.#result([]);
    }

    this.#tick += 1;
    this.#elapsedSeconds += dt;
    this.#refillLossCaps();
    this.checkMatchEnd();
    for (const record of this.#participants.values()) {
      this.#stepStart.set(record.id, record.position);
    }
    this.#countControlled();
    this.#advanceGroundEffects(dt);
    this.#projectAuras();
    // Every knockdown counts down before anyone acts, so one lasts its
    // full duration whoever lands it, and the tick it ends is one its
    // bearer acts in again (#468). A shrine's invulnerability too (#1208).
    for (const record of this.#participants.values()) {
      this.#advanceKnockdown(record.combatant, dt);
      this.#advanceInvulnerability(record.combatant, dt);
      tickChainMarks(record.combatant, dt);
    }
    this.#advanceProjectiles(dt);
    this.#steadyGhosts();

    for (const record of this.#participants.values()) {
      if (this.#resetDue(record, dt)) {
        this.#reset(record, "reset");
      }
      // Overcast recovers alive or dead (#461, GW1).
      recoverOvercast(record.combatant, this.#ruleset.resources.overcastRecoveryPerSecond, dt);

      if (record.combatant.dead) {
        record.respawnInSeconds -= dt;
        if (record.respawnInSeconds <= 0) {
          this.#reset(record, "respawn");
        }
        continue;
      }

      // A creature that has run its time vanishes (#1052): no death, so
      // nothing answers it and nobody scores.
      if (record.creature !== undefined) {
        record.creature.ageSeconds += dt;
        record.creature.expiresInSeconds -= dt;
        if (record.creature.expiresInSeconds < SWING_EPSILON) {
          this.#leaving.add(record.id);
          continue;
        }
      }
      // A pet attack waits for its pet's blow only so long (#1046); the
      // energy stays spent.
      if (record.armedAttack !== undefined) {
        record.armedAttack.remainingSeconds -= dt;
        if (record.armedAttack.remainingSeconds < SWING_EPSILON) {
          record.armedAttack = undefined;
        }
      }

      // Adrenaline does not keep between fights (#828): out of combat for
      // the whole window, within a hair, as a swing's interval is.
      const lossIn = adrenalineLossIn(
        record.combatant,
        this.#elapsedSeconds,
        this.#ruleset.resources.adrenalineLossSeconds,
      );
      if (lossIn !== null && lossIn < SWING_EPSILON) {
        emptyAdrenaline(record.combatant);
      }

      // Knocked down, it does nothing at all; its statuses and recharges
      // run on (#468). Read here, so one landed earlier this tick counts.
      const down = record.combatant.knockdownRemaining > 0;

      // The aftercast holds the body still; a held direction or a clicked
      // point is kept for after it.
      if (!down && !record.combatant.cast.inAftercast) {
        this.advanceMovement(record, record.inputDirection, dt);
        this.#advanceWalk(record, dt);
        this.#advanceFollow(record, dt);
      }
      // Where it stands now, before its statuses run (ADR-0053).
      this.#applyZones(record);

      // Degeneration its statuses' own regeneration does not cancel is
      // health lost, so natural regeneration stops before it would.
      // A minion's rot (#467) counts as one, and it never regenerates.
      const modifiers = aggregateModifiers(record.combatant.statuses.active);
      const rot = creaturePips(record);
      record.outOfCombatSeconds += dt;
      if (clampPips(modifiers.healthPips + rot) < 0) {
        record.outOfCombatSeconds = 0;
      }
      const natural = this.#naturalPips(record);

      // Energy regenerates continuously, at the net pips (GW1); adrenaline
      // is earned by acting, not by waiting, so it deliberately does not
      // tick up here.
      const energyPips = netPips(record.combatant, natural, this.#upkeep(record.combatant)).energy;
      // Up to the ceiling overcast leaves, which can be below 0 (#461).
      record.combatant.energy = Math.max(
        energyFloor(record.combatant),
        Math.min(
          effectiveMaxEnergy(record.combatant),
          record.combatant.energy + energyPips * ENERGY_PER_PIP * dt,
        ),
      );

      const sources = degenerationSources(record.combatant);
      // Spirit Light Weapon's more near a spirit (#1064): counted only for
      // a bearer it could matter to.
      const nearSpirit =
        modifiers.healthPerSecondNearSpirit !== 0 &&
        spiritsWithin(this.#participants.values(), record, AREA_EARSHOT) > 0;
      // Signet of Ghostly Might's (#1827): who put each status on a
      // summoned creature that destroys it as it runs out.
      const destroyers = new Map(
        isSummonedCreature(record.creature?.kind)
          ? record.combatant.statuses.active
              .filter(({ id }) => getStatusDefinition(id).destroysBearerOnExpiry)
              .map(({ id, sourceId }) => [id, sourceId] as const)
          : [],
      );
      const statusEvents = advanceStatuses(record.combatant, dt, natural + rot, nearSpirit);
      // One ran out on a creature still standing: it is destroyed as
      // Rupture Soul destroys a spirit, no corpse, no killer, no morale.
      const ranOut = statusEvents.find(
        (event) => event.kind === "status-expired" && destroyers.has(event.statusId),
      );
      const destroyedBy =
        ranOut?.kind === "status-expired" && !statusEvents.some((event) => event.kind === "death")
          ? destroyers.get(ranOut.statusId)
          : undefined;
      if (destroyedBy !== undefined) {
        record.combatant.health = 0;
        record.combatant.dead = true;
        statusEvents.push({ kind: "creature-destroyed", targetId: record.id });
      }
      if (statusEvents.length > 0) {
        const drained = statusEvents.some((event) => event.kind === "damage");
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: destroyedBy ?? (drained ? sources.draining : sources.healing),
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: statusEvents,
        });
      }

      // Degeneration (bleeding, burning, a hex) can kill between ticks.
      // Keyed off the emitted death event rather than re-reading
      // `combatant.dead`: the flag was checked above, so narrowing would
      // claim this is unreachable, and losing this branch would leave a
      // corpse mid-cast that never respawns.
      if (
        statusEvents.some((event) => event.kind === "death" || event.kind === "creature-destroyed")
      ) {
        this.#recordDeaths(statusEvents);
        continue;
      }

      // A copy that ends this tick takes its cast with it (#1928): the
      // skill being cast is no longer in the slot.
      const casting = record.combatant.cast.activeCast;
      if (
        casting !== undefined &&
        [...record.combatant.cast.overrides.values()].some(
          (copy) => copy.key === casting.key && copy.remainingSeconds <= dt,
        )
      ) {
        this.#cancelCast(record);
      }
      const completed = record.combatant.cast.advance(dt);
      dropEndedCopyPools(record.combatant);
      if (completed !== undefined) {
        this.resolveCast(record, completed, dt);
        // A claim finished that the rule still allows (#1377): the altar
        // is settled once every death is in.
        if (completed.skillId === CLAIM_SKILL_ID && this.#mayClaim(record)) {
          this.#claims.push(record.combatant.team);
        }
      }
      // A skill pressed during an activation or the aftercast goes off the
      // tick both are over (#317, #1722). A refusal now is dropped: nobody
      // is pressing a key at this moment.
      if (!record.combatant.cast.isCasting && !record.combatant.cast.inAftercast) {
        const queued = record.combatant.cast.takeQueued();
        if (queued !== undefined) {
          this.requestSkill(record.id, queued);
        }
      }

      if (!down) {
        // Before a skill queued behind the same cast goes off, and after a
        // blow that just landed: a swap is an action, queued behind the
        // one in progress (#489).
        this.#settleWeaponSwap(record);
        this.#advancePendingSkill(record, dt);
        this.#advanceInteract(record, dt);
        this.#advanceAttack(record, dt);
        this.#settleWeaponSwap(record);
        this.#faceCastTarget(record);
      }
      // Walked or approached: either way, it is what a shot leads.
      record.history.push(record.position);

      // Behaviours act after their own cast resolves, so a dummy can
      // finish one cast and begin the next within the same tick.
      // A Ghostly Hero on the altar claims it by itself instead (#1377).
      if (record.behaviour !== undefined && !down && !this.#claim(record)) {
        this.#act(record, record.behaviour, dt);
      }
    }

    this.#springTraps();
    this.#pulseGroundEffects();
    this.#pulseSpirits();
    this.#pulseStatuses();
    this.#settleUpkeep(dt);
    this.#fireEnergyEmpty();
    this.#fireSourceApart();
    this.#spreadStatuses();
    this.#fireStatusChanges();
    this.#breakBonds();
    this.#awardKillMorale();
    this.#settleMoving();
    this.#tallyAggression();
    this.#burstLeaving();
    this.#removeLeaving();
    this.#replaceFallen();
    // Before the wave: a team beaten this step is out, and not raised.
    this.#eliminateBeaten();
    this.#priestWave();
    // After every death, before the match end: a point on the last tick counts.
    this.#advanceRelics();
    this.#advanceAltar(dt);
    this.#watchStartLine();
    this.#advanceCapturePoints(dt);
    this.#advanceGates(dt);
    // After every death this step, so two teams wiped in it both lose.
    this.checkMatchEnd();
    // After the match end: a lord slain as a boost falls due ends it first.
    this.#advanceFlags(dt);
    this.#advanceBeacon(dt);
    this.#advanceZoneStrikes();

    const log = this.#log.concat(this.#reaped);
    this.#log = [];
    this.#reaped = [];
    this.#healthLost(log);
    return this.#result(log);
  }

  /**
   * Maintained enchantments that end by themselves (#837, GW1), once
   * everyone has acted. A death ends one, the bearer's or its caster's.
   * A bearer beyond compass range of its caster for longer than the grace
   * period loses it, unlogged; coming back starts the grace again (#839).
   * Past the cap, a caster whose upkeep takes its pre-cap energy pips below
   * −`MAX_PIPS` loses its oldest. And a caster at 0 energy whose pre-cap
   * net is below 0 loses its newest, then the next, until it can pay, each
   * with a log row of its own. Pre-cap, never the clamped rate the tick
   * applies.
   */
  #settleUpkeep(dt: number): void {
    const maintained = new Map<string, { bearer: Combatant; id: StatusId; seq: number }[]>();
    for (const record of this.#participants.values()) {
      const bearer = record.combatant;
      for (const status of bearer.statuses.active) {
        if (status.maintained === null) {
          continue;
        }
        // Ended by its caster's death, or its caster leaving the match. A
        // dead bearer has none left: its death ended them all (#940).
        const caster = this.#participants.get(status.sourceId);
        if (caster === undefined || caster.combatant.dead) {
          bearer.statuses.remove(status.id);
          continue;
        }
        // Recall's (#1930) holds while its ally is within compass range,
        // as GW1 has it, and ends with the ally gone from the match.
        const anchor =
          status.stepTargetId === null ? caster : this.#participants.get(status.stepTargetId);
        if (anchor === undefined) {
          bearer.statuses.remove(status.id);
          continue;
        }
        status.maintained.outOfRangeSeconds =
          distance(anchor.position, record.position) > RANGE_COMPASS
            ? status.maintained.outOfRangeSeconds + dt
            : 0;
        if (status.maintained.outOfRangeSeconds > UPKEEP_RANGE_GRACE_SECONDS) {
          bearer.statuses.remove(status.id);
          continue;
        }
        const held = maintained.get(status.sourceId) ?? [];
        held.push({ bearer, id: status.id, seq: status.maintained.seq });
        maintained.set(status.sourceId, held);
      }
    }
    for (const [casterId, held] of maintained) {
      const caster = this.#participants.get(casterId)?.combatant;
      if (caster === undefined) {
        continue;
      }
      held.sort((a, b) => a.seq - b.seq);
      let upkeep = -held.length;
      // Over the cap: the oldest give way to the newest, which stays even
      // alone. Checked every tick, so in practice it is the cast that
      // crosses it.
      while (held.length > 1 && preCapEnergyPips(caster, upkeep) < -MAX_PIPS) {
        const oldest = held.shift();
        oldest?.bearer.statuses.remove(oldest.id);
        upkeep += 1;
      }
      // Can't pay: the newest goes first, until the rest can be paid for.
      const events: CombatEvent[] = [];
      while (caster.energy <= 0 && preCapEnergyPips(caster, upkeep) < 0) {
        const newest = held.pop();
        if (newest === undefined) {
          break;
        }
        newest.bearer.statuses.remove(newest.id);
        upkeep += 1;
        events.push({
          kind: "upkeep-lost",
          targetId: newest.bearer.id,
          statusId: newest.id,
          casterId,
        });
      }
      if (events.length > 0) {
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "skill",
          sourceId: casterId,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events,
        });
      }
    }
  }

  /** What `caster` pays for the enchantments it maintains, in pips (#837, #2321). */
  #upkeep(caster: Combatant): number {
    return upkeepPips(caster, combatantsOf(this.#participants.values()));
  }

  /**
   * Spreading statuses (#765), once everyone has acted: every living
   * combatant adjacent to a living bearer, on either team, catches it for
   * as long as the bearer has left, once per outbreak. Who carries what
   * is read before anyone catches anything, so one caught this step
   * spreads from the next, and in the participants' fixed order, so the
   * same seed spreads the same way.
   */
  #spreadStatuses(): void {
    const living = [...this.#participants.values()].filter((record) => !record.combatant.dead);
    const carriers: {
      readonly record: ParticipantRecord;
      readonly status: ActiveStatus;
      readonly outbreak: Outbreak;
      readonly remainingSeconds: number;
    }[] = [];
    for (const record of living) {
      for (const status of record.combatant.statuses.active) {
        if (status.outbreak !== null) {
          // Its bearer is in it, so it never catches its own outbreak back.
          status.outbreak.infected.add(record.id);
          carriers.push({
            record,
            status,
            outbreak: status.outbreak,
            remainingSeconds: status.remainingSeconds,
          });
        }
      }
    }
    for (const { record, status, outbreak, remainingSeconds } of carriers) {
      for (const other of living) {
        // Immune (#1455): not caught, and free to catch it once that ends.
        if (
          outbreak.infected.has(other.id) ||
          !sharesFloor(other.floors, floorOf(record.layer)) ||
          distance(record.position, other.position) > AREA_ADJACENT ||
          other.combatant.statuses.isImmuneTo(status.id)
        ) {
          continue;
        }
        // A spreading status is a condition: an invulnerable body (#1208)
        // does not catch it, and can once its window ends. It says so
        // once an outbreak, not every tick it stands there (#1233).
        if (isInvulnerable(other.combatant)) {
          if (!outbreak.refused.has(other.id)) {
            outbreak.refused.add(other.id);
            this.#log.push({
              tick: this.#tick,
              atSeconds: this.#elapsedSeconds,
              cause: "degeneration",
              sourceId: status.sourceId,
              skillId: undefined,
              weaponId: undefined,
              attributeId: undefined,
              area: undefined,
              doubleStrike: false,
              events: [{ kind: "invulnerable", targetId: other.id }],
            });
          }
          continue;
        }
        outbreak.infected.add(other.id);
        const had = other.combatant.statuses.has(status.id);
        other.combatant.statuses.catch(
          status.id,
          scaledStatusDuration(other.combatant, status.id, remainingSeconds),
          status.sourceId,
          outbreak,
          status.ranks,
        );
        // Already carrying it, from another outbreak: nothing new to say.
        if (had) {
          continue;
        }
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: status.sourceId,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: [
            { kind: "status-spread", targetId: other.id, fromId: record.id, statusId: status.id },
          ],
        });
      }
    }
  }

  /** Losing health of any kind, a hit, a sacrifice, a drain or a steal, is being in combat. */
  #healthLost(log: readonly CombatLogEntry[]): void {
    for (const entry of log) {
      for (const event of entry.events) {
        if (
          (event.kind === "damage" ||
            event.kind === "sacrifice" ||
            event.kind === "health-loss" ||
            event.kind === "health-lost" ||
            event.kind === "life-stolen") &&
          event.amount > 0
        ) {
          const target = this.#participants.get(event.targetId);
          if (target !== undefined) {
            target.outOfCombatSeconds = 0;
          }
        }
      }
    }
  }

  #result(log: readonly CombatLogEntry[]): StepResult {
    return { tick: this.#tick, elapsedSeconds: this.#elapsedSeconds, phase: this.phase, log };
  }

  /** Who a targeted skill lands on: the selection, or the caster for an ally skill with no ally selected. */
  #castTarget(record: ParticipantRecord, skill: Skill): string | undefined {
    if (isCompanionRule(skill.target)) {
      return this.#companionOf(record)?.id;
    }
    if (!isAllyOrSelfRule(skill.target)) {
      return record.targetId;
    }
    const selected =
      record.targetId === undefined ? undefined : this.#participants.get(record.targetId);
    return selected?.combatant.team === record.combatant.team ? selected.id : record.id;
  }

  /**
   * The one activation check, for a cast and for a behaviour asking
   * whether it could. `key` is what the slot used waits under (#469): a
   * copy's, or the skill's own id. A press checks as if nothing were
   * casting, `isCasting` false, as it may queue (#1722).
   */
  #check(
    record: ParticipantRecord,
    skill: Skill,
    targetId: string | undefined,
    key: string = skill.id,
    isCasting: boolean = record.combatant.cast.isCasting,
  ): ActivationCheck {
    // A pet skill acts on the pet, whatever was asked (#1046).
    const targetedId = isCompanionRule(skill.target) ? this.#companionOf(record)?.id : targetId;
    const target = targetedId === undefined ? undefined : this.#participants.get(targetedId);
    const aimed = skill.target === "self" ? record : target;
    const check = canActivate({
      skill,
      caster: record.combatant,
      casterPosition: record.position,
      target: skill.target === "self" ? record.combatant : target?.combatant,
      targetPosition: skill.target === "self" ? record.position : target?.position,
      targetCreatureKind: skill.target === "self" ? record.creature?.kind : target?.creature?.kind,
      targetCreatureOwnerId:
        skill.target === "self" ? record.creature?.ownerId : target?.creature?.ownerId,
      key,
      rechargeRemaining: record.combatant.cast.rechargeRemaining,
      spent: record.combatant.cast.spent,
      isCasting,
      skillBar: resolvedBar(record.skillBar, record.combatant.cast).map(
        (slot) => slot?.key ?? null,
      ),
      losBlockers: this.#wallsOn(record.layer),
      deckBlocked: aimed !== undefined && this.#deckBlocks(record, aimed),
      sharesFloorWithTarget: aimed === undefined || sharesFloor(record.floors, aimed.floors),
      heightStep:
        aimed === undefined
          ? 0
          : heightStep(record.floors, record.layer, aimed.floors, aimed.layer),
    });
    // A carrier's hands are full (#1225, GW1): no attack skill, before
    // anything walks in. Read from the bundles, not a status a cleanse
    // could take off.
    if (skill.type === "attack" && this.carriesBundle(record.id)) {
      return { ok: false, reason: "hands-full" };
    }
    // Any other refusal first; then a corpse skill needs a fresh corpse in
    // reach (#466), or nothing is paid. A well does without, at a price
    // paid as it resolves (#1730).
    if (
      check.ok &&
      skill.corpse !== undefined &&
      skill.corpse.elseSacrificePercent === undefined &&
      skill.corpse.all !== true &&
      this.#freshCorpse(record, skill.corpse, target) === undefined
    ) {
      return { ok: false, reason: "no-corpse" };
    }
    // Spirit Transfer drains the spirit nearest its caster (#1947): none
    // within earshot, nothing is paid.
    if (
      check.ok &&
      skill.effects.some(({ kind }) => kind === "drain-nearest-spirit") &&
      nearestSpiritWithin(this.#participants.values(), record, AREA_EARSHOT) === undefined
    ) {
      return { ok: false, reason: "no-spirit" };
    }
    // Resurrection skills targeted on players cannot target pets (#1046,
    // fandom): told before a walk toward one starts.
    if (
      isResurrectionSkill(skill) &&
      target?.creature !== undefined &&
      (check.ok || check.reason === "out-of-range" || check.reason === "no-line-of-sight")
    ) {
      return { ok: false, reason: "invalid-target-creature" };
    }
    return check;
  }

  /**
   * Each team's centroids, and its foes', from its living players'
   * positions now (#2545): once a tick, into the same objects.
   */
  #placeCentroids(): void {
    this.#centroidsTick = this.#tick;
    for (const team of this.#teams) {
      if (!this.#centroids.has(team)) {
        this.#centroids.set(team, {
          team: { x: 0, y: 0, count: 0 },
          foes: { x: 0, y: 0, count: 0 },
        });
      }
    }
    let x = 0;
    let y = 0;
    let count = 0;
    for (const { team } of this.#centroids.values()) {
      team.x = 0;
      team.y = 0;
      team.count = 0;
    }
    for (const { combatant, creature, position } of this.#participants.values()) {
      const sum = this.#centroids.get(combatant.team)?.team;
      if (combatant.dead || creature !== undefined || sum === undefined) {
        continue;
      }
      sum.x += position.x;
      sum.y += position.y;
      sum.count += 1;
      x += position.x;
      y += position.y;
      count += 1;
    }
    for (const { team, foes } of this.#centroids.values()) {
      foes.count = count - team.count;
      foes.x = foes.count > 0 ? (x - team.x) / foes.count : 0;
      foes.y = foes.count > 0 ? (y - team.y) / foes.count : 0;
      team.x = team.count > 0 ? team.x / team.count : 0;
      team.y = team.count > 0 ? team.y / team.count : 0;
    }
  }

  /** Put a behaviour's intent through the same calls a player's messages make. */
  #act(record: ParticipantRecord, behaviour: Behaviour, dt: number): void {
    if (this.#centroidsTick !== this.#tick) {
      this.#placeCentroids();
    }
    const centroids = this.#centroids.get(record.combatant.team);
    const intent = decide(behaviour, record.cursor, {
      self: record,
      participants: [...this.#participants.values()],
      dt,
      // The same slowed speed advanceMovement will move it at, so a
      // crippled dummy plans with the step it will really take.
      stepUnits: this.#stepUnits(record, dt),
      check: (skillId, targetId) => {
        const skill = getSkill(skillId);
        return skill === undefined
          ? { ok: false, reason: "skill-not-on-bar" }
          : this.#check(record, skill, targetId);
      },
      isBot: (participantId) =>
        this.#participants.get(participantId)?.behaviour?.kind === "play-build",
      calledTargetId: this.#calledTargets.get(record.combatant.team),
      sees: (point, layer = record.layer) =>
        this.#seesAcross(record.position, record.layer, point, layer),
      seesBetween: (from, to, fromLayer, toLayer) => this.#seesAcross(from, fromLayer, to, toLayer),
      walkable: (point) =>
        isStandable(this.#graphOn(record.layer), point) &&
        walkIsClear(this.#graphOn(record.layer), record.position, point),
      foeCentroid: centroids !== undefined && centroids.foes.count > 0 ? centroids.foes : undefined,
      objectives: this.#botObjectives,
      projectiles: this.#projectiles,
      seed: this.#seed,
    });
    this.setInputDirection(record.id, intent.moveDirection);
    const following = record.followGoal !== undefined;
    record.followGoal =
      intent.moveTo === undefined
        ? undefined
        : {
            point: intent.moveTo,
            layer: intent.moveToLayer ?? this.#leaderLayer(record),
            passing: record.creature?.ownerId,
          };
    if (following && record.followGoal === undefined) {
      record.route = undefined;
    }
    // A move, as a held direction is: it ends the attack and the cast.
    if (record.followGoal !== undefined) {
      this.#moveInterrupts(record);
    }
    this.setTarget(record.id, intent.targetId);
    // Asked only when the attack wanted is not the one going, as a player
    // presses Space once: a pet switches with its owner (#1046). So is
    // the walk to a relic (#2581).
    if (
      intent.attackTargetId !== undefined &&
      record.combatant.attack?.targetId !== intent.attackTargetId &&
      record.interact?.targetId !== intent.attackTargetId
    ) {
      this.requestAttack(record.id, intent.attackTargetId);
    }
    if (intent.useSkillId !== undefined) {
      const slot = resolvedBar(record.skillBar, record.combatant.cast).findIndex(
        (held) => held?.key === intent.useSkillId,
      );
      if (slot !== -1) {
        this.requestSkill(record.id, slot);
      }
    }
    if (intent.endUpkeep !== undefined) {
      this.endUpkeep(record.id, intent.endUpkeep.targetId, intent.endUpkeep.status);
    }
    // As a skill effect applies it: the dummy is the source, so the
    // degeneration it causes is attributed to the dummy, and so is the
    // health a deep wound takes as it lands.
    for (const application of intent.applyStatuses) {
      const aimed = this.#participants.get(application.targetId);
      if (aimed !== undefined && !aimed.combatant.dead) {
        // Infuse Condition (#1915) sends a condition to a minion here too.
        const target = conditionTaker(aimed.combatant, application.statusId, this.#participants);
        const loss = applyStatus(
          target,
          application.statusId,
          scaledStatusDuration(target, application.statusId, application.durationSeconds),
          record.id,
          statusRanks(application.statusId, record.combatant),
        );
        if (loss !== undefined && loss > 0) {
          this.#log.push({
            tick: this.#tick,
            atSeconds: this.#elapsedSeconds,
            cause: "skill",
            sourceId: record.id,
            skillId: undefined,
            weaponId: undefined,
            attributeId: undefined,
            area: undefined,
            doubleStrike: false,
            events: [
              {
                kind: "health-lost",
                targetId: target.id,
                amount: loss,
                statusId: application.statusId,
              },
            ],
          });
        }
      }
    }
  }

  /**
   * How long an attack skill winds up before its blow lands (ADR-0029):
   * half of its activation, or of a swing of the weapon when it states
   * none, after attack-speed effects. Its recovery is as long again.
   */
  #attackHitSeconds(record: ParticipantRecord, skill: Skill): number {
    const base =
      skill.activationSeconds > 0
        ? skill.activationSeconds
        : record.combatant.equipment.mainHand.weapon.attackIntervalSeconds;
    return attackDurationSeconds(record.combatant, base) / 2;
  }

  /**
   * Leadership's energy for a shout or a chant (#625, #758): one for
   * each ally it reached, the shouter included, however many events each got, up to
   * the rank's cap. Pushed onto the shout's own events, so its log entry
   * carries the gain.
   */
  #gainLeadershipEnergy(record: ParticipantRecord, events: CombatEvent[]): void {
    const team = record.combatant.team;
    const affected = new Set(
      events
        .map((event) => event.targetId)
        .filter((id) => this.#participants.get(id)?.combatant.team === team),
    );
    const rank = rankOf(record.combatant, LEADERSHIP_ATTRIBUTE);
    gainEnergy(record.combatant, leadershipEnergy(rank, affected.size), events);
  }

  /** Resolve a cast that has finished its activation time. */
  private resolveCast(record: ParticipantRecord, cast: ActiveCast, dt: number): void {
    const { skillId, targetId } = cast;
    const used = getSkill(skillId);
    if (used === undefined) {
      return;
    }
    // Anthem of Guidance's (#1505): this attack skill's blows, melee or
    // flying, cannot be blocked.
    const skill =
      cast.rule.unblockable && used.attack !== undefined
        ? { ...used, attack: { ...used.attack, unblockable: true } }
        : used;
    // Equinox's (#2321): a spell that caused Overcast as it began causes
    // more as it finishes, the highest surcharge on its caster once.
    if (cast.rule.causedOvercast) {
      addOvercast(
        record.combatant,
        record.combatant.statuses.active.reduce(
          (highest, { id }) => Math.max(highest, getStatusDefinition(id).overcastSurcharge),
          0,
        ),
      );
    }

    const targetRecord = targetId === undefined ? undefined : this.#participants.get(targetId);
    if (
      this.#failsSpell(record, skill, targetRecord, cast.key) ||
      this.#failsTouch(record, skill, targetRecord, cast.key) ||
      this.#failsFloor(record, skill, targetRecord, cast.key) ||
      this.#failsByChance(record, skill, cast.key)
    ) {
      return;
    }
    // Signet of Illusions' (#1929): a finished spell spends a use and
    // scales, where it lands and what it summons, with the lent attribute;
    // a signet under Symbolic Celerity's too (#2446).
    const borrowing = record.combatant.statuses.borrowedFor(skill);
    const lent =
      borrowing === undefined
        ? undefined
        : getStatusDefinition(borrowing).borrowsAttribute?.attributeId;
    // What its start spent still boosts it (#1941): the last glyph spell's.
    // Of Mastery's +1 (#2011), rolled once a use, as the ranks are read.
    const mastered =
      skill.attributeId !== undefined &&
      spellModComesUp(
        record.combatant.equipment.spellMods.attributePlusOne.filter(
          ({ attributeId }) => attributeId === skill.attributeId,
        ),
        skill,
        this.#rng,
      )
        ? skill.attributeId
        : undefined;
    const loan = {
      lent,
      held:
        mastered === undefined
          ? cast.rule.heldAttributeDeltas
          : [...cast.rule.heldAttributeDeltas, { scope: { attributeId: mastered }, amount: 1 }],
    };
    const primary = skill.target === "self" ? record : targetRecord;
    // Glimmering Mark's (#2282): a status that ends when its source uses
    // a skill on its bearer is gone before this one lands. Mind Wrack's
    // (#2290): one that answers it fires then.
    if (primary !== undefined) {
      this.#logEnded(
        record,
        skill,
        primary,
        primary.combatant.statuses.endOnSourceTargets(record.id),
      );
      this.#logFired(
        fireSourceTargetsTriggers(
          primary.combatant,
          record.id,
          { skillId, key: cast.key },
          this.#triggerContext(),
        ),
      );
    }
    const exposed = this.#exposedTo(record);
    const speed = record.combatant.equipment.mainHand.weapon.projectileSpeed;
    const flight = skill.projectile;
    // Only a skill that lands at once can shorten its own recharge (#845):
    // one that flies has started it by the time it lands. Only one can
    // summon (#1052): no attack skill or flying spell does.
    const only = (events: CombatEvent[]): SkillOutcome => ({
      events,
      rechargeFraction: 0,
      rechargeShorterSeconds: 0,
      rechargeLongerSeconds: 0,
      summons: [],
      grounds: [],
      taken: [],
      skipped: undefined,
    });
    // What the caster's statuses add to its hits, each logged apart (#939).
    const riders: FiredTrigger[] = [];
    const resolve =
      flight !== undefined
        ? (resolution: SkillResolution) =>
            only(
              this.#releaseSpell(
                record,
                resolution,
                flight.speed * cast.rule.projectileSpeedMultiplier,
                dt,
                loan,
              ),
            )
        : skill.attack === undefined
          ? (resolution: SkillResolution) => resolveSkillEffects(resolution)
          : speed === undefined
            ? (resolution: SkillResolution) =>
                resolveAttackSkillOutcome(resolution, exposed, riders)
            : (resolution: SkillResolution) =>
                only(this.#releaseSkill(record, resolution, speed, dt));
    const targets = resolveTargets({
      skill,
      caster: record.combatant,
      casterPosition: record.position,
      casterLayer: record.layer,
      primary,
      // Only an area looks past the primary: skip the copy every other
      // cast would make for nothing. A flying spell's area is found
      // where it lands, not here, but a spread's, whose shots it aims (#1914).
      candidates:
        skill.area === undefined || (flight !== undefined && flight.spread !== true)
          ? []
          : [...this.#participants.values()],
      losBlockers: this.#wallsOn(
        skill.area?.origin === "target" && primary !== undefined ? primary.layer : record.layer,
      ),
    });
    // An item spell's ashes take the hands (#1434): a flag, a relic or the
    // ashes held fall first, the ashes' drop effect before the new ones.
    if (skill.type === "item-spell") {
      this.#dropBundle(record);
      this.#dropAshes(record);
    }
    // A corpse skill takes its corpse as it lands, not as it began (#466):
    // one used up during the cast leaves it with no effect, paid for. A
    // well finding none sacrifices instead and goes off where its caster
    // stands (#1730), as though on a corpse there. One that takes every
    // corpse (#1915) goes off where its caster stands, with none or many.
    const every =
      skill.corpse?.all === true ? this.#exploitEveryCorpse(record, skill.corpse) : undefined;
    const corpse =
      skill.corpse === undefined || every !== undefined
        ? undefined
        : this.#exploitCorpse(record, skill.corpse, targetRecord);
    const sacrifice = corpse === undefined ? skill.corpse?.elseSacrificePercent : undefined;
    const site = corpse ?? (sacrifice === undefined && every === undefined ? undefined : record);
    // What it summons is made at the ranks it went off at (#1915), before
    // any status it gives itself, and with what it is lent and holds (#1929, #1941).
    const ranks = withRankLoan(record.combatant, loan, skill, () => ranksOf(record.combatant));
    const {
      events,
      rechargeFraction,
      rechargeShorterSeconds,
      rechargeLongerSeconds,
      summons,
      grounds,
      taken,
      skipped,
    } =
      skill.corpse !== undefined && site === undefined
        ? only([])
        : withRankLoan(record.combatant, loan, skill, () =>
            resolve({
              skill:
                sacrifice === undefined
                  ? skill
                  : {
                      ...skill,
                      effects: [
                        {
                          kind: "sacrifice-health",
                          percentOfMax: resolveMagnitude(sacrifice, record.combatant),
                        },
                        ...skill.effects,
                      ],
                    },
              caster: record.combatant,
              targets,
              rng: this.#rng,
              rules: this.#ruleset.combat,
              surroundings: this.#participants,
              own: cast.rule.own,
              corpseId: corpse?.id,
            }),
          );
    // What the skill put on its own user does not answer this use of it
    // (#999): the chanter's own Song of Restoration waits for its next skill.
    // A copier does not use up an echo already up, either (#469, #1928).
    const spared: ReadonlySet<StatusId> = new Set([
      ...events.flatMap((event) =>
        event.kind === "status-applied" && event.targetId === record.id ? [event.statusId] : [],
      ),
      ...(copiesSkill(skill.id)
        ? record.combatant.statuses.active.map(({ id }) => id).filter(isEchoStatus)
        : []),
    ]);
    // Where an area landed, for whoever draws it: nowhere, when an area
    // centred on a target had no target to centre on, or when it is still
    // flying. A party area (#1013) has no ring to draw.
    const origin = skill.area?.origin === "caster" ? record.position : primary?.position;
    const area =
      skill.area === undefined ||
      skill.area.origin === "party" ||
      origin === undefined ||
      flight !== undefined
        ? undefined
        : { x: origin.x, y: origin.y, radius: skill.area.radius };

    // Only attack skills earn adrenaline, as weapon hits do: a spell is
    // paid for in energy, and earning both would make casters the best
    // adrenaline builders. A blocked blow earns nothing, not even the
    // damage its `onBlocked` deals, as Swift Chop's (#534). Damage on a
    // victim that blocked every blow is all `onBlocked`'s; a dual attack
    // (#885) blocked once and landed once still landed. Each foe it landed
    // on is a strike (#936): Cyclone Axe on three foes earns three. Only
    // a foe the skill swung at counts, not one an effect of it hit: Death
    // Blossom's splash on adjacent foes earns nothing more. One that loses
    // all adrenaline (#1097) earns none back: GW1 takes it after the strike.
    if (skill.type === "attack" && !losesAllAdrenaline(skill)) {
      const strikes = strikeCount(
        skill.attack?.strikes,
        record.combatant,
        primary?.combatant ?? record.combatant,
        this.#participants,
      );
      const swungAt = new Set(targets.map((target) => target.id));
      const blocked = (targetId: string): boolean => {
        const blows = events.filter(
          (event) =>
            (event.kind === "attack-blocked" || event.kind === "attack-missed") &&
            event.targetId === targetId,
        );
        return blows.some(({ kind }) => kind === "attack-blocked") && blows.length >= strikes;
      };
      const landed = events.filter((event) => event.kind !== "damage" || !blocked(event.targetId));
      const foesHit = new Set(
        landed.flatMap((event) => {
          const victim =
            event.kind === "damage" || event.kind === "attack-backfired"
              ? this.#participants.get(event.targetId)
              : undefined;
          return victim !== undefined &&
            swungAt.has(victim.id) &&
            victim.combatant.team !== record.combatant.team
            ? [victim.id]
            : [];
        }),
      );
      this.#gainAdrenaline(record, landed, events, foesHit.size);
    }
    if (skill.type === "shout" || skill.type === "chant") {
      this.#gainLeadershipEnergy(record, events);
    }
    this.#chargeFromDamage(record.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#recordSteps(events);
    this.#recordResurrections(events);
    withRankLoan(record.combatant, loan, skill, () => {
      // A raised minion rises where its corpse lay (#467).
      for (const summon of summons) {
        this.#summon(
          record,
          skill.id,
          summon.creature,
          summon.count + (summon.perExploitedCorpse === true ? (every?.length ?? 0) : 0),
          summon.at === "target"
            ? (primary?.position ?? record.position)
            : (corpse?.position ?? record.position),
          false,
          false,
          ranks,
        );
      }
      for (const ground of grounds) {
        const anchor = this.#groundAnchor(record, ground, site, primary);
        if (anchor !== undefined) {
          this.#placeGroundEffect(record, skill.id, ground, anchor);
        }
      }
    });
    for (const creature of taken) {
      this.#takeControl(record, creature);
    }
    // An attack skill is a swing, so it turns on its target with the
    // weapon: it starts an attack, or switches one to them. Any other skill
    // leaves the attack alone (#317): one in progress resumes on its own
    // target after the cast, and none starts.
    if (
      skill.type === "attack" &&
      primary !== undefined &&
      this.#attackCheck(record, primary.id).ok
    ) {
      record.combatant.attack = { targetId: primary.id, swingElapsed: 0, unreachableSeconds: 0 };
    }
    if (hasAftercast(skill)) {
      record.combatant.cast.beginAftercast(this.#ruleset.combat.aftercastSeconds);
    }
    // An attack skill recovers from its blow for as long as it wound up.
    if (skill.attack !== undefined) {
      record.combatant.cast.beginAftercast(cast.totalSeconds);
    }

    // An off-hand attack out of sequence, or whose chain requirement did
    // not hold, recharges at once (#831, #1041), but for what its failure
    // adds, as Repeating Strike's 15 s (#1757).
    if (
      events.some((event) => event.kind === "attack-missed" && event.reason === "out-of-sequence")
    ) {
      if (rechargeLongerSeconds > 0) {
        beginRecharge(record.combatant.cast, skill, rechargeLongerSeconds, cast.key);
      }
    } else {
      // A spell recharges faster under Mantra of Recovery (#938) or Weapon
      // of Quickening (#975), and a binding ritual under Weapon of
      // Quickening (#1064), read now: one that ends later leaves this
      // recharge as it started. Read after the spell resolved, so Weapon of
      // Quickening cast on yourself already shortens its own. An
      // enchantment of Avatar of Lyssa's profession (#1455) takes the
      // larger of its share and the spells'. Serpent's Quickness's share
      // (#1539) is any skill's: the larger of it and the type's counts.
      // Ghostly Haste's (#2504) holds for a spell finished in earshot of a
      // spirit, read now as the rest are.
      const modifiers = aggregateModifiers(record.combatant.statuses.active);
      const nearSpiritShare =
        modifiers.spellRechargeFasterNearSpirit !== 0 &&
        spiritsWithin(this.#participants.values(), record, AREA_EARSHOT) > 0
          ? modifiers.spellRechargeFasterNearSpirit
          : 0;
      const enchantmentShares = modifiers.enchantmentRechargeFaster
        .filter(({ profession }) => skill.type === "enchantment" && skill.profession === profession)
        .map(({ share }) => share);
      const typeFaster = isSpell(skill.type)
        ? Math.max(modifiers.spellRechargeFaster, nearSpiritShare, ...enchantmentShares)
        : skill.type === "binding-ritual"
          ? modifiers.bindingRitualRechargeFaster
          : 0;
      // A status on the caster's skills of its kind (#1761), as Practiced
      // Stance's preparations, as its use was paid for.
      const faster = Math.max(
        modifiers.skillRechargeFaster,
        typeFaster,
        cast.rule.own.rechargeFaster,
        cast.rule.rechargeFaster,
      );
      // A glyph's hold on the spell (#1730): Renewal's 0 over Sacrifice's 30 more.
      // Of Memory's chance (#2011) halves the whole of it.
      beginRecharge(
        record.combatant.cast,
        skill,
        cast.rule.rechargesInstantly
          ? 0
          : // Energizing Wind's slower share (#1886), once the faster is off.
            // "None Shall Pass!"'s seconds (#2320), never below 0 s.
            (Math.max(
              0,
              reducedRecharge(skill.rechargeSeconds * (1 - rechargeFraction), faster) -
                rechargeShorterSeconds,
            ) *
              (1 + cast.rule.own.rechargeSlower) +
              rechargeLongerSeconds +
              cast.rule.extraRechargeSeconds) *
              (spellModComesUp(
                record.combatant.equipment.spellMods.rechargeHalves,
                skill,
                this.#rng,
              )
                ? 0.5
                : 1),
        cast.key,
      );
      // A form's "disabled for 45 seconds" (#1437), beside its recharge.
      if (skill.disabledAfterUseSeconds !== undefined) {
        record.combatant.cast.disable(cast.key, skill.disabledAfterUseSeconds);
      }
      // Ritual Lord's own recharge, over once its binding ritual is (#1941).
      for (const key of [...record.combatant.cast.rechargeRemaining.keys()]) {
        if (cast.rule.resetsRecharge.includes(skillIdOfKey(key))) {
          record.combatant.cast.endRecharge(key);
        }
      }
    }
    // The use itself leads its entry (#1735), and one that did nothing says
    // why. A cast whose target is gone went off at nothing: no use to tell.
    const usedEvents: CombatEvent[] =
      primary === undefined
        ? []
        : [{ kind: "skill-used", casterId: record.id, skillId: skill.id, targetId: primary.id }];
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: record.id,
      skillId: skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area,
      doubleStrike: false,
      events: [...usedEvents, ...events, ...this.#skippedEvent(record, skill, skipped, ranks)],
    });
    this.#logFired(riders);
    if (borrowing !== undefined) {
      this.#logSpent(record, skill, record.combatant.statuses.spendBorrowed(borrowing));
    }
    // After the skill's own effects, as their own entries (#469): a spell
    // finished is Backfire's moment, an attack skill Empathy's. Any skill
    // used is Spiteful Spirit's (#935), and an attack skill twice over.
    const aimedAt: AimedAt | undefined =
      primary === undefined
        ? undefined
        : { id: primary.id, hadLessHealth: primary !== record && cast.targetHadLessHealth };
    this.#fireTriggers(
      record,
      "bearer-uses-skill",
      spared,
      { skillId: skill.id, key: cast.key },
      aimedAt,
    );
    this.#useNextSkill(record, skill, spared, primary);
    this.#endOnUseSkill(record, skill, spared);
    if (isSpell(skill.type)) {
      // Kinetic Armor's renewal (#1614), and Lyssa's Aura's at a foe
      // (#2132); Aura of Restoration's gain reads the spell's cost.
      record.combatant.statuses.castSpell(
        primary !== undefined && primary.combatant.team !== record.combatant.team,
      );
      this.#fireTriggers(
        record,
        "bearer-casts-spell",
        spared,
        { skillId: skill.id, key: cast.key },
        aimedAt,
      );
    }
    if (skill.attack !== undefined) {
      this.#fireTriggers(record, "bearer-attacks", spared, undefined, aimedAt);
    }
  }

  /**
   * What `record`'s use of `skill` that did nothing says (#1735): why, if
   * an `if` did not hold, its numbers at the `ranks` it went off at.
   */
  #skippedEvent(
    record: ParticipantRecord,
    skill: Skill,
    skipped: SkippedEffect | undefined,
    ranks: ReadonlyMap<string, number>,
  ): CombatEvent[] {
    return skipped === undefined
      ? []
      : [
          {
            kind: "effect-skipped",
            casterId: record.id,
            targetId: skipped.targetId,
            skillId: skill.id,
            requirement: conditionRequirementText(skipped.condition, ranks, EN_WORDS, EN_NAMES),
          },
        ];
  }

  /**
   * Whether a status on `record` fails the spell it just finished on
   * `target` (#1475): Guilt's, on a spell at a foe. The spell is paid for
   * and recharges, as an interrupted one, and does nothing else; the
   * status ends, and its effects land on the bearer from its source,
   * logged as its skill. A foe's spell at a bearer of Shadow Form (#1951)
   * fails so too, the form left on. A spell with no chosen target never
   * fails so.
   */
  #failsSpell(
    record: ParticipantRecord,
    skill: Skill,
    target: ParticipantRecord | undefined,
    key: string,
  ): boolean {
    if (!isSpell(skill.type) || skill.target === "self" || target === undefined) {
      return false;
    }
    const bearer = record.combatant;
    // Sliver Armor's (#2095): a spell at a foe is aimed at it before it can fail.
    if (target.combatant.team !== bearer.team) {
      target.combatant.statuses.recordTargetedByFoe(bearer.id);
    }
    // Shadow Form's (#1951): a foe's spell at its bearer, checked as it finishes.
    const shield =
      target.combatant.team === bearer.team
        ? undefined
        : target.combatant.statuses.active.find(({ id }) => STATUS_DEFINITIONS[id].foeSpellsFail);
    if (shield !== undefined) {
      beginRecharge(bearer.cast, skill, skill.rechargeSeconds, key);
      this.#logFired([
        {
          sourceId: target.id,
          skillId: shield.sourceSkillId ?? skill.id,
          events: [{ kind: "spell-failed", targetId: bearer.id, skillId: skill.id }],
        },
      ]);
      return true;
    }
    const failer = bearer.statuses.spellFailer(
      target.combatant.team === bearer.team ? "ally-targeted" : "foe-targeted",
    );
    const fails = failer === undefined ? undefined : STATUS_DEFINITIONS[failer.id].failsNextSpell;
    if (failer === undefined || fails === undefined) {
      return false;
    }
    beginRecharge(bearer.cast, skill, skill.rechargeSeconds, key);
    bearer.statuses.end(failer.id);
    const events: CombatEvent[] = [
      { kind: "spell-failed", targetId: bearer.id, skillId: skill.id },
    ];
    const source = this.#participants.get(failer.sourceId);
    if (source !== undefined) {
      events.push(
        ...applyEffects(fails.effects, {
          caster: source.combatant,
          target: bearer,
          rng: this.#rng,
          rules: this.#ruleset.combat,
          surroundings: this.#participants,
          usedSkill: undefined,
        }),
      );
    }
    this.#logFired([{ sourceId: failer.sourceId, skillId: fails.skillId, events }]);
    return true;
  }

  /**
   * Whether `record`'s skill fails by its own chance as it finishes
   * (#2189, `Skill.failChanceUnless`): Withdraw Hexes' below Divine Favor
   * 5. It is paid for and recharges, as a failed spell. At the rank or
   * above nothing is rolled.
   */
  #failsByChance(record: ParticipantRecord, skill: Skill, key: string): boolean {
    const fail = skill.failChanceUnless;
    if (
      fail === undefined ||
      rankOf(record.combatant, fail.attributeId) >= fail.rank ||
      this.#rng.nextFloat() >= fail.chance
    ) {
      return false;
    }
    beginRecharge(record.combatant.cast, skill, skill.rechargeSeconds, key);
    this.#logFired([
      {
        sourceId: record.id,
        skillId: skill.id,
        events: [{ kind: "spell-failed", targetId: record.id, skillId: skill.id }],
      },
    ]);
    return true;
  }

  /**
   * Whether a melee attack skill's blow finds its target off the attacker's
   * floors (ADR-0051), the target having left in the wind-up: nothing
   * lands, and it recharges as a failed skill does.
   */
  #failsFloor(
    record: ParticipantRecord,
    skill: Skill,
    target: ParticipantRecord | undefined,
    key: string,
  ): boolean {
    const { weapon } = record.combatant.equipment.mainHand;
    if (
      skill.attack === undefined ||
      target === undefined ||
      blowKind(weapon) !== "melee" ||
      sharesFloor(record.floors, target.floors)
    ) {
      return false;
    }
    beginRecharge(record.combatant.cast, skill, skill.rechargeSeconds, key);
    this.#logWeapon(record.id, weapon.id, [{ kind: "attack-obstructed", targetId: target.id }]);
    return true;
  }

  /**
   * Whether `target`'s status fails `record`'s touch skill on it (#1966):
   * "Can't Touch This!" on a foe. It is paid for and recharges, as a
   * failed spell, and spends one of the status's charges. An ally's
   * touch lands.
   */
  #failsTouch(
    record: ParticipantRecord,
    skill: Skill,
    target: ParticipantRecord | undefined,
    key: string,
  ): boolean {
    if (
      skill.touch !== true ||
      target === undefined ||
      target.combatant.team === record.combatant.team
    ) {
      return false;
    }
    const failer = target.combatant.statuses.touchFailer();
    if (failer === undefined) {
      return false;
    }
    beginRecharge(record.combatant.cast, skill, skill.rechargeSeconds, key);
    target.combatant.statuses.spendTouchFail(failer.id);
    this.#logFired([
      {
        sourceId: target.id,
        skillId: failer.sourceSkillId ?? skill.id,
        events: [{ kind: "spell-failed", targetId: record.id, skillId: skill.id }],
      },
    ]);
    return true;
  }

  /**
   * The bearer did `event` (#469): each status on it that answers fires.
   * `usedSkill` is the skill it used, on `bearer-uses-skill` (#949) and
   * `bearer-casts-spell` (#1614); `aimedAt`, whom it or the attack was
   * aimed at (#2282).
   * A status in `spared` does not answer (#999), as `fireTriggers`.
   */
  #fireTriggers(
    record: ParticipantRecord,
    event: DirectTriggerEvent,
    spared: ReadonlySet<StatusId>,
    usedSkill?: SlotSkill,
    aimedAt?: AimedAt,
  ): readonly FiredTrigger[] {
    // Panic's interrupt (#1501) is untimed, as a pulse's: finding nothing
    // to interrupt is no miss, so it says nothing.
    const fired = fireTriggers(
      record.combatant,
      event,
      aimedAt === undefined
        ? this.#triggerContext(usedSkill)
        : { ...this.#triggerContext(usedSkill), aimedAt },
      spared,
    ).map((each) => ({
      ...each,
      events: each.events.filter((event) => event.kind !== "interrupt-missed"),
    }));
    this.#logFired(fired);
    return fired;
  }

  /**
   * The bearer begins an attack (#1593): what answers fires, and whether
   * it cancelled a plain swing, as Clumsiness does. An attack skill it
   * cancels is interrupted there and then.
   */
  #attackBegins(record: ParticipantRecord): boolean {
    return this.#fireTriggers(record, "bearer-attack-begins", NONE_SPARED).some(({ events }) =>
      events.some((event) => event.kind === "attack-interrupted" && event.targetId === record.id),
    );
  }

  /**
   * After its triggers answered the use (#1483): each status on the
   * bearer that holds its next skill of this kind resolves on the bearer,
   * as its own entry, and one that counted its last ends there, but those
   * in `spared` (#999): Chorus of Restoration never answers its own cast.
   * One `at` the skill's target resolves on `primary` (#2275), and on
   * nothing if it is gone or dead.
   */
  #useNextSkill(
    record: ParticipantRecord,
    skill: Skill,
    spared: ReadonlySet<StatusId>,
    primary: ParticipantRecord | undefined,
  ): void {
    const bearer = record.combatant;
    const { answered, ended } = bearer.statuses.useNextSkill(skill, spared);
    const atTarget =
      primary === undefined || primary.combatant.dead ? undefined : primary.combatant;
    this.#logFired(
      answered.map(({ statusId, next, ranks }) => ({
        sourceId: record.id,
        skillId: next.skillId,
        events: [
          // At its source's ranks as it landed (#2143): an ally's Anthem
          // of Fury gives the Paragon's strikes.
          ...(next.at === "skill-target" && atTarget === undefined
            ? []
            : applyEffects(next.effects, {
                caster: bearer,
                target: next.at === "skill-target" ? atTarget : bearer,
                ranksFrom: outsideMatch(ranks),
                rng: this.#rng,
                rules: this.#ruleset.combat,
                surroundings: this.#participants,
              })),
          ...(ended.includes(statusId)
            ? [{ kind: "status-expired" as const, targetId: record.id, statusId }]
            : []),
        ],
      })),
    );
  }

  /**
   * After its triggers answered the use (#949): every status on the
   * bearer that ends when it uses a skill, as Diversion, or an adrenal
   * one (#1329), is gone, and logged against that skill, but those in
   * `spared` (#999).
   */
  #endOnUseSkill(record: ParticipantRecord, skill: Skill, spared: ReadonlySet<StatusId>): void {
    this.#logEnded(
      record,
      skill,
      record,
      record.combatant.statuses.endOnBearerUseSkill(spared, skill),
    );
  }

  /** The statuses `ended` on `bearer` by `record`'s use of `skill`, logged against it. */
  #logEnded(
    record: ParticipantRecord,
    skill: Skill,
    bearer: ParticipantRecord,
    ended: readonly StatusId[],
  ): void {
    if (ended.length > 0) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: record.id,
        skillId: skill.id,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events: ended.map((statusId) => ({
          kind: "status-expired",
          targetId: bearer.id,
          statusId,
        })),
      });
    }
  }

  #triggerContext(usedSkill?: SlotSkill): TriggerContext {
    return {
      sourceOf: (id) => this.#participants.get(id)?.combatant,
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
      usedSkill,
    };
  }

  /**
   * The one point a tick where statuses that answer a change fire (#887):
   * every participant's recorded changes, in participant order, each in
   * the order it happened. Then whatever the firing itself changed is
   * discarded: a triggered effect never sets off a trigger, so two
   * Contagions never echo, and a condition Contagion hands out sets off
   * nobody's. Hits and physical damage are drained here too (#935), so
   * two Mark of Pain bearers side by side never chain. A status the
   * firing ended still fires its own end (#1789), as Faithful
   * Intervention heals when damage below half ends it, and a bearer the
   * firing killed fires its `bearer-dies` triggers (#1825), as Reaper's
   * Mark pays for a Judge's Intervention kill. Only then do this tick's
   * own deaths fire theirs: what all of those change is discarded in
   * turn, so a death one of them causes, Putrid Bile's burst killing
   * a second bearer, fires nothing.
   */
  #fireStatusChanges(): void {
    const changes = [...this.#participants.values()].map((record) => ({
      record,
      changes: record.combatant.statuses.drainChanges(),
    }));
    for (const { record, changes: recorded } of changes) {
      for (const change of recorded) {
        if (change.kind === "redirected-damage") {
          this.#landRedirected(record, change);
        }
        if (change.kind === "charged-source") {
          this.#landCharge(change.toId, change.statusId, change.amount);
        }
        this.#loseRaisedMaxima(record, change);
        this.#endForm(record, change);
        this.#dieWithStatus(record, change);
        this.#returnSource(change);
        this.#stepToTarget(change);
        this.#endEverywhere(record, change);
      }
    }
    const context = this.#triggerContext();
    for (const { record, changes: recorded } of changes) {
      for (const change of recorded) {
        this.#logFired(fireChangeTriggers(record.combatant, change, this.#spread, context));
      }
    }
    this.#settleTriggered(context, true);
    for (const { record, changes: recorded } of changes) {
      for (const change of recorded) {
        if (change.kind === "ended") {
          this.#logFired(fireDeathTriggers(record.combatant, change, context));
        }
      }
    }
    this.#settleTriggered(context, false);
    // Every drain is done: what was spent this tick has ended everywhere.
    this.#spentStatuses.clear();
  }

  /**
   * What firing triggers changed, drained (#887). A protective spirit still
   * pays for what it did against a triggered effect (#1265): a payment is
   * not a trigger, so it cannot echo. Nor is a broken hex's damage (#1403),
   * owed for a hex a trigger cast. With `ownEnds`, a status that ended
   * fires its own end triggers (#1789), and its `bearer-dies` ones if its
   * bearer died (#1825); nothing else answers. Those fire only once every
   * participant is drained, so what they change is the next pass's,
   * whoever joined first: a death they cause never fires here. Without
   * `ownEnds` it is the last pass (#1837): every participant is drained
   * before any is settled, and what that settling changes, a hex breaker's
   * kill among it, is drained again, every participant before any is
   * landed. Those drains fire nothing, now or next tick, whoever joined
   * first: what the last pass causes never settles (#1825). They land what
   * is owed without being a trigger, redirected damage and spirits'
   * charges, and keep the books (raised maxima, forms, returns). Landing
   * can owe more, drained again, up to `LAST_PASS_LANDINGS` times; a last
   * drain only keeps the books, and what is still owed then is dropped.
   */
  #settleTriggered(context: TriggerContext, ownEnds: boolean): void {
    const settle = (record: ParticipantRecord, changes: readonly StatusChange[]): void => {
      for (const change of changes) {
        if (change.kind === "redirected-damage") {
          this.#landRedirected(record, change);
        }
        if (change.kind === "charged-source") {
          this.#landCharge(change.toId, change.statusId, change.amount);
        }
        if (change.kind === "broke-hex") {
          this.#logFired(breakHex(record.combatant, change, context));
        }
        this.#loseRaisedMaxima(record, change);
        this.#endForm(record, change);
        this.#dieWithStatus(record, change);
        this.#returnSource(change);
        this.#stepToTarget(change);
        this.#endEverywhere(record, change);
        if (ownEnds && change.kind === "ended") {
          this.#logFired(fireEndTriggers(record.combatant, change, context));
          this.#logFired(fireDeathTriggers(record.combatant, change, context));
        }
      }
    };
    const drained = [...this.#participants.values()].map((record) => ({
      record,
      changes: record.combatant.statuses.drainChanges(),
    }));
    for (const { record, changes } of drained) {
      settle(record, changes);
    }
    if (ownEnds) {
      return;
    }
    for (let round = 0; round <= LAST_PASS_LANDINGS; round += 1) {
      const left = [...this.#participants.values()].map((record) => ({
        record,
        changes: record.combatant.statuses.drainChanges(),
      }));
      for (const { record, changes } of left) {
        for (const change of changes) {
          if (round < LAST_PASS_LANDINGS && change.kind === "redirected-damage") {
            this.#landRedirected(record, change);
          }
          if (round < LAST_PASS_LANDINGS && change.kind === "charged-source") {
            this.#landCharge(change.toId, change.statusId, change.amount);
          }
          this.#loseRaisedMaxima(record, change);
          this.#endForm(record, change);
          this.#dieWithStatus(record, change);
          this.#returnSource(change);
          this.#stepToTarget(change);
          this.#endEverywhere(record, change);
        }
      }
    }
  }

  /**
   * A status that kills its bearer as it ends did (#2311), unless its
   * bearer's death ended it: Vengeance's ally dies, as a death, sparing the
   * death penalty if the status does.
   */
  #dieWithStatus(record: ParticipantRecord, change: StatusChange): void {
    const { combatant } = record;
    if (change.kind !== "ended" || change.death || combatant.dead) {
      return;
    }
    const definition = getStatusDefinition(change.id);
    if (!definition.killsBearerOnEnd) {
      return;
    }
    if (definition.noDeathPenalty) {
      this.#sparedDeaths.add(combatant.id);
    }
    combatant.health = 0;
    combatant.dead = true;
    // Unyielding Aura (#2470): the corpse it leaves is spent.
    if (definition.exploitsCorpseOnDeath) {
      record.corpseExploited = true;
    }
    const events: CombatEvent[] = [{ kind: "death", targetId: combatant.id }];
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: change.sourceId,
      skillId: undefined,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * A form ended (#1437), and no form is up after it: GW1's "auto attack
   * and movement will cease and skills will stop activating". The cast is
   * lost as a walk loses it, paid for and not recharging; held movement
   * keys walk again only when the input next changes. A form recast ends
   * itself and is up again: nothing stops.
   */
  #endForm(record: ParticipantRecord, change: StatusChange): void {
    const { statuses } = record.combatant;
    if (
      change.kind !== "ended" ||
      STATUS_DEFINITIONS[change.id].category !== "form" ||
      statuses.countByCategory("form") > 0
    ) {
      return;
    }
    record.inputDirection = ZERO;
    this.cancelAction(record.id);
  }

  /**
   * A status that raised its bearer's maximum ended: Endure Pain's health
   * (#1359), Mighty Was Vorizun's energy (#1464), or an enchantment that
   * Symbiosis counted (#1873). What is above the maximum
   * left is lost, as in GW1; a bearer below it loses nothing, so the end
   * never kills.
   */
  #loseRaisedMaxima(record: ParticipantRecord, change: StatusChange): void {
    if (change.kind !== "ended") {
      return;
    }
    const { maxHealthBonus, maxHealthBonusPerEnchantment, maxEnergyBonus, category } =
      STATUS_DEFINITIONS[change.id];
    const { combatant } = record;
    // Energy Boon's (#2503) health hangs on the energy maximum too.
    if (
      maxHealthBonus !== 0 ||
      maxHealthBonusPerEnchantment !== 0 ||
      maxEnergyBonus !== 0 ||
      category === "enchantment"
    ) {
      combatant.health = Math.min(combatant.health, effectiveMaxHealth(combatant));
    }
    if (maxEnergyBonus !== 0) {
      combatant.energy = Math.max(
        energyFloor(combatant),
        Math.min(combatant.energy, effectiveMaxEnergy(combatant)),
      );
    }
  }

  /**
   * A protective spirit's payment for what its status did (#1265): `toId`
   * loses `amount` health, no armor and from nobody, and may die of it.
   * Dead or gone, it pays nothing; its aura goes the next step.
   */
  #landCharge(toId: string, statusId: StatusId, amount: number): void {
    const source = this.#participants.get(toId);
    if (source === undefined || source.combatant.dead) {
      return;
    }
    const { combatant } = source;
    const lost = Math.min(amount, combatant.health);
    combatant.health -= lost;
    const events: CombatEvent[] = [{ kind: "health-lost", targetId: toId, amount: lost, statusId }];
    if (combatant.health <= 0) {
      combatant.dead = true;
      events.push({ kind: "death", targetId: toId });
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: undefined,
      skillId: undefined,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * Symbiotic Bond's share of a hit on `bearer` (#1108), on `toId`, the
   * bond's caster, or Dark Bond's (#1986) on the bearer's closest living
   * minion now: typeless, unmitigated and from nobody, so it is never
   * redirected again and answers nothing. With its caster dead or gone,
   * or no minion, the bearer takes it back: damage never vanishes.
   */
  #landRedirected(
    bearer: ParticipantRecord,
    { toId, amount, toClosestMinion }: Extract<StatusChange, { kind: "redirected-damage" }>,
  ): void {
    const to = toClosestMinion
      ? closestOwnMinion(bearer.combatant, this.#participants)
      : this.#participants.get(toId)?.combatant;
    const victim = to === undefined || to.dead ? bearer.combatant : to;
    const events: CombatEvent[] = [];
    applyRedirectedDamage(victim, amount, events);
    if (events.length === 0) {
      return;
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: undefined,
      skillId: undefined,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * Contagion (#887): the condition its bearer gained, on each living foe
   * of the bearer within the radius, in participant order, as the
   * trigger's caster's; Fevered Dreams (#2259), on each of the bearer's
   * allies instead, the bearer aside.
   */
  readonly #spread: SpreadGainedCondition = (effect, bearer, gained, caster) => {
    const from = this.#participants.get(bearer.id);
    if (from === undefined || bearer.dead) {
      return [];
    }
    return [...this.#participants.values()]
      .filter(
        (other) =>
          (effect.to === "bearer-foes"
            ? other.combatant.team !== bearer.team
            : other.combatant.team === bearer.team && other.combatant.id !== bearer.id) &&
          !other.combatant.dead &&
          sharesFloor(other.floors, floorOf(from.layer)) &&
          distance(from.position, other.position) <= effect.radius,
      )
      .flatMap((other) =>
        applyEffects(
          [
            {
              kind: "apply-status",
              statusId: gained.id,
              durationSeconds: { flat: gained.durationSeconds },
            },
          ],
          {
            caster,
            target: other.combatant,
            rng: this.#rng,
            rules: this.#ruleset.combat,
            surroundings: this.#participants,
          },
        ),
      );
  };

  /**
   * What triggers did (#469), each logged as its source's skill; whoever
   * it kills dies as usual. Its damage charges the source's adrenaline as
   * any foe's hit does (#827).
   */
  #logFired(fired: readonly FiredTrigger[]): void {
    for (const { sourceId, skillId, events } of fired) {
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId,
        skillId,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events,
      });
      this.#chargeFromDamage(this.#participants.get(sourceId)?.combatant, events);
      // A trigger's step moves the body as a skill's does (#2446): Augury of Death's.
      this.#recordSteps(events);
      this.#recordDeaths(events);
      // Restoration's death burst raises (#2478): no respawn after it.
      this.#recordResurrections(events);
    }
  }

  /**
   * The way from `record` to `goal` round walls, as `find` gives it,
   * but planned again only when it must (#1157): with no route yet, once
   * `goal` is `REPLAN_GOAL_UNITS` from the goal it was planned to, or
   * when the body no longer sees its next waypoint, shoved round a
   * corner. Otherwise the route is kept: waypoints the body already sees
   * past are dropped, and the last becomes `goal` if the way to it is
   * still clear. A gate moving drops every route (#2691), so otherwise
   * only the goal or the body can make one stale. No way there is not kept: the next tick asks again.
   */
  #route(
    record: ParticipantRecord,
    goal: Vec2,
    layer: number,
  ): readonly RouteWaypoint[] | undefined {
    const route = record.route;
    if (route?.layer === layer && distance(goal, route.goal) <= REPLAN_GOAL_UNITS) {
      const { waypoints } = route;
      const graph = this.#graphOn(record.layer);
      const next = waypoints[0];
      if (next !== undefined && walkIsClear(graph, record.position, next)) {
        // A waypoint on another layer stays, however clear the line past it,
        // and so does the one before it, the way onto a ramp, until the body is at it.
        for (
          let after = waypoints[1];
          after !== undefined &&
          (after.layer === record.layer ||
            distance(record.position, waypoints[0] ?? after) <= RAMP_FOOT_REACHED_UNITS) &&
          waypoints[0]?.layer === record.layer &&
          walkIsClear(graph, record.position, after);
          after = waypoints[1]
        ) {
          waypoints.shift();
        }
        const before = waypoints.at(-2) ?? record.position;
        if (walkIsClear(this.#graphOn(layer), before, goal)) {
          const last = waypoints.at(-1);
          if (last?.x !== goal.x || last.y !== goal.y) {
            waypoints[waypoints.length - 1] = { x: goal.x, y: goal.y, layer };
          }
          return waypoints;
        }
      }
    }
    const waypoints = this.#paths.find(record.position, record.layer, goal, layer);
    record.route = waypoints === undefined ? undefined : { goal, layer, waypoints };
    return waypoints;
  }

  /** The graph of paths on `layer`; a body's layer is one the map has. */
  #graphOn(layer: number): NavGraph {
    const graph = this.#graphs[layer];
    if (graph === undefined) {
      throw new Error(`no layer ${String(layer)}`);
    }
    return graph;
  }

  /** The layer a behaviour's walk goes to: its leader's, or the one it is on. */
  #leaderLayer(record: ParticipantRecord): number {
    const ownerId = record.creature?.leaderId ?? record.creature?.ownerId;
    return (
      (ownerId === undefined ? undefined : this.#participants.get(ownerId)?.layer) ?? record.layer
    );
  }

  /** A chase's goal: where `target` stands, or the nearest spot to it a deck has room for. */
  #chaseGoal(position: Vec2, layer: number): Vec2 {
    const graph = this.#graphOn(layer);
    return graph.walkable.length === 0 ? position : nearestStandable(graph, position);
  }

  /**
   * One tick of an approach (ADR-0026): walk until `target` is within
   * `reach` and in sight, round walls (#211), then face it. The only
   * movement the simulation chooses, and never on top of the player's
   * own. Its route follows a target that moves, and a shove, as
   * `#route` keeps it (#1157).
   *
   * `progress` counts how long it has got nowhere; at
   * `unreachableAfterSeconds` (#218) the approach gives up, and the
   * caller ends what it was walking for.
   */
  #approach(
    record: ParticipantRecord,
    target: {
      readonly id: string | undefined;
      readonly position: Vec2;
      readonly layer: number;
      readonly floors: number;
    },
    reach: number,
    melee: boolean,
    progress: { unreachableSeconds: number },
    dt: number,
  ): "arrived" | "walking" | "unreachable" {
    if (
      distanceWithinRange(record.position, target.position, reach) &&
      this.#clearTo(record, target, melee)
    ) {
      faceToward(record, target.position);
      record.route = undefined;
      return "arrived";
    }
    const next = this.#route(
      record,
      this.#chaseGoal(target.position, target.layer),
      target.layer,
    )?.[0];
    if (next === undefined) {
      // No way there, this tick. It has to last before the approach ends
      // (#218); meanwhile, on its own layer, steer straight at the target,
      // which is what usually shoves a squeezed body back out (#211).
      if (this.#stalledFor(progress, dt)) {
        record.route = undefined;
        return "unreachable";
      }
      if (target.layer === record.layer) {
        this.advanceMovement(record, sub(target.position, record.position), dt);
      }
      return "walking";
    }
    // A path that leads nowhere counts as none: an approach that cannot
    // move, boxed in or with a body in a doorway, ends as unreachable
    // too. One held is neither lost nor progress.
    const step = this.#stepToward(record, next, target.id, false, dt);
    if (step === "stalled") {
      if (this.#stalledFor(progress, dt)) {
        record.route = undefined;
        return "unreachable";
      }
      return "walking";
    }
    if (step === "moved") {
      progress.unreachableSeconds = 0;
    }
    return "walking";
  }

  /** Another `dt` of an approach getting nowhere; whether it has now lasted too long (#218). */
  #stalledFor(progress: { unreachableSeconds: number }, dt: number): boolean {
    progress.unreachableSeconds += dt;
    return (
      progress.unreachableSeconds >= this.#ruleset.combat.unreachableAfterSeconds - SWING_EPSILON
    );
  }

  /**
   * One tick's walk toward `next`, a path's next waypoint round walls
   * (#211), bent round any living body in the way but `self` and
   * `passing` (#277). The approach passes its target, since reaching it
   * is the point. With `land`, `next` is the goal, and a step longer than
   * what is left ends on it rather than past it.
   *
   * A step that covers less than `STALL_FRACTION` of what it was asked
   * made no progress: boxed in, or pressed into a wall. One asked to walk
   * nowhere is `held`, which is neither: nothing in the game does that
   * today (the speed multiplier floors at 0.25), but a ruleset or a
   * future status that zeroes speed would.
   */
  #stepToward(
    record: ParticipantRecord,
    next: Vec2,
    passing: string | undefined,
    land: boolean,
    dt: number,
  ): PathStep {
    this.#bodies.length = 0;
    for (const [otherId, other] of this.#participants) {
      // An own-team spirit is walked through, so it is not steered round (#1295).
      if (
        otherId !== record.id &&
        otherId !== passing &&
        other.layer === record.layer &&
        !other.combatant.dead &&
        !this.#walksThrough(record, other)
      ) {
        this.#bodies.push(other.position);
      }
    }
    const radius = this.#radiusOf(record);
    const before = record.position;
    const left = distance(before, next);
    const full = this.#stepUnits(record, dt);
    // The same speed for less of the tick: on the goal, never past it.
    const asked = land ? Math.min(full, left) : full;
    const seconds = asked < full ? (dt * asked) / full : dt;
    this.advanceMovement(record, steerAround(before, next, radius, this.#bodies), seconds);
    if (!(asked > 0)) {
      return "held";
    }
    return distance(before, record.position) < STALL_FRACTION * asked ? "stalled" : "moved";
  }

  /** How far `record` walks in `dt` at its speed now, slowed or not. */
  #stepUnits(record: ParticipantRecord, dt: number): number {
    return this.#ruleset.movement.maxSpeedUnitsPerSecond * this.#speedOf(record) * dt;
  }

  /**
   * `record`'s speed multiplier: its statuses', and a flag or relic
   * carrier's burden (#1225, #1374) with them, clamped together as
   * statuses are.
   */
  #speedOf(record: ParticipantRecord): number {
    const statuses = aggregateModifiers(record.combatant.statuses.active).moveSpeedMultiplier;
    const burden = this.#carriesFlagOrRelic(record.id) ? FLAG_CARRIER_SPEED_MULTIPLIER : 1;
    return clampMoveSpeed(statuses / burden);
  }

  /**
   * The click-to-walk step (#310): along the path to the goal, until
   * within `ARRIVE_UNITS` of it. A walk whose way there has got no
   * shorter for as long as an approach may get nowhere
   * (`unreachableAfterSeconds`, #218) ends where it is, without a word:
   * the player sees the hero stop.
   *
   * Progress is the way left, not the step taken: a body in a doorway
   * leaves a walker sliding to and fro along the wall, a full step every
   * tick and no nearer. The approach cannot judge it so, since its
   * target moves. And unlike an attack, a walk that cannot move at all
   * is not held: there is nothing for it to resume.
   */
  #advanceWalk(record: ParticipantRecord, dt: number): void {
    if (record.walkGoal !== undefined && !record.walkSettled) {
      const layer = record.walkLayer ?? record.layer;
      const spot = nearestStandable(this.#graphOn(layer), record.walkGoal);
      const path = this.#paths.find(record.position, record.layer, spot, layer);
      record.walkGoal = path === undefined ? undefined : spot;
      record.walkLayer = layer;
      record.route = path === undefined ? undefined : { goal: spot, layer, waypoints: path };
      record.walkSettled = true;
    }
    const goal = record.walkGoal;
    if (goal === undefined) {
      return;
    }
    if (distance(record.position, goal) <= ARRIVE_UNITS) {
      record.walkGoal = undefined;
      record.route = undefined;
      return;
    }
    const layer = record.walkLayer ?? record.layer;
    const path = this.#route(record, goal, layer);
    const left = path === undefined ? Number.POSITIVE_INFINITY : pathLength(record.position, path);
    if (left < record.walkLeast - STALL_FRACTION * this.#stepUnits(record, dt)) {
      record.walkLeast = left;
      record.walkStalledSeconds = 0;
    } else {
      record.walkStalledSeconds += dt;
      if (
        record.walkStalledSeconds >=
        this.#ruleset.combat.unreachableAfterSeconds - SWING_EPSILON
      ) {
        record.walkGoal = undefined;
        record.route = undefined;
        return;
      }
    }
    const next = path?.[0];
    if (next === undefined) {
      // As the approach does: straight at it usually shoves a squeezed
      // body back out (#211). Only on its own layer.
      if (layer === record.layer) {
        this.advanceMovement(record, sub(goal, record.position), dt);
      }
    } else {
      this.#stepToward(record, next, undefined, path?.length === 1, dt);
    }
    if (distance(record.position, goal) <= ARRIVE_UNITS) {
      record.walkGoal = undefined;
      record.route = undefined;
    }
  }

  /**
   * A behaviour's walk to a point (#1153): a path's next step, as
   * click-to-walk takes it, bent round bodies but `passing`'s. With no
   * way there it stands still, and asks again next tick; but a body
   * squeezed where it cannot stand steers straight at the point, which
   * is what shoves it back out (#211). No stall rule: the behaviour
   * re-decides every tick.
   */
  #advanceFollow(record: ParticipantRecord, dt: number): void {
    const goal = record.followGoal;
    if (goal === undefined || record.combatant.attack !== undefined) {
      return;
    }
    const path = this.#route(
      record,
      nearestStandable(this.#graphOn(goal.layer), goal.point),
      goal.layer,
    );
    const next = path?.[0];
    if (next !== undefined) {
      this.#stepToward(record, next, goal.passing, path?.length === 1, dt);
    } else if (
      goal.layer === record.layer &&
      !isStandable(this.#graphOn(record.layer), record.position)
    ) {
      this.advanceMovement(record, sub(goal.point, record.position), dt);
    }
  }

  /**
   * The step of a skill walking in (#415, #499): drop it once its target
   * is no longer one it could be used on, or on a move; wait out a cast
   * and an aftercast; walk to the skill's own range, not the weapon's
   * (Barrage stops short of a longbow's); then use it as if pressed now,
   * checked all over again. Refused there (Energy Burn took the energy on
   * the way), it is dropped without a word, and a running attack resumes.
   *
   * A walk that gets nowhere for `unreachableAfterSeconds` drops it and
   * says so; an attack skill's ends its attack too, as Space's would.
   */
  #advancePendingSkill(record: ParticipantRecord, dt: number): void {
    const pending = record.pendingSkill;
    if (pending === undefined) {
      return;
    }
    const used = slotSkill(record.skillBar, record.combatant.cast, pending.slot);
    const skill = used === undefined ? undefined : getSkill(used.skillId);
    const target = this.#participants.get(pending.targetId);
    const moving =
      record.inputDirection.x !== 0 ||
      record.inputDirection.y !== 0 ||
      record.walkGoal !== undefined;
    if (used === undefined || skill === undefined || target === undefined || moving) {
      record.pendingSkill = undefined;
      return;
    }
    const check = this.#check(record, skill, target.id, used.key);
    if (!check.ok && TARGET_REJECTIONS.has(check.reason)) {
      record.pendingSkill = undefined;
      return;
    }
    if (record.combatant.cast.isCasting || record.combatant.cast.inAftercast) {
      return;
    }

    const approach = this.#approach(
      record,
      target,
      this.#skillReach(record, skill, target),
      skill.attack !== undefined &&
        blowKind(record.combatant.equipment.mainHand.weapon) === "melee",
      pending,
      dt,
    );
    if (approach === "unreachable") {
      record.pendingSkill = undefined;
      const unreachable: CombatEvent = { kind: "attack-unreachable", targetId: target.id };
      if (skill.attack === undefined) {
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "skill",
          sourceId: record.id,
          skillId: skill.id,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: [unreachable],
        });
      } else {
        record.combatant.attack = undefined;
        this.#logWeapon(record.id, record.combatant.equipment.mainHand.weapon.id, [unreachable]);
      }
      return;
    }
    if (approach === "arrived") {
      record.pendingSkill = undefined;
      const arrived = this.#check(record, skill, target.id, used.key);
      this.#useSkill(record, pending.slot, skill, used.key, target.id, arrived);
    }
  }

  /**
   * The walk to a flag, the stand (#1225) or a relic (#1374): paused
   * while casting, through the aftercast and while a skill walks in, as
   * an attack is. On reaching it, the step's flags or relics take it up
   * (`#advanceFlags`, `#advanceRelics`). One picked up or planted by
   * someone else meanwhile, or no way there, ends it.
   */
  #advanceInteract(record: ParticipantRecord, dt: number): void {
    const interact = record.interact;
    if (interact === undefined) {
      return;
    }
    const point = this.#interactPoint(interact.targetId);
    if (point === undefined) {
      record.interact = undefined;
      return;
    }
    if (
      record.combatant.cast.isCasting ||
      record.combatant.cast.inAftercast ||
      record.pendingSkill !== undefined
    ) {
      return;
    }
    // A ghost is a body: walked past, as an attack's target is.
    const ghost = isGhostId(interact.targetId) ? interact.targetId : undefined;
    // Reached as a blow is: on its layer, or in a ramp to it (ADR-0051).
    const approach = this.#approach(
      record,
      { id: ghost, ...point },
      FLAG_REACH_UNITS,
      true,
      interact,
      dt,
    );
    if (approach === "walking") {
      return;
    }
    record.interact = undefined;
    if (approach === "arrived" && ghost !== undefined) {
      this.#toggleGhost(record, ghost);
    } else if (approach === "arrived" && switchIdOf(interact.targetId) !== undefined) {
      this.#switchArrivals.push({
        kind: "interact",
        playerId: record.id,
        team: record.combatant.team,
        targetId: interact.targetId,
      });
    } else if (approach === "arrived") {
      // One bundle at a time: the ashes fall before a flag or relic is taken (#1434).
      this.#dropAshes(record);
      const arrivals =
        relicTeamOf(interact.targetId) === undefined ? this.#flagArrivals : this.#relicArrivals;
      arrivals.push({
        kind: "interact",
        playerId: record.id,
        team: record.combatant.team,
        targetId: interact.targetId,
      });
    }
  }

  /**
   * Why `record` may not walk to `targetId`, a flag, the stand or a
   * relic, now; `"no-target"` on a map without them.
   */
  #interactRefusal(record: ParticipantRecord, targetId: string): ActivationRejection | undefined {
    const { id, combatant } = record;
    if (isGhostId(targetId)) {
      return this.#participants.get(targetId)?.combatant.dead === false
        ? undefined
        : "invalid-target-dead";
    }
    if (switchIdOf(targetId) !== undefined) {
      return this.#switchOf(targetId) === undefined ? "no-target" : undefined;
    }
    if (relicTeamOf(targetId) !== undefined) {
      return this.#relicField === undefined || this.#relicsState === undefined
        ? "no-target"
        : relicRefusal(this.#relicField, this.#relicsState, id, combatant.team, targetId);
    }
    return this.#flagField === undefined || this.#flagsState === undefined
      ? "no-target"
      : flagRefusal(this.#flagField, this.#flagsState, id, combatant.team, targetId);
  }

  /** Where the walk to `targetId`, a flag, the stand or a relic, ends, and on which floors; `undefined` for nowhere. */
  #interactPoint(
    targetId: string,
  ): { readonly position: Vec2; readonly layer: number; readonly floors: number } | undefined {
    if (isGhostId(targetId)) {
      const ghost = this.#participants.get(targetId);
      return ghost === undefined || ghost.combatant.dead
        ? undefined
        : { position: ghost.position, layer: ghost.layer, floors: ghost.floors };
    }
    if (switchIdOf(targetId) !== undefined) {
      const lever = this.#switchOf(targetId);
      return lever === undefined
        ? undefined
        : { position: lever.position, layer: lever.layer, floors: floorOf(lever.layer) };
    }
    let point: CarriedPoint | undefined;
    if (relicTeamOf(targetId) !== undefined) {
      point =
        this.#relicField === undefined
          ? undefined
          : relicTargetPoint(this.#relicField, this.relics, targetId);
    } else if (this.#flagField !== undefined) {
      point = flagTargetPoint(this.#flagField, this.flags, targetId);
    }
    return point === undefined ? undefined : { ...point, floors: floorOf(point.layer) };
  }

  /** The drops of every bundle carrier `objects` has who died this step, where they lie. */
  #deathDrops(objects: readonly (FlagState | RelicState)[]): CarriedDrop[] {
    return fallenDrops(objects, (carrierId) => {
      const carrier = this.#participants.get(carrierId);
      return carrier?.combatant.dead === true
        ? { position: carrier.position, layer: carrier.layer }
        : undefined;
    });
  }

  /** The switch `targetId` names (#3025), or `undefined` if the map has none by that id. */
  #switchOf(targetId: string): Switch | undefined {
    const id = switchIdOf(targetId);
    return id === undefined ? undefined : this.#switches.find((lever) => lever.id === id);
  }

  /**
   * The step's switch flips (#3025), in arrival order, of those still
   * alive: each flips its lever, which toggles its gates. Returns how many
   * times each gate was toggled, by index.
   */
  #flipSwitches(): Map<number, number> {
    const arrivals = this.#livingArrivals(this.#switchArrivals);
    this.#switchArrivals = [];
    const toggles = new Map<number, number>();
    for (const arrival of arrivals) {
      const at = this.#switches.findIndex((lever) => lever.id === switchIdOf(arrival.targetId));
      const lever = this.#switches[at];
      if (lever === undefined) {
        continue;
      }
      const next = flipSwitch(lever);
      this.#switches[at] = next;
      for (const target of next.targets) {
        toggles.set(target, (toggles.get(target) ?? 0) + 1);
      }
    }
    return toggles;
  }

  /** The arrivals of those still alive: one who arrived and was killed later in the step takes nothing. */
  #livingArrivals(arrivals: readonly CarriedArrival[]): CarriedArrival[] {
    return arrivals.filter(
      (arrival) => this.#participants.get(arrival.playerId)?.combatant.dead === false,
    );
  }

  /**
   * The step's relics (#1374), once every death is in and before the
   * match end is checked, so a point on the last tick counts: first every
   * carrier on the altar scores, then a dead carrier's relic falls where
   * they lie, then whoever arrived takes up or returns one, in order.
   * Scores come before the drops, so a carrier who reaches the altar and
   * dies in the same tick still scores.
   */
  #advanceRelics(): void {
    const arrivals = this.#relicArrivals;
    this.#relicArrivals = [];
    const field = this.#relicField;
    const state = this.#relicsState;
    if (field === undefined || state === undefined || this.phase !== "active") {
      return;
    }
    const scores = state.relics.flatMap(({ place }) => {
      const carrier =
        place.kind === "carried" ? this.#participants.get(place.carrierId) : undefined;
      return carrier !== undefined && this.#atRelicTarget(field, carrier)
        ? [{ kind: "score" as const, carrierId: carrier.id, team: carrier.combatant.team }]
        : [];
    });
    const { state: next, scored } = stepRelics(field, state, [
      ...scores,
      ...this.#deathDrops(state.relics),
      ...this.#livingArrivals(arrivals),
    ]);
    this.#relicsState = next;
    if (next !== state) {
      this.#refreshBotObjectives();
    }
    for (const team of scored) {
      this.#score = addPoint(this.#score, team);
      this.#recentScoringTeams = withLatestTeam(this.#recentScoringTeams, team);
    }
  }

  /** Whether `carrier` is where its relic scores: the altar, or within its reach of its own living ghost (#2695). */
  #atRelicTarget(field: RelicField, carrier: ParticipantRecord): boolean {
    if (field.relicTarget === "altar") {
      return onAltar(field, carrier);
    }
    const ghost = this.#participants.get(ghostId(carrier.combatant.team));
    return (
      ghost !== undefined &&
      !ghost.combatant.dead &&
      sharesFloor(ghost.floors, carrier.floors) &&
      distance(ghost.position, carrier.position) <= ALTAR_REACH_UNITS
    );
  }

  /** Whether `targetId` is `record`'s own team's Ghostly Hero (#1377): Space on it is no attack. */
  #isAllyGhost(record: ParticipantRecord, targetId: string): boolean {
    return (
      isGhostId(targetId) &&
      this.#participants.get(targetId)?.combatant.team === record.combatant.team
    );
  }

  /**
   * Space on your Ghostly Hero, reached (#1377): one following you stays
   * where it stands; any other follows you, its last leader's or staying.
   */
  #toggleGhost(record: ParticipantRecord, ghostId: string): void {
    const ghost = this.#participants.get(ghostId);
    const field = this.#ghostField;
    // Where relics are carried to it, it keeps its post (#2695): no leading it to the foe's.
    if (
      ghost === undefined ||
      ghost.combatant.dead ||
      field === undefined ||
      this.#relicField?.relicTarget === "own-ghost"
    ) {
      return;
    }
    if (ghost.creature?.leaderId === record.id) {
      this.#stay(ghost, ghost.position);
    } else {
      ghost.behaviour = followBehaviour(field.altar, field.altarLayer ?? 0);
      ghost.cursor = createCursor();
      if (ghost.creature !== undefined) {
        ghost.creature.leaderId = record.id;
      }
    }
  }

  /** A Ghostly Hero stays at `post`, following nobody (#1377). */
  #stay(ghost: ParticipantRecord, post: Vec2): void {
    ghost.behaviour = stayBehaviour(post);
    ghost.cursor = createCursor();
    if (ghost.creature !== undefined) {
      ghost.creature.leaderId = undefined;
    }
  }

  /**
   * A Ghostly Hero whose leader died or left stays where it stands
   * (#1377), before anyone acts this step.
   */
  #steadyGhosts(): void {
    for (const spawn of this.#ghostField?.spawns ?? []) {
      const ghost = this.#participants.get(ghostId(spawn.team));
      const leaderId = ghost?.creature?.leaderId;
      if (ghost === undefined || leaderId === undefined) {
        continue;
      }
      const leader = this.#participants.get(leaderId);
      if (leader === undefined || leader.combatant.dead || this.#leaving.has(leader.id)) {
        this.#stay(ghost, ghost.position);
      }
    }
  }

  /**
   * Whether `record`, a Ghostly Hero, may claim the altar now (#1377):
   * alive, within reach of it, and its team not the holder, with nobody
   * holding it or the holder's ghost dead.
   */
  #mayClaim(record: ParticipantRecord): boolean {
    const field = this.#ghostField;
    const altar = field?.altar;
    if (
      altar === undefined ||
      record.combatant.dead ||
      !onHill(altar, field?.altarLayer ?? 0, record)
    ) {
      return false;
    }
    const { holder } = this.#altarState;
    const holderGhost = holder === null ? undefined : this.#participants.get(ghostId(holder));
    return mayClaim(
      this.#altarState,
      record.combatant.team,
      holderGhost !== undefined && !holderGhost.combatant.dead,
    );
  }

  /**
   * A Ghostly Hero's claim (#1377): one under way that the rule no longer
   * allows, off the altar's reach or with the holder's ghost risen, stops;
   * one it allows begins, through the cast path as any skill, so an
   * interrupt or a knockdown cuts it short as it would a spell. While it
   * lasts the ghost stands still and fights nobody. Whether it is
   * claiming, so its behaviour waits.
   */
  #claim(record: ParticipantRecord): boolean {
    if (record.creature?.kind !== "ghostly-hero") {
      return false;
    }
    const cast = record.combatant.cast;
    const allowed = this.#mayClaim(record);
    if (cast.activeCast?.skillId === CLAIM_SKILL_ID) {
      if (!allowed) {
        this.#cancelCast(record);
      }
      return allowed;
    }
    if (!allowed || cast.isCasting || cast.inAftercast) {
      return false;
    }
    this.setInputDirection(record.id, ZERO);
    record.followGoal = undefined;
    record.route = undefined;
    record.combatant.attack = undefined;
    const request = this.requestSkill(record.id, record.skillBar.indexOf(CLAIM_SKILL_ID));
    return request?.check.ok === true;
  }

  /**
   * The step's altar (#1377), once every death is in and before the match
   * end is checked, so a point on the last tick counts: a claim finished
   * by one team alone takes it, and its clock starts at 0; otherwise its
   * holder counts the step, and scores at every `POINT_TICK_SECONDS`.
   */
  #advanceAltar(dt: number): void {
    const claims = this.#claims;
    this.#claims = [];
    if (this.#ghostField?.altar === undefined || this.phase !== "active") {
      return;
    }
    const { state, scored } = stepAltar(this.#altarState, dt, claimant(claims));
    const taken = state.holder !== this.#altarState.holder;
    this.#altarState = state;
    if (taken) {
      this.#refreshBotObjectives();
    }
    if (
      scored !== null &&
      (this.#score.byTeam.get(scored) ?? 0) < (this.#matchRules?.pointCap ?? Infinity)
    ) {
      this.#score = addPoint(this.#score, scored);
      this.#recentScoringTeams = withLatestTeam(this.#recentScoringTeams, scored);
    }
  }

  /**
   * The shrines (#2580), relics (#2581) or altar holder (#2582) bots
   * read, only in their mode: one allocation per change to them.
   */
  #refreshBotObjectives(): void {
    const victory = this.#matchRules?.victory;
    if (victory === "capture-points") {
      this.#botObjectives = { ...NO_OBJECTIVES, capturePoints: this.#capturePoints };
    } else if (victory === "relic-run" && this.#relicField !== undefined) {
      this.#botObjectives = {
        ...NO_OBJECTIVES,
        relics: this.relics,
        relicSpawns: this.#relicField.spawns,
        relicCarry: this.#relicField.relicCarry,
        altar: this.#relicField.altar,
        altarLayer: this.#relicField.altarLayer ?? 0,
      };
    } else if (victory === "king-of-the-hill" && this.#ghostField !== undefined) {
      this.#botObjectives = {
        ...NO_OBJECTIVES,
        altar: this.#ghostField.altar,
        altarLayer: this.#ghostField.altarLayer ?? 0,
        altarHolder: this.#altarState.holder,
      };
    } else {
      this.#botObjectives = NO_OBJECTIVES;
    }
    if (this.#gates.length > 0) {
      this.#botObjectives = { ...this.#botObjectives, gates: this.#gates };
    }
    if (this.#harmfulZones.length > 0) {
      this.#botObjectives = { ...this.#botObjectives, harmfulZones: this.#harmfulZonesNow() };
    }
  }

  /** Each layer's walls with the gates as they stand now; `[]` on a map of one layer. */
  #wallsByLayer(): readonly (readonly Segment[])[] {
    return (this.#layers?.walls ?? []).map((walls, layer) => [
      ...walls,
      ...this.#gates
        .filter((gate) => !gate.open && (gate.layer ?? this.#ground) === layer)
        .flatMap((gate) => gate.segments),
    ]);
  }

  /** Each layer's walls, its deep water (#2983) and its ramp rims (#2975), indexed by layer. */
  #blockersByLayer(): readonly (readonly Segment[])[] {
    return this.#layerWalls.map((walls, layer) => [
      ...walls,
      ...(this.#layers?.deepWater[layer] ?? []),
      ...(this.#rampRims[layer] ?? []),
    ]);
  }

  /** The walls on `layer`: what stops sight and shots there. */
  #wallsOn(layer: number): readonly Segment[] {
    return this.#layerWalls[layer] ?? this.#walls;
  }

  /** What a body on `layer` collides with: its walls, deep water (#2983) and ramp rims (#2975). */
  #blockersOn(layer: number): readonly Segment[] {
    return this.#layerBlockers[layer] ?? this.#walls;
  }

  /** The floors a body at `position` on `layer` stands on (ADR-0051). */
  #floorsFor(position: Vec2, layer: number): number {
    return this.#layers === undefined ? 1 : floorsAt(position, layer, this.#layers.transitions);
  }

  #refreshFloors(record: ParticipantRecord): void {
    record.floors = this.#floorsFor(record.position, record.layer);
  }

  /** Whether a deck stands between `from` and `target` (ADR-0051's footprint rule). */
  #deckBlocks(from: ParticipantRecord, target: ParticipantRecord): boolean {
    return deckBlocksSight(
      this.#layers?.decks ?? NO_DECKS,
      from.position,
      from.layer,
      target.position,
      target.layer,
    );
  }

  /** ADR-0051's sight: the shooter's layer's walls and the footprint rule. */
  #seesAcross(from: Vec2, fromLayer: number, to: Vec2, toLayer: number): boolean {
    return (
      hasLineOfSight(from, to, this.#wallsOn(fromLayer)) &&
      !deckBlocksSight(this.#layers?.decks ?? NO_DECKS, from, fromLayer, to, toLayer)
    );
  }

  /**
   * Whether an attack from `record` gets to `target` (ADR-0051): a blow
   * needs a shared floor and the attacker's walls clear, and no deck
   * footprint comes into it; a shot is `#seesAcross`.
   */
  #clearTo(
    record: ParticipantRecord,
    target: Pick<ParticipantRecord, "position" | "layer" | "floors">,
    melee: boolean,
  ): boolean {
    return melee
      ? sharesFloor(record.floors, target.floors) &&
          hasLineOfSight(record.position, target.position, this.#wallsOn(record.layer))
      : this.#seesAcross(record.position, record.layer, target.position, target.layer);
  }

  /** `range` as a bow or spear in `record`'s hands has it at `target`; other weapons keep it. */
  #heightReach(record: ParticipantRecord, target: ParticipantRecord, range: number): number {
    return feelsHeight(record.combatant.equipment.mainHand.weapon.id)
      ? heightRange(range, heightStep(record.floors, record.layer, target.floors, target.layer))
      : range;
  }

  /** The range a skill reaches `target` from: an attack skill's fires the weapon, so it feels height. */
  #skillReach(record: ParticipantRecord, skill: Skill, target: ParticipantRecord): number {
    return skill.attack === undefined
      ? skill.range
      : this.#heightReach(record, target, skill.range);
  }

  #isLayer(layer: number): boolean {
    return Number.isInteger(layer) && layer >= 0 && layer < (this.#layers?.count ?? 1);
  }

  /** Whether `point` is a place to stand on `layer`: the ground is everywhere but its pits. */
  #isOnLayer(point: Vec2, layer: number): boolean {
    if (!this.#isLayer(layer)) {
      return false;
    }
    if (layer === this.#ground) {
      return this.#pitAt(point) === undefined;
    }
    return (this.#walkable[layer] ?? []).some((area) => pointInPolygon(point, area));
  }

  /** The pit `point` is in, off any ramp down into it (#2973). */
  #pitAt(point: Vec2): Polygon | undefined {
    const layers = this.#layers;
    if (layers === undefined || layers.pits.length === 0) {
      return undefined;
    }
    const pit = layers.pits.find((each) => pointInPolygon(point, each));
    const onRamp = layers.transitions.some(
      (ramp) => ramp.to === this.#ground && pointInPolygon(point, ramp.area),
    );
    return onRamp ? undefined : pit;
  }

  /**
   * `position`, or the nearest point `layer` can be stood on (ADR-0051), so
   * a walk, a step or a teleport stops at a deck's edge.
   */
  #clampToLayer(position: Vec2, layer: number): Vec2 {
    if (layer === this.#ground) {
      const pit = this.#pitAt(position);
      return pit === undefined ? position : closestPointOnPolygon(position, pit);
    }
    if (this.#isOnLayer(position, layer)) {
      return position;
    }
    let nearest = position;
    let least = Number.POSITIVE_INFINITY;
    for (const area of this.#walkable[layer] ?? []) {
      const point = closestPointOnPolygon(position, area);
      const away = distance(position, point);
      if (away < least) {
        least = away;
        nearest = point;
      }
    }
    return nearest;
  }

  /**
   * A body inside a ramp that walked towards its other layer is on it
   * from this tick (ADR-0051): with a route, only if its next waypoint
   * is this ramp's, on that layer; steered, uphill or downhill as
   * `direction` points. Only near the far end (#2972): a ramp's top
   * overlaps its deck, so a body turned to the ground there would walk
   * off under it.
   */
  #climb(record: ParticipantRecord, direction: Vec2): void {
    const transitions = this.#layers?.transitions ?? NO_TRANSITIONS;
    const steered = record.inputDirection.x !== 0 || record.inputDirection.y !== 0;
    const next = steered ? undefined : record.route?.waypoints[0];
    for (const transition of transitions) {
      if (
        (record.layer !== transition.from && record.layer !== transition.to) ||
        !pointInPolygon(record.position, transition.area)
      ) {
        continue;
      }
      const upward = record.layer === transition.from;
      const { uphill } = transition;
      const wants =
        next === undefined
          ? (direction.x * uphill.x + direction.y * uphill.y) * (upward ? 1 : -1) > 0
          : next.layer === (upward ? transition.to : transition.from) &&
            pointInPolygon(next, transition.area);
      const t = progressAlong(transition.area, uphill, record.position);
      const nearFarEnd = upward ? t >= RAMP_CLIMBS_FROM : t <= RAMP_DESCENDS_FROM;
      if (wants && nearFarEnd) {
        record.layer = upward ? transition.to : transition.from;
        this.#refreshFloors(record);
        return;
      }
    }
  }

  /** The walls and paths for how the gates stand now, read off the graph built up front. */
  #currentWallSet(): WallSet {
    let closed = 0;
    this.#gates.forEach((gate, at) => {
      closed |= gate.open ? 0 : 1 << at;
    });
    let set = this.#wallSets.get(closed);
    if (set === undefined) {
      const graphs = this.#gatedGraphs.map((gated) => navGraphFor(gated, closed));
      const paths = createLayeredPathFinder(graphs, this.#layers?.transitions ?? []);
      const walls = [
        ...this.#mapWalls,
        ...this.#gates.flatMap((gate) => (gate.open ? [] : gate.segments)),
      ];
      set = { walls, graphs, paths };
      this.#wallSets.set(closed, set);
    }
    return set;
  }

  /**
   * The step's gates (#2691), once every death is in, so a player killed
   * this tick holds no plate and flips no switch (#3025). One that closes
   * stops the shots crossing it and moves anybody in its way to the
   * nearest ground clear of it.
   */
  #advanceGates(dt: number): void {
    if (this.#gates.length === 0 || this.phase !== "active") {
      this.#switchArrivals = [];
      return;
    }
    const toggles = this.#flipSwitches();
    let moved = false;
    const closing: Gate[] = [];
    for (const [at, gate] of this.#gates.entries()) {
      const held = [...this.#participants.values()].some(
        (record) =>
          countsForTeam(record) &&
          !record.combatant.dead &&
          holdsPlate(gate, record.combatant.team, record.position),
      );
      // Two levers flipped in one step on the same gate leave it as it was.
      const flipped = (toggles.get(at) ?? 0) % 2 === 1;
      const next = stepGate(gate, held, flipped, dt);
      this.#gates[at] = next;
      if (next.open !== gate.open) {
        moved = true;
        if (!next.open) {
          closing.push(next);
        }
      }
    }
    if (!moved) {
      return;
    }
    const set = this.#currentWallSet();
    this.#walls = set.walls;
    this.#layerWalls = this.#wallsByLayer();
    this.#layerBlockers = this.#blockersByLayer();
    this.#graphs = set.graphs;
    this.#paths = set.paths;
    for (const record of this.#participants.values()) {
      record.route = undefined;
      const graph = this.#graphOn(record.layer);
      if (
        closing.some((gate) => (gate.layer ?? this.#ground) === record.layer) &&
        !isStandable(graph, record.position)
      ) {
        this.#placeAt(record, nearestStandable(graph, record.position));
      }
    }
    for (const gate of closing) {
      this.#projectiles = this.#projectiles.map((shot) => cutShotAtGate(shot, gate));
    }
  }

  /**
   * The first of team 0 on the start line starts the clock (#2692), or the
   * first death on team 1, so a party cannot let the Zaishen come to it and
   * step over the line for the last kill (#2933). One removed is not dead.
   */
  #watchStartLine(): void {
    const line = this.#startLine;
    if (line === undefined || this.#clearClockStartedAt !== undefined || this.phase !== "active") {
      return;
    }
    for (const record of this.#participants.values()) {
      if (!countsForTeam(record)) {
        continue;
      }
      const started =
        record.combatant.team === 0
          ? !record.combatant.dead &&
            record.layer === line.layer &&
            record.position.x >= line.x &&
            record.position.x <= line.x + line.width &&
            record.position.y >= line.y &&
            record.position.y <= line.y + line.height
          : record.combatant.team === 1 && record.combatant.dead;
      if (started) {
        this.#clearClockStartedAt = this.#elapsedSeconds;
        return;
      }
    }
  }

  /**
   * The step's shrines (#1378), once every death is in, so a player killed
   * this tick is on none: each moves by the pips on it (#2690), a living
   * player one, a living Ghostly Hero `GHOST_PIPS`, a pet, minion or
   * spirit none; then, at every `POINT_TICK_SECONDS` of match clock, each
   * scores its owner a point, and a team then ahead of every other alone
   * has led last. The capture comes first, so one taken on the scoring tick scores.
   */
  #advanceCapturePoints(dt: number): void {
    if (this.#capturePoints.length === 0 || this.phase !== "active") {
      return;
    }
    const presence = this.#capturePoints.map((point) => {
      const pips = new Map<number, number>();
      for (const record of this.#participants.values()) {
        const ghost = record.creature?.kind === "ghostly-hero";
        if (
          (countsForTeam(record) || ghost) &&
          !record.combatant.dead &&
          onCapturePoint(point, record)
        ) {
          const team = record.combatant.team;
          pips.set(team, (pips.get(team) ?? 0) + (ghost ? GHOST_PIPS : 1));
        }
      }
      return pips;
    });
    this.#capturePoints = stepCapturePoints(this.#capturePoints, dt, presence).state;
    this.#refreshBotObjectives();
    const due = (this.#pointTicks + 1) * POINT_TICK_SECONDS;
    if (this.#elapsedSeconds + SWING_EPSILON < due) {
      return;
    }
    this.#pointTicks += 1;
    for (const { owner } of this.#capturePoints) {
      if (owner !== null) {
        this.#score = addPoint(this.#score, owner);
      }
    }
    // An eliminated team's points, which its shrines still add to, have no
    // say in who leads (#2682).
    const lead = soleLeader({
      byTeam: new Map([...this.#score.byTeam].filter(([team]) => !this.#eliminated.has(team))),
    });
    if (lead !== undefined) {
      this.#ledAt.set(lead, this.#elapsedSeconds);
    }
  }

  /**
   * The step's flags (#1225), once every death is in: a dead carrier's
   * flag falls where they lie, before anyone who arrived this step takes
   * up or plants one, in the order they arrived; then the stand's
   * countdown, which boosts its holder's morale when it runs out.
   */
  #advanceFlags(dt: number): void {
    const arrivals = this.#flagArrivals;
    this.#flagArrivals = [];
    const field = this.#flagField;
    const state = this.#flagsState;
    if (field === undefined || state === undefined || this.phase !== "active") {
      return;
    }
    const { boostTeam, ...next } = stepFlags(
      field,
      state,
      [...this.#deathDrops(state.flags), ...this.#livingArrivals(arrivals)],
      dt,
    );
    this.#flagsState = next;
    if (boostTeam !== undefined) {
      this.moraleBoost(boostTeam, FLAG_MORALE_BOOST);
    }
  }

  /**
   * The Storm Beacon's strike (#2694), once the step's flags are planted:
   * every `BEACON_STRIKE_SECONDS` its owner holds it, one random living
   * foe in earshot of it takes Beacon Lightning. A spirit is no target,
   * as it is none for a trap. With nobody in earshot, nothing is drawn.
   */
  #advanceBeacon(dt: number): void {
    const field = this.#flagField;
    if (field?.beacon !== true || this.#flagsState === undefined || this.phase !== "active") {
      return;
    }
    const { state, strikes } = stepBeacon(this.#beaconState, this.#flagsState.stand.holder, dt);
    this.#beaconState = state;
    if (!strikes) {
      return;
    }
    const foes = [...this.#participants.values()].filter(
      (body) =>
        !body.combatant.dead &&
        body.creature?.kind !== "spirit" &&
        body.combatant.team !== state.owner &&
        atObjective(field.stand, field.standLayer ?? 0, body, BEACON_STRIKE_RADIUS),
    );
    if (foes.length === 0) {
      return;
    }
    const target = foes[this.#rng.nextInt(0, foes.length)];
    if (target === undefined) {
      return;
    }
    const events = beaconLightning(target.combatant, {
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
    });
    // From nobody: no player is credited. The cause names the beacon, and the area is where the bolt starts.
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "beacon",
      sourceId: undefined,
      skillId: undefined,
      weaponId: undefined,
      attributeId: undefined,
      area: beaconStrikeArea(field.stand),
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * The attack step (ADR-0026): drop an attack whose target is no longer
   * a living enemy, pause while casting, through the aftercast and while
   * a skill walks in (#499), walk into reach, then swing.
   *
   * The swing timer keeps the remainder past each interval rather than
   * zeroing, so the rate stays exact at 20 Hz. A target that steps out of
   * reach mid-swing keeps the swing's progress for when it is caught.
   */
  #advanceAttack(record: ParticipantRecord, dt: number): void {
    const attack = record.combatant.attack;
    if (attack === undefined) {
      return;
    }
    const check = this.#attackCheck(record, attack.targetId);
    const target = this.#participants.get(attack.targetId);
    if (!check.ok || target === undefined) {
      record.combatant.attack = undefined;
      return;
    }
    // Moving cancels, as in GW1. `setInputDirection` cancels on the way in,
    // but an attack asked for while a direction is already held would
    // otherwise approach on top of the walk, at twice the speed. A
    // click-to-walk is moving too: an instant skill at an enemy, which
    // turns on them with the weapon, does not stop it (#310).
    if (
      record.inputDirection.x !== 0 ||
      record.inputDirection.y !== 0 ||
      record.walkGoal !== undefined
    ) {
      record.combatant.attack = undefined;
      return;
    }
    if (
      record.combatant.cast.isCasting ||
      record.combatant.cast.inAftercast ||
      record.pendingSkill !== undefined
    ) {
      return;
    }

    const { weapon } = record.combatant.equipment.mainHand;
    // A spirit never walks (#1239): a foe out of its reach or sight ends
    // the attack, and its behaviour picks the next.
    if (
      record.behaviour?.kind === "auto-attack" &&
      record.behaviour.reach !== undefined &&
      !(
        distanceWithinRange(
          record.position,
          target.position,
          this.#heightReach(record, target, weapon.range),
        ) && this.#clearTo(record, target, weapon.projectileSpeed === undefined)
      )
    ) {
      record.combatant.attack = undefined;
      return;
    }
    const approach = this.#approach(
      record,
      target,
      this.#heightReach(record, target, weapon.range),
      weapon.projectileSpeed === undefined,
      attack,
      dt,
    );
    if (approach === "unreachable") {
      record.combatant.attack = undefined;
      this.#logWeapon(record.id, weapon.id, [{ kind: "attack-unreachable", targetId: target.id }]);
    }
    if (approach !== "arrived") {
      return;
    }

    attack.swingElapsed += dt;
    const interval = swingIntervalSeconds(record.combatant);
    // Within a hair: twenty-odd additions of 0.05 fall just short of
    // 1.75, and a swing a whole tick late would make the rate drift.
    if (attack.swingElapsed < interval - SWING_EPSILON) {
      return;
    }
    attack.swingElapsed = Math.max(0, attack.swingElapsed - interval);
    // The blow is the old weapon's; a swap waiting on it takes the next
    // settle, this tick, and the new weapon swings afresh (#489).
    if (record.pendingWeaponSet !== undefined) {
      attack.swingElapsed = 0;
    }
    record.outOfCombatSeconds = 0;
    this.#blowStarted(record, target);
    // A swing is an attack, as a skill is paid for: the mire takes its Energy (#3027).
    loseActionEnergy(record.combatant);
    // Read as the swing begins (#2282), before its blow lands.
    const aimedAt: AimedAt = {
      id: target.id,
      hadLessHealth: this.#hasLessHealth(record, target.id),
    };
    // Cancelled as it began (#1593): no arrow, no blow, and no `attacks`.
    // A pet's armed attack is spent, as if it missed.
    if (this.#attackBegins(record)) {
      record.armedAttack = undefined;
      return;
    }

    if (weapon.projectileSpeed !== undefined) {
      const released = this.#release(record, target, weapon.projectileSpeed, dt, undefined);
      if (released.length > 0) {
        this.#logWeapon(record.id, weapon.id, released);
      }
      this.#fireTriggers(record, "bearer-attacks", NONE_SPARED, undefined, aimedAt);
      return;
    }
    const armed =
      record.armedAttack === undefined ? undefined : getSkill(record.armedAttack.skillId);
    if (armed !== undefined) {
      this.#landArmedAttack(record, armed, target);
      return;
    }
    const { events, doubleStrike, landed, fired } = resolveSwing({
      attacker: record.combatant,
      target,
      surroundings: this.#participants,
      rng: this.#rng,
      rules: this.#ruleset.combat,
      exposed: this.#exposedTo(record),
    });
    this.#gainAdrenaline(record, events, events, landed);
    this.#chargeFromDamage(record.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#logWeapon(record.id, record.combatant.equipment.mainHand.weapon.id, events, doubleStrike);
    this.#logFired(fired);
    this.#fireTriggers(record, "bearer-attacks", NONE_SPARED, undefined, aimedAt);
  }

  /**
   * A companion's blow, armed by its owner's pet attack (#1046): the
   * skill, through the one attack-skill path with the pet as the
   * attacker, its ranks the ones it arrived with. The arming is used up
   * whatever the blow does: a hit, a blind miss or a block. A pet attack
   * is not an attack skill: it earns no adrenaline.
   */
  #landArmedAttack(pet: ParticipantRecord, skill: Skill, target: ParticipantRecord): void {
    pet.armedAttack = undefined;
    const aimedAt: AimedAt = { id: target.id, hadLessHealth: this.#hasLessHealth(pet, target.id) };
    const fired: FiredTrigger[] = [];
    const events = resolveAttackSkill(
      {
        skill,
        caster: pet.combatant,
        targets: [target.combatant],
        rng: this.#rng,
        rules: this.#ruleset.combat,
        surroundings: this.#participants,
      },
      this.#exposedTo(pet),
      fired,
    );
    this.#chargeFromDamage(pet.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: pet.id,
      skillId: skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#logFired(fired);
    this.#fireTriggers(pet, "bearer-attacks", NONE_SPARED, undefined, aimedAt);
  }

  /**
   * Whether a victim shows `attacker` its back while moving (#533): facing
   * more than 90° away from the attacker, read the moment the blow lands,
   * and its last step moved it. A melee blow at such a victim always crits.
   */
  #exposedTo(attacker: ParticipantRecord): (victim: Combatant) => boolean {
    return (victim) => {
      const record = this.#participants.get(victim.id);
      if (record === undefined) {
        return false;
      }
      const [before, after] = record.history.samples().slice(-2);
      const moving =
        before !== undefined &&
        after !== undefined &&
        (before.x !== after.x || before.y !== after.y);
      return moving && showsBackTo(record.position, record.facing, attacker.position);
    };
  }

  /**
   * A ranged weapon's attack skill (#416): a shot at each victim the
   * skill picked, each with its own blind roll and its own flight, the
   * skill riding it. What happens now is only what stopped a shot from
   * flying; the rest lands with the shot.
   *
   * Each shot carries the caster's chants' riders as they are now, and
   * the chants end at once, flying or not (#782): the release spends
   * them, so a second attack skill loosed before the first shot lands
   * carries none, and a chant that would have run out in flight still
   * lands its rider.
   *
   * A skill's `flightSpeed` (#1486) speeds each shot whose `when` holds
   * now, its victim the target: Swift Javelin keeps its speed if its
   * enchantment ends in flight. Its `strikes` are read now too (#1914):
   * Forked Arrow shoots one arrow if its user was hexed as it left.
   */
  #releaseSkill(
    record: ParticipantRecord,
    resolution: SkillResolution,
    speed: number,
    dt: number,
  ): CombatEvent[] {
    const skillHit: SkillHit = {
      kind: "attack",
      skill: resolution.skill,
      blow: skillBlow(resolution.skill, record.combatant, this.#participants),
      next: nextAttackSkillOf(record.combatant),
      own: resolution.own,
      strikes: 1,
      unblockable: false,
    };
    const flight = resolution.skill.attack?.flightSpeed;
    const released: CombatEvent[] = [];
    removePreparations(record.combatant, resolution.skill, released);
    // Read before `onRelease`, which may take what gates them (#2459).
    const shots = resolution.targets.map((victim) => ({
      victim,
      ...releasedStrikes(resolution.skill.attack, record.combatant, victim, this.#participants),
    }));
    const onRelease = resolution.skill.attack?.onRelease;
    const primary = resolution.targets[0];
    if (onRelease !== undefined) {
      released.push(
        ...applySkillEffects(
          {
            ...resolution,
            skill: { ...resolution.skill, effects: onRelease },
            targets: [primary ?? record.combatant],
          },
          [],
        ),
      );
    }
    const events = shots.flatMap(({ victim, strikes, unblockable, eachWeaponDamage }) => {
      const target = this.#participants.get(victim.id);
      const multiplier =
        flight !== undefined &&
        (flight.when === undefined ||
          stateHolds(flight.when, record.combatant, victim, this.#participants))
          ? flight.multiplier
          : 1;
      const blow =
        eachWeaponDamage === 1
          ? skillHit.blow
          : { ...skillHit.blow, weaponDamage: skillHit.blow.weaponDamage * eachWeaponDamage };
      return target === undefined || victim.dead
        ? []
        : this.#release(record, target, speed * multiplier, dt, {
            ...skillHit,
            blow,
            strikes,
            unblockable,
          });
    });
    useNextAttackSkill(record.combatant, skillHit.next, events);
    return [...released, ...events];
  }

  /**
   * What an attack skill's shot that failed to hit `target` does
   * (#1486): its `onFailedToHit`, `target` the target. Nothing for a
   * plain shot, or with its attacker gone from the match.
   */
  #failedToHit(
    attacker: Combatant | undefined,
    target: ParticipantRecord,
    skillHit: SkillHit | undefined,
    earlier: readonly CombatEvent[],
  ): CombatEvent[] {
    const effects = skillHit?.skill.attack?.onFailedToHit ?? [];
    return skillHit === undefined || attacker === undefined || effects.length === 0
      ? []
      : applySkillEffects(
          {
            skill: { ...skillHit.skill, effects },
            caster: attacker,
            targets: [target.combatant],
            rng: this.#rng,
            rules: this.#ruleset.combat,
            surroundings: this.#participants,
            own: skillHit.own,
          },
          earlier,
        );
  }

  /**
   * A flying spell (#535): one shot at the primary target, carrying the
   * cast. Its effects, and anyone its area catches, land with it.
   * Several (#1914): its `shots` at the primary, each flying and dodged
   * alone, Dancing Daggers'; or, `spread`, one at each target its area
   * found as it left, the primary first, none splashing, Lava Arrows'.
   */
  #releaseSpell(
    record: ParticipantRecord,
    resolution: SkillResolution,
    speed: number,
    dt: number,
    loan: RankLoan,
  ): CombatEvent[] {
    const { skill } = resolution;
    const spread = skill.projectile?.spread === true;
    const victims = spread ? resolution.targets : resolution.targets.slice(0, 1);
    const shots = skill.projectile?.shots ?? 1;
    const spellHit: SpellHit = {
      kind: "spell",
      skill: spread ? { ...skill, area: undefined } : skill,
      caster: record.combatant,
      own: resolution.own,
      loan,
    };
    return victims.flatMap((victim) => {
      const target = this.#participants.get(victim.id);
      return target === undefined || target.combatant.dead
        ? []
        : Array.from({ length: shots }, () =>
            this.#release(record, target, speed, dt, spellHit),
          ).flat();
    });
  }

  /**
   * A ranged swing lands as a shot leaving the bow, led ahead of the
   * target. Blind is rolled now, as GW1 does: a blinded shot misses at
   * once and nothing flies; a spell is not blinded. Then line of sight, once: a wall in the way
   * spends the swing and nothing flies either, and the next swing looks
   * again. Melee is never checked; its reach is shorter than any gap.
   * Releasing an attack, flying or not, ends the attacker's weapon spell
   * (#758). Returns that, and the miss or the obstruction, for the caller
   * to log, with what an attack skill's `onFailedToHit` did (#1486).
   * An arrow flies as fast as its archer's statuses say as it leaves
   * (`projectileSpeedMultiplier`, #1742), and keeps that speed.
   */
  #release(
    record: ParticipantRecord,
    target: ParticipantRecord,
    weaponSpeed: number,
    dt: number,
    skillHit: SkillHit | SpellHit | undefined,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    const speed =
      skillHit?.kind !== "spell" && wieldsFor(record.combatant.equipment.mainHand.weapon.id, "bow")
        ? weaponSpeed *
          aggregateModifiers(record.combatant.statuses.active).projectileSpeedMultiplier
        : weaponSpeed;
    let attacked: ReturnType<typeof bearerAttacked> = {
      unblockable: false,
      criticalChanceBonus: 0,
      damageDelta: 0,
      spent: [],
    };
    if (skillHit?.kind !== "spell") {
      // Only a flying attack is released here.
      attacked = bearerAttacked(record.combatant, events, "projectile");
      aimedAt(record.combatant, target.combatant);
      if (
        blindMisses(record.combatant, target.combatant, this.#rng) ||
        lowRankMisses(skillHit?.skill.attack, record.combatant, this.#rng)
      ) {
        bearerFailedToHit(record.combatant, record.combatant.equipment.mainHand.weapon, events);
        events.push({ kind: "attack-missed", targetId: target.id });
        return [...events, ...this.#failedToHit(record.combatant, target, skillHit, events)];
      }
    }
    if (!this.#seesAcross(record.position, record.layer, target.position, target.layer)) {
      events.push({ kind: "attack-obstructed", targetId: target.id });
      if (skillHit?.kind !== "spell") {
        bearerMissed(record.combatant, events);
      }
      return skillHit?.kind === "spell"
        ? events
        : [...events, ...this.#failedToHit(record.combatant, target, skillHit, events)];
    }
    const from = record.position;
    const tracked = trackTarget(target.history.samples(), dt, target.position);
    const leadPoint = leadAimPoint(from, tracked.position, tracked.velocity, speed);
    // Along the whole flight, once: the path is fixed from here (#215). A
    // shot led round a corner, or at a target stepping behind a pillar,
    // stops at the wall, a unit short of it so it lands on the near side.
    const impact = firstHit(from, leadPoint, this.#wallsOn(record.layer));
    const aimPoint =
      impact === undefined
        ? leadPoint
        : distance(from, impact) <= 1
          ? from
          : add(impact, scale(normalize(sub(from, impact)), 1));
    this.#projectiles.push({
      id: this.#nextProjectileId,
      attackerId: record.id,
      targetId: target.id,
      from,
      aimPoint,
      fromLayer: record.layer,
      toLayer: target.layer,
      obstructed: impact !== undefined,
      speed,
      flightSeconds: distance(from, aimPoint) / speed,
      elapsed: 0,
      weaponSnapshot: withEndedStatuses(weaponSnapshotOf(record.combatant), attacked),
      skillHit,
      unblockable: attacked.unblockable,
      spent: attacked.spent,
      heightDamage:
        skillHit?.kind !== "spell" && feelsHeight(record.combatant.equipment.mainHand.weapon.id)
          ? heightDamageMultiplier(
              heightStep(record.floors, record.layer, target.floors, target.layer),
            )
          : 1,
    });
    this.#nextProjectileId += 1;
    return events;
  }

  /** Fly every shot in flight one tick, and land those that arrive, in release order. */
  #advanceProjectiles(dt: number): void {
    const landed: Projectile[] = [];
    const flying: Projectile[] = [];
    for (const projectile of this.#projectiles) {
      projectile.elapsed += dt;
      (projectile.elapsed >= projectile.flightSeconds - SWING_EPSILON ? landed : flying).push(
        projectile,
      );
    }
    this.#projectiles = flying;
    for (const projectile of landed) {
      this.#land(projectile);
    }
  }

  /**
   * A shot lands at its aim point, and hits whoever it was aimed at if
   * they are still there: alive, and within their body plus the
   * tolerance. Anyone else is dodged. Its attacker may have died since;
   * the shot lands all the same, as in GW1, but the dead earn no
   * adrenaline. A target that died in flight is not there to be hit or
   * to dodge, so nothing happens. A hit carries the attacker's
   * preparation as it is on landing (#525).
   *
   * A shot carrying an attack skill (#416) lands its bonus with the blow
   * and its riders after it, only on a hit: a caster who finished before
   * it arrived is not interrupted. Blocked, it lands the skill's
   * `onBlocked` instead, which earns no adrenaline; an `unblockable`
   * skill (Wild Throw) rolls no block. With its attacker gone from the
   * match, the blow lands and the riders do not. A critical hit lands its
   * `onCritical` after the riders; a dodge, a block (after `onBlocked`)
   * or a wall lands its `onFailedToHit` (#1486).
   *
   * A hit lands the riders of the chants its release spent (#782) after
   * the skill's own.
   */
  #land(projectile: Projectile): void {
    const target = this.#participants.get(projectile.targetId);
    const { skillHit } = projectile;
    const attacker = this.#participants.get(projectile.attackerId);
    if (projectile.obstructed) {
      // It hit the wall; where the target is now has nothing to do with it.
      const events: CombatEvent[] = [{ kind: "attack-obstructed", targetId: projectile.targetId }];
      if (skillHit?.kind !== "spell" && attacker !== undefined) {
        bearerMissed(attacker.combatant, events);
      }
      if (skillHit?.kind !== "spell" && target !== undefined && !target.combatant.dead) {
        events.push(...this.#failedToHit(attacker?.combatant, target, skillHit, events));
        this.#recordDeaths(events);
      }
      this.#logShot(projectile, events);
      return;
    }
    if (target === undefined || target.combatant.dead) {
      return;
    }
    if (skillHit?.kind === "spell") {
      this.#landSpell(projectile, skillHit, target);
      return;
    }
    const events: CombatEvent[] = [];
    // What the attacker's statuses add to the hit, each logged apart (#939).
    const fired: FiredTrigger[] = [];
    const riders = (effects: Skill["effects"]): CombatEvent[] =>
      skillHit === undefined || attacker === undefined
        ? []
        : applySkillEffects(
            {
              skill: { ...skillHit.skill, effects },
              caster: attacker.combatant,
              targets: [target.combatant],
              rng: this.#rng,
              rules: this.#ruleset.combat,
              surroundings: this.#participants,
              own: skillHit.own,
            },
            events,
          );
    let blocked = false;
    if (!this.#reaches(projectile, target)) {
      events.push({ kind: "attack-dodged", targetId: target.id });
      if (attacker !== undefined) {
        bearerMissed(attacker.combatant, events);
      }
      events.push(...riders(skillHit?.skill.attack?.onFailedToHit ?? []));
    } else {
      blocked = this.#landBlows(projectile, skillHit, target, attacker, events, fired, riders);
    }
    if (
      attacker !== undefined &&
      !attacker.combatant.dead &&
      !blocked &&
      (skillHit === undefined || !losesAllAdrenaline(skillHit.skill))
    ) {
      this.#gainAdrenaline(attacker, events, events);
    }
    this.#chargeFromDamage(attacker?.combatant, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    this.#logShot(projectile, events);
    this.#logFired(fired);
  }

  /**
   * The blows of a shot that reached `target`: one, or its attack skill's
   * `strikes` (#1539), Dual Shot's two arrows in one flight. Each rolls
   * its own block and crit and lands the skill's riders if it hits; the
   * first's blind was rolled at the release, each later one rolls its
   * own now. A target the first blow killed takes no second. Returns
   * whether no blow hit and one was blocked: a blocked shot earns no
   * adrenaline.
   */
  #landBlows(
    projectile: Projectile,
    skillHit: SkillHit | undefined,
    target: ParticipantRecord,
    attacker: ParticipantRecord | undefined,
    events: CombatEvent[],
    fired: FiredTrigger[],
    riders: (effects: Skill["effects"]) => CombatEvent[],
  ): boolean {
    const strikes = skillHit?.strikes ?? 1;
    let hits = 0;
    let blocked = 0;
    for (let strike = 0; strike < strikes && !target.combatant.dead; strike += 1) {
      // The first blow was aimed at the release; each later one is aimed now.
      if (strike > 0 && attacker !== undefined) {
        aimedAt(attacker.combatant, target.combatant);
      }
      // Shadow Form's miss (#1951) is checked as each blow lands, the first too.
      if (
        attacksAgainstMiss(target.combatant.statuses.active) ||
        (strike > 0 &&
          attacker !== undefined &&
          (blindMisses(attacker.combatant, target.combatant, this.#rng) ||
            lowRankMisses(skillHit?.skill.attack, attacker.combatant, this.#rng)))
      ) {
        events.push({ kind: "attack-missed", targetId: target.id });
        if (attacker !== undefined) {
          bearerFailedToHit(attacker.combatant, projectile.weaponSnapshot.mainHand.weapon, events);
        }
        continue;
      }
      if (this.#landBlow(projectile, skillHit, target, attacker, events, fired, riders)) {
        hits += 1;
      } else {
        blocked += 1;
      }
    }
    return hits === 0 && blocked > 0;
  }

  /**
   * One blow of a shot that reached `target`: blocked, it lands the
   * skill's `onBlocked` and `onFailedToHit`; else the blow, its riders and
   * on a critical its `onCritical`. Returns whether it hit.
   */
  #landBlow(
    projectile: Projectile,
    skillHit: SkillHit | undefined,
    target: ParticipantRecord,
    attacker: ParticipantRecord | undefined,
    events: CombatEvent[],
    fired: FiredTrigger[],
    riders: (effects: Skill["effects"]) => CombatEvent[],
  ): boolean {
    if (
      !projectile.unblockable &&
      !unblockableNow(
        skillHit?.unblockable ?? false,
        attacker?.combatant,
        target.combatant,
        this.#participants,
      ) &&
      blocks(
        target.combatant,
        projectile.attackerId,
        attacker?.combatant.statuses.active ?? [],
        "projectile",
        skillHit !== undefined,
        this.#rng,
      )
    ) {
      events.push({ kind: "attack-blocked", targetId: target.id });
      if (attacker !== undefined) {
        bearerFailedToHit(attacker.combatant, projectile.weaponSnapshot.mainHand.weapon, events);
      }
      attackReached(target.combatant, events);
      events.push(...riders(skillHit?.skill.attack?.onBlocked ?? []));
      if (attacker !== undefined) {
        attackBlockedRiders(
          attacker.combatant,
          target.combatant,
          projectile.weaponSnapshot.mainHand,
          skillHit !== undefined,
          this.#rng,
          this.#ruleset.combat,
          this.#participants,
          fired,
          projectile.spent,
        );
      }
      events.push(...riders(skillHit?.skill.attack?.onFailedToHit ?? []));
      return false;
    }
    const blow = settleBlow(
      skillHit?.blow ?? PLAIN_BLOW,
      attacker?.combatant,
      target.combatant,
      this.#participants,
    );
    // No Order of Undeath bonus (#1915) here: every minion fights in melee
    // (weapon-attack.ts adds it). A ranged minion needs it added here too.
    // Painful Bond's +18 on a spirit's shot that hits (#1270), armor-
    // ignoring on the same blow. A spirit gone before its shot lands
    // is no longer anyone's, so it adds nothing.
    const fromSpirit =
      attacker?.creature?.kind === "spirit"
        ? aggregateModifiers(target.combatant.statuses.active).damageFromSpiritAttacks
        : 0;
    const before = target.combatant.health;
    const critical = landBlow(
      projectile.weaponSnapshot,
      attacker?.combatant,
      target.combatant,
      fromSpirit === 0 ? blow : { ...blow, bonus: blow.bonus + fromSpirit },
      // A shot crits only on its roll, never for where it came from.
      false,
      this.#rng,
      this.#ruleset.combat,
      events,
      this.#participants,
      projectile.heightDamage,
    );
    if (critical && attacker !== undefined) {
      landedCritical(attacker.combatant, projectile.weaponSnapshot.criticalStrikes, events);
      criticalHitRiders(
        attacker.combatant,
        target.combatant,
        projectile.weaponSnapshot.mainHand.weapon,
        this.#rng,
        this.#ruleset.combat,
        this.#participants,
        fired,
      );
    }
    if (attacker !== undefined) {
      events.push(
        ...attackHitRiders(
          attacker.combatant,
          target.combatant,
          projectile.weaponSnapshot.mainHand,
          skillHit !== undefined,
          Math.max(0, before - target.combatant.health),
          this.#rng,
          this.#ruleset.combat,
          this.#participants,
          fired,
          projectile.spent,
        ),
      );
      bearerHit(
        attacker.combatant,
        target.combatant,
        events,
        skillHit?.skill,
        projectile.weaponSnapshot.mainHand.weapon,
        Math.max(0, before - target.combatant.health),
      );
    }
    if (skillHit !== undefined && attacker !== undefined) {
      events.push(
        ...nextAttackSkillRiders(
          skillHit.next,
          attacker.combatant,
          target.combatant,
          this.#rng,
          this.#ruleset.combat,
          this.#participants,
        ),
      );
    }
    attackReached(target.combatant, events);
    events.push(...riders(skillHit?.skill.effects ?? []));
    if (critical) {
      events.push(...riders(skillHit?.skill.attack?.onCritical ?? []));
    }
    return true;
  }

  /**
   * A spell lands as it was cast (#535), centred on where its target is
   * now: its effects on the target, its area around them. Its caster may
   * have died since, and it lands all the same. Dodged, nothing happens
   * to anyone, splash included.
   */
  #landSpell(projectile: Projectile, spell: SpellHit, target: ParticipantRecord): void {
    if (!this.#reaches(projectile, target)) {
      this.#logShot(projectile, [{ kind: "attack-dodged", targetId: target.id }]);
      return;
    }
    const { skill, caster } = spell;
    const { events, skipped } = withRankLoan(caster, spell.loan, skill, () =>
      resolveSkillEffects({
        skill,
        caster,
        targets: resolveTargets({
          skill,
          caster,
          casterPosition: projectile.from,
          casterLayer: this.#participants.get(caster.id)?.layer ?? target.layer,
          primary: target,
          candidates: skill.area === undefined ? [] : [...this.#participants.values()],
          losBlockers: this.#wallsOn(target.layer),
        }),
        rng: this.#rng,
        rules: this.#ruleset.combat,
        surroundings: this.#participants,
        own: spell.own,
      }),
    );
    this.#chargeFromDamage(caster, events);
    this.#recordDeaths(events);
    this.#recordKnockdowns(events);
    const area =
      skill.area === undefined || skill.area.origin === "party"
        ? undefined
        : { x: target.position.x, y: target.position.y, radius: skill.area.radius };
    const casterRecord = this.#participants.get(projectile.attackerId);
    this.#logShot(
      projectile,
      casterRecord === undefined
        ? events
        : [
            ...events,
            ...this.#skippedEvent(
              casterRecord,
              skill,
              skipped,
              withRankLoan(caster, spell.loan, skill, () => ranksOf(caster)),
            ),
          ],
      area,
    );
  }

  /** Whether a shot landing now finds its target where it was aimed: their body plus the tolerance. */
  #reaches(projectile: Projectile, target: ParticipantRecord): boolean {
    const reach = this.#radiusOf(target) + this.#ruleset.combat.projectileTolerance;
    return distance(target.position, projectile.aimPoint) <= reach;
  }

  /**
   * A shot's entry: its skill's, if it carries one (#416, #535), else its
   * weapon's; with the area a spell's landing caught.
   */
  #logShot(
    projectile: Projectile,
    events: readonly CombatEvent[],
    area?: CombatLogEntry["area"],
  ): void {
    const { skillHit } = projectile;
    if (skillHit === undefined) {
      this.#logWeapon(projectile.attackerId, projectile.weaponSnapshot.mainHand.weapon.id, events);
      return;
    }
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: projectile.attackerId,
      skillId: skillHit.skill.id,
      weaponId: undefined,
      attributeId: undefined,
      area,
      doubleStrike: false,
      events,
    });
  }

  /** A weapon entry, named for the weapon that swung or shot (#162). */
  #logWeapon(
    sourceId: string,
    weaponId: WeaponId,
    events: readonly CombatEvent[],
    doubleStrike = false,
  ): void {
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "weapon",
      sourceId,
      skillId: undefined,
      weaponId,
      attributeId: undefined,
      area: undefined,
      doubleStrike,
      events,
    });
  }

  /** Why `record` may not attack `targetId`, as a cast at it would be told. */
  #attackCheck(record: ParticipantRecord, targetId: string): ActivationCheck {
    const target = this.#participants.get(targetId)?.combatant;
    if (record.combatant.dead) {
      return { ok: false, reason: "caster-dead" };
    }
    if (record.combatant.knockdownRemaining > 0) {
      return { ok: false, reason: "caster-knocked-down" };
    }
    // Hands full of flag or relic (#1225, #1374, GW1): no weapon to swing.
    if (this.carriesBundle(record.id)) {
      return { ok: false, reason: "hands-full" };
    }
    // Obsidian Flesh (#1575): a queued attack stops with it.
    if (preventsAttacks(record.combatant.statuses.active)) {
      return { ok: false, reason: "cannot-attack" };
    }
    if (target === undefined) {
      return { ok: false, reason: "no-target" };
    }
    if (target.dead) {
      return { ok: false, reason: "invalid-target-dead" };
    }
    if (target.id === record.id) {
      return { ok: false, reason: "invalid-target-self" };
    }
    if (target.team === record.combatant.team) {
      return { ok: false, reason: "invalid-target-ally" };
    }
    return { ok: true };
  }

  /**
   * Adrenaline is earned by landing damage on a foe, never by waiting,
   * which makes adrenaline skills a reward for staying in the fight rather
   * than a second energy pool. `blows` strikes to every adrenaline skill
   * (#463), if anything in `events` damaged a foe: one for each foe an
   * attack skill landed on (#936), one for a shot, and one per landed blow
   * of a swing, so
   * a double strike earns two. A blocked blow deals no damage, so it earns
   * nothing (#534). A Furious weapon's blow may count twice (#2009).
   * "For Great Justice!" (#936) adds its extra strikes to each. What filled is told in `log` (#1735), the events logged
   * for the blow.
   */
  #gainAdrenaline(
    record: ParticipantRecord,
    events: readonly CombatEvent[],
    log: CombatEvent[],
    blows = 1,
  ): void {
    const damagedFoe = events.some((event) => {
      // A blow that backfired off a foe hit it (#2471).
      const victim =
        event.kind === "damage" || event.kind === "attack-backfired"
          ? this.#participants.get(event.targetId)
          : undefined;
      return victim !== undefined && victim.combatant.team !== record.combatant.team;
    });
    if (damagedFoe) {
      const { extraStrikesPerHit } = aggregateModifiers(record.combatant.statuses.active);
      // Furious (#2009): each blow rolls to count twice. Drawn only for a
      // weapon that has it, so no other fight's stream moves.
      const { doubleAdrenalineChance } = record.combatant.equipment.hitMods;
      let doubled = 0;
      for (let blow = 0; doubleAdrenalineChance > 0 && blow < blows; blow += 1) {
        if (this.#rng.nextFloat() < doubleAdrenalineChance) {
          doubled += 1;
        }
      }
      const strikes = (blows + doubled) * (1 + extraStrikesPerHit);
      if (gainStrikes(record.combatant, strikes, this.#elapsedSeconds, true)) {
        log.push({ kind: "adrenaline-gained", targetId: record.id, strikes, skillId: undefined });
      }
    }
  }

  /**
   * Taking damage from a foe charges adrenaline too (#827), as in GW1: a
   * warrior under pressure builds it. Each `damage` in `events` that
   * `source` dealt a living foe gives that foe `floor(100 × amount /
   * maxHealth)` units, so a hit for a quarter of its health is a strike.
   * Called where a skill, a swing, a shot or a spell lands, never for
   * degeneration; an ally's or your own damage, and a lethal hit, give
   * nothing. A `source` gone from the match is no one's foe. A hit for
   * 0 gives nothing but still keeps the victim's adrenaline (#828).
   */
  #chargeFromDamage(source: Combatant | undefined, events: readonly CombatEvent[]): void {
    if (source === undefined) {
      return;
    }
    for (const event of events) {
      const victim = event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
      if (
        event.kind !== "damage" ||
        victim === undefined ||
        victim.combatant.dead ||
        victim.combatant.team === source.team
      ) {
        continue;
      }
      gainUnits(
        victim.combatant,
        Math.floor((100 * event.amount) / effectiveMaxHealth(victim.combatant)),
        this.#elapsedSeconds,
        false,
      );
    }
  }

  /**
   * Each zone `record` stands in, on its layer, puts its kind's statuses on
   * it again for the kind's linger (ADR-0053), in the map's order. A spirit
   * stands where it was raised and is spared; the dead were skipped already.
   * The source is the zone: no player is credited with what it does.
   */
  #applyZones(record: ParticipantRecord): void {
    if (this.#zones.length === 0 || record.creature?.kind === "spirit") {
      return;
    }
    for (const zone of zonesHolding(this.#zones, record.position, record.layer)) {
      const rule = ZONE_RULES[zone.kind];
      // A strike lands once a window, in #advanceZoneStrikes (#3029).
      if (rule.trigger !== "while-inside") {
        continue;
      }
      for (const status of rule.statuses) {
        applyStatus(record.combatant, status, rule.lingerSeconds, zoneSourceId(zone), NO_RANKS);
      }
    }
  }

  /**
   * The harmful ground a bot steps out of this tick (#3029): every
   * standing zone, a timed one only while it telegraphs or strikes, and a
   * moving one where it is now.
   */
  #harmfulZonesNow(): readonly MatchZone[] {
    return this.#zones.flatMap((zone) => {
      const rule = ZONE_RULES[zone.kind];
      if (!rule.harmful) {
        return [];
      }
      if (rule.trigger === "while-inside") {
        return [zone];
      }
      return zonePhaseAt(zone, this.#elapsedSeconds) === "idle"
        ? []
        : [{ ...zone, polygon: zonePolygonAt(zone, this.#elapsedSeconds) }];
    });
  }

  /**
   * Timed and moving hazards (#3029), once every body has moved. A timed
   * zone strikes each living body in it once per active window, whether it
   * stood there as the window opened or walked in during it. A moving one
   * is always active and strikes a body once each time it passes over it,
   * and never twice within `ZONE_REHIT_SECONDS`. A spirit is spared, as it
   * is by standing ground; nobody is credited.
   */
  #advanceZoneStrikes(): void {
    const now = this.#elapsedSeconds;
    for (const zone of this.#zones) {
      const rule = ZONE_RULES[zone.kind];
      if (rule.trigger !== "strike") {
        continue;
      }
      const window = zoneWindowAt(zone, now);
      let state = this.#zoneStrikes.get(zone.id);
      if (state === undefined || (zone.path === undefined && state.window !== window)) {
        state = { window, struck: new Set(), lastHit: new Map() };
        this.#zoneStrikes.set(zone.id, state);
      }
      if (zonePhaseAt(zone, now) !== "active") {
        continue;
      }
      const polygon = zonePolygonAt(zone, now);
      const inside = new Set<string>();
      for (const record of this.#participants.values()) {
        if (
          record.combatant.dead ||
          record.creature?.kind === "spirit" ||
          record.layer !== zone.layer ||
          !pointInPolygon(record.position, polygon)
        ) {
          continue;
        }
        inside.add(record.id);
        if (state.struck.has(record.id)) {
          continue;
        }
        const last = state.lastHit.get(record.id);
        if (last !== undefined && now - last < ZONE_REHIT_SECONDS - SWING_EPSILON) {
          continue;
        }
        state.struck.add(record.id);
        state.lastHit.set(record.id, now);
        const events = zoneStrike(record.combatant, rule, zoneSourceId(zone), {
          rng: this.#rng,
          rules: this.#ruleset.combat,
          surroundings: this.#participants,
        });
        this.#log.push({
          tick: this.#tick,
          atSeconds: now,
          cause: "zone",
          sourceId: zoneSourceId(zone),
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events,
        });
        this.#recordDeaths(events);
      }
      // A moving zone that has passed on lets a body be struck on its next pass.
      if (zone.path !== undefined) {
        for (const id of state.struck) {
          if (!inside.has(id)) {
            state.struck.delete(id);
          }
        }
      }
    }
  }

  /**
   * Every death in `events` drops the victim's cast, so a resurrection
   * (#812) never finishes it, scores for the other side and starts its
   * respawn; a creature's does neither, and it leaves (#1052). Read from the emitted events so every death routes through
   * one place, whether a skill, a swing or degeneration caused it.
   */
  #recordDeaths(events: readonly CombatEvent[]): void {
    const fallen: { victim: ParticipantRecord; conditions: ActiveStatus[] }[] = [];
    const pacts: { sourceId: string; skillId: string | undefined }[] = [];
    for (const event of events) {
      // A destroyed spirit (#1309) is no death: it leaves as an expired
      // one does, at the end of the step, and nothing answers it.
      // A destroyed minion (#1836) still leaves its corpses and its
      // replacement.
      if (event.kind === "creature-destroyed") {
        const destroyed = this.#participants.get(event.targetId);
        if (destroyed !== undefined) {
          destroyed.respawnInSeconds = Number.POSITIVE_INFINITY;
          this.#creatureFell(destroyed);
        }
        continue;
      }
      if (event.kind !== "death") {
        continue;
      }
      const victim = this.#participants.get(event.targetId);
      if (victim !== undefined) {
        victim.combatant.attack = undefined;
        victim.pendingSkill = undefined;
        victim.combatant.cast.cancelCast();
        victim.combatant.cast.endAftercast();
        victim.walkGoal = undefined;
        victim.route = undefined;
        // A walk to a flag or relic dies with its walker (#1225).
        victim.interact = undefined;
        victim.combatant.knockdownRemaining = 0;
        victim.combatant.invulnerableRemaining = 0;
        victim.pendingWeaponSet = undefined;
        // Pestilence (#1886) spreads what it bore: read before death clears it.
        fallen.push({
          victim,
          conditions: victim.combatant.statuses.active.filter(
            ({ id, remainingSeconds }) =>
              remainingSeconds > 0 && getStatusDefinition(id).category === "condition",
          ),
        });
        // Jagged Bones (#1986) stands a horror up, Malign Intervention a
        // masterless one (#2092): read before death clears it.
        const replacedOnDeath = victim.combatant.statuses.active.flatMap(
          ({ id, remainingSeconds, ranks, sourceSkillId }) => {
            const by = getStatusDefinition(id).replacedOnDeathBy;
            return by === undefined || remainingSeconds <= 0
              ? []
              : [{ ...by, ranks, skillId: sourceSkillId }];
          },
        );
        this.#riseMasterless(victim, replacedOnDeath);
        // Death Pact Signet's (#2479), read before death ends it.
        for (const { id, sourceId, sourceSkillId, remainingSeconds } of victim.combatant.statuses
          .active) {
          if (remainingSeconds > 0 && getStatusDefinition(id).killsSourceOnDeath) {
            pacts.push({ sourceId, skillId: sourceSkillId });
          }
        }
        // Vengeance's (#2311), read before death ends it.
        const spared =
          this.#sparedDeaths.delete(victim.combatant.id) ||
          victim.combatant.statuses.active.some(({ id }) => getStatusDefinition(id).noDeathPenalty);
        victim.combatant.statuses.endAll();
        victim.armedAttack = undefined;
        this.#clearChainMarks(victim);
        victim.combatant.cast.clearOverrides();
        dropEndedCopyPools(victim.combatant);
        emptyAdrenaline(victim.combatant);
        // A creature (#1052) scores nothing and never respawns on its own:
        // a spirit or minion leaves at the end of the step, a pet lies where
        // it fell (#1046) and pays the death penalty (#1133). Only a
        // spirit's death is no soul to reap (GW1: "a non-Spirit creature").
        // Read before the next life starts it again (#2689).
        const killerTeam = victim.combatant.lastFoeTeam;
        victim.combatant.lastFoeTeam = undefined;
        if (victim.creature !== undefined) {
          if (victim.creature.kind === "ghostly-hero") {
            this.#ghostKilled(killerTeam);
          }
          // A Ghostly Hero rises by its own reset, and has no morale (#1377).
          victim.respawnInSeconds =
            victim.creature.onDeath === "rise"
              ? this.#respawnSeconds(victim)
              : Number.POSITIVE_INFINITY;
          if (victim.creature.onDeath === "vanish") {
            this.#creatureFell(victim);
            this.#replaceOnDeath(victim, replacedOnDeath);
          } else if (victim.creature.onDeath === "lie" && !spared) {
            this.#deathPenalty(victim);
          }
          if (victim.creature.kind !== "spirit") {
            this.#reapSoul(victim);
          }
          this.#companionDied(victim, victim.creature);
          continue;
        }
        if (killerTeam !== undefined && this.#teams.has(killerTeam)) {
          this.#recentKillTeams = withLatestTeam(this.#recentKillTeams, killerTeam);
        }
        victim.respawnInSeconds = this.#respawnSeconds(victim);
        if (!spared) {
          this.#deathPenalty(victim);
        }
        this.#reapSoul(victim);
        this.recordDeath(victim.combatant.team);
      }
    }
    for (const { victim, conditions } of fallen) {
      this.#diedInRange(victim, conditions);
    }
    for (const { sourceId, skillId } of pacts) {
      this.#dieWithPact(sourceId, skillId);
    }
  }

  /**
   * A pact's bearer died (#2479): its source dies too, sparing the death
   * penalty, as Death Pact Signet's "the next time that ally dies within
   * 120 seconds, so do you". A source already dead is left as it is, so
   * pacts chained round a loop end there.
   */
  #dieWithPact(sourceId: string, skillId: string | undefined): void {
    const record = this.#participants.get(sourceId);
    if (record === undefined || record.combatant.dead) {
      return;
    }
    const { combatant } = record;
    this.#sparedDeaths.add(combatant.id);
    combatant.health = 0;
    combatant.dead = true;
    const events: CombatEvent[] = [{ kind: "death", targetId: combatant.id }];
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId,
      skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events,
    });
    this.#recordDeaths(events);
  }

  /**
   * A non-spirit body died (#1886): every living spirit with an
   * `onDeathInRange` whose range it died in answers it, one of a skill:
   * Edge of Extinction's hardest, else the first. Logged as the spirit's
   * skill, so a death it causes is answered in turn, by each spirit once.
   */
  #diedInRange(victim: ParticipantRecord, conditions: readonly ActiveStatus[]): void {
    if (victim.creature?.kind === "spirit") {
      return;
    }
    const answering = new Map<string, { spirit: ParticipantRecord; rule: ArrivedDeathInRange }>();
    for (const record of this.#participants.values()) {
      const rule = record.creature?.onDeathInRange;
      const skillId = record.creature?.skillId;
      if (
        rule === undefined ||
        skillId === undefined ||
        record.combatant.dead ||
        !sharesFloor(victim.floors, floorOf(record.layer)) ||
        !distanceWithinRange(record.position, victim.position, RANGE_NATURE_RITUAL)
      ) {
        continue;
      }
      const kept = answering.get(skillId)?.rule;
      if (
        kept === undefined ||
        (rule.kind === "damage-same-type" &&
          kept.kind === "damage-same-type" &&
          rule.damage > kept.damage)
      ) {
        answering.set(skillId, { spirit: record, rule });
      }
    }
    for (const [skillId, { spirit, rule }] of answering) {
      const events =
        rule.kind === "damage-same-type"
          ? this.#extinction(spirit, victim, rule)
          : this.#pestilence(victim, conditions, rule.radius);
      if (events.length > 0) {
        this.#logFired([{ sourceId: spirit.id, skillId, events }]);
      }
    }
  }

  /**
   * Edge of Extinction (#1886): every living body of `victim`'s type in
   * `spirit`'s range, below its share of maximum Health, takes the
   * damage, typeless, from the spirit.
   */
  #extinction(
    spirit: ParticipantRecord,
    victim: ParticipantRecord,
    rule: Extract<ArrivedDeathInRange, { kind: "damage-same-type" }>,
  ): CombatEvent[] {
    const type = bodyType(victim);
    const effect: SkillEffect = {
      kind: "damage",
      amount: { flat: rule.damage },
      type: "typeless",
      armorPenetration: 0,
    };
    const events: CombatEvent[] = [];
    for (const other of this.#participants.values()) {
      const { combatant } = other;
      if (
        combatant.dead ||
        other.creature?.kind === "spirit" ||
        bodyType(other) !== type ||
        combatant.health >= rule.belowHealthFraction * effectiveMaxHealth(combatant) ||
        !sharesFloor(other.floors, floorOf(spirit.layer)) ||
        !distanceWithinRange(spirit.position, other.position, RANGE_NATURE_RITUAL)
      ) {
        continue;
      }
      events.push(
        ...applyEffects([effect], {
          caster: spirit.combatant,
          target: combatant,
          rng: this.#rng,
          rules: this.#ruleset.combat,
          surroundings: this.#participants,
        }),
      );
    }
    return events;
  }

  /**
   * Pestilence (#1886): each of `conditions`, what `victim` bore as it
   * died, lands on every living non-spirit within `radius` of the corpse
   * that bears a condition already, read before any lands.
   */
  #pestilence(
    victim: ParticipantRecord,
    conditions: readonly ActiveStatus[],
    radius: number,
  ): CombatEvent[] {
    const events: CombatEvent[] = [];
    if (conditions.length === 0) {
      return events;
    }
    const reached = [...this.#participants.values()].filter(
      ({ combatant, creature, position, floors }) =>
        !combatant.dead &&
        creature?.kind !== "spirit" &&
        sharesFloor(floors, floorOf(victim.layer)) &&
        distance(position, victim.position) <= radius &&
        combatant.statuses.active.some(
          ({ id }) => getStatusDefinition(id).category === "condition",
        ),
    );
    for (const { combatant } of reached) {
      for (const condition of conditions) {
        landCaughtCondition(combatant, condition, events, this.#participants);
      }
    }
    return events;
  }

  /**
   * A spirit or minion that died or was destroyed: it leaves at the end of
   * the step, unless it lies as corpses to exploit (#1836), and its
   * replacement, if it has one, stands up there after it.
   */
  #creatureFell(record: ParticipantRecord): void {
    const creature = record.creature;
    if (creature === undefined) {
      return;
    }
    if (creature.corpsesLeft <= 0) {
      this.#leaving.add(record.id);
    }
    if (creature.replacedBy !== undefined && creature.ownerId !== undefined) {
      this.#replacements.push({
        ownerId: creature.ownerId,
        skillId: creature.skillId ?? "",
        ...creature.replacedBy,
        at: record.position,
        ranks: undefined,
      });
    }
  }

  /**
   * What its statuses stand up where `record`, a creature, died (#1986):
   * Jagged Bones's horror, its owner's, at its caster's ranks, beside
   * the creature's own replacement.
   */
  #replaceOnDeath(record: ParticipantRecord, replacedOnDeath: readonly ReplacedOnDeath[]): void {
    const ownerId = record.creature?.ownerId;
    if (ownerId === undefined) {
      return;
    }
    for (const { creature, count, ranks, masterless } of replacedOnDeath) {
      if (masterless === true) {
        continue;
      }
      this.#replacements.push({
        ownerId,
        skillId: record.creature?.skillId ?? "",
        creature,
        count,
        at: record.position,
        ranks,
      });
    }
  }

  /**
   * What rises masterless where `record` died (#2092): Malign
   * Intervention's horror, at its caster's ranks, whoever the bearer was,
   * a player or a creature. Its corpse is not spent.
   */
  #riseMasterless(record: ParticipantRecord, replacedOnDeath: readonly ReplacedOnDeath[]): void {
    for (const { creature, count, ranks, masterless, skillId } of replacedOnDeath) {
      if (masterless === true) {
        this.#replacements.push({
          ownerId: undefined,
          skillId: skillId ?? "",
          creature,
          count,
          at: record.position,
          ranks,
        });
      }
    }
  }

  /**
   * Who stands up where a minion fell this step (#1836), once the fallen
   * have left, so there is room: its owner's, unless its owner is dead or
   * gone; a masterless one regardless (#2092). As many as `MAX_CREATURES`
   * leaves room for, past no cap.
   */
  #replaceFallen(): void {
    const replacements = this.#replacements.splice(0);
    for (const { ownerId, skillId, creature, count, at, ranks } of replacements) {
      if (ownerId === undefined) {
        this.#summonMasterless(creature, count, at, ranks ?? new Map(), skillId);
        continue;
      }
      const owner = this.#participants.get(ownerId);
      if (owner !== undefined && !owner.combatant.dead) {
        this.#summon(
          owner,
          skillId,
          creature,
          count,
          at,
          false,
          true,
          ranks ?? ranksOf(owner.combatant),
        );
      }
    }
  }

  /**
   * A pet's death disables its owner's whole bar (#1046, fandom "Beast
   * Mastery"), alive or dead, unless it was resurrected less than
   * `PET_DEATH_GRACE_SECONDS` ago. Alongside any recharge, the longer wins.
   */
  #companionDied(victim: ParticipantRecord, creature: Creature): void {
    if (
      creature.ownerDisableSeconds <= 0 ||
      this.#elapsedSeconds - victim.resurrectedAtSeconds < PET_DEATH_GRACE_SECONDS
    ) {
      return;
    }
    const owner =
      creature.ownerId === undefined ? undefined : this.#participants.get(creature.ownerId);
    if (owner === undefined) {
      return;
    }
    // A copy standing in a slot (#469) waits under its own key; the skill
    // it hides is disabled too, for when the copy ends.
    const keys = new Set<string>();
    for (const skillId of owner.skillBar) {
      if (skillId !== null) {
        keys.add(skillId);
      }
    }
    for (const slot of resolvedBar(owner.skillBar, owner.combatant.cast)) {
      if (slot !== null) {
        keys.add(slot.key);
      }
    }
    for (const key of keys) {
      owner.combatant.cast.disable(key, creature.ownerDisableSeconds);
    }
  }

  /**
   * Soul Reaping (#530): every living Necromancer within spirit range of
   * `victim` gains its rank in energy, up to its maximum, at most 3 times
   * in any 15 s. The victim's own rank does nothing: it is dead.
   */
  #reapSoul(victim: ParticipantRecord): void {
    for (const record of this.#participants.values()) {
      const { combatant } = record;
      const rank = rankOf(combatant, SOUL_REAPING_ATTRIBUTE);
      if (
        rank <= 0 ||
        combatant.dead ||
        !distanceWithinRange(record.position, victim.position, RANGE_SPIRIT)
      ) {
        continue;
      }
      const triggers = soulReapingTrigger(combatant.soulReapingTriggers, this.#elapsedSeconds);
      if (triggers !== undefined) {
        combatant.soulReapingTriggers = triggers;
        const events: CombatEvent[] = [];
        gainEnergy(combatant, soulReapingEnergy(rank), events);
        if (events.length > 0) {
          this.#reaped.push({
            tick: this.#tick,
            atSeconds: this.#elapsedSeconds,
            cause: "attribute",
            sourceId: record.id,
            skillId: undefined,
            weaponId: undefined,
            attributeId: SOUL_REAPING_ATTRIBUTE,
            area: undefined,
            doubleStrike: false,
            events,
          });
        }
      }
    }
  }

  /** Every chain mark on `record` goes, and every one it placed (#831). */
  #clearChainMarks(record: ParticipantRecord): void {
    clearChainMarksOn(
      [...this.#participants.values()].map(({ combatant }) => combatant),
      record.id,
    );
  }

  /** Count `combatant`'s knockdown down by `dt`, to exactly 0 at the end. */
  #advanceKnockdown(combatant: Combatant, dt: number): void {
    if (combatant.knockdownRemaining > 0) {
      combatant.knockdownRemaining -= dt;
      if (combatant.knockdownRemaining <= KNOCKDOWN_EPSILON) {
        combatant.knockdownRemaining = 0;
      }
    }
  }

  /** Count `combatant`'s invulnerability (#1208) down by `dt`, to exactly 0 at the end. */
  #advanceInvulnerability(combatant: Combatant, dt: number): void {
    if (combatant.invulnerableRemaining > 0) {
      combatant.invulnerableRemaining -= dt;
      if (combatant.invulnerableRemaining <= KNOCKDOWN_EPSILON) {
        combatant.invulnerableRemaining = 0;
      }
    }
  }

  /**
   * Everyone knocked down in `events` stops where they are (#468): the
   * skill effect already ended their cast and attack; this drops what
   * only the simulation keeps, a walk and a skill walking in. Neither
   * comes back on rising. A held direction stays: it is the keyboard's
   * state, not an action, and walks again on rising.
   */
  #recordKnockdowns(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "knocked-down") {
        continue;
      }
      const victim = this.#participants.get(event.targetId);
      if (victim !== undefined) {
        victim.walkGoal = undefined;
        victim.pendingSkill = undefined;
      }
    }
  }

  /**
   * Every shadow step in `events` (#988) puts its caster beside its
   * target, and every teleport (#474) its target beside whom it names,
   * where that one stands now: touching it, on the side the caster came
   * from, or behind it when the two stood on one spot. With a wall between
   * the target and that spot, on the target, and the push-outs move it
   * clear as they do a walk; the doorway rule does not hold, since a step
   * is not a walk. It faces the target, and nothing reads the step as a
   * run: its track starts over, and it did not walk this step. An attack
   * and a skill walking in stay. A step away (#1326) is `#stepAway`'s. A
   * swap (#1930) is `#swap`'s, unless its creature died since. A shadow
   * step drops its caster's ashes first, where it stood (#1434).
   */
  #recordSteps(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind === "shadow-stepped-away") {
        const record = this.#participants.get(event.targetId);
        if (record !== undefined) {
          this.#dropAshes(record);
          this.#stepAway(record);
        }
        continue;
      }
      if (event.kind === "shadow-swapped") {
        const record = this.#participants.get(event.targetId);
        const other = this.#participants.get(event.withId);
        if (record !== undefined && other !== undefined && !other.combatant.dead) {
          this.#dropAshes(record);
          this.#swap(record, other);
        }
        continue;
      }
      if (event.kind === "companion-stepped") {
        const pet = this.#participants.get(event.targetId);
        const foe = this.#participants.get(event.toId);
        if (pet !== undefined && foe !== undefined && !foe.combatant.dead) {
          this.#stepBeside(pet, foe);
          // As an armed pet attack's (#1865): a pet at heel only moves.
          if (pet.creature?.mode !== "heel" && pet.behaviour?.kind === "follow-and-attack") {
            this.requestAttack(pet.id, foe.id);
          }
        }
        continue;
      }
      if (event.kind !== "shadow-stepped" && event.kind !== "teleported") {
        continue;
      }
      const record = this.#participants.get(event.targetId);
      const target = this.#participants.get(event.toId);
      if (record === undefined || target === undefined) {
        continue;
      }
      // A shadow step drops the ashes where it began (#1434); a teleport is no step.
      if (event.kind === "shadow-stepped") {
        this.#dropAshes(record);
      }
      this.#stepBeside(record, target);
    }
  }

  /** Put `record` beside `target`, facing it, as `#recordSteps` describes. */
  #stepBeside(record: ParticipantRecord, target: ParticipantRecord): void {
    const radius = this.#ruleset.collision.playerRadius;
    const away =
      distance(record.position, target.position) > 0
        ? normalize(sub(record.position, target.position))
        : vec2(-Math.cos(target.facing), -Math.sin(target.facing));
    const beside = add(target.position, scale(away, 2 * radius));
    this.#placeAt(
      record,
      hasLineOfSight(target.position, beside, this.#blockersOn(record.layer))
        ? beside
        : target.position,
    );
    faceToward(record, target.position);
  }

  /**
   * Swap (#1930): `record` and `other` trade places exactly, each facing
   * the other after. The one moved first stands on the other's old spot
   * only for the push-outs of the second, which see the two as far apart
   * as they were.
   */
  #swap(record: ParticipantRecord, other: ParticipantRecord): void {
    const from = record.position;
    const to = other.position;
    other.position = from;
    this.#refreshFloors(other);
    this.#placeAt(record, to);
    this.#placeAt(other, from);
    faceToward(record, other.position);
    faceToward(other, record.position);
  }

  /**
   * Put `record` at `point`, as a step does: the push-outs settle it off
   * any body or wall, and its track starts over. Its facing is the
   * caller's.
   */
  #placeAt(record: ParticipantRecord, point: Vec2): void {
    const radius = this.#ruleset.collision.playerRadius;
    let position = point;
    for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
      const relaxed = this.#pushOut(record, position, radius, NOBODY);
      const settled = relaxed.x === position.x && relaxed.y === position.y;
      position = relaxed;
      if (settled) {
        break;
      }
    }
    record.position = position;
    this.#refreshFloors(record);
    record.walkGoal = undefined;
    record.route = undefined;
    record.history.clear();
    this.#stepStart.set(record.id, position);
  }

  /**
   * A status that ends everywhere when spent negated a fatal blow on
   * `record` (#1955): every other copy its source put up ends, Angelic
   * Bond's "then it ends on all other allies".
   */
  #endEverywhere(record: ParticipantRecord, change: StatusChange): void {
    if (
      change.kind !== "fatal-negated" ||
      !getStatusDefinition(change.statusId).endsEverywhereWhenSpent
    ) {
      return;
    }
    for (const other of this.#participants.values()) {
      if (
        other !== record &&
        other.combatant.statuses.get(change.statusId)?.sourceId === change.sourceId
      ) {
        other.combatant.statuses.end(change.statusId);
      }
    }
  }

  /**
   * A returning status ended (#1826): its source, alive, Shadow Steps back
   * to where it put it up, ashes dropped first, facing kept, and the step
   * logged as that status's skill.
   */
  #returnSource(change: StatusChange): void {
    if (change.kind !== "ended" || change.returnPoint === null) {
      return;
    }
    const source = this.#participants.get(change.sourceId);
    const returns = STATUS_DEFINITIONS[change.id].returnsSource;
    if (source === undefined || source.combatant.dead || returns === undefined) {
      return;
    }
    this.#dropAshes(source);
    this.#placeAt(source, change.returnPoint);
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: source.id,
      skillId: returns.skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events: [{ kind: "shadow-stepped-back", targetId: source.id }],
    });
  }

  /**
   * A status that steps to its ally ended (#1930), Recall's: its source
   * Shadow Steps beside that ally, ashes dropped first, and all its skills
   * are disabled, logged as the status's skill. Either of the two dead, or
   * gone: nothing.
   */
  #stepToTarget(change: StatusChange): void {
    if (change.kind !== "ended" || change.stepTargetId === null) {
      return;
    }
    const steps = STATUS_DEFINITIONS[change.id].stepsToTarget;
    const source = this.#participants.get(change.sourceId);
    const ally = this.#participants.get(change.stepTargetId);
    if (
      steps === undefined ||
      source === undefined ||
      ally === undefined ||
      source.combatant.dead ||
      ally.combatant.dead
    ) {
      return;
    }
    this.#dropAshes(source);
    this.#stepBeside(source, ally);
    const disabled = disableOwnSkills(
      source.combatant,
      { kind: "disable-own-skills", which: "all", seconds: { flat: steps.disableSeconds } },
      steps.skillId,
    );
    this.#log.push({
      tick: this.#tick,
      atSeconds: this.#elapsedSeconds,
      cause: "skill",
      sourceId: source.id,
      skillId: steps.skillId,
      weaponId: undefined,
      attributeId: undefined,
      area: undefined,
      doubleStrike: false,
      events: [{ kind: "shadow-stepped", targetId: source.id, toId: ally.id }, ...disabled],
    });
  }

  /**
   * A shadow step directly away from what `record` has selected (#1326),
   * as Heart of Shadow's: `SHADOW_STEP_AWAY_DISTANCE` along the line from
   * the selection, alive or dead, ally or foe, where it stands now. A wall
   * on the way stops it a unit short, on the near side, and the push-outs
   * settle it as they do any step. It keeps its facing, and its track
   * starts over. Nothing selected, itself selected, or the two on one spot:
   * no step.
   */
  #stepAway(record: ParticipantRecord): void {
    const selection =
      record.targetId === undefined ? undefined : this.#participants.get(record.targetId);
    if (
      selection === undefined ||
      selection.id === record.id ||
      distance(record.position, selection.position) === 0
    ) {
      return;
    }
    const from = record.position;
    const away = normalize(sub(from, selection.position));
    const goal = add(from, scale(away, SHADOW_STEP_AWAY_DISTANCE));
    const impact = firstHit(from, goal, this.#blockersOn(record.layer));
    const position =
      impact === undefined
        ? goal
        : distance(from, impact) <= 1
          ? from
          : add(impact, scale(normalize(sub(from, impact)), 1));
    this.#placeAt(record, position);
  }

  /**
   * The fresh corpse nearest `record`, or its `target` under a rule that
   * names it (#1583), within the rule's radius; `undefined` for none, or
   * for no target to look round.
   */
  #freshCorpse(
    record: ParticipantRecord,
    rule: CorpseRule,
    target: ParticipantRecord | undefined,
  ): ParticipantRecord | undefined {
    const centre = rule.near === "target" ? target : record;
    return centre === undefined
      ? undefined
      : nearestFreshCorpse(
          centre.position,
          floorOf(centre.layer),
          rule.radius,
          this.#participants.values(),
        );
  }

  /**
   * Marks the corpse `#freshCorpse` finds as exploited (#466) and returns
   * it; `undefined` for none. Wells and minions (#466, #467) will want
   * its position. A random pick (#2268) draws among every fresh corpse in
   * reach, in their nearest-first order, with the match's rng: the same
   * seed, the same corpse.
   */
  #exploitCorpse(
    record: ParticipantRecord,
    rule: CorpseRule,
    target: ParticipantRecord | undefined,
  ): ParticipantRecord | undefined {
    const reach =
      rule.pick === "random"
        ? freshCorpsesWithin(
            record.position,
            floorOf(record.layer),
            rule.radius,
            this.#participants.values(),
          )
        : undefined;
    const corpse =
      reach === undefined
        ? this.#freshCorpse(record, rule, target)
        : reach.length === 0
          ? undefined
          : reach[this.#rng.nextInt(0, reach.length)];
    if (corpse !== undefined) {
      this.#markExploited(corpse);
    }
    return corpse;
  }

  /**
   * Marks every fresh corpse within the rule's radius of `record` as
   * exploited (#1915), once each, and returns them, nearest first.
   */
  #exploitEveryCorpse(record: ParticipantRecord, rule: CorpseRule): ParticipantRecord[] {
    const corpses = freshCorpsesWithin(
      record.position,
      floorOf(record.layer),
      rule.radius,
      this.#participants.values(),
    );
    for (const corpse of corpses) {
      this.#markExploited(corpse);
    }
    return corpses;
  }

  /** One corpse of `corpse`'s used up (#466). */
  #markExploited(corpse: ParticipantRecord): void {
    if (corpse.creature !== undefined) {
      // A Flesh Golem's (#1836) is several, and it goes with the last.
      corpse.creature.corpsesLeft -= 1;
      if (corpse.creature.corpsesLeft <= 0) {
        this.#leaving.add(corpse.id);
      }
    } else {
      corpse.corpseExploited = true;
    }
  }

  /**
   * Every resurrection in `events` (#812) cancels its respawn timer. The
   * body stays where it fell, and what its death cleared stays clear.
   */
  #recordResurrections(events: readonly CombatEvent[]): void {
    for (const event of events) {
      if (event.kind !== "resurrected") {
        continue;
      }
      const record = this.#participants.get(event.targetId);
      if (record !== undefined) {
        record.respawnInSeconds = 0;
        record.outOfCombatSeconds = 0;
        record.resurrectedAtSeconds = this.#elapsedSeconds;
        record.swapHealthDebt = 0;
        record.corpseExploited = false;
      }
    }
  }

  /** Where `record` respawns: its spawn, or the altar its team holds in the Halls' King of the Hill (#2700). */
  #respawnPlace(record: ParticipantRecord): Vec2 {
    const altar = this.#ghostField?.altar;
    return altar !== undefined &&
      record.creature === undefined &&
      this.#matchRules?.respawnOnWave === true &&
      this.#altarState.holder === record.combatant.team
      ? altar
      : record.spawn;
  }

  /**
   * How long `record` stays dead: its own `on-death` reset if it has one,
   * else the match rules'. Without match rules, or under
   * `"resurrection-only"` (#843), nobody respawns: infinity never counts
   * down to 0.
   */
  #respawnSeconds(record: ParticipantRecord): number {
    if (record.spec.reset?.kind === "on-death") {
      return record.spec.reset.afterSeconds;
    }
    if (this.#matchRules?.deathRule !== "respawn") {
      return Number.POSITIVE_INFINITY;
    }
    const { respawnSeconds, respawnOnWave } = this.#matchRules;
    return respawnOnWave
      ? respawnSeconds - (this.#elapsedSeconds % respawnSeconds)
      : respawnSeconds;
  }

  /**
   * The death penalty (#843, GW1): with `deathPenalty` on, `victim` loses
   * 15% morale, down to −60%, unless it was resurrected less than 5 s ago;
   * its foes' +2% waits for the end of the step. A companion's death
   * costs it the same but gives its foes nothing (#1133): it is no player.
   */
  #deathPenalty(victim: ParticipantRecord): void {
    if (this.#matchRules?.deathPenalty !== true) {
      return;
    }
    if (countsForTeam(victim)) {
      this.#moraleKills.push(victim.combatant.team);
    }
    if (this.#elapsedSeconds - victim.resurrectedAtSeconds < DP_GRACE_AFTER_RES_SECONDS) {
      return;
    }
    this.#setMorale(
      victim,
      Math.max(MORALE_FLOOR, victim.combatant.morale - DEATH_PENALTY_PERCENT),
    );
  }

  /**
   * Every death this step gives each living foe in the death penalty 2%
   * back, up to 0 (#843): a kill never boosts. Of creatures, only a
   * companion has morale (#1133).
   */
  #awardKillMorale(): void {
    for (const team of this.#moraleKills) {
      for (const record of this.#participants.values()) {
        const { combatant } = record;
        if (
          combatant.team !== team &&
          !combatant.dead &&
          combatant.morale < 0 &&
          hasMorale(record)
        ) {
          this.#setMorale(record, Math.min(0, combatant.morale + KILL_MORALE_PERCENT));
        }
      }
    }
    this.#moraleKills = [];
  }

  /**
   * A foe team's Ghostly Hero killed (#2689): `killerTeam`, its last
   * foe's to hit it, a minion's its master's, gets a morale boost.
   * Nobody's, as a masterless minion's, gets none.
   */
  #ghostKilled(killerTeam: number | undefined): void {
    if (killerTeam !== undefined && killerTeam !== MASTERLESS_TEAM) {
      this.moraleBoost(killerTeam, GHOST_MORALE_BOOST);
    }
  }

  /**
   * A morale boost (GvG's flag stand, HA's ghost): `amount` percent to
   * every member of `team`, dead or alive, up to +10%, companions too but no
   * other creature (#1052, #1133). Not capped at 0,
   * so it lifts a death penalty too. It readies every skill spent until a
   * morale boost (#474), at +10% too.
   */
  public moraleBoost(team: number, amount: number): void {
    for (const record of this.#participants.values()) {
      if (record.combatant.team === team && hasMorale(record)) {
        this.#setMorale(record, Math.min(MORALE_CEILING, record.combatant.morale + amount));
        record.combatant.cast.refreshSpent();
      }
    }
  }

  /**
   * Set `record`'s morale and the maxima that follow it (GW1: on the base,
   * before upgrades; a creature has none, so its base is its own). A drop
   * clamps health and energy to the new ceilings; a rise leaves them where
   * they are.
   */
  #setMorale(record: ParticipantRecord, morale: number): void {
    const { combatant } = record;
    const { baseHealth, baseEnergy } =
      record.creature === undefined
        ? this.#ruleset.combat
        : { baseHealth: record.resolvedMaxHealth, baseEnergy: record.resolvedMaxEnergy };
    combatant.morale = morale;
    combatant.maxHealth = moraleMaximum(baseHealth, record.resolvedMaxHealth, morale);
    combatant.maxEnergy = moraleMaximum(baseEnergy, record.resolvedMaxEnergy, morale);
    combatant.health = Math.min(combatant.health, effectiveMaxHealth(combatant));
    combatant.energy = Math.max(
      energyFloor(combatant),
      Math.min(combatant.energy, effectiveMaxEnergy(combatant)),
    );
  }

  /**
   * Whether a swap must wait (#489): GW1 changes no equipment during a
   * skill's activation or an attack's swing, and a knocked-down body takes
   * no action. An attack paused out of reach with a swing begun waits for
   * its next blow; moving or Esc ends the attack, and the swap with it.
   */
  #swapBlocked(record: ParticipantRecord): boolean {
    const { combatant } = record;
    return (
      combatant.knockdownRemaining > 0 ||
      combatant.cast.isCasting ||
      combatant.cast.inAftercast ||
      (combatant.attack !== undefined && combatant.attack.swingElapsed > 0)
    );
  }

  /** Take a queued swap if nothing blocks it any more (#489). */
  #settleWeaponSwap(record: ParticipantRecord): void {
    const set = record.pendingWeaponSet;
    if (set !== undefined && !record.combatant.dead && !this.#swapBlocked(record)) {
      this.#swapWeapons(record, set);
    }
  }

  /**
   * Put `set` in hand (#489): the only writer of `combatant.equipment`.
   * Maximum energy becomes the set's, and current energy moves by the
   * same amount, below 0 if it must (GW1's hidden energy, ADR-0036).
   * Maximum health and regeneration follow the set's mods (#2007);
   * health moves like energy but never below 1: a swap does not kill, and
   * what that floor held back is owed to the next swap up.
   * `moraleMaximum` is linear, so the move is the sets' difference at any
   * morale. An attack in progress swings afresh with the new weapon.
   */
  #swapWeapons(record: ParticipantRecord, set: WeaponSetIndex): void {
    const held = record.weaponSets[set];
    if (held === null) {
      return;
    }
    const { combatant } = record;
    const before = combatant.maxEnergy;
    // Read raised: Energy Boon hangs Health on the set's Energy (#2503).
    const healthBefore = raisedMaxHealth(combatant);
    record.activeWeaponSet = set;
    record.pendingWeaponSet = undefined;
    combatant.equipment = held.equipment;
    combatant.baseEnergyPips = held.baseEnergyPips;
    record.resolvedMaxEnergy = held.maxEnergy;
    combatant.maxEnergy = moraleMaximum(
      this.#ruleset.combat.baseEnergy,
      record.resolvedMaxEnergy,
      combatant.morale,
    );
    combatant.energy += combatant.maxEnergy - before;
    record.resolvedMaxHealth = held.maxHealth;
    combatant.maxHealth = moraleMaximum(
      this.#ruleset.combat.baseHealth,
      record.resolvedMaxHealth,
      combatant.morale,
    );
    const change = raisedMaxHealth(combatant) - healthBefore;
    if (change >= 0) {
      const repaid = Math.min(record.swapHealthDebt, change);
      record.swapHealthDebt -= repaid;
      combatant.health += change - repaid;
    } else {
      const health = Math.max(Math.min(1, combatant.health), combatant.health + change);
      record.swapHealthDebt += health - (combatant.health + change);
      combatant.health = health;
    }
    if (combatant.attack !== undefined) {
      combatant.attack.swingElapsed = 0;
    }
  }

  /** Whether `record`'s reset policy, other than `on-death`, calls for a reset now. */
  #resetDue(record: ParticipantRecord, dt: number): boolean {
    const policy = record.spec.reset;
    record.sinceReset += dt;
    switch (policy?.kind) {
      case "on-interval":
        return record.sinceReset >= policy.everySeconds;
      case "below-health":
        return record.combatant.health < raisedMaxHealth(record.combatant) * policy.fraction;
      case "on-death":
      case "never":
      case undefined:
        return false;
    }
  }

  /**
   * Credit a kill to the team that scored it; the step checks for a winner
   * once every death in it is in.
   *
   * The victim's team is what is known at the point of death, so a kill
   * is credited to "the other team" rather than to a specific killer.
   * Attributing kills to individuals needs damage-source tracking, which
   * is honest future work rather than something to fake here.
   */
  private recordDeath(victimTeam: number): void {
    if (this.phase !== "active") {
      return;
    }
    // A Relic Run's score is its relic points (#1374), King of the Hill's
    // its points for the altar (#1377), Capture Points' its shrine points
    // (#1378): a kill is none.
    if (
      this.#matchRules?.victory === "relic-run" ||
      this.#matchRules?.victory === "king-of-the-hill" ||
      this.#matchRules?.victory === "capture-points"
    ) {
      return;
    }
    // Kill count is two teams only (`TWO_TEAM_MODES`): the kill is the other's.
    const scoringTeam = victimTeam === 0 ? 1 : 0;
    this.#score = addPoint(this.#score, scoringTeam);
  }

  /**
   * Every team that had members, or has a Guild Lord (#1222): who is alive,
   * its total morale (#846), and its lord's and its aggression; creatures
   * are not members (#1052).
   */
  #standing(): MatchStanding {
    const teams = new Set([...this.#teams, ...this.#guildLordTeams]);
    const members = new Map<
      number,
      { members: number; living: number; morale: number; raisable: number }
    >([...teams].map((team) => [team, { members: 0, living: 0, morale: 0, raisable: 0 }]));
    for (const record of this.#participants.values()) {
      if (!countsForTeam(record)) {
        continue;
      }
      const { combatant } = record;
      const team = members.get(combatant.team) ?? { members: 0, living: 0, morale: 0, raisable: 0 };
      team.members += 1;
      team.living += combatant.dead ? 0 : 1;
      team.morale += combatant.morale;
      team.raisable += combatant.dead && combatant.morale <= MORALE_FLOOR ? 0 : 1;
      members.set(combatant.team, team);
    }
    const byTeam = new Map<number, TeamStanding>();
    for (const [team, { members: count, living, morale, raisable }] of members) {
      byTeam.set(team, {
        members: count + (this.#awaitedTeams.has(team) ? 1 : 0),
        living,
        morale,
        priestLives: this.#priestLives(team),
        guildLordLives: this.#guildLordLives(team),
        beyondRaising: this.#teams.has(team) && raisable === 0,
        aggression: this.#aggression.get(team) ?? 0,
        ledAtSeconds: this.#ledAt.get(team),
        pointsHeld: this.#capturePoints.filter((point) => point.owner === team).length,
        eliminated: this.#eliminated.has(team),
      });
    }
    return {
      byTeam,
      recentKillTeams: this.#recentKillTeams,
      recentScoringTeams: this.#recentScoringTeams,
    };
  }

  /**
   * As each whole second of match clock starts, every Guild Lord's cap
   * on its Health loss refills to that second's (#1223).
   */
  #refillLossCaps(): void {
    const second = Math.floor(this.#elapsedSeconds + WHOLE_SECOND_EPSILON);
    if (second === this.#lossSecond) {
      return;
    }
    this.#lossSecond = second;
    for (const record of this.#participants.values()) {
      const guard = record.combatant.lossGuard;
      if (guard === undefined) {
        continue;
      }
      guard.remaining = guildLordLossCap(second);
    }
  }

  /** Whether `team`'s Guild Lord is in the match and alive (#1222). */
  #guildLordLives(team: number): boolean {
    const lord = this.#participants.get(guildLordId(team));
    return lord !== undefined && !lord.combatant.dead && !this.#leaving.has(lord.id);
  }

  /** Whether the shrines raise with no priest: a Guild Battle's (#1222), a Capture Points base's (#2845), a Relic Run's where a ghost takes the relic (#2695). */
  #shrinesRaiseAlone(): boolean {
    const victory = this.#matchRules?.victory;
    return (
      victory === "guild-battle" ||
      victory === "capture-points" ||
      this.#relicField?.relicTarget === "own-ghost"
    );
  }

  /** Seconds of match clock between the shrines' waves. */
  #waveSeconds(): number {
    return this.#matchRules?.victory === "capture-points"
      ? CAPTURE_WAVE_SECONDS
      : PRIEST_WAVE_SECONDS;
  }

  /**
   * Add this step's damage to a Guild Lord to the aggression of the team
   * that dealt it (#1222, GW1): direct damage after armor, a creature's
   * for its own team, which is its owner's. Degeneration is not counted,
   * nor life stealing, which is not damage. Before the step's leavers go,
   * so a creature's last blow still has a team.
   */
  #tallyAggression(): void {
    if (this.#guildLordTeams.size === 0) {
      return;
    }
    for (const entry of [...this.#log, ...this.#reaped]) {
      if (entry.cause === "degeneration" || entry.sourceId === undefined) {
        continue;
      }
      const team = this.#participants.get(entry.sourceId)?.combatant.team;
      // A masterless minion's blows are no side's (#2092).
      if (team === undefined || team === MASTERLESS_TEAM) {
        continue;
      }
      for (const event of entry.events) {
        const lord = this.#participants.get(event.targetId);
        if (
          event.kind === "damage" &&
          lord?.creature?.kind === "guild-lord" &&
          lord.combatant.team !== team
        ) {
          this.#aggression.set(team, (this.#aggression.get(team) ?? 0) + event.amount);
        }
      }
    }
  }

  /**
   * Every team beaten as it stands, as the match's victory counts it, is
   * out for the rest of the match (#2682): with three teams the match goes
   * on past it, and neither a wave nor the clock brings it back.
   */
  #eliminateBeaten(): void {
    const rules = this.#matchRules;
    if (rules === undefined) {
      return;
    }
    for (const [team, standing] of this.#standing().byTeam) {
      if (teamBeaten(standing, rules)) {
        this.#eliminated.add(team);
      }
    }
  }

  /** Whether `team`'s priest is in the match and alive (#1186). */
  #priestLives(team: number): boolean {
    const priest = this.#participants.get(priestId(team));
    return priest !== undefined && !priest.combatant.dead && !this.#leaving.has(priest.id);
  }

  /**
   * The priests' wave (#1186, GW1): at every `PRIEST_WAVE_SECONDS` of match
   * clock, each living priest raises its team's dead players above
   * `MORALE_FLOOR` on its shrine, at full Health and Energy, their morale
   * kept. After the step's deaths, so a priest killed this tick raises
   * nobody. A creature is never raised, a companion neither, but for
   * the Ghostly Hero (#2839), back at its spawn, unlogged and uncounted.
   * In a Guild Battle (#1222) every shrine raises, with no priest at all;
   * in Capture Points too, every `CAPTURE_WAVE_SECONDS` (#2845).
   */
  #priestWave(): void {
    const due = (this.#priestWaves + 1) * this.#waveSeconds();
    if (this.#shrines.length === 0 || this.#elapsedSeconds + SWING_EPSILON < due) {
      return;
    }
    this.#priestWaves += 1;
    const alone = this.#shrinesRaiseAlone();
    for (const shrine of this.#shrines) {
      if (this.#eliminated.has(shrine.team) || (!alone && !this.#priestLives(shrine.team))) {
        continue;
      }
      const events: CombatEvent[] = [];
      for (const record of this.#participants.values()) {
        const { combatant } = record;
        if (
          record.creature?.kind === "ghostly-hero" &&
          combatant.team === shrine.team &&
          combatant.dead
        ) {
          this.#reset(record, "respawn");
          continue;
        }
        if (
          !countsForTeam(record) ||
          combatant.team !== shrine.team ||
          !combatant.dead ||
          combatant.morale <= MORALE_FLOOR
        ) {
          continue;
        }
        this.#raiseAtShrine(record, shrine);
        events.push({
          kind: "resurrected",
          targetId: record.id,
          healthFraction: 1,
          energyFraction: 1,
        });
      }
      if (events.length === 0) {
        continue;
      }
      this.#log.push({
        tick: this.#tick,
        atSeconds: this.#elapsedSeconds,
        cause: "skill",
        sourceId: alone ? undefined : priestId(shrine.team),
        skillId: undefined,
        weaponId: undefined,
        attributeId: undefined,
        area: undefined,
        doubleStrike: false,
        events,
      });
      this.#recordResurrections(events);
    }
  }

  /**
   * `record` back from the dead on a shrine at `at`, pushed clear as anyone
   * is (#1186), and invulnerable for its first seconds (#1208).
   */
  #raiseAtShrine(record: ParticipantRecord, shrine: Shrine): void {
    const { combatant } = record;
    combatant.statuses.clear();
    combatant.dead = false;
    combatant.health = effectiveMaxHealth(combatant);
    record.swapHealthDebt = 0;
    combatant.invulnerableRemaining = SHRINE_INVULNERABLE_SECONDS;
    combatant.energy = Math.max(0, effectiveMaxEnergy(combatant));
    emptyAdrenaline(combatant);
    record.layer = shrine.layer ?? this.#ground;
    let position = nearestStandable(this.#graphOn(record.layer), shrine.position);
    for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
      position = this.#pushOut(record, position, this.#radiusOf(record), NOBODY);
    }
    record.position = position;
    this.#refreshFloors(record);
    record.inputDirection = ZERO;
    record.history.clear();
    this.#stepStart.set(record.id, position);
  }

  private checkMatchEnd(): void {
    if (this.#matchRules === undefined) {
      return;
    }
    const outcome = evaluateMatch(
      this.#score,
      this.#standing(),
      this.#elapsedSeconds,
      this.#matchRules,
    );
    if (outcome.phase !== "finished") {
      return;
    }
    // Only the Elite Zaishen Battle has a start line, and it is won only by
    // killing all six (#2933): annihilation's other ending is the time limit.
    this.#outcome =
      this.#startLine !== undefined && outcome.reason !== "annihilation"
        ? { phase: "finished", winningTeam: 1, reason: "time" }
        : outcome;
  }

  private advanceMovement(record: ParticipantRecord, direction: Vec2, dt: number): void {
    // A spirit stands where it was planted (#1064), a priest on its
    // shrine (#1186), a Guild Lord at its post (#1222): nothing moves it, and bodies are pushed out of it,
    // never it out of them.
    if (
      record.creature?.kind === "spirit" ||
      record.creature?.kind === "priest" ||
      record.creature?.kind === "guild-lord"
    ) {
      return;
    }
    // Where it pushes, even into a wall.
    if (direction.x !== 0 || direction.y !== 0) {
      record.facing = directionAngle(direction.x, direction.y);
    }
    const radius = this.#radiusOf(record);
    const start = record.position;
    let position = integrateMovement(
      start,
      direction,
      this.#ruleset.movement.maxSpeedUnitsPerSecond * this.#speedOf(record),
      dt,
    );

    // A minion or pet of its own the body already stands in, as one
    // raised at its feet, lets it step off in any direction unshoved
    // (#1278); once apart, it blocks again. The doorway rule below still
    // holds, so the step can only lead out of it.
    const ownedOverlaps = new Set<string>();
    for (const [otherId, other] of this.#participants) {
      if (
        other.creature?.ownerId === record.id &&
        !other.combatant.dead &&
        penetration(start, other.position, radius + this.#radiusOf(other)) > 0
      ) {
        ownedOverlaps.add(otherId);
      }
    }

    // One push-out pass at a time, until a pass changes nothing. Squeezed
    // between a body and a wall, each push undoes the other, so one pass
    // alone can leave a body anywhere; a few settle it.
    for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
      const relaxed = this.#pushOut(record, position, radius, ownedOverlaps);
      const settled = relaxed.x === position.x && relaxed.y === position.y;
      position = relaxed;
      if (settled) {
        break;
      }
    }

    // A doorway a body stands in stays held (#291): a move that ends any
    // deeper inside a living body than it started is refused, so hugging
    // the wall never squeezes past. Per body and against the start, so two
    // bodies that already overlap (a shared spawn) can still move apart.
    for (const [otherId, other] of this.#participants) {
      if (
        otherId === record.id ||
        other.layer !== record.layer ||
        other.combatant.dead ||
        this.#walksThrough(record, other)
      ) {
        continue;
      }
      const reach = radius + this.#radiusOf(other);
      if (
        penetration(position, other.position, reach) >
        penetration(start, other.position, reach) + 1e-6
      ) {
        return;
      }
    }

    const moved = position.x !== start.x || position.y !== start.y;
    record.position = position;
    if (moved) {
      this.#refreshFloors(record);
      this.#climb(record, direction);
    }
  }

  /**
   * A spirit is no body to its own team (#1278), as in GW1: allies, their
   * pets and minions walk through it; foes are blocked by it.
   */
  #ownSpirit(mover: ParticipantRecord, other: ParticipantRecord): boolean {
    return other.creature?.kind === "spirit" && other.combatant.team === mover.combatant.team;
  }

  /**
   * Whether `mover` walks through `other` rather than round it: its own
   * team's spirit, or any of its own team while it carries a relic
   * (#2581), so an escort on its route never holds the run up.
   */
  #walksThrough(mover: ParticipantRecord, other: ParticipantRecord): boolean {
    return (
      this.#ownSpirit(mover, other) ||
      (other.combatant.team === mover.combatant.team &&
        carriedRelic(this.relics, mover.id) !== undefined)
    );
  }

  /**
   * One pass of push-outs for `mover`, a body of `radius` at `position`:
   * bodies, bar its own team's spirits and those in `passing`, then
   * walls, then the edge.
   */
  #pushOut(
    mover: ParticipantRecord,
    position: Vec2,
    radius: number,
    passing: ReadonlySet<string>,
  ): Vec2 {
    // Body blocking (brief §21): living players are solid, so a front
    // line can physically deny ground and a caster can be boxed in.
    // Corpses are not solid — standing on a dead player should never
    // trap the living.
    for (const [otherId, other] of this.#participants) {
      if (
        otherId === mover.id ||
        other.layer !== mover.layer ||
        other.combatant.dead ||
        passing.has(otherId) ||
        this.#walksThrough(mover, other)
      ) {
        continue;
      }
      position = resolveCircleCircleCollision(
        position,
        radius,
        other.position,
        this.#radiusOf(other),
      );
    }

    // Walls resolve after bodies so a player squeezed between a blocker
    // and a wall ends up outside the wall rather than inside it — being
    // pushed through level geometry is far worse than overlapping a
    // teammate for one tick.
    for (const wallSegment of this.#blockersOn(mover.layer)) {
      position = resolveCircleSegmentCollision(position, radius, wallSegment);
    }

    // The map's edge last (#244), so nobody walks off it out of sight.
    // Every wall that meets an edge on today's maps is perpendicular to it,
    // so this slides a body along the wall's face, never into it.
    const bounds = this.#bounds;
    if (bounds !== undefined) {
      position = vec2(
        Math.min(Math.max(position.x, radius), bounds.width - radius),
        Math.min(Math.max(position.y, radius), bounds.height - radius),
      );
    }
    return this.#clampToLayer(position, mover.layer);
  }

  /**
   * Casting at somebody else turns you to them, after anything that
   * pushed you this step; nobody walks mid-cast, since a move cancels the
   * cast (#279). A self-cast, or a target that is gone, leaves facing
   * alone.
   */
  #faceCastTarget(record: ParticipantRecord): void {
    const targetId = record.combatant.cast.activeCast?.targetId;
    if (targetId === undefined || targetId === record.id) {
      return;
    }
    const target = this.#participants.get(targetId);
    if (target !== undefined) {
      faceToward(record, target.position);
    }
  }

  /**
   * Respawn, and every reset policy: the one way back to the start. At
   * the starting health, full energy, no adrenaline, nothing active, any
   * cast dropped, at spawn. Recharges carry on, as they would in a match.
   * A respawn keeps its overcast and fills only to the ceiling it leaves,
   * as GW1 keeps it through death; a reset clears it (#461), and morale
   * with it, maxima and all (#843), and readies a skill spent until a
   * morale boost (#474).
   */
  #reset(record: ParticipantRecord, why: "respawn" | "reset"): void {
    const returnsTo = why === "respawn" ? this.#respawnPlace(record) : record.spawn;
    if (why === "reset") {
      record.combatant.overcast = 0;
      this.#setMorale(record, 0);
      record.combatant.cast.refreshSpent();
    }
    record.combatant.dead = false;
    record.combatant.health = record.combatant.maxHealth * (record.spec.startHealthFraction ?? 1);
    record.swapHealthDebt = 0;
    record.corpseExploited = false;
    record.combatant.energy = Math.max(0, effectiveMaxEnergy(record.combatant));
    emptyAdrenaline(record.combatant);
    record.combatant.lastCombatAt = this.#elapsedSeconds;
    record.combatant.statuses.clear();
    record.position = returnsTo;
    record.layer = record.spec.layer ?? this.#ground;
    this.#refreshFloors(record);
    record.facing = record.spec.facing;
    record.inputDirection = ZERO;
    record.walkGoal = undefined;
    record.route = undefined;
    record.interact = undefined;
    record.respawnInSeconds = 0;
    record.combatant.cast.cancelCast();
    record.combatant.cast.endAftercast();
    record.combatant.cast.clearOverrides();
    dropEndedCopyPools(record.combatant);
    record.combatant.attack = undefined;
    record.combatant.knockdownRemaining = 0;
    record.combatant.invulnerableRemaining = 0;
    // The set in hand stays: GW1 resurrects you holding it (#489).
    record.pendingWeaponSet = undefined;
    this.#clearChainMarks(record);
    record.pendingSkill = undefined;
    record.sinceReset = 0;
    if (why === "respawn") {
      record.cursor = createCursor();
    }
    // A Ghostly Hero rises staying put at its spawn (#1377).
    if (record.creature?.kind === "ghostly-hero") {
      this.#stay(record, record.spawn);
    }
    record.armedAttack = undefined;
    record.outOfCombatSeconds = 0;
    record.history.clear();
    record.combatant.moving = false;
    this.#stepStart.set(record.id, returnsTo);
    // A companion comes back with its owner, alive, beside them (#1046),
    // wherever it was summoned.
    const companion = record.creature === undefined ? this.#companionOf(record) : undefined;
    if (companion !== undefined) {
      this.#reset(companion, why);
      companion.position = record.position;
      companion.layer = record.layer;
      this.#refreshFloors(companion);
      this.#stepStart.set(companion.id, record.position);
    }
  }

  /**
   * Who walked this step (#921): everyone at once, after everyone acted,
   * so the order the participants resolve in cannot change who is moving.
   * One who walked loses every status that ends when its bearer moves
   * (#2096), logged as a status running out is.
   */
  #settleMoving(): void {
    for (const record of this.#participants.values()) {
      const start = this.#stepStart.get(record.id);
      record.combatant.moving =
        !record.combatant.dead &&
        start !== undefined &&
        (start.x !== record.position.x || start.y !== record.position.y);
      const ended = record.combatant.moving ? record.combatant.statuses.endOnBearerMove() : [];
      if (ended.length > 0) {
        this.#log.push({
          tick: this.#tick,
          atSeconds: this.#elapsedSeconds,
          cause: "degeneration",
          sourceId: record.id,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
          area: undefined,
          doubleStrike: false,
          events: ended.map((statusId) => ({
            kind: "status-expired",
            targetId: record.id,
            statusId,
          })),
        });
      }
    }
  }

  /** Ticks in the ruleset's tracking window: at least two, or there is no motion to fit. */
  #historyLength(): number {
    return Math.max(
      2,
      Math.round(this.#ruleset.combat.trackWindowSeconds * this.#ruleset.tickRateHz),
    );
  }

  /** Set 1 from the spec's own gear, the others spare (#489). */
  #weaponSets(spec: ParticipantSpec): ResolvedWeaponSets {
    const [set2, set3, set4] = spec.spareWeaponSets ?? [null, null, null];
    return [
      {
        equipment: spec.equipment,
        maxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
        maxHealth: spec.maxHealth ?? this.#ruleset.combat.baseHealth,
        baseEnergyPips: spec.baseEnergyPips ?? 0,
      },
      set2,
      set3,
      set4,
    ];
  }

  #combatant(spec: ParticipantSpec): Combatant {
    const maxHealth = spec.maxHealth ?? this.#ruleset.combat.baseHealth;
    const statuses = new StatusSet(this.#spentStatuses);
    return {
      id: spec.id,
      health: maxHealth * (spec.startHealthFraction ?? 1),
      maxHealth,
      energy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      maxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy,
      overcast: 0,
      morale: 0,
      baseEnergyPips: spec.baseEnergyPips ?? 0,
      adrenaline: adrenalinePools(spec.skillBar),
      skillBar: spec.skillBar,
      lastCombatAt: this.#elapsedSeconds,
      attributeRanks: spec.attributeRanks,
      borrowedAttribute: null,
      heldAttributeDeltas: [],
      team: spec.team,
      dead: false,
      statuses,
      cast: new CastState(spec.id, statuses),
      attack: undefined,
      knockdownRemaining: 0,
      invulnerableRemaining: 0,
      lastFoeTeam: undefined,
      soulReapingTriggers: [],
      nextMaintainSeq: 0,
      chainMarks: new Map(),
      moving: false,
      controlled: { minion: 0, spirit: 0, pet: 0 },
      equipment: spec.equipment,
      lossGuard: undefined,
    };
  }
}

/** A body's type, as Edge of Extinction reads it (#1886): a creature's kind, or `"character"`. */
function bodyType(record: ParticipantRecord): CreatureKind | "character" {
  return record.creature?.kind ?? "character";
}
