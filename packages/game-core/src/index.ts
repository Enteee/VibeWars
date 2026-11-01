/**
 * `@vibewars/game-core` — pure game-domain primitives.
 *
 * Nothing in this package may import a renderer, a network library, a browser
 * API, or the system clock. Everything here must be deterministic and
 * unit-testable in isolation (see `docs/adr/0001-architecture.md`).
 */

export type { SimulationRng } from "./rng.js";
export { createRng, seedFromString } from "./rng.js";

export type { Vec2 } from "./vec2.js";
export * as Vec from "./vec2.js";
export { ZERO, length, normalize, vec2 } from "./vec2.js";

export { clampInputDirection, integrateMovement } from "./movement.js";

export { AREA_EARSHOT, RANGE_COMPASS, RANGE_SPELL } from "./distances.js";

export type { Segment } from "./geometry.js";
export {
  buildNavGraph,
  createPathFinder,
  nearestStandable,
  type NavGraph,
  type PathFinder,
} from "./pathing.js";
export {
  circleIntersectsSegment,
  closestPointOnSegment,
  distancePointToSegment,
  distanceSegmentToSegment,
  distanceWithinRange,
  firstHit,
  hasLineOfSight,
  resolveCircleCircleCollision,
  resolveCircleSegmentCollision,
  segment,
  segmentsIntersect,
} from "./geometry.js";

export type {
  AttributeRules,
  CombatRules,
  CollisionRules,
  MovementRules,
  ResourceRules,
  Ruleset,
} from "./ruleset.js";
export {
  ADRENALINE_PER_STRIKE,
  FLASH_LOCKOUT_SECONDS,
  MINIMAL_GW_INSPIRED_PVP_V1,
} from "./ruleset.js";
export { adrenalineLossIn } from "./skills/adrenaline.js";

export type {
  AttributeDefinition,
  ProfessionDefinition,
  ProfessionId,
  SkillProfession,
} from "./professions.js";
export {
  PROFESSIONS,
  getAttribute,
  getProfession,
  primaryAttributeOf,
  skillProfessionName,
} from "./professions.js";

export type { AttributeAllocation, AttributeModifier } from "./attributes.js";
export {
  AttributeRankError,
  MAX_ATTRIBUTE_RANK,
  MAX_EFFECTIVE_RANK,
  cumulativeCostForRank,
  effectiveRank,
  isAffordable,
  totalCost,
} from "./attributes.js";

export type { Character } from "./character.js";
export {
  CharacterValidationError,
  accessibleAttributeIds,
  primaryAttributeIds,
  validateCharacter,
} from "./character.js";

export * from "./equipment/index.js";

export { describePrimaryAttribute } from "./primary-attributes.js";

export type { BuildProblem, PlayerBuild, SkillBar } from "./build.js";
export {
  ONE_ELITE_PER_BAR,
  SKILL_BAR_SLOTS,
  attributeRanksOf,
  defaultBuildEquipment,
  equippableSkills,
  isProfessionId,
  parsePlayerBuild,
  toCharacter,
  validatePlayerBuild,
} from "./build.js";
export type { JoinLoadout, JoinRefusal } from "./join-loadout.js";
export { loadoutOf, resolveJoinLoadout } from "./join-loadout.js";
export { STARTER_BUILDS, pickBuildFrom, pickStarterBuild } from "./starter-builds.js";
export {
  STARTER_TEAMS,
  pickStarterTeam,
  type StarterTeam,
  type StarterTeamMember,
} from "./starter-teams.js";
export { FIRST_NAMES, SURNAMES, randomCharacterName } from "./character-names.js";

export * from "./skills/index.js";

export type {
  MatchEndReason,
  MatchMode,
  MatchOutcome,
  MatchPhase,
  MatchRules,
  MatchScore,
  MatchStanding,
  TeamStanding,
} from "./match-rules.js";
export {
  ANNIHILATION_MATCH_RULES,
  CAPTURE_POINTS_MATCH_RULES,
  DEATH_PENALTY_PERCENT,
  DP_GRACE_AFTER_RES_SECONDS,
  GUILD_BATTLE_MATCH_RULES,
  KILL_COUNT_MATCH_RULES,
  KILL_MORALE_PERCENT,
  KING_OF_THE_HILL_MATCH_RULES,
  MATCH_IN_PROGRESS,
  MATCH_MODES,
  MORALE_CEILING,
  MORALE_FLOOR,
  PRIEST_ANNIHILATION_MATCH_RULES,
  POINT_TICK_SECONDS,
  PRIEST_WAVE_SECONDS,
  RELIC_RUN_MATCH_RULES,
  addPoint,
  emptyScore,
  evaluateMatch,
  moraleMaximum,
} from "./match-rules.js";

