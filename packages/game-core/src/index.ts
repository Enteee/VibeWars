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
export { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
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
export { DEFAULT_SKILL_BAR, HOUSE_LOADOUT, resolveJoinLoadout } from "./join-loadout.js";

export * from "./skills/index.js";

export type {
  MatchEndReason,
  MatchOutcome,
  MatchPhase,
  MatchRules,
  MatchScore,
  MatchStanding,
  TeamStanding,
} from "./match-rules.js";
export {
  ANNIHILATION_MATCH_RULES,
  DEATH_PENALTY_PERCENT,
  DEFAULT_MATCH_RULES,
  DP_GRACE_AFTER_RES_SECONDS,
  KILL_COUNT_MATCH_RULES,
  KILL_MORALE_PERCENT,
  MATCH_IN_PROGRESS,
  MORALE_CEILING,
  MORALE_FLOOR,
  RANDOM_ARENA_RULES,
  addKill,
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
export type { BenchField, TickBench } from "./tools/tick-bench.js";
export { DENSE_FIELD, runTickBench, tickStats } from "./tools/tick-bench.js";

export type {
  Creature,
  CreatureKind,
  MatchSimulationOptions,
  Participant,
  ParticipantSpec,
  SkillRequest,
  StepResult,
} from "./match/simulation.js";
export { countsForTeam, MAX_CREATURES, MatchSimulation } from "./match/simulation.js";
export { facingToward, spawnFacing } from "./match/facing.js";
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
