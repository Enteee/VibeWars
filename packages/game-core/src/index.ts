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

export type { Segment } from "./geometry.js";
export {
  circleIntersectsSegment,
  closestPointOnSegment,
  distancePointToSegment,
  distanceWithinRange,
  hasLineOfSight,
  resolveCircleSegmentCollision,
  segment,
  segmentsIntersect,
} from "./geometry.js";

export type { AttributeRules, CollisionRules, MovementRules, Ruleset } from "./ruleset.js";
export { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";

export type { AttributeDefinition, ProfessionDefinition, ProfessionId } from "./professions.js";
export { PROFESSIONS, getAttribute, getProfession, primaryAttributeOf } from "./professions.js";

export type { AttributeAllocation, AttributeModifier } from "./attributes.js";
export {
  AttributeRankError,
  MAX_ATTRIBUTE_RANK,
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

export * from "./skills/index.js";