export type {
  HeadlessFighter,
  HeadlessMatchOptions,
  HeadlessMatchResult,
} from "./tools/headless-match.js";
export { fighter, runHeadlessMatch } from "./tools/headless-match.js";
export type { BenchCrowd, BenchField, TickBench } from "./tools/tick-bench.js";
export { DENSE_FIELD, runTickBench, tickStats } from "./tools/tick-bench.js";

export type {
  Creature,
  CreatureKind,
  CompanionMode,
  CreatureOrder,
  CreatureLook,
  GroundEffect,
  MatchSimulationOptions,
  Participant,
  ParticipantSpec,
  SkillRequest,
  StepResult,
  WeaponSetRequest,
} from "./match/simulation.js";
export {
  countsForTeam,
  CREATURE_LOOKS,
  loadoutSpec,
  MAX_CREATURES,
  MAX_MAP_CREATURES,
  companionMode,
  MAX_GROUND_EFFECTS,
  MatchSimulation,
} from "./match/simulation.js";
export type { CorpseCandidate } from "./match/corpses.js";
export { isFreshCorpse, nearestFreshCorpse } from "./match/corpses.js";
export {
  MINION_CAP_ATTRIBUTE,
  MINION_DEGENERATION_STEP_SECONDS,
  minionCap,
  minionDegenerationPips,
} from "./match/minions.js";
export type { CompanionSkill } from "./match/companions.js";
export { companionSkills, PET_DEATH_GRACE_SECONDS } from "./match/companions.js";
export { facingToward, spawnFacing } from "./match/facing.js";
export type { Shrine } from "./match/priest.js";
export { PRIEST_SKILL_ID, priestId } from "./match/priest.js";
export type { GuildLord } from "./match/guild-lord.js";
export type { CarriedObject, CarriedPlace, CarriedSpawn } from "./match/carried.js";
export { FLAG_STAND_ID, isCarriedObjectId } from "./match/carried.js";
export type { FlagField, FlagPlace, FlagState, StandState } from "./match/flags.js";
export {
  FLAG_MORALE_BOOST,
  FLAG_REACH_UNITS,
  STAND_HOLD_SECONDS,
  flagId,
  flagTeamOf,
} from "./match/flags.js";
export type { RelicField, RelicState } from "./match/relics.js";
export type { CapturePoint } from "./match/capture-points.js";
export { CAPTURE_REACH_UNITS, CAPTURE_SECONDS } from "./match/capture-points.js";
export { ALTAR_REACH_UNITS, relicId, relicTeamOf } from "./match/relics.js";
export type { AltarState } from "./match/altar.js";
export type { GhostSpawn, HillField } from "./match/ghost.js";
export { CLAIM_SKILL_ID, ghostId, isGhostId } from "./match/ghost.js";
export { GUILD_LORD_HEALTH, guildLordId, guildLordLossCap } from "./match/guild-lord.js";
export type { BaseGuard, GuardRole } from "./match/guards.js";
export { GUARD_ROLE_IDS, GUARD_ROLES, guardId } from "./match/guards.js";
export type { IntentRefusal, MatchIntent } from "./match/apply-intent.js";
export { applyIntent } from "./match/apply-intent.js";
export { MAX_CATCHUP_SECONDS, drainAccumulator } from "./match/accumulator.js";

export type {
  CombatCause,
  CombatLogEntry,
  CombatTally,
  MatchTallyRow,
} from "./match/combat-log.js";
export { CombatMeter, MatchTally, tallyCombat } from "./match/combat-log.js";

export type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
  Targeting,
} from "./match/behaviour.js";
export { createCursor, decide, nearestLiving, resolveTargeting } from "./match/behaviour.js";

export type {
  TrainingDummy,
  TrainingKnob,
  TrainingMechanic,
  TrainingScenario,
} from "./match/training-scenarios.js";
export {
  getTrainingScenario,
  PLAYER_TEAM,
  scenarioParticipants,
  TRAINING_SCENARIOS,
} from "./match/training-scenarios.js";
