/**
 * Equipment: weapons, off-hands, armor, runes and insignias (ADR-0012).
 *
 * Static catalogs plus the build-time shapes that reference them.
 * Nothing here simulates anything — the damage pipeline and the swing
 * timer live in `skills/`, and they read these catalogs rather than the
 * other way round, which keeps the dependency one-way.
 */

export type { DamageType, EquipmentRequirement, ArmorSlot } from "./types.js";
export { ARMOR_SLOTS, EQUIPMENT_REQUIREMENT_RANK, isArmorSlot, isPhysicalDamage } from "./types.js";

export type { DoubleStrikeRule, Weapon, WeaponGrip, WeaponId } from "./weapons.js";
export {
  ALL_WEAPONS,
  LONG_BOW_RANGE,
  UNARMED_WEAPON_ID,
  WEAPONS,
  allowsOffhand,
  getWeapon,
  isWeaponId,
  wieldsFor,
} from "./weapons.js";

export type { Offhand, OffhandId, OffhandKind } from "./offhands.js";
export {
  ALL_OFFHANDS,
  OFFHANDS,
  SHIELD_REQUIREMENT_ATTRIBUTES,
  getOffhand,
  isOffhandId,
} from "./offhands.js";

export type { ArmorPiece, ArmorSet } from "./armor.js";
export {
  BASE_ARMOR_BY_PROFESSION,
  BASE_ENERGY_PIPS_BY_PROFESSION,
  armorPieces,
  bareArmorSet,
  baseArmorFor,
  baseEnergyPipsFor,
} from "./armor.js";

export type {
  AttributeRuneTier,
  EquippedRune,
  RuneEffect,
  RuneTier,
  UniversalRune,
  UniversalRuneId,
} from "./runes.js";
export {
  ALL_UNIVERSAL_RUNES,
  ATTRIBUTE_RUNE_TIERS,
  RUNE_TIERS,
  UNIVERSAL_RUNES,
  getUniversalRune,
  isRuneTier,
  isUniversalRuneId,
  runeDisplayName,
} from "./runes.js";

export type { ArmorCondition, Insignia, InsigniaEffect, InsigniaId } from "./insignias.js";
export { ALL_INSIGNIAS, INSIGNIAS, getInsignia, isInsigniaId, perSlotAmount } from "./insignias.js";

export type { BuildEquipment, EquippedOffhand, EquippedWeapon } from "./loadout.js";
export { defaultEquipmentFor, defaultOffhandFor, defaultWeaponFor } from "./loadout.js";

export type { GearOmission, MissingGearMechanic } from "./coverage.js";
export { GEAR_OMISSIONS, formatGearCoverage, gearOmission, openGearGaps } from "./coverage.js";

export { parseBuildEquipment } from "./parse.js";

export type {
  ConditionalArmor,
  LoadoutInput,
  ResolvedEquipment,
  ResolvedLoadout,
  ResolvedWeapon,
} from "./resolve.js";
export { resolveLoadout, unarmedResolvedEquipment } from "./resolve.js";

export type { ReconcileContext } from "./reconcile.js";
export { reconcileEquipment } from "./reconcile.js";

export type { EquipmentProblem, EquipmentValidationContext } from "./validate.js";
export { validateEquipment } from "./validate.js";
