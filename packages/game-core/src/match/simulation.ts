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
import {
  distanceWithinRange,
  firstHit,
  hasLineOfSight,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
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
  SHRINE_INVULNERABLE_SECONDS,
  type MatchOutcome,
  type MatchPhase,
  type MatchRules,
  type MatchScore,
  type MatchStanding,
  type TeamStanding,
} from "../match-rules.js";
import { clampInputDirection, integrateMovement } from "../movement.js";
import {
  buildNavGraph,
  createPathFinder,
  isStandable,
  nearestStandable,
  type NavGraph,
  type PathFinder,
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
  payCost,
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
  applyDamage,
  applyEffects,
  applySkillEffects,
  applyStatus,
  conditionTaker,
  disableOwnSkills,
  gainEnergy,
  landCaughtCondition,
  resolveSkillEffects,
  stateHolds,
  type CombatEvent,
  type SkillOutcome,
  type SkippedEffect,
  type SkillResolution,
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
  type StatusId,
} from "../skills/status.js";
import { effectiveMaxEnergy, energyFloor, recoverOvercast } from "../skills/overcast.js";
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
  type GroundAct,
  type PulseRule,
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
  attackBlockedRiders,
  attackDurationSeconds,
  attackHitRiders,
  attackReached,
  bearerAttacked,
  bearerFailedToHit,
  bearerMissed,
  bearerHit,
  blindMisses,
  blocks,
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
  strikeCount,
  unblockableNow,
  weaponSnapshotOf,
  withEndedStatuses,
} from "../skills/weapon-attack.js";
import {
  breakHex,
  fireChangeTriggers,
  fireCreationTriggers,
  fireDeathTriggers,
  fireEndTriggers,
  fireTriggers,
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
  type Behaviour,
  type BehaviourCursor,
  type ResetPolicy,
} from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { freshCorpsesWithin, nearestFreshCorpse } from "./corpses.js";
import { companionSkills, PET_DEATH_GRACE_SECONDS } from "./companions.js";
import { MINION_CAP_ATTRIBUTE, minionCap, minionDegenerationPips } from "./minions.js";
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
} from "./carried.js";
import {
  FLAG_CARRIER_SPEED_MULTIPLIER,
  FLAG_MORALE_BOOST,
  FLAG_REACH_UNITS,
  carriedFlag,
  dropFlag,
  flagRefusal,
  flagTargetPosition,
  flagTeamOf,
  initialFlags,
  stepFlags,
  type FlagField,
  type FlagState,
  type FlagsState,
  type StandState,
} from "./flags.js";
import {
  initialCapturePoints,
  onCapturePoint,
  stepCapturePoints,
  type CapturePoint,
} from "./capture-points.js";
import {
  carriedRelic,
  initialRelics,
  onAltar,
  relicRefusal,
  relicTargetPosition,
  relicTeamOf,
  stepRelics,
  type RelicField,
  type RelicState,
  type RelicsState,
} from "./relics.js";
import { guardSpec, type BaseGuard } from "./guards.js";
import { UNCLAIMED_ALTAR, claimant, mayClaim, stepAltar, type AltarState } from "./altar.js";
import {
  CLAIM_SKILL_ID,
  followBehaviour,
  ghostId,
  ghostSpec,
  isGhostId,
  onHill,
  stayBehaviour,
  type HillField,
} from "./ghost.js";
import { priestId, priestSpec, type Shrine } from "./priest.js";
import { steerAround } from "./steering.js";

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
 * A spirit's death burst as it arrived: its rate (#1603), or the time of
 * the status it gives (#1956), on its owner's rank.
 */
export type ArrivedDeathBurst =
  | (Omit<Extract<DeathBurst, { effect: "damage" | "heal" }>, "perSecondAlive"> & {
      readonly perSecondAlive: number;
    })
  | (Omit<Extract<DeathBurst, { effect: "apply-status" }>, "durationSeconds"> & {
      readonly durationSeconds: number;
    });

/** A spirit's answer to a death in its range as it arrived: its damage on its owner's rank (#1886). */
export type ArrivedDeathInRange =
  | (Omit<Extract<DeathInRange, { kind: "damage-same-type" }>, "damage"> & {
      readonly damage: number;
    })
  | Extract<DeathInRange, { kind: "spread-conditions" }>;

/**
 * A body that is not a player (#1052, ADR-0035): a participant that never
 * counts for its team and has no seat. A spirit or minion is gone once it
 * dies or expires; a companion lies where it fell (#1046).
 */
export interface Creature {
  /**
   * Whoever summoned it, and whom it answers to: it leaves with them.
   * `undefined`: a map's NPC, as a priest (#1186), which answers to nobody.
   * A spirit someone takes control of (#1965) answers to them from then on.
   */
  ownerId: string | undefined;
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

export interface ParticipantSpec {
  readonly id: string;
  readonly team: number;
  readonly skillBar: SkillBar;
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly equipment: ResolvedEquipment;
  readonly spawn: Vec2;
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
    maxHealth: loadout.maxHealth,
    maxEnergy: set1.maxEnergy,
    baseEnergyPips: loadout.baseEnergyPips,
    spareWeaponSets: [set2, set3, set4],
  };
}

export interface Participant {
  readonly id: string;
  readonly combatant: Combatant;
  readonly skillBar: SkillBar;
  readonly spawn: Vec2;
  position: Vec2;
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

export interface MatchSimulationOptions {
  readonly seed: string | number;
  readonly ruleset?: Ruleset;
  /**
   * Scoring, time limit and respawn. Omitted: the match never ends and
   * the dead stay dead, which is what training and the headless runner
   * want.
   */
  readonly matchRules?: MatchRules | undefined;
  /** Omitted or `[]`: nothing collides with a wall or blocks line of sight. */
  readonly walls?: readonly Segment[];
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
   * King of the Hill's altar and ghost spawns (#1377): each team's Ghostly
   * Hero stands at its spawn from the start. Omitted: no ghosts.
   */
  readonly hillField?: HillField | undefined;
  /**
   * Capture Points' shrines (#1378), each neutral at the start. Omitted
   * or `[]`: none.
   */
  readonly capturePoints?: readonly Vec2[];
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
  followGoal: { readonly point: Vec2; readonly passing: string | undefined } | undefined;
  /**
   * The way an approach, a walk or a follow last planned (#1157), to
   * `goal`; `undefined` until one is asked for, and once its order ends.
   */
  route: { goal: Vec2; waypoints: Vec2[] } | undefined;
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
        definition.whileUnder.healthPips < 0 &&
        isUnderAnother(combatant.statuses.active, status, definition.whileUnder))
    ) {
      draining.add(status.sourceId);
    } else if (
      pips > 0 ||
      definition.healthPipsPerEnchantment !== undefined ||
      definition.healthPerSecondWhileMoving > 0 ||
      definition.healthPerSecond > 0 ||
      (definition.whileUnder !== undefined &&
        definition.whileUnder.healthPips > 0 &&
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

export class MatchSimulation {
  readonly #ruleset: Ruleset;
  readonly #matchRules: MatchRules | undefined;
  readonly #walls: readonly Segment[];
  readonly #bounds: { readonly width: number; readonly height: number } | undefined;
  /** Corners an approach or a walk can path through, built once from the walls (#211). */
  readonly #graph: NavGraph;
  /** Paths round this match's walls, for the attack's approach and for a walk (#211, #267, #310). */
  readonly #paths: PathFinder;
  /** The living bodies a path step steers round, refilled for each one rather than allocated (#277). */
  readonly #bodies: Vec2[] = [];
  readonly #rng: SimulationRng;
  readonly #participants = new Map<string, ParticipantRecord>();
  /**
   * What every participant's `StatusSet` shares as spent this tick
   * (#1955), cleared once the tick's last drain is done.
   */
  readonly #spentStatuses = new Set<string>();
  /**
   * Every team anyone was added to (#846): one whose members all left is
   * still in the standing, wiped, rather than gone.
   */
  readonly #teams = new Set<number>();
  /** Each team's called foe (#443), which its bots fight (#1193). */
  readonly #calledTargets = new Map<number, string>();
  #projectiles: Projectile[] = [];
  #nextProjectileId = 1;

  #tick = 0;
  #elapsedSeconds = 0;
  #score: MatchScore = emptyScore([0, 1]);
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
  /** Who stands up where a minion fell this step (#1836), after the fallen leave. */
  readonly #replacements: {
    readonly ownerId: string;
    readonly skillId: string;
    readonly creature: CreatureTemplate;
    readonly count: number;
    readonly at: Vec2;
  }[] = [];
  /** Priest Annihilation's shrines (#1186), one a team; `[]` for every other match. */
  readonly #shrines: readonly Shrine[];
  /** Priest waves gone by (#1186): the next is at `PRIEST_WAVE_SECONDS` times one more. */
  #priestWaves = 0;
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
  /** The altar and relic spawns (#1374); `undefined` on a map without them. */
  readonly #relicField: RelicField | undefined;
  /** Where every relic is (#1374); `undefined` without a field. */
  #relicsState: RelicsState | undefined;
  /** Who reached a relic this step (#1374), in simulation order. */
  #relicArrivals: CarriedArrival[] = [];
  /** King of the Hill's altar and ghost spawns (#1377); `undefined` on a map without them. */
  readonly #hillField: HillField | undefined;
  /** Who holds the altar (#1377); nobody on a map without a hill. */
  #altarState: AltarState = UNCLAIMED_ALTAR;
  /** The teams whose ghost finished a claim this step (#1377), in simulation order. */
  #claims: number[] = [];
  /** Capture Points' shrines (#1378), who owns each and how far toward whom; `[]` without them. */
  #capturePoints: readonly CapturePoint[];
  /** Shrine scorings gone by (#1378): the next is at `POINT_TICK_SECONDS` times one more. */
  #pointTicks = 0;
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
    this.#walls = options.walls ?? [];
    this.#bounds = options.bounds;
    this.#graph = buildNavGraph(this.#walls, options.bounds, this.#ruleset.collision.playerRadius);
    this.#paths = createPathFinder(this.#graph);
    this.#rng = createRng(
      typeof options.seed === "string" ? seedFromString(options.seed) : options.seed,
    );
    this.#flagField = options.flagField;
    this.#flagsState = this.#flagField === undefined ? undefined : initialFlags(this.#flagField);
    this.#relicField = options.relicField;
    this.#relicsState =
      this.#relicField === undefined ? undefined : initialRelics(this.#relicField);
    this.#hillField = options.hillField;
    this.#capturePoints = initialCapturePoints(options.capturePoints ?? []);
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
    const ghostSpawns = this.#hillField?.spawns ?? [];
    for (const spawn of ghostSpawns) {
      this.add(
        ghostSpec(
          spawn,
          spawnFacing(
            spawn.position,
            ghostSpawns.filter((other) => other.team !== spawn.team).map((other) => other.position),
            ghostSpawns.map((other) => other.position),
          ),
        ),
      );
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
    return this.#relicsState?.relics ?? [];
  }

  /**
   * The altar a relic is run to (#1374), or a Ghostly Hero claims (#1377);
   * `undefined` on a map without one.
   */
  public get altar(): Vec2 | undefined {
    return this.#relicField?.altar ?? this.#hillField?.altar;
  }

  /** Who holds King of the Hill's altar, and how long since the claim or the last point (#1377). */
  public get altarState(): AltarState {
    return this.#altarState;
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
      this.#upkeep(participant.id),
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
    const record: ParticipantRecord = {
      id: spec.id,
      combatant: this.#combatant(spec),
      skillBar: spec.skillBar,
      spawn: spec.spawn,
      position: spec.spawn,
      facing: spec.facing,
      inputDirection: ZERO,
      walkGoal: undefined,
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
      pendingWeaponSet: undefined,
      corpseExploited: false,
      armedAttack: undefined,
      hadEnergy: false,
      interact: undefined,
    };
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
    // A body lying as corpses (#1836) takes no room.
    let creatures = 0;
    for (const record of this.#participants.values()) {
      if (
        record.creature?.ownerId !== undefined &&
        !record.combatant.dead &&
        !this.#leaving.has(record.id)
      ) {
        creatures += 1;
      }
    }
    const fits = Math.max(0, Math.min(count, MAX_CREATURES - creatures));
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
      const id = `${owner.id}/c${String(this.#nextCreature)}`;
      this.#nextCreature += 1;
      this.add({
        id,
        team: owner.combatant.team,
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
        facing: owner.facing,
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
        maxEnergy: 0,
        baseEnergyPips: 0,
        behaviour: template.behaviour,
        creature: {
          ownerId: owner.id,
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
          replacedBy: template.replacedBy,
          corpsesLeft:
            template.leavesCorpses === undefined
              ? 0
              : Math.round(resolveMagnitudeAtRanks(template.leavesCorpses, ranks)),
          companionSkillId: companion ? skillId : undefined,
          leaderId: undefined,
          mode: "guard",
        },
      });
      if (template.kind !== "pet") {
        this.#logFired(fireCreationTriggers(owner.combatant, id, this.#triggerContext()));
      }
    }
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
   * `owner` takes control of the spirit `spiritId` (#1965): Signet of
   * Binding's. It answers to `owner` and is on its team from now on, and
   * leaves with it; it keeps its Health, its time left and the ranks it
   * arrived with. The aura pass reads its team each step.
   */
  #takeControl(owner: ParticipantRecord, spiritId: string): void {
    const spirit = this.#participants.get(spiritId);
    if (
      spirit?.creature?.kind !== "spirit" ||
      spirit.combatant.dead ||
      this.#leaving.has(spiritId)
    ) {
      return;
    }
    spirit.creature.ownerId = owner.id;
    spirit.combatant.team = owner.combatant.team;
    // An attack spirit's swing was at its new side.
    spirit.combatant.attack = undefined;
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
    position: Vec2,
  ): void {
    this.#addGroundEffect({
      skillId,
      ownerId: owner.id,
      team: owner.combatant.team,
      position,
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
      this.#groundEffects.shift();
    }
  }

  /**
   * Where a ground effect `owner` leaves lands (#1104): where it stands,
   * where the corpse its skill exploited lies, or where its target stands
   * (#1113), as they are now. A well or a symbol does not follow a body
   * that later moves, stands up or respawns. Nowhere, when a target
   * anchor has no target.
   */
  #groundAnchor(
    owner: ParticipantRecord,
    effect: CreateGroundEffect,
    corpse: ParticipantRecord | undefined,
    primary: ParticipantRecord | undefined,
  ): Vec2 | undefined {
    switch (effect.anchor) {
      case "caster":
        return owner.position;
      case "corpse":
        // A corpse skill with neither a corpse nor a well's sacrifice
        // (#1730) never resolves, so this is a bug.
        if (corpse === undefined) {
          throw new Error(`${owner.id}: a corpse-anchored ground effect with no corpse`);
        }
        return corpse.position;
      case "target":
        return primary?.position;
    }
  }

  /**
   * Every ground effect counts down `dt` (#1087); one at zero is gone,
   * except a trap that springs as its time runs out (#1113): this step's
   * `#springTraps` springs it.
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
        effect.remainingSeconds > 0 || (effect.act.kind === "trap" && effect.act.trap.springsAtEnd),
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
            distance(body.position, effect.position) <= trap.triggerRadius,
        );
      if (!triggered) {
        continue;
      }
      sprung.add(effect.id);
      this.#landPulse(owner, effect.skillId, effect.position, trap.spring);
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
   * One whose owner has left the match is gone with no effect.
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
      const { pulse } = effect.act;
      const age = effect.durationSeconds - effect.remainingSeconds;
      if (
        effect.pulsed >= pulse.count ||
        age < pulse.delaySeconds + effect.pulsed * pulse.everySeconds - SWING_EPSILON
      ) {
        continue;
      }
      effect.pulsed += 1;
      this.#landPulse(owner, effect.skillId, effect.position, pulse);
    }
    if (gone.size > 0) {
      this.#groundEffects = this.#groundEffects.filter((effect) => !gone.has(effect.id));
    }
  }

  /**
   * Every status damage pulse that came due this step (#1501), in
   * participant order: damage of its type from the status's source to the
   * source's foes within its radius of the bearer, and to the bearer if
   * it `hitsBearer` (#1754), logged as the status's skill. A bearer that died since takes none,
   * and a source that has left the match deals none.
   */
  #pulseStatuses(): void {
    for (const record of this.#participants.values()) {
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
   * One pulse of `rule` at `position` (#1113): its effects land from
   * `owner` on whoever its area takes there, in line of sight of it, and
   * it is logged as a cast is, even when it hits nobody. A pulse's
   * interrupt comes free with what it lands, untimed, as Maelstrom's
   * (#1367): finding nothing to interrupt is no miss, so it says nothing.
   */
  #landPulse(owner: ParticipantRecord, skillId: string, position: Vec2, rule: PulseRule): void {
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
        primary: undefined,
        candidates: [...this.#participants.values()],
        losBlockers: this.#walls,
      }),
      rng: this.#rng,
      rules: this.#ruleset.combat,
      surroundings: this.#participants,
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
   * What every living spirit and every ground effect projects (#1064,
   * #1087), settled once a step before anyone acts, so a hit this step
   * sees this step's auras. Every living body that is not a spirit wears
   * an aura's status exactly while some source with it, on a side it
   * reaches, stands within its radius; one worn from two sources is worn
   * once, named for the first. A source gone since the last step is gone
   * from everyone now: one step late at worst. Spirits in the order they
   * were summoned, then ground effects in id order; bodies in match order.
   * One pass for both, as a second would strip what the first projected.
   */
  #projectAuras(): void {
    const sources: {
      readonly sourceId: string;
      readonly team: number;
      readonly position: Vec2;
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
          aura,
          ranks: statusRanks(aura.statusId, (owner ?? record).combatant),
        });
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
      for (const { sourceId, team, position, aura, ranks } of sources) {
        if (
          !wears.has(aura.statusId) &&
          reaches(aura.affects, team, body.combatant.team) &&
          distance(position, body.position) <= aura.radius
        ) {
          wears.set(aura.statusId, { sourceId, ranks });
        }
      }
      const { statuses } = body.combatant;
      for (const status of statuses.active) {
        if (status.projected && !wears.has(status.id)) {
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
          : Math.min(
              burst.perSecondAlive * Math.floor(creature.ageSeconds + SWING_EPSILON),
              burst.max ?? Number.POSITIVE_INFINITY,
            );
      if (amount <= 0) {
        continue;
      }
      const effect: SkillEffect =
        burst.effect === "apply-status"
          ? { kind: "apply-status", statusId: burst.statusId, durationSeconds: amount }
          : burst.effect === "damage"
            ? { kind: "damage", amount: { flat: amount }, type: "typeless", armorPenetration: 0 }
            : { kind: "heal", amount: { flat: amount } };
      const events: CombatEvent[] = [];
      for (const other of this.#participants.values()) {
        const ally = other.combatant.team === spirit.combatant.team;
        if (
          other.combatant.dead ||
          other.creature?.kind === "spirit" ||
          (burst.affects !== "all" && ally !== (burst.affects === "allies")) ||
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
    record.resolvedMaxHealth = loadout.maxHealth;
    record.resolvedMaxEnergy = loadout.weaponSets[0].maxEnergy;
    // Back to set 1, as a fresh build starts (#489).
    record.weaponSets = this.#weaponSets(spec);
    record.activeWeaponSet = 0;
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
      this.#flagsState = dropFlag(this.#flagsState, record.id, record.position);
    }
    if (this.#relicsState !== undefined && this.#relicField !== undefined) {
      this.#relicsState = stepRelics(this.#relicField, this.#relicsState, [
        { kind: "drop", carrierId: record.id, position: record.position },
      ]).state;
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
   * Only the point is kept here. The next step settles it, once however
   * many clicks arrived since: settling costs a path search, and a client
   * may send hundreds of clicks a second.
   */
  public walkTo(id: string, point: Vec2): void {
    const record = this.#participants.get(id);
    if (record === undefined || record.combatant.dead || record.combatant.knockdownRemaining > 0) {
      return;
    }
    record.inputDirection = ZERO;
    this.#moveInterrupts(record);
    record.walkGoal = point;
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
    if (isCarriedObjectId(targetId) || this.#isAllyGhost(record, targetId)) {
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
      this.relics.some(({ team }) => team === relicTeamOf(targetId));
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
    const { rule } = this.#payForUse(record, skill, key);
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
    const { rule } = this.#payForUse(record, skill, key);
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
      },
      0,
    );
  }

  /**
   * A skill used, at once or as it begins: its cost, and what it uses up
   * of a glyph, the chants on its user, or a status counting its next
   * skills of a kind (#1761). Returns what they give it.
   */
  #payForUse(
    record: ParticipantRecord,
    skill: Skill,
    key: string,
  ): { rule: CastRule; castsInstantly: boolean } {
    // Read before anything is spent: Extend Enchantments lengthens the
    // enchantment that uses it up.
    const own = ownSkillBoost(record.combatant.statuses.active, skill);
    payCost(skill, record.combatant, key);
    const glyphs = this.#useGlyph(record, skill);
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
    const heldAttributeDeltas = [...glyphs, ...spent].flatMap(
      (id) => getStatusDefinition(id).attributeDeltas,
    );
    return { rule: { ...rule, heldAttributeDeltas, own }, castsInstantly };
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
    // still hastens it.
    const timed =
      skill.attack === undefined
        ? effectiveActivationSeconds(
            skill,
            record.combatant,
            castTargetId === undefined
              ? undefined
              : this.#participants.get(castTargetId)?.combatant,
          )
        : undefined;
    const { rule, castsInstantly } = this.#payForUse(record, skill, key);
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
    return { skillId: skill.id, check };
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
   */
  #useGlyph(record: ParticipantRecord, skill: Skill): readonly StatusId[] {
    if (!isSpell(skill.type)) {
      return [];
    }
    const ended = record.combatant.statuses.countSpellStarted();
    this.#logSpent(record, skill, ended);
    return ended;
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
    rule: Omit<CastRule, "own" | "heldAttributeDeltas">;
    castsInstantly: boolean;
    losesAllEnergy: boolean;
    spent: readonly StatusId[];
  } {
    const all = record.combatant.statuses.useNextSkillRules(skill);
    const used = all.filter(({ answered }) => answered);
    this.#logFired(
      all.map(({ statusId, rule }) => ({
        sourceId: record.id,
        skillId: rule.skillId,
        events: [{ kind: "status-expired" as const, targetId: record.id, statusId }],
      })),
    );
    return {
      rule: {
        uninterruptible: used.some(({ rule }) => rule.uninterruptible),
        unblockable: used.some(({ rule }) => rule.unblockable),
        rechargesInstantly: used.some(({ rule }) => rule.rechargesInstantly),
        extraRechargeSeconds: used.reduce((sum, { rule }) => sum + rule.extraRechargeSeconds, 0),
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
      const energyPips = netPips(record.combatant, natural, this.#upkeep(record.id)).energy;
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
        spiritsWithin(this.#participants.values(), record.position, AREA_EARSHOT) > 0;
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
    this.#pulseStatuses();
    this.#settleUpkeep(dt);
    this.#fireEnergyEmpty();
    this.#spreadStatuses();
    this.#fireStatusChanges();
    this.#awardKillMorale();
    this.#settleMoving();
    this.#tallyAggression();
    this.#burstLeaving();
    this.#removeLeaving();
    this.#replaceFallen();
    this.#priestWave();
    // After every death, before the match end: a point on the last tick counts.
    this.#advanceRelics();
    this.#advanceAltar(dt);
    this.#advanceCapturePoints(dt);
    // After every death this step, so two teams wiped in it both lose.
    this.checkMatchEnd();
    // After the match end: a lord slain as a boost falls due ends it first.
    this.#advanceFlags(dt);

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

  /** What `casterId` pays for the enchantments it maintains, in pips (#837). */
  #upkeep(casterId: string): number {
    return upkeepPips(casterId, combatantsOf(this.#participants.values()));
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
      losBlockers: this.#walls,
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
      nearestSpiritWithin(this.#participants.values(), record.position, AREA_EARSHOT) === undefined
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

  /** Put a behaviour's intent through the same calls a player's messages make. */
  #act(record: ParticipantRecord, behaviour: Behaviour, dt: number): void {
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
      sees: (point) => hasLineOfSight(record.position, point, this.#walls),
    });
    this.setInputDirection(record.id, intent.moveDirection);
    const following = record.followGoal !== undefined;
    record.followGoal =
      intent.moveTo === undefined
        ? undefined
        : { point: intent.moveTo, passing: record.creature?.ownerId };
    if (following && record.followGoal === undefined) {
      record.route = undefined;
    }
    // A move, as a held direction is: it ends the attack and the cast.
    if (record.followGoal !== undefined) {
      this.#moveInterrupts(record);
    }
    this.setTarget(record.id, intent.targetId);
    // Asked only when the attack wanted is not the one going, as a player
    // presses Space once: a pet switches with its owner (#1046).
    if (
      intent.attackTargetId !== undefined &&
      record.combatant.attack?.targetId !== intent.attackTargetId
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

    const targetRecord = targetId === undefined ? undefined : this.#participants.get(targetId);
    if (
      this.#failsSpell(record, skill, targetRecord, cast.key) ||
      this.#failsTouch(record, skill, targetRecord, cast.key)
    ) {
      return;
    }
    // Signet of Illusions' (#1929): a finished spell spends a use and
    // scales, where it lands and what it summons, with the lent attribute.
    const borrowing = record.combatant.statuses.borrowedFor(skill);
    const lent =
      borrowing === undefined
        ? undefined
        : getStatusDefinition(borrowing).borrowsAttribute?.attributeId;
    // What its start spent still boosts it (#1941): the last glyph spell's.
    const loan = { lent, held: cast.rule.heldAttributeDeltas };
    const primary = skill.target === "self" ? record : targetRecord;
    const exposed = this.#exposedTo(record);
    const speed = record.combatant.equipment.mainHand.weapon.projectileSpeed;
    const flight = skill.projectile;
    // Only a skill that lands at once can shorten its own recharge (#845):
    // one that flies has started it by the time it lands. Only one can
    // summon (#1052): no attack skill or flying spell does.
    const only = (events: CombatEvent[]): SkillOutcome => ({
      events,
      rechargeFraction: 0,
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
            only(this.#releaseSpell(record, resolution, flight.speed, dt, loan))
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
      primary,
      // Only an area looks past the primary: skip the copy every other
      // cast would make for nothing. A flying spell's area is found
      // where it lands, not here, but a spread's, whose shots it aims (#1914).
      candidates:
        skill.area === undefined || (flight !== undefined && flight.spread !== true)
          ? []
          : [...this.#participants.values()],
      losBlockers: this.#walls,
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
    const { events, rechargeFraction, rechargeLongerSeconds, summons, grounds, taken, skipped } =
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
                        { kind: "sacrifice-health", percentOfMax: sacrifice },
                        ...skill.effects,
                      ],
                    },
              caster: record.combatant,
              targets,
              rng: this.#rng,
              rules: this.#ruleset.combat,
              surroundings: this.#participants,
              own: cast.rule.own,
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
            event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
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
        const position = this.#groundAnchor(record, ground, site, primary);
        if (position !== undefined) {
          this.#placeGroundEffect(record, skill.id, ground, position);
        }
      }
    });
    for (const spiritId of taken) {
      this.#takeControl(record, spiritId);
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
      const modifiers = aggregateModifiers(record.combatant.statuses.active);
      const enchantmentShares = modifiers.enchantmentRechargeFaster
        .filter(({ profession }) => skill.type === "enchantment" && skill.profession === profession)
        .map(({ share }) => share);
      const typeFaster = isSpell(skill.type)
        ? Math.max(modifiers.spellRechargeFaster, ...enchantmentShares)
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
      beginRecharge(
        record.combatant.cast,
        skill,
        cast.rule.rechargesInstantly
          ? 0
          : // Energizing Wind's slower share (#1886), once the faster is off.
            reducedRecharge(skill.rechargeSeconds * (1 - rechargeFraction), faster) *
              (1 + cast.rule.own.rechargeSlower) +
              rechargeLongerSeconds +
              cast.rule.extraRechargeSeconds,
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
      events: [...usedEvents, ...events, ...this.#skippedEvent(record, skill, skipped)],
    });
    this.#logFired(riders);
    if (borrowing !== undefined) {
      this.#logSpent(record, skill, record.combatant.statuses.spendBorrowed(borrowing));
    }
    // After the skill's own effects, as their own entries (#469): a spell
    // finished is Backfire's moment, an attack skill Empathy's. Any skill
    // used is Spiteful Spirit's (#935), and an attack skill twice over.
    this.#fireTriggers(record, "bearer-uses-skill", spared, {
      skillId: skill.id,
      key: cast.key,
    });
    this.#useNextSkill(record, skill, spared);
    this.#endOnUseSkill(record, skill, spared);
    if (isSpell(skill.type)) {
      // Kinetic Armor's renewal (#1614); Aura of Restoration's gain reads
      // the spell's cost.
      record.combatant.statuses.castSpell();
      this.#fireTriggers(record, "bearer-casts-spell", spared, {
        skillId: skill.id,
        key: cast.key,
      });
    }
    if (skill.attack !== undefined) {
      this.#fireTriggers(record, "bearer-attacks", spared);
    }
  }

  /** What `record`'s use of `skill` that did nothing says (#1735): why, if an `if` did not hold. */
  #skippedEvent(
    record: ParticipantRecord,
    skill: Skill,
    skipped: SkippedEffect | undefined,
  ): CombatEvent[] {
    return skipped === undefined
      ? []
      : [
          {
            kind: "effect-skipped",
            casterId: record.id,
            targetId: skipped.targetId,
            skillId: skill.id,
            requirement: conditionRequirementText(skipped.condition),
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
   * `bearer-casts-spell` (#1614).
   * A status in `spared` does not answer (#999), as `fireTriggers`.
   */
  #fireTriggers(
    record: ParticipantRecord,
    event: DirectTriggerEvent,
    spared: ReadonlySet<StatusId>,
    usedSkill?: SlotSkill,
  ): readonly FiredTrigger[] {
    // Panic's interrupt (#1501) is untimed, as a pulse's: finding nothing
    // to interrupt is no miss, so it says nothing.
    const fired = fireTriggers(
      record.combatant,
      event,
      this.#triggerContext(usedSkill),
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
   */
  #useNextSkill(record: ParticipantRecord, skill: Skill, spared: ReadonlySet<StatusId>): void {
    const bearer = record.combatant;
    const { answered, ended } = bearer.statuses.useNextSkill(skill, spared);
    this.#logFired(
      answered.map(({ statusId, next }) => ({
        sourceId: record.id,
        skillId: next.skillId,
        events: [
          ...applyEffects(next.effects, {
            caster: bearer,
            target: bearer,
            rng: this.#rng,
            rules: this.#ruleset.combat,
            surroundings: this.#participants,
          }),
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
    const ended = record.combatant.statuses.endOnBearerUseSkill(
      spared,
      skill.cost?.kind === "adrenaline",
    );
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
          this.#landRedirected(record, change.toId, change.amount);
        }
        if (change.kind === "charged-source") {
          this.#landCharge(change.toId, change.statusId, change.amount);
        }
        this.#loseRaisedMaxima(record, change);
        this.#endForm(record, change);
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
          this.#landRedirected(record, change.toId, change.amount);
        }
        if (change.kind === "charged-source") {
          this.#landCharge(change.toId, change.statusId, change.amount);
        }
        if (change.kind === "broke-hex") {
          this.#logFired(breakHex(record.combatant, change, context));
        }
        this.#loseRaisedMaxima(record, change);
        this.#endForm(record, change);
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
            this.#landRedirected(record, change.toId, change.amount);
          }
          if (round < LAST_PASS_LANDINGS && change.kind === "charged-source") {
            this.#landCharge(change.toId, change.statusId, change.amount);
          }
          this.#loseRaisedMaxima(record, change);
          this.#endForm(record, change);
          this.#returnSource(change);
          this.#stepToTarget(change);
          this.#endEverywhere(record, change);
        }
      }
    }
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
    if (maxHealthBonus !== 0 || maxHealthBonusPerEnchantment !== 0 || category === "enchantment") {
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
   * bond's caster: typeless, unmitigated and from nobody, so it is never
   * redirected again and answers nothing. With its caster dead or gone,
   * the bearer takes it back: damage never vanishes.
   */
  #landRedirected(bearer: ParticipantRecord, toId: string, amount: number): void {
    const to = this.#participants.get(toId);
    const victim = to === undefined || to.combatant.dead ? bearer : to;
    const events: CombatEvent[] = [];
    applyDamage(victim.combatant, amount, "typeless", false, events, undefined);
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
   * of the bearer within the radius, in participant order, as the bearer's.
   */
  readonly #spread: SpreadGainedCondition = (effect, bearer, gained) => {
    const from = this.#participants.get(bearer.id);
    if (from === undefined || bearer.dead) {
      return [];
    }
    return [...this.#participants.values()]
      .filter(
        (other) =>
          other.combatant.team !== bearer.team &&
          !other.combatant.dead &&
          distance(from.position, other.position) <= effect.radius,
      )
      .flatMap((other) =>
        applyEffects(
          [{ kind: "apply-status", statusId: gained.id, durationSeconds: gained.durationSeconds }],
          {
            caster: bearer,
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
      this.#recordDeaths(events);
    }
  }

  /**
   * The way from `record` to `goal` round walls, as `find` gives it,
   * but planned again only when it must (#1157): with no route yet, once
   * `goal` is `REPLAN_GOAL_UNITS` from the goal it was planned to, or
   * when the body no longer sees its next waypoint, shoved round a
   * corner. Otherwise the route is kept: waypoints the body already sees
   * past are dropped, and the last becomes `goal` if the way to it is
   * still clear. Walls never move, so only the goal or the body can make
   * a route stale. No way there is not kept: the next tick asks again.
   */
  #route(record: ParticipantRecord, goal: Vec2): readonly Vec2[] | undefined {
    const route = record.route;
    if (route !== undefined && distance(goal, route.goal) <= REPLAN_GOAL_UNITS) {
      const { waypoints } = route;
      const next = waypoints[0];
      if (next !== undefined && walkIsClear(this.#graph, record.position, next)) {
        for (
          let after = waypoints[1];
          after !== undefined && walkIsClear(this.#graph, record.position, after);
          after = waypoints[1]
        ) {
          waypoints.shift();
        }
        const before = waypoints.at(-2) ?? record.position;
        if (walkIsClear(this.#graph, before, goal)) {
          waypoints[waypoints.length - 1] = goal;
          return waypoints;
        }
      }
    }
    const waypoints = this.#paths.find(record.position, goal);
    record.route = waypoints === undefined ? undefined : { goal, waypoints: [...waypoints] };
    return waypoints;
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
    target: { readonly id: string | undefined; readonly position: Vec2 },
    reach: number,
    progress: { unreachableSeconds: number },
    dt: number,
  ): "arrived" | "walking" | "unreachable" {
    if (
      distanceWithinRange(record.position, target.position, reach) &&
      hasLineOfSight(record.position, target.position, this.#walls)
    ) {
      faceToward(record, target.position);
      record.route = undefined;
      return "arrived";
    }
    const next = this.#route(record, target.position)?.[0];
    if (next === undefined) {
      // No way there, this tick. It has to last before the approach ends
      // (#218); meanwhile, steer straight at the target, which is what
      // usually shoves a squeezed body back out (#211).
      if (this.#stalledFor(progress, dt)) {
        record.route = undefined;
        return "unreachable";
      }
      this.advanceMovement(record, sub(target.position, record.position), dt);
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
        !other.combatant.dead &&
        !this.#ownSpirit(record, other)
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
      const spot = nearestStandable(this.#graph, record.walkGoal);
      const path = this.#paths.find(record.position, spot);
      record.walkGoal = path === undefined ? undefined : spot;
      record.route = path === undefined ? undefined : { goal: spot, waypoints: [...path] };
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
    const path = this.#route(record, goal);
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
      // body back out (#211).
      this.advanceMovement(record, sub(goal, record.position), dt);
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
    const path = this.#route(record, nearestStandable(this.#graph, goal.point));
    const next = path?.[0];
    if (next !== undefined) {
      this.#stepToward(record, next, goal.passing, path?.length === 1, dt);
    } else if (!isStandable(this.#graph, record.position)) {
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

    const approach = this.#approach(record, target, skill.range, pending, dt);
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
    const position = this.#interactPosition(interact.targetId);
    if (position === undefined) {
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
    const approach = this.#approach(
      record,
      { id: ghost, position },
      FLAG_REACH_UNITS,
      interact,
      dt,
    );
    if (approach === "walking") {
      return;
    }
    record.interact = undefined;
    if (approach === "arrived" && ghost !== undefined) {
      this.#toggleGhost(record, ghost);
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
    if (relicTeamOf(targetId) !== undefined) {
      return this.#relicField === undefined || this.#relicsState === undefined
        ? "no-target"
        : relicRefusal(this.#relicField, this.#relicsState, id, combatant.team, targetId);
    }
    return this.#flagField === undefined || this.#flagsState === undefined
      ? "no-target"
      : flagRefusal(this.#flagField, this.#flagsState, id, combatant.team, targetId);
  }

  /** Where the walk to `targetId`, a flag, the stand or a relic, ends; `undefined` for nowhere. */
  #interactPosition(targetId: string): Vec2 | undefined {
    if (isGhostId(targetId)) {
      const ghost = this.#participants.get(targetId);
      return ghost === undefined || ghost.combatant.dead ? undefined : ghost.position;
    }
    if (relicTeamOf(targetId) !== undefined) {
      return this.#relicField === undefined
        ? undefined
        : relicTargetPosition(this.#relicField, this.relics, targetId);
    }
    return this.#flagField === undefined
      ? undefined
      : flagTargetPosition(this.#flagField, this.flags, targetId);
  }

  /** The drops of every bundle carrier `objects` has who died this step, where they lie. */
  #deathDrops(objects: readonly (FlagState | RelicState)[]): CarriedDrop[] {
    return fallenDrops(objects, (carrierId) => {
      const carrier = this.#participants.get(carrierId);
      return carrier?.combatant.dead === true ? carrier.position : undefined;
    });
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
      return carrier !== undefined && onAltar(field, carrier.position)
        ? [{ kind: "score" as const, carrierId: carrier.id }]
        : [];
    });
    const { state: next, scored } = stepRelics(field, state, [
      ...scores,
      ...this.#deathDrops(state.relics),
      ...this.#livingArrivals(arrivals),
    ]);
    this.#relicsState = next;
    for (const team of scored) {
      this.#score = addPoint(this.#score, team);
    }
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
    const field = this.#hillField;
    if (ghost === undefined || ghost.combatant.dead || field === undefined) {
      return;
    }
    if (ghost.creature?.leaderId === record.id) {
      this.#stay(ghost, ghost.position);
    } else {
      ghost.behaviour = followBehaviour(field.altar);
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
    for (const spawn of this.#hillField?.spawns ?? []) {
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
    const field = this.#hillField;
    if (field === undefined || record.combatant.dead || !onHill(field, record.position)) {
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
    if (this.#hillField === undefined || this.phase !== "active") {
      return;
    }
    const { state, scored } = stepAltar(this.#altarState, dt, claimant(claims));
    this.#altarState = state;
    if (scored !== null) {
      this.#score = addPoint(this.#score, scored);
    }
  }

  /**
   * The step's shrines (#1378), once every death is in, so a player killed
   * this tick is on none: each moves toward the one team on it, then, at
   * every `POINT_TICK_SECONDS` of match clock, each scores its owner a
   * point. The capture comes first, so one taken on the scoring tick scores.
   */
  #advanceCapturePoints(dt: number): void {
    if (this.#capturePoints.length === 0 || this.phase !== "active") {
      return;
    }
    const presence = this.#capturePoints.map((point) =>
      [...this.#participants.values()].flatMap((record) =>
        countsForTeam(record) &&
        !record.combatant.dead &&
        onCapturePoint(point.position, record.position)
          ? [record.combatant.team]
          : [],
      ),
    );
    this.#capturePoints = stepCapturePoints(this.#capturePoints, dt, presence).state;
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
        distanceWithinRange(record.position, target.position, weapon.range) &&
        hasLineOfSight(record.position, target.position, this.#walls)
      )
    ) {
      record.combatant.attack = undefined;
      return;
    }
    const approach = this.#approach(record, target, weapon.range, attack, dt);
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
      this.#fireTriggers(record, "bearer-attacks", NONE_SPARED);
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
    this.#fireTriggers(record, "bearer-attacks", NONE_SPARED);
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
    this.#fireTriggers(pet, "bearer-attacks", NONE_SPARED);
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
    };
    const flight = resolution.skill.attack?.flightSpeed;
    const released: CombatEvent[] = [];
    removePreparations(record.combatant, resolution.skill, released);
    const events = resolution.targets.flatMap((victim) => {
      const target = this.#participants.get(victim.id);
      const multiplier =
        flight !== undefined &&
        (flight.when === undefined ||
          stateHolds(flight.when, record.combatant, victim, this.#participants))
          ? flight.multiplier
          : 1;
      const strikes = strikeCount(
        resolution.skill.attack?.strikes,
        record.combatant,
        victim,
        this.#participants,
      );
      return target === undefined || victim.dead
        ? []
        : this.#release(record, target, speed * multiplier, dt, { ...skillHit, strikes });
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
      if (blindMisses(record.combatant, target.combatant, this.#rng)) {
        bearerFailedToHit(record.combatant, events);
        events.push({ kind: "attack-missed", targetId: target.id });
        return [...events, ...this.#failedToHit(record.combatant, target, skillHit, events)];
      }
    }
    if (!hasLineOfSight(record.position, target.position, this.#walls)) {
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
    const impact = firstHit(from, leadPoint, this.#walls);
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
      obstructed: impact !== undefined,
      speed,
      flightSeconds: distance(from, aimPoint) / speed,
      elapsed: 0,
      weaponSnapshot: withEndedStatuses(weaponSnapshotOf(record.combatant), attacked),
      skillHit,
      unblockable: attacked.unblockable,
      spent: attacked.spent,
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
      // Shadow Form's miss (#1951) is checked as each blow lands, the first too.
      if (
        attacksAgainstMiss(target.combatant.statuses.active) ||
        (strike > 0 &&
          attacker !== undefined &&
          blindMisses(attacker.combatant, target.combatant, this.#rng))
      ) {
        events.push({ kind: "attack-missed", targetId: target.id });
        if (attacker !== undefined) {
          bearerFailedToHit(attacker.combatant, events);
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
        skillHit?.skill.attack?.unblockable ?? false,
        attacker?.combatant,
        target.combatant,
        this.#participants,
      ) &&
      blocks(target.combatant, projectile.attackerId, "projectile", this.#rng)
    ) {
      events.push({ kind: "attack-blocked", targetId: target.id });
      if (attacker !== undefined) {
        bearerFailedToHit(attacker.combatant, events);
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
    );
    if (critical && attacker !== undefined) {
      landedCritical(attacker.combatant, projectile.weaponSnapshot.criticalStrikes, events);
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
        skillHit !== undefined,
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
          primary: target,
          candidates: skill.area === undefined ? [] : [...this.#participants.values()],
          losBlockers: this.#walls,
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
        : [...events, ...this.#skippedEvent(casterRecord, skill, skipped)],
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
   * nothing (#534). "For Great Justice!" (#936) adds its extra strikes
   * to each. What filled is told in `log` (#1735), the events logged
   * for the blow.
   */
  #gainAdrenaline(
    record: ParticipantRecord,
    events: readonly CombatEvent[],
    log: CombatEvent[],
    blows = 1,
  ): void {
    const damagedFoe = events.some((event) => {
      const victim = event.kind === "damage" ? this.#participants.get(event.targetId) : undefined;
      return victim !== undefined && victim.combatant.team !== record.combatant.team;
    });
    if (damagedFoe) {
      const { extraStrikesPerHit } = aggregateModifiers(record.combatant.statuses.active);
      const strikes = blows * (1 + extraStrikesPerHit);
      if (gainStrikes(record.combatant, strikes, this.#elapsedSeconds)) {
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
      );
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
        if (victim.creature !== undefined) {
          // A Ghostly Hero rises by its own reset, and has no morale (#1377).
          victim.respawnInSeconds =
            victim.creature.onDeath === "rise"
              ? this.#respawnSeconds(victim)
              : Number.POSITIVE_INFINITY;
          if (victim.creature.onDeath === "vanish") {
            this.#creatureFell(victim);
          } else if (victim.creature.onDeath === "lie") {
            this.#deathPenalty(victim);
          }
          if (victim.creature.kind !== "spirit") {
            this.#reapSoul(victim);
          }
          this.#companionDied(victim, victim.creature);
          continue;
        }
        victim.respawnInSeconds = this.#respawnSeconds(victim);
        this.#deathPenalty(victim);
        this.#reapSoul(victim);
        this.recordDeath(victim.combatant.team);
      }
    }
    for (const { victim, conditions } of fallen) {
      this.#diedInRange(victim, conditions);
    }
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
      ({ combatant, creature, position }) =>
        !combatant.dead &&
        creature?.kind !== "spirit" &&
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
      });
    }
  }

  /**
   * Who stands up where a minion fell this step (#1836), once the fallen
   * have left, so there is room: its owner's, unless its owner is dead or
   * gone. As many as `MAX_CREATURES` leaves room for, past no cap.
   */
  #replaceFallen(): void {
    const replacements = this.#replacements.splice(0);
    for (const { ownerId, skillId, creature, count, at } of replacements) {
      const owner = this.#participants.get(ownerId);
      if (owner !== undefined && !owner.combatant.dead) {
        this.#summon(owner, skillId, creature, count, at, false, true);
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
      hasLineOfSight(target.position, beside, this.#walls) ? beside : target.position,
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
    const impact = firstHit(from, goal, this.#walls);
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
    const centre = rule.near === "target" ? target?.position : record.position;
    return centre === undefined
      ? undefined
      : nearestFreshCorpse(centre, rule.radius, this.#participants.values());
  }

  /**
   * Marks the corpse `#freshCorpse` finds as exploited (#466) and returns
   * it; `undefined` for none. Wells and minions (#466, #467) will want
   * its position.
   */
  #exploitCorpse(
    record: ParticipantRecord,
    rule: CorpseRule,
    target: ParticipantRecord | undefined,
  ): ParticipantRecord | undefined {
    const corpse = this.#freshCorpse(record, rule, target);
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
    const corpses = freshCorpsesWithin(record.position, rule.radius, this.#participants.values());
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
        record.corpseExploited = false;
      }
    }
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
    return this.#matchRules.respawnSeconds;
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
   * A morale boost (GvG's flag stand, HA's altar): `amount` percent to
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
    record.activeWeaponSet = set;
    record.pendingWeaponSet = undefined;
    combatant.equipment = held.equipment;
    record.resolvedMaxEnergy = held.maxEnergy;
    combatant.maxEnergy = moraleMaximum(
      this.#ruleset.combat.baseEnergy,
      record.resolvedMaxEnergy,
      combatant.morale,
    );
    combatant.energy += combatant.maxEnergy - before;
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
    const members = new Map<number, { living: number; morale: number; raisable: number }>(
      [...teams].map((team) => [team, { living: 0, morale: 0, raisable: 0 }]),
    );
    for (const record of this.#participants.values()) {
      if (!countsForTeam(record)) {
        continue;
      }
      const { combatant } = record;
      const team = members.get(combatant.team) ?? { living: 0, morale: 0, raisable: 0 };
      team.living += combatant.dead ? 0 : 1;
      team.morale += combatant.morale;
      team.raisable += combatant.dead && combatant.morale <= MORALE_FLOOR ? 0 : 1;
      members.set(combatant.team, team);
    }
    const byTeam = new Map<number, TeamStanding>();
    for (const [team, { living, morale, raisable }] of members) {
      byTeam.set(team, {
        living,
        morale,
        priestLives: this.#priestLives(team),
        guildLordLives: this.#guildLordLives(team),
        beyondRaising: this.#teams.has(team) && raisable === 0,
        aggression: this.#aggression.get(team) ?? 0,
      });
    }
    return { byTeam };
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

  /** Whether the shrines raise with no priest: a Guild Battle's (#1222). */
  #shrinesRaiseAlone(): boolean {
    return this.#matchRules?.victory === "guild-battle";
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
      if (team === undefined) {
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
   * nobody. A creature is never raised, a companion neither.
   * In a Guild Battle (#1222) every shrine raises, with no priest at all.
   */
  #priestWave(): void {
    const due = (this.#priestWaves + 1) * PRIEST_WAVE_SECONDS;
    if (this.#shrines.length === 0 || this.#elapsedSeconds + SWING_EPSILON < due) {
      return;
    }
    this.#priestWaves += 1;
    const alone = this.#shrinesRaiseAlone();
    for (const shrine of this.#shrines) {
      if (!alone && !this.#priestLives(shrine.team)) {
        continue;
      }
      const events: CombatEvent[] = [];
      for (const record of this.#participants.values()) {
        const { combatant } = record;
        if (
          !countsForTeam(record) ||
          combatant.team !== shrine.team ||
          !combatant.dead ||
          combatant.morale <= MORALE_FLOOR
        ) {
          continue;
        }
        this.#raiseAtShrine(record, shrine.position);
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
  #raiseAtShrine(record: ParticipantRecord, at: Vec2): void {
    const { combatant } = record;
    combatant.statuses.clear();
    combatant.dead = false;
    combatant.health = effectiveMaxHealth(combatant);
    combatant.invulnerableRemaining = SHRINE_INVULNERABLE_SECONDS;
    combatant.energy = Math.max(0, effectiveMaxEnergy(combatant));
    emptyAdrenaline(combatant);
    let position = nearestStandable(this.#graph, at);
    for (let pass = 0; pass < MOVEMENT_RELAX_PASSES; pass += 1) {
      position = this.#pushOut(record, position, this.#radiusOf(record), NOBODY);
    }
    record.position = position;
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
    this.#outcome = outcome;
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
      if (otherId === record.id || other.combatant.dead || this.#ownSpirit(record, other)) {
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

    record.position = position;
  }

  /**
   * A spirit is no body to its own team (#1278), as in GW1: allies, their
   * pets and minions walk through it; foes are blocked by it.
   */
  #ownSpirit(mover: ParticipantRecord, other: ParticipantRecord): boolean {
    return other.creature?.kind === "spirit" && other.combatant.team === mover.combatant.team;
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
        other.combatant.dead ||
        passing.has(otherId) ||
        this.#ownSpirit(mover, other)
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
    for (const wallSegment of this.#walls) {
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
    return position;
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
    if (why === "reset") {
      record.combatant.overcast = 0;
      this.#setMorale(record, 0);
      record.combatant.cast.refreshSpent();
    }
    record.combatant.dead = false;
    record.combatant.health = record.combatant.maxHealth * (record.spec.startHealthFraction ?? 1);
    record.corpseExploited = false;
    record.combatant.energy = Math.max(0, effectiveMaxEnergy(record.combatant));
    emptyAdrenaline(record.combatant);
    record.combatant.lastCombatAt = this.#elapsedSeconds;
    record.combatant.statuses.clear();
    record.position = record.spawn;
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
    this.#stepStart.set(record.id, record.spawn);
    // A companion comes back with its owner, alive, beside them (#1046),
    // wherever it was summoned.
    const companion = record.creature === undefined ? this.#companionOf(record) : undefined;
    if (companion !== undefined) {
      this.#reset(companion, why);
      companion.position = record.position;
      this.#stepStart.set(companion.id, record.position);
    }
  }

  /**
   * Who walked this step (#921): everyone at once, after everyone acted,
   * so the order the participants resolve in cannot change who is moving.
   */
  #settleMoving(): void {
    for (const record of this.#participants.values()) {
      const start = this.#stepStart.get(record.id);
      record.combatant.moving =
        !record.combatant.dead &&
        start !== undefined &&
        (start.x !== record.position.x || start.y !== record.position.y);
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
      { equipment: spec.equipment, maxEnergy: spec.maxEnergy ?? this.#ruleset.combat.baseEnergy },
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
