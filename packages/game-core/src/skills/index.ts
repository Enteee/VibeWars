export type { ActivationCheck, ActivationRejection, ActivationRequest } from "./activation.js";
export {
  canActivate,
  energyCostOf,
  isAllyOrSelfRule,
  isCompanionRule,
  isResurrectionSkill,
  payCost,
  targetLivenessAllows,
  targetRuleAllows,
  usableMidAction,
} from "./activation.js";

export type { ActiveCast, SlotSkill } from "./cast-state.js";
export { CastState, resolvedBar } from "./cast-state.js";

export { IMPLEMENTED_SKILLS, MAINTAINED_STATUSES, SKILLS_BY_ID, getSkill } from "./catalog.js";

export type {
  DescriptionPart,
  EffectDescription,
  MagnitudeDescription,
  SkillDescription,
} from "./describe.js";
export {
  describeSkill,
  describeStatus,
  chainRequirementText,
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

export { resolveMagnitude, resolveMagnitudeAtRanks, statAt, statAtTwelve } from "./scaling.js";

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
  StatusStat,
} from "./status.js";
export {
  STATUS_DEFINITIONS,
  HEALING_MULTIPLIER_FLOOR,
  NO_RANKS,
  StatusSet,
  aggregateModifiers,
  combinedHealingMultiplier,
  findStatusDefinition,
  getStatusDefinition,
  isStatusId,
  preventsAttacks,
  preventsEnchantments,
  preventsResurrection,
  preventsShoutsAndChants,
  preventsSpells,
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
  raisedMaxHealth,
  upkeepPips,
  outsideMatch,
  rankOf,
  weaponDamageMultiplierOf,
} from "./tick.js";
export type { NetPips, RankHolder } from "./tick.js";
export { raisedMaxEnergy } from "./overcast.js";

export type {
  ApplyStatusEffect,
  MaintainStatusEffect,
  AttackSkillRule,
  AttackWeaponClass,
  AttributeScaling,
  LevelScaling,
  Aura,
  ChainMark,
  ChainRole,
  Combatant,
  CreateGroundEffect,
  GroundAct,
  CreatureTemplate,
  DamageEffect,
  EnergyGainEffect,
  HealEffect,
  InterruptEffect,
  KnockdownEffect,
  Magnitude,
  PulseRule,
  RemoveStatusEffect,
  ResourceKind,
  SacrificeHealthEffect,
  Skill,
  SkillContext,
  SkillCost,
  SkillEffect,
  SkillProjectile,
  SkillType,
  SummonEffect,
  TargetRule,
  TrapRule,
} from "./types.js";

export { KNOCKDOWN_SECONDS, PET_ATTACK_SECONDS, isSpell } from "./types.js";

export { CHAIN_MARK_SECONDS } from "./chain.js";

export { makeCombatant } from "./testing.js";

export type { DamagePacket, DamageSource, HitLocation } from "./damage.js";
export {
  armorMultiplier,
  effectiveArmor,
  hitLocationOf,
  mitigate,
  skillDamage,
  unmitigatedDamage,
  weaponAttributeMultiplier,
} from "./damage.js";
