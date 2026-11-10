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
export { beaconStrikeArea } from "./match/beacon.js";
export {
  isZoneSourceId,
  ZONE_KINDS,
  ZONE_RULES,
  zoneKindOfSource,
  zoneOffsetAt,
  zonePhaseAt,
  ZONE_TELEGRAPH_SECONDS,
  zoneReach,
  zonesHolding,
} from "./match/zones.js";
export type {
  MatchZone,
  ZoneKind,
  ZonePath,
  ZonePhase,
  ZoneRule,
  ZoneSchedule,
} from "./match/zones.js";

export type { Polygon, Segment } from "./geometry.js";
export { pointInPolygon, progressAlong } from "./geometry.js";
export {
  buildLayeredNavGraph,
  buildNavGraph,
  createLayeredPathFinder,
  createPathFinder,
  navGraphFor,
  minRampLength,
  nearestStandable,
  rampLength,
  type LayeredPathFinder,
  type NavGraph,
  type NavZone,
  type NavLayer,
  type NavTransition,
  type PathFinder,
  type RouteWaypoint,
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
  LARGEST_RANK_COST,
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
export { ELITE_ZAISHEN_MAP, drawZaishen, zaishenMoraleBoost } from "./elite-zaishen.js";
export {
  ATTRIBUTE_IDS,
  decodeTemplateCode,
  encodeTemplateCode,
  looksLikeTemplate,
  type DecodeResult,
  type EncodeResult,
  type TemplateBuild,
} from "./template-code.js";
export {
  STARTER_TEAMS,
  pickStarterTeam,
  type StarterTeam,
  type StarterTeamMember,
} from "./starter-teams.js";
export { PLAYER_ADJECTIVES, PLAYER_NOUNS, randomPlayerName } from "./player-names.js";

export * from "./skills/index.js";

export type {
  MatchEndReason,
  MatchMode,
  MatchOutcome,
  MatchPhase,
  MatchRules,
  MatchScore,
  MatchStanding,
  TeamCount,
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
  THREEFOLD_KEEP_MATCH_RULES,
  MATCH_IN_PROGRESS,
  HALLS_MATCH_RULES,
  HALL_SLOT_SECONDS,
  HALL_SLOT_WINDOW_SECONDS,
  hallSlotOpen,
  nextHallSlotMs,
  isHallsMode,
  MATCH_MODES,
  type HallsMode,
  MORALE_CEILING,
  MORALE_FLOOR,
  PRIEST_ANNIHILATION_MATCH_RULES,
  POINT_TICK_SECONDS,
  PRIEST_WAVE_SECONDS,
  CAPTURE_WAVE_SECONDS,
  FOE_RELIC_RUN_MATCH_RULES,
  RELIC_RUN_MATCH_RULES,
  TWO_TEAM_MODES,
  addPoint,
  emptyScore,
  evaluateMatch,
  moraleMaximum,
  teamIds,
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
  MatchLayers,
  MatchSimulationOptions,
  Participant,
  ParticipantSpec,
  SkillRequest,
  StepResult,
  WeaponSetRequest,
  StartLine,
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
  walkableAreas,
} from "./match/simulation.js";
export { rampRims, UPHILL, type Uphill } from "./match/layer-rules.js";
export type { CorpseCandidate } from "./match/corpses.js";
export { isFreshCorpse, nearestFreshCorpse } from "./match/corpses.js";
export {
  MASTERLESS_TEAM,
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
export type { RelicCarry, RelicField, RelicState, RelicTarget } from "./match/relics.js";
export type { Gate, GateField, GateOpener } from "./match/gates.js";
export { GATE_PLATE_REACH_UNITS, GATE_REOPEN_SECONDS } from "./match/gates.js";
export type { Switch, SwitchField, SwitchState } from "./match/switches.js";
export { switchIdOf, switchTargetId } from "./match/switches.js";
export type { CapturePoint, CapturePointSite } from "./match/capture-points.js";
export {
  CAPTURE_REACH_UNITS,
  CAPTURE_SECONDS,
  GHOST_PIPS,
  MAX_PIPS,
} from "./match/capture-points.js";
export { ALTAR_REACH_UNITS, relicId, relicTeamOf } from "./match/relics.js";
export type { AltarState } from "./match/altar.js";
export type { GhostField, GhostLevel, GhostSpawn } from "./match/ghost.js";
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
export { creatureSummonerOf } from "./match/creature-id.js";

export type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
  Reaction,
  Targeting,
} from "./match/behaviour.js";
export {
  BOT_REACTION,
  createCursor,
  decide,
  INSTANT_REACTION,
  nearestLiving,
  resolveTargeting,
} from "./match/behaviour.js";
export { isSpikeSkill } from "./match/bot/skill-intent.js";

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
