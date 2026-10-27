export type { ActivationCheck, ActivationRejection, ActivationRequest } from "./activation.js";
export { canActivate, energyCostOf, payCost, targetRuleAllows } from "./activation.js";

export type { ActiveCast } from "./cast-state.js";
export { CastState } from "./cast-state.js";

export { IMPLEMENTED_SKILLS, SKILLS_BY_ID, getSkill } from "./catalog.js";

export type { EffectDescription, MagnitudeDescription, SkillDescription } from "./describe.js";
export { describeSkill, describeStatus, formatScalingRange, neededWeaponText } from "./describe.js";

export type { MissingMechanic, SkillCoverage, UnimplementedSkill } from "./coverage.js";
export {
  MISSING_MECHANIC_DESCRIPTIONS,
  computeCoverage,
  formatCoverage,
  missingMechanics,
} from "./coverage.js";

export type { CombatEvent } from "./effects.js";

export type { Projectile } from "./projectile.js";
export { leadAimPoint } from "./projectile.js";
export type { WeaponSnapshot } from "./weapon-attack.js";
export { swingProgress } from "./weapon-attack.js";
export { applyEffect, applyEffects } from "./effects.js";

export type { SkillRole } from "./roles.js";
export { SKILL_ROLES, skillRoles } from "./roles.js";

export { resolveMagnitude, resolveMagnitudeAtRanks } from "./scaling.js";

export type {
  ActiveStatus,
  ArmorReduction,
  BlockRule,
  Outbreak,
  StatusCategory,
  StatusDefinition,
  StatusId,
  StatusModifiers,
} from "./status.js";
export {
  STATUS_DEFINITIONS,
  StatusSet,
  aggregateModifiers,
  findStatusDefinition,
  getStatusDefinition,
  isStatusId,
  scaledStatusDuration,
} from "./status.js";

export {
  advanceStatuses,
  armorReductionOf,
  attackMissChanceOf,
  blockChanceOf,
  effectiveActivationSeconds,
  effectiveMaxHealth,
  moveSpeedMultiplier,
  naturalHealthPips,
  netPips,
  outsideMatch,
  rankOf,
  weaponDamageMultiplierOf,
} from "./tick.js";
export type { NetPips, RankHolder } from "./tick.js";

export type {
  ApplyStatusEffect,
  AttackSkillRule,
  AttackWeaponClass,
  AttributeScaling,
  Combatant,
  DamageEffect,
  EnergyGainEffect,
  HealEffect,
  InterruptEffect,
  KnockdownEffect,
  Magnitude,
  RemoveStatusEffect,
  ResourceKind,
  SacrificeHealthEffect,
  Skill,
  SkillContext,
  SkillCost,
  SkillEffect,
  SkillProjectile,
  SkillType,
  TargetRule,
} from "./types.js";

export { KNOCKDOWN_SECONDS } from "./types.js";

export { makeCombatant } from "./testing.js";

export type { DamagePacket, DamageSource } from "./damage.js";
export {
  armorMultiplier,
  effectiveArmor,
  mitigate,
  respectsArmor,
  spellDamage,
  unmitigatedDamage,
  weaponAttributeMultiplier,
} from "./damage.js";
