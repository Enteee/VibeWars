import { MAX_EFFECTIVE_RANK } from "../attributes.js";
import { ENERGY_STORAGE_ATTRIBUTE, energyStorageBonus } from "../primary-attributes.js";
import type { ProfessionId } from "../professions.js";
import type { CombatRules } from "../ruleset.js";
import type { StatusId } from "../skills/status.js";
import { creatureDamageMultiplier, creatureRankDamageMultiplier } from "../skills/damage.js";
import type { CreatureAttack } from "../skills/types.js";
import {
  HEADGEAR_BONUS,
  INHERENT_ARMOR_BY_PROFESSION,
  NO_PIECE_ARMOR,
  NO_PIECE_REDUCTION,
  armorPieces,
  baseArmorFor,
  baseEnergyPipsFor,
  headgearAttributeOf,
  type ConditionalArmor,
  type PieceArmor,
  type PieceReduction,
} from "./armor.js";
import {
  getInsignia,
  insigniaAllowed,
  perSlotAmount,
  type ArmorCondition,
  type Insignia,
} from "./insignias.js";
import type { BuildEquipment, WeaponSet } from "./loadout.js";
import { wornMods, type ModEffect, type ModSpells, type ModWhile, type WeaponMod } from "./mods.js";
import { getOffhand, type OffhandId } from "./offhands.js";
import {
  ATTRIBUTE_RUNE_TIERS,
  RUNE_TIERS,
  UNIVERSAL_RUNES,
  getUniversalRune,
  type EquippedRune,
  type RuneEffect,
  type RuneTier,
  type UniversalRuneId,
} from "./runes.js";
import type { ArmorSlot, DamageType, EquipmentRequirement } from "./types.js";
import { getWeapon, weaponDamageType, type Weapon } from "./weapons.js";

/**
 * Turning a build's gear into the numbers the simulation uses
 * (ADR-0012).
 *
 * This runs **once, before a `Combatant` is constructed**, and that is
 * the whole design. `Combatant.maxHealth` and `attributeRanks` are
 * `readonly` because they are the character sheet, not simulation
 * state. Every weapon set is resolved here too, each to its own
 * `ResolvedEquipment` and maximum energy, and a swap in a match only
 * picks another of them (ADR-0036): nothing is resolved twice.
 * Resolving up front means a rune cannot be applied twice, cannot be
 * applied in the wrong order, and cannot disagree between the build
 * editor and the server — both call this.
 */

export interface ResolvedWeapon {
  readonly weapon: Weapon;
  /** The attribute its damage scales with, if any. */
  readonly attributeId: string | undefined;
  /** What its blows deal: a wand or staff takes the nominated attribute's element (#761). */
  readonly damageType: DamageType;
  /** Whether the bearer actually meets the requirement. */
  readonly requirementMet: boolean;
  /**
   * A minion's (#1131) or a spirit's (#1239): what its summoner's rank does
   * to every blow, in place of weapon mastery. `undefined` for every weapon
   * a player holds, and a pet's, which scale with weapon mastery.
   */
  readonly creatureDamageScale: number | undefined;
}

/** What the held weapon's mods do to its hits (#2009). */
export interface WeaponHitMods {
  /** Health each landed hit steals: Vampiric's. */
  readonly lifeSteal: number;
  /** Energy each landed hit gains: Zealous'. */
  readonly energyOnHit: number;
  /** Sundering's: the chance a hit has `sunderPenetration` more armor penetration. */
  readonly sunderChance: number;
  readonly sunderPenetration: number;
  /** Furious': the chance a hit's adrenaline is doubled. */
  readonly doubleAdrenalineChance: number;
  /** Multiplier on a condition the weapon's attacks cause: Barbed's 1.33 on Bleeding. */
  readonly inflictedDurationScale: ReadonlyMap<StatusId, number>;
  /** More from the weapon's roll, each while its condition holds (#2010): Strength and Honor's. */
  readonly attackDamage: readonly ModOf<"attack-damage">[];
}

/** One kind of mod effect, as the resolved set carries it. */
export type ModOf<K extends ModEffect["kind"]> = Extract<ModEffect, { readonly kind: K }>;

export const NO_HIT_MODS: WeaponHitMods = Object.freeze({
  lifeSteal: 0,
  energyOnHit: 0,
  sunderChance: 0,
  sunderPenetration: 0,
  doubleAdrenalineChance: 0,
  inflictedDurationScale: new Map(),
  attackDamage: [],
});

