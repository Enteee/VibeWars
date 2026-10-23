export type { ActivationCheck, ActivationRejection, ActivationRequest } from "./activation.js";
export { canActivate, payCost } from "./activation.js";

export type { ActiveCast } from "./cast-state.js";
export { CastState } from "./cast-state.js";

export { IMPLEMENTED_SKILLS, SKILLS_BY_ID, getSkill } from "./catalog.js";

export type { SkillCoverage } from "./coverage.js";
export { computeCoverage, formatCoverage } from "./coverage.js";

export type { CombatEvent } from "./effects.js";
export { applyEffect, applyEffects } from "./effects.js";

export { resolveMagnitude } from "./scaling.js";

export type {
  ActiveStatus,
  StatusCategory,
  StatusDefinition,
  StatusId,
  StatusModifiers,
} from "./status.js";
export {
  STATUS_DEFINITIONS,
  StatusSet,
  aggregateModifiers,
  getStatusDefinition,
} from "./status.js";

export { advanceStatuses, attackMisses, effectiveMaxHealth } from "./tick.js";

export type {
  ApplyStatusEffect,
  AttributeScaling,
  Combatant,
  DamageEffect,
  EnergyGainEffect,
  HealEffect,
  InterruptEffect,
  Magnitude,
  RemoveStatusEffect,
  ResourceKind,
  SacrificeHealthEffect,
  Skill,
  SkillContext,
  SkillCost,
  SkillEffect,
  TargetRule,
} from "./types.js";

export { makeCombatant } from "./testing.js";
