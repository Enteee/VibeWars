/**
 * Equipment: weapons, off-hands, armor, runes and insignias (ADR-0012).
 *
 * Static catalogs plus the build-time shapes that reference them.
 * Nothing here simulates anything — the damage pipeline and the swing
 * timer live in `skills/`, and they read these catalogs rather than the
 * other way round, which keeps the dependency one-way.
 */

export type { DamageType, EquipmentRequirement, ArmorSlot } from "./types.js";
export {
  ARMOR_SLOTS,
  EQUIPMENT_REQUIREMENT_RANK,
  isArmorSlot,
  isElementalDamage,
  isPhysicalDamage,
} from "./types.js";

export type { DoubleStrikeRule, Weapon, WeaponGrip, WeaponId } from "./weapons.js";
export {
  ALL_WEAPONS,
  CASTER_WEAPON_ELEMENT,
  LONG_BOW_RANGE,
  UNARMED_WEAPON_ID,
  WEAPONS,
  allowsOffhand,
  getWeapon,
  isWeaponId,
  weaponDamageType,
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

export type {
  ArmorPiece,
  ArmorSet,
  ConditionalArmor,
  HeadPiece,
  PieceArmor,
  PieceReduction,
} from "./armor.js";
export {
  BASE_ARMOR_BY_PROFESSION,
  BASE_ENERGY_PIPS_BY_PROFESSION,
  HEADGEAR_BONUS,
  HIT_LOCATION_WEIGHTS,
  INHERENT_ARMOR_BY_PROFESSION,
  NO_PIECE_ARMOR,
  NO_PIECE_REDUCTION,
  armorPieces,
  bareArmorSet,
  baseArmorFor,
  baseEnergyPipsFor,
  headgearAttributeOf,
  rollHitLocation,
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
export {
  ALL_INSIGNIAS,
  INSIGNIAS,
  getInsignia,
  insigniaAllowed,
  isInsigniaId,
  perSlotAmount,
} from "./insignias.js";

export type {
  ItemUpgrades,
  ModEffect,
  ModId,
  ModItem,
  ModSlot,
  ModStatusWhile,
  ModWhile,
  WeaponMod,
} from "./mods.js";
export {
  MOD_SLOTS,
  MOD_WHILE_TEXT,
  MOD_SLOT_KEYS,
  NO_UPGRADES,
  WEAPON_MODS,
  fittingUpgrades,
  getWeaponMod,
  isModId,
  modFits,
  wornMods,
} from "./mods.js";

export type {
  BuildEquipment,
  EquippedOffhand,
  EquippedWeapon,
  WeaponSet,
  WeaponSetIndex,
  WeaponSets,
} from "./loadout.js";
export {
  WEAPON_SETS,
  defaultEquipmentFor,
  defaultOffhandFor,
  defaultWeaponFor,
  isWeaponSetIndex,
} from "./loadout.js";

export type { GearOmission, MissingGearMechanic } from "./coverage.js";
export { GEAR_OMISSIONS, formatGearCoverage, gearOmission, openGearGaps } from "./coverage.js";

export { parseBuildEquipment } from "./parse.js";

export type {
  LoadoutInput,
  ResolvedEquipment,
  ResolvedLoadout,
  ResolvedWeapon,
  ResolvedWeaponSet,
  ResolvedWeaponSets,
  WeaponHitMods,
} from "./resolve.js";
export {
  NO_HIT_MODS,
  creatureResolvedEquipment,
  effectiveRanks,
  resolveLoadout,
  unarmedResolvedEquipment,
} from "./resolve.js";

export type { ReconcileContext } from "./reconcile.js";
export { reconcileEquipment, weaponReachable } from "./reconcile.js";

export type { EquipmentProblem, EquipmentValidationContext } from "./validate.js";
export { validateEquipment } from "./validate.js";