/** A chance a mod acts on a spell (#2011); `attributeId` `undefined`: on any spell. */
export interface SpellChance {
  readonly chance: number;
  readonly attributeId: string | undefined;
}

/** What the held set's mods do to its wielder's spells (#2011). */
export interface SpellMods {
  /** Each halves a spell's casting time at its chance: Adept's, Swift's. */
  readonly castHalves: readonly SpellChance[];
  /** Each halves a spell's recharge at its chance: of Memory's, of Quickening's. */
  readonly rechargeHalves: readonly SpellChance[];
  /** Each raises its item's attribute by 1 for a spell at its chance: of Mastery's. */
  readonly attributePlusOne: readonly (SpellChance & { readonly attributeId: string })[];
  /** Multiplier on enchantments the wielder casts: of Enchanting's 1.2. */
  readonly enchantmentDurationScale: number;
}

export const NO_SPELL_MODS: SpellMods = Object.freeze({
  castHalves: [],
  rechargeHalves: [],
  attributePlusOne: [],
  enchantmentDurationScale: 1,
});

export interface ResolvedEquipment {
  readonly mainHand: ResolvedWeapon;
  /** The held set's mods that act on a hit (#2009). */
  readonly hitMods: WeaponHitMods;
  /** The held set's mods that act on its wielder's spells (#2011). */
  readonly spellMods: SpellMods;
  /** Health regeneration the held set's mods give, in pips: Vampiric's -1. */
  readonly healthPips: number;
  /** Armor before any conditional bonus or status modifier. */
  readonly baseArmor: number;
  /** On every hit: the profession's inherent armor, a creature's, a guard's. */
  readonly conditionalArmor: readonly ConditionalArmor[];
  /** Insignias, on hits to their own piece only (#1135). */
  readonly pieceArmor: PieceArmor;
  /** Knight's, off a physical hit to its own piece only, after armor (#1142). */
  readonly pieceReduction: PieceReduction;
  /** Rune of Absorption: subtracted from each physical hit, after mitigation. */
  readonly flatPhysicalReduction: number;
  /** The held set's cuts off a physical hit, by condition or chance (#2010): Luck of the Draw's. */
  readonly physicalReductions: readonly ModOf<"physical-reduction">[];
  /** The held set's maximum Health while its condition holds (#2010): of Devotion's. */
  readonly conditionalMaxHealth: readonly ModOf<"conditional-max-health">[];
  /** The held set's maximum Energy while its condition holds (#2010): Hale and Hearty's. */
  readonly conditionalMaxEnergy: readonly ModOf<"conditional-max-energy">[];
  /** Multiplier applied to an incoming condition's duration. Absent means 1. */
  readonly statusDurationScale: ReadonlyMap<StatusId, number>;
  /**
   * What runes and headgear add to each attribute, already in `attributeRanks`: what
   * tells an allocated rank from a boosted one, as weakness must (#762).
   */
  readonly attributeBonuses: ReadonlyMap<string, number>;
  /** The off-hand that counts, for its mark in the arena (#276); `undefined` for none. */
  readonly offhandId: OffhandId | undefined;
}

/** One carried set, resolved (ADR-0036). */
export interface ResolvedWeaponSet {
  /** Main hand, off-hand, and armor with this set's shield; the runes' share is the same in every set. */
  readonly equipment: ResolvedEquipment;
  /** Maximum energy holding this set, before morale: a focus's bonus is in it. */
  readonly maxEnergy: number;
  /** Maximum health holding this set, before morale: its mods' is in it (#2007). */
  readonly maxHealth: number;
  /** Energy regeneration before any status, in pips: the primary's, and this set's mods'. */
  readonly baseEnergyPips: number;
}

export type ResolvedWeaponSets = readonly [
  ResolvedWeaponSet,
  ResolvedWeaponSet | null,
  ResolvedWeaponSet | null,
  ResolvedWeaponSet | null,
];

export interface ResolvedLoadout {
  /** Allocated ranks plus rune and headgear bonuses, clamped to `MAX_EFFECTIVE_RANK`. */
  readonly attributeRanks: ReadonlyMap<string, number>;
  /** Index i is build set i; `null` where the build's is. */
  readonly weaponSets: ResolvedWeaponSets;
}

