export type { ActivationCheck, ActivationRejection, ActivationRequest } from "./activation.js";
export {
  canActivate,
  energyCostOf,
  payCost,
  targetLivenessAllows,
  targetRuleAllows,
} from "./activation.js";

export type { ActiveCast } from "./cast-state.js";
export { CastState } from "./cast-state.js";

export { IMPLEMENTED_SKILLS, SKILLS_BY_ID, getSkill } from "./catalog.js";

export type { EffectDescription, MagnitudeDescription, SkillDescription } from "./describe.js";
export {
  describeSkill,
  describeStatus,
  formatScalingRange,
  neededWeaponText,
  overcastText,
} from "./describe.js";

export type { MissingMechanic, SkillCoverage, UnimplementedSkill } from "./coverage.js";
export {
  MISSING_MECHANIC_DESCRIPTIONS,
  computeCoverage,
  formatCoverage,
  missingMechanics,
  unmaintainedUpkeepSkills,
} from "./coverage.js";

export type { CombatEvent } from "./effects.js";

export type { Projectile } from "./projectile.js";
export { leadAimPoint } from "./projectile.js";
export type { WeaponSnapshot } from "./weapon-attack.js";
export { swingProgress } from "./weapon-attack.js";
export { applyEffect, applyEffects, applyStatus } from "./effects.js";

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
  MaxHealthLoss,
  StatusModifiers,
} from "./status.js";
export {
  STATUS_DEFINITIONS,
  HEALING_MULTIPLIER_FLOOR,
  StatusSet,
  aggregateModifiers,
  combinedHealingMultiplier,
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
  healingMultiplierOf,
  maxHealthLossOf,
  maxHealthLossOfStatusIds,
  moveSpeedMultiplier,
  naturalHealthPips,
  netPips,
  preCapEnergyPips,
  upkeepPips,
  outsideMatch,
  rankOf,
  weaponDamageMultiplierOf,
} from "./tick.js";
export type { NetPips, RankHolder } from "./tick.js";

export type {
  ApplyStatusEffect,
  MaintainStatusEffect,
  AttackSkillRule,
  AttackWeaponClass,
  AttributeScaling,
  ChainMark,
  ChainRole,
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

export { CHAIN_MARK_SECONDS } from "./chain.js";

export { makeCombatant } from "./testing.js";

export type { DamagePacket, DamageSource } from "./damage.js";
export {
  armorMultiplier,
  effectiveArmor,
  mitigate,
  skillDamage,
  unmitigatedDamage,
  weaponAttributeMultiplier,
} from "./damage.js";