export interface LoadoutInput {
  readonly primaryProfession: ProfessionId;
  /** Whose attributes the headgear may raise, with the primary's (#1140). */
  readonly secondaryProfession: ProfessionId | undefined;
  /** Ranks bought with attribute points, before runes. */
  readonly allocatedRanks: ReadonlyMap<string, number>;
  readonly equipment: BuildEquipment;
}

/** The attribute a piece of gear is linked to, fixed or nominated. */
function linkedAttribute(
  requirement: EquipmentRequirement,
  nominated: string | null,
): string | undefined {
  if (requirement.kind === "fixed") {
    return requirement.attributeId;
  }
  return nominated ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* Runes                                                                       */
/* -------------------------------------------------------------------------- */

interface RuneTotals {
  readonly attributeBonuses: ReadonlyMap<string, number>;
  readonly healthDelta: number;
  readonly energyDelta: number;
  readonly flatPhysicalReduction: number;
  readonly statusDurationScale: ReadonlyMap<StatusId, number>;
}

/**
 * Add up every equipped rune.
 *
 * The one rule worth reading twice: for two runes of the *same*
 * attribute, only the **largest bonus** counts, but **every** health
 * penalty does. That asymmetry is the entire mechanic — it is what stops
 * "slot five superior runes of Swordsmanship" from being free, and why
 * `validateEquipment` reports a duplicate as a problem rather than
 * silently letting it happen.
 *
 * A universal rune counts once however many are worn, at the best tier
 * worn, unless it `stacks` (GW1: two Runes of Clarity are 20%, not 36%).
 */
function totalRunes(equipment: BuildEquipment, primaryProfession: ProfessionId): RuneTotals {
  const bestBonusPerAttribute = new Map<string, number>();
  const statusDurationScale = new Map<StatusId, number>();
  let healthDelta = 0;
  let energyDelta = 0;
  let flatPhysicalReduction = 0;
  const bestTierPerRune = new Map<UniversalRuneId, RuneTier>();
  const worn: RuneEffect[] = [];

  for (const [slot, piece] of armorPieces(equipment.armor)) {
    const insignia = wornInsignia(piece.insigniaId, primaryProfession);
    if (insignia?.effect.kind === "health") {
      healthDelta += perSlotAmount(insignia.effect, slot);
    } else if (insignia?.effect.kind === "energy") {
      energyDelta += perSlotAmount(insignia.effect, slot);
    }

    const rune: EquippedRune | null = piece.rune;
    if (rune === null) {
      continue;
    }

    if (rune.kind === "attribute") {
      const tier = ATTRIBUTE_RUNE_TIERS[rune.tier];
      const best = bestBonusPerAttribute.get(rune.attributeId) ?? 0;
      bestBonusPerAttribute.set(rune.attributeId, Math.max(best, tier.bonus));
      // Unconditional: the penalty is paid per rune, not per attribute.
      healthDelta -= tier.healthPenalty;
      continue;
    }

    const definition = getUniversalRune(rune.runeId);
    if (definition === undefined) {
      continue;
    }
    if (
      definition.requiresPrimary !== undefined &&
      definition.requiresPrimary !== primaryProfession
    ) {
      // Validation rejects this, but the resolver must still be safe to
      // call on a build that slipped through from an older client.
      continue;
    }

    if (definition.stacks) {
      worn.push(definition.byTier[rune.tier]);
      continue;
    }
    const best = bestTierPerRune.get(definition.id);
    if (best === undefined || RUNE_TIERS.indexOf(best) < RUNE_TIERS.indexOf(rune.tier)) {
      bestTierPerRune.set(definition.id, rune.tier);
    }
  }

  for (const [runeId, tier] of bestTierPerRune) {
    worn.push(UNIVERSAL_RUNES[runeId].byTier[tier]);
  }
  for (const effect of worn) {
    switch (effect.kind) {
      case "health":
        healthDelta += effect.amount;
        break;
      case "energy":
        energyDelta += effect.amount;
        break;
      case "flat-physical-reduction":
        flatPhysicalReduction += effect.amount;
        break;
      case "status-duration":
        for (const statusId of effect.statusIds) {
          // Multiplicative across different runes, so two reductions
          // never reach zero duration — the same reason miss chance
          // multiplies. Two of the same rune count once, above.
          const current = statusDurationScale.get(statusId) ?? 1;
          statusDurationScale.set(statusId, current * (1 - effect.reduction));
        }
        break;
    }
  }

  return {
    attributeBonuses: bestBonusPerAttribute,
    healthDelta,
    energyDelta,
    flatPhysicalReduction,
    statusDurationScale,
  };
}

/**
 * The insignia a piece holds, if it counts: another primary's is
 * rejected by validation, and grants nothing if it gets here anyway, as
 * a `requiresPrimary` rune does (#1142).
 */
function wornInsignia(insigniaId: string | null, primary: ProfessionId): Insignia | undefined {
  const insignia = insigniaId === null ? undefined : getInsignia(insigniaId);
  return insignia !== undefined && insigniaAllowed(insignia, primary) ? insignia : undefined;
}

/** Each piece's insignia armor and cut, which only a hit to that piece meets (#1135, #1142). */
function pieceInsigniasOf(
  equipment: BuildEquipment,
  primary: ProfessionId,
): { readonly pieceArmor: PieceArmor; readonly pieceReduction: PieceReduction } {
  const pieceArmor: Record<ArmorSlot, readonly ConditionalArmor[]> = { ...NO_PIECE_ARMOR };
  const pieceReduction: Record<ArmorSlot, number> = { ...NO_PIECE_REDUCTION };
  for (const [slot, piece] of armorPieces(equipment.armor)) {
    const effect = wornInsignia(piece.insigniaId, primary)?.effect;
    if (effect?.kind === "conditional-armor") {
      pieceArmor[slot] = effect.bonuses;
    } else if (effect?.kind === "physical-reduction") {
      pieceReduction[slot] = effect.amount;
    }
  }
  return { pieceArmor, pieceReduction };
}

/* -------------------------------------------------------------------------- */
/* The resolver                                                                */
/* -------------------------------------------------------------------------- */

/** Each attribute's rune and headgear bonus, before any cap. */
function attributeBonusesOf(
  equipment: BuildEquipment,
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): Map<string, number> {
  // The headgear's +1 stacks with the best rune of its attribute (#1140).
  const attributeBonuses = new Map(totalRunes(equipment, primary).attributeBonuses);
  const headgear = headgearAttributeOf(equipment.armor.head, primary, secondary);
  if (headgear !== undefined) {
    attributeBonuses.set(headgear, (attributeBonuses.get(headgear) ?? 0) + HEADGEAR_BONUS);
  }
  return attributeBonuses;
}

function withBonuses(
  allocatedRanks: ReadonlyMap<string, number>,
  attributeBonuses: ReadonlyMap<string, number>,
): Map<string, number> {
  // Rune and headgear bonuses raise the ceiling past what points alone
  // can buy, which is exactly what a superior rune is for.
  const attributeRanks = new Map(allocatedRanks);
  for (const [attributeId, bonus] of attributeBonuses) {
    const base = attributeRanks.get(attributeId) ?? 0;
    attributeRanks.set(attributeId, Math.min(MAX_EFFECTIVE_RANK, base + bonus));
  }
  return attributeRanks;
}

/**
 * The ranks a build fights at: bought ranks plus rune and headgear
 * bonuses, capped at `MAX_EFFECTIVE_RANK` (#1900). What `resolveLoadout`
 * puts in `attributeRanks`, for skill text outside a match.
 */
export function effectiveRanks(
  allocatedRanks: ReadonlyMap<string, number>,
  equipment: BuildEquipment,
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): Map<string, number> {
  return withBonuses(allocatedRanks, attributeBonusesOf(equipment, primary, secondary));
}

export function resolveLoadout(input: LoadoutInput, rules: CombatRules): ResolvedLoadout {
  const runes = totalRunes(input.equipment, input.primaryProfession);
  const attributeBonuses = attributeBonusesOf(
    input.equipment,
    input.primaryProfession,
    input.secondaryProfession,
  );
  const attributeRanks = withBonuses(input.allocatedRanks, attributeBonuses);

  const rankOf = (attributeId: string | undefined): number =>
    attributeId === undefined ? 0 : (attributeRanks.get(attributeId) ?? 0);

  // Energy Storage (#532) adds to the maximum like Attunement does, once
  // at join; only an Elementalist primary holds its rank.
  const shared: SharedGear = {
    baseArmor: baseArmorFor(input.primaryProfession),
    health: rules.baseHealth + runes.healthDelta,
    baseEnergyPips: baseEnergyPipsFor(input.primaryProfession),
    energyDelta: runes.energyDelta + energyStorageBonus(rankOf(ENERGY_STORAGE_ATTRIBUTE)),
    conditionalArmor: INHERENT_ARMOR_BY_PROFESSION[input.primaryProfession],
    ...pieceInsigniasOf(input.equipment, input.primaryProfession),
    flatPhysicalReduction: runes.flatPhysicalReduction,
    statusDurationScale: runes.statusDurationScale,
    attributeBonuses,
  };
  const [set1, set2, set3, set4] = input.equipment.weaponSets;
  const resolve = (set: WeaponSet | null): ResolvedWeaponSet | null =>
    set === null ? null : resolveWeaponSet(set, shared, rankOf, rules);

  return {
    attributeRanks,
    weaponSets: [
      resolveWeaponSet(set1, shared, rankOf, rules),
      resolve(set2),
      resolve(set3),
      resolve(set4),
    ],
  };
}

/** What every weapon set shares: armor and runes are one set (ADR-0036). */
interface SharedGear {
  /** Before any mod's; runes and insignias count once, in every set. */
  readonly health: number;
  /** Before any mod's. */
  readonly baseEnergyPips: number;
  /** Before a shield's bonus. */
  readonly baseArmor: number;
  /** Before a focus's bonus. */
  readonly energyDelta: number;
  readonly conditionalArmor: readonly ConditionalArmor[];
  readonly pieceArmor: PieceArmor;
  readonly pieceReduction: PieceReduction;
  readonly flatPhysicalReduction: number;
  readonly statusDurationScale: ReadonlyMap<StatusId, number>;
  readonly attributeBonuses: ReadonlyMap<string, number>;
}

function resolveWeaponSet(
  set: WeaponSet,
  shared: SharedGear,
  rankOf: (attributeId: string | undefined) => number,
  rules: CombatRules,
): ResolvedWeaponSet {
  const weapon = getWeapon(set.mainHand.weaponId);
  const resolvedWeapon = resolveWeapon(weapon, set.mainHand.requirementAttributeId, rankOf);

  let baseArmor = shared.baseArmor;
  let energyDelta = shared.energyDelta;
  let offhandId: OffhandId | undefined;
  // Each mod with its item's attribute (#2011): Adept's "of the item's attribute".
  const mods: { readonly mod: WeaponMod; readonly itemAttribute: string | undefined }[] = wornMods(
    set.mainHand.upgrades,
  ).map((mod) => ({
    mod,
    itemAttribute: set.mainHand.requirementAttributeId ?? undefined,
  }));

  const offHand = set.offHand;
  if (offHand !== null) {
    const definition = getOffhand(offHand.offhandId);
    // An off-hand alongside a two-handed weapon is rejected by
    // validation; if one reaches here anyway it grants nothing rather
    // than quietly handing out free armor.
    if (definition !== undefined && weapon?.grip === "one-handed") {
      offhandId = offHand.offhandId;
      const linked = linkedAttribute(definition.requirement, offHand.requirementAttributeId);
      const met = rankOf(linked) >= definition.requirement.rank;
      const amount = definition.baseBonus + (met ? definition.metRequirementBonus : 0);
      if (definition.kind === "armor") {
        baseArmor += amount;
      } else {
        energyDelta += amount;
      }
      mods.push(...wornMods(offHand.upgrades).map((mod) => ({ mod, itemAttribute: linked })));
    }
  }

  // The set's mods (#2007), on top of what every set shares.
  let healthDelta = 0;
  let pipsDelta = 0;
  let healthPips = 0;
  let conditionalArmor = shared.conditionalArmor;
  let statusDurationScale = shared.statusDurationScale;
  let mainHand = resolvedWeapon;
  let hitMods = NO_HIT_MODS;
  const physicalReductions: ModOf<"physical-reduction">[] = [];
  const conditionalMaxHealth: ModOf<"conditional-max-health">[] = [];
  const conditionalMaxEnergy: ModOf<"conditional-max-energy">[] = [];
  const castHalves: SpellChance[] = [];
  const rechargeHalves: SpellChance[] = [];
  const attributePlusOne: (SpellChance & { readonly attributeId: string })[] = [];
  let enchantmentDurationScale = 1;
  for (const { effect, itemAttribute } of mods.flatMap(({ mod, itemAttribute }) =>
    mod.effects.map((effect) => ({ effect, itemAttribute })),
  )) {
    // An item with no attribute has none to act on: never one a mod fits.
    const scoped = (chance: number, spells: ModSpells): SpellChance | undefined =>
      spells === "any"
        ? { chance, attributeId: undefined }
        : itemAttribute === undefined
          ? undefined
          : { chance, attributeId: itemAttribute };
    switch (effect.kind) {
      case "max-health":
        healthDelta += effect.amount;
        break;
      case "max-energy":
        energyDelta += effect.amount;
        break;
      case "energy-regen":
        pipsDelta += effect.pips;
        break;
      case "armor":
        baseArmor += effect.amount;
        break;
      case "armor-vs":
        conditionalArmor = [...conditionalArmor, modArmor(effect)];
        break;
      case "condition-duration": {
        // Multiplies with a rune of the same condition, as two runes do.
        const scale = new Map(statusDurationScale);
        scale.set(effect.statusId, (scale.get(effect.statusId) ?? 1) * (1 - effect.reduction));
        statusDurationScale = scale;
        break;
      }
      case "life-steal-on-hit":
        hitMods = {
          ...hitMods,
          lifeSteal: hitMods.lifeSteal + (effect.amountByWeapon[set.mainHand.weaponId] ?? 0),
        };
        break;
      case "health-regen":
        healthPips += effect.pips;
        break;
      case "energy-on-hit":
        hitMods = { ...hitMods, energyOnHit: hitMods.energyOnHit + effect.amount };
        break;
      case "armor-penetration-chance":
        hitMods = {
          ...hitMods,
          sunderChance: effect.chance,
          sunderPenetration: effect.penetration,
        };
        break;
      case "double-adrenaline-chance":
        hitMods = { ...hitMods, doubleAdrenalineChance: effect.chance };
        break;
      case "inflicted-condition-duration": {
        const scale = new Map(hitMods.inflictedDurationScale);
        scale.set(effect.statusId, (scale.get(effect.statusId) ?? 1) * (1 + effect.increase));
        hitMods = { ...hitMods, inflictedDurationScale: scale };
        break;
      }
      case "damage-type":
        mainHand = { ...mainHand, damageType: effect.type };
        break;
      case "attack-damage":
        hitMods = { ...hitMods, attackDamage: [...hitMods.attackDamage, effect] };
        break;
      case "conditional-armor":
        conditionalArmor = [...conditionalArmor, whileArmor(effect.amount, effect.while)];
        break;
      case "conditional-max-health":
        conditionalMaxHealth.push(effect);
        break;
      case "conditional-max-energy":
        conditionalMaxEnergy.push(effect);
        break;
      case "physical-reduction":
        physicalReductions.push(effect);
        break;
      case "cast-halve-chance": {
        const scope = scoped(effect.chance, effect.of);
        if (scope !== undefined) castHalves.push(scope);
        break;
      }
      case "recharge-halve-chance": {
        const scope = scoped(effect.chance, effect.of);
        if (scope !== undefined) rechargeHalves.push(scope);
        break;
      }
      case "attribute-plus-one-chance":
        if (itemAttribute !== undefined) {
          attributePlusOne.push({ chance: effect.chance, attributeId: itemAttribute });
        }
        break;
      case "enchantment-duration":
        enchantmentDurationScale *= 1 + effect.increase;
        break;
    }
  }

  return {
    equipment: {
      mainHand,
      hitMods,
      spellMods: { castHalves, rechargeHalves, attributePlusOne, enchantmentDurationScale },
      healthPips,
      baseArmor,
      conditionalArmor,
      pieceArmor: shared.pieceArmor,
      pieceReduction: shared.pieceReduction,
      flatPhysicalReduction: shared.flatPhysicalReduction,
      physicalReductions,
      conditionalMaxHealth,
      conditionalMaxEnergy,
      statusDurationScale,
      attributeBonuses: shared.attributeBonuses,
      offhandId,
    },
    maxEnergy: Math.max(1, rules.baseEnergy + energyDelta),
    maxHealth: Math.max(rules.minimumMaxHealth, shared.health + healthDelta),
    baseEnergyPips: shared.baseEnergyPips + pipsDelta,
  };
}

/** A mod's armor against one kind of damage, as an insignia's is written. */
function modArmor(effect: Extract<ModEffect, { kind: "armor-vs" }>): ConditionalArmor {
  const condition: ArmorCondition =
    effect.against === "physical"
      ? { kind: "vs-physical" }
      : effect.against === "elemental"
        ? { kind: "vs-elemental" }
        : { kind: "vs-type", type: effect.against };
  return { amount: effect.amount, conditions: [condition] };
}

/** A mod's armor while the wielder's `condition` holds (#2010), as an insignia's is written. */
function whileArmor(amount: number, condition: ModWhile): ConditionalArmor {
  return { amount, conditions: [{ kind: "mod-while", while: condition }] };
}

function resolveWeapon(
  weapon: Weapon | undefined,
  nominated: string | null,
  rankOf: (attributeId: string | undefined) => number,
): ResolvedWeapon {
  // An unknown weapon id resolves to fists rather than throwing: this
  // runs on join, and a stale client must not be able to refuse itself
  // entry (brief §27).
  const resolved = weapon ?? getWeapon("unarmed");
  if (resolved === undefined) {
    throw new Error("internal: the unarmed fallback is missing from the weapon catalog");
  }
  const attributeId = linkedAttribute(resolved.requirement, nominated);
  return {
    weapon: resolved,
    attributeId,
    damageType: weaponDamageType(resolved, attributeId),
    // Fists and anything else with no attribute link are always "met":
    // there is no training that would improve them.
    requirementMet: attributeId === undefined || rankOf(attributeId) >= resolved.requirement.rank,
    creatureDamageScale: undefined,
  };
}

/** Fists, no armor bonuses, nothing slotted. The default for a bare combatant. */
export function unarmedResolvedEquipment(baseArmor: number): ResolvedEquipment {
  const unarmed = getWeapon("unarmed");
  if (unarmed === undefined) {
    throw new Error("internal: the unarmed fallback is missing from the weapon catalog");
  }
  return {
    mainHand: {
      weapon: unarmed,
      attributeId: undefined,
      damageType: unarmed.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
    hitMods: NO_HIT_MODS,
    spellMods: NO_SPELL_MODS,
    healthPips: 0,
    baseArmor,
    conditionalArmor: [],
    pieceArmor: NO_PIECE_ARMOR,
    pieceReduction: NO_PIECE_REDUCTION,
    flatPhysicalReduction: 0,
    physicalReductions: [],
    conditionalMaxHealth: [],
    conditionalMaxEnergy: [],
    statusDurationScale: new Map(),
    attributeBonuses: new Map(),
    offhandId: undefined,
  };
}

/**
 * A creature's (#467 child 3): unarmed with `armor`, or, with an attack,
 * a weapon of its numbers keyed to `attack.attributeId`, scaled by its
 * summoner's `rank` there (#1131). The weapon keeps the id "unarmed",
 * which is all the client draws and the log names.
 */
export function creatureResolvedEquipment(
  armor: number,
  attack: CreatureAttack | undefined,
  rank: number,
): ResolvedEquipment {
  const unarmed = unarmedResolvedEquipment(armor);
  if (attack === undefined) {
    return unarmed;
  }
  return {
    ...unarmed,
    mainHand: {
      weapon: {
        ...unarmed.mainHand.weapon,
        damageMin: attack.damageMin,
        damageMax: attack.damageMax,
        damageType: attack.damageType,
        attackIntervalSeconds: attack.attackIntervalSeconds,
        range: attack.range,
        projectileSpeed: attack.projectileSpeed,
        onHit: attack.onHit,
      },
      attributeId: attack.attributeId,
      damageType: attack.damageType,
      requirementMet: true,
      creatureDamageScale: creatureDamageScale(attack, rank),
    },
  };
}

/** What `rank` does to a creature's blows, as its `scaling` says; `undefined`: weapon mastery. */
function creatureDamageScale(attack: CreatureAttack, rank: number): number | undefined {
  switch (attack.scaling.kind) {
    case "level":
      return creatureDamageMultiplier(rank, attack.scaling.level);
    case "rank":
      return creatureRankDamageMultiplier(rank, attack.scaling.atZero, attack.damageMax);
    case "weapon-mastery":
      return undefined;
  }
}
