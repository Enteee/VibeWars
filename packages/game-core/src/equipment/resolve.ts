import { MAX_EFFECTIVE_RANK } from "../attributes.js";
import { ENERGY_STORAGE_ATTRIBUTE, energyStorageBonus } from "../primary-attributes.js";
import type { ProfessionId } from "../professions.js";
import type { CombatRules } from "../ruleset.js";
import type { StatusId } from "../skills/status.js";
import {
  INHERENT_ARMOR_BY_PROFESSION,
  armorPieces,
  baseArmorFor,
  baseEnergyPipsFor,
  type ConditionalArmor,
} from "./armor.js";
import { getInsignia, perSlotAmount } from "./insignias.js";
import type { BuildEquipment } from "./loadout.js";
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
import type { ArmorSlot, EquipmentRequirement } from "./types.js";
import { getWeapon, type Weapon } from "./weapons.js";

/**
 * Turning a build's gear into the numbers the simulation uses
 * (ADR-0012).
 *
 * This runs **once, before a `Combatant` is constructed**, and that is
 * the whole design. `Combatant.maxHealth`, `maxEnergy` and
 * `attributeRanks` are `readonly` because they are the character sheet,
 * not simulation state; gear is fixed at join, so there is never a
 * reason to mutate them. Resolving up front means a rune cannot be
 * applied twice, cannot be applied in the wrong order, and cannot
 * disagree between the build editor and the server — both call this.
 */

export interface ResolvedWeapon {
  readonly weapon: Weapon;
  /** The attribute its damage scales with, if any. */
  readonly attributeId: string | undefined;
  /** Whether the bearer actually meets the requirement. */
  readonly requirementMet: boolean;
}

export interface ResolvedEquipment {
  readonly mainHand: ResolvedWeapon;
  /** Armor before any conditional bonus or status modifier. */
  readonly baseArmor: number;
  readonly conditionalArmor: readonly ConditionalArmor[];
  /** Rune of Absorption: subtracted from each physical hit, after mitigation. */
  readonly flatPhysicalReduction: number;
  /** Multiplier applied to an incoming condition's duration. Absent means 1. */
  readonly statusDurationScale: ReadonlyMap<StatusId, number>;
  /**
   * What runes add to each attribute, already in `attributeRanks`: what
   * tells an allocated rank from a boosted one, as weakness must (#762).
   */
  readonly attributeBonuses: ReadonlyMap<string, number>;
  /** The off-hand that counts, for its mark in the arena (#276); `undefined` for none. */
  readonly offhandId: OffhandId | undefined;
}

export interface ResolvedLoadout {
  readonly maxHealth: number;
  readonly maxEnergy: number;
  /** Energy regeneration before any status, in pips: the primary profession's. */
  readonly baseEnergyPips: number;
  /** Allocated ranks plus rune bonuses, clamped to `MAX_EFFECTIVE_RANK`. */
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly equipment: ResolvedEquipment;
}

export interface LoadoutInput {
  readonly primaryProfession: ProfessionId;
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
    if (piece.insigniaId !== null) {
      applyInsignia(piece.insigniaId, slot, (health, energy) => {
        healthDelta += health;
        energyDelta += energy;
      });
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

function applyInsignia(
  insigniaId: string,
  slot: ArmorSlot,
  add: (health: number, energy: number) => void,
): void {
  const insignia = getInsignia(insigniaId);
  if (insignia === undefined) {
    return;
  }
  const { effect } = insignia;
  if (effect.kind === "health") {
    add(perSlotAmount(effect, slot), 0);
  } else if (effect.kind === "energy") {
    add(0, perSlotAmount(effect, slot));
  }
}

/** The primary profession's inherent armor first, then the insignias'. */
function conditionalArmorOf(
  primaryProfession: ProfessionId,
  equipment: BuildEquipment,
): readonly ConditionalArmor[] {
  const bonuses: ConditionalArmor[] = [...INHERENT_ARMOR_BY_PROFESSION[primaryProfession]];
  for (const [, piece] of armorPieces(equipment.armor)) {
    if (piece.insigniaId === null) {
      continue;
    }
    const insignia = getInsignia(piece.insigniaId);
    if (insignia?.effect.kind === "conditional-armor") {
      bonuses.push({ amount: insignia.effect.amount, condition: insignia.effect.condition });
    }
  }
  return bonuses;
}

/* -------------------------------------------------------------------------- */
/* The resolver                                                                */
/* -------------------------------------------------------------------------- */

export function resolveLoadout(input: LoadoutInput, rules: CombatRules): ResolvedLoadout {
  const runes = totalRunes(input.equipment, input.primaryProfession);

  // Rune bonuses raise the ceiling past what points alone can buy, which
  // is exactly what a superior rune is for.
  const attributeRanks = new Map(input.allocatedRanks);
  for (const [attributeId, bonus] of runes.attributeBonuses) {
    const base = attributeRanks.get(attributeId) ?? 0;
    attributeRanks.set(attributeId, Math.min(MAX_EFFECTIVE_RANK, base + bonus));
  }

  const rankOf = (attributeId: string | undefined): number =>
    attributeId === undefined ? 0 : (attributeRanks.get(attributeId) ?? 0);

  const weapon = getWeapon(input.equipment.mainHand.weaponId);
  const resolvedWeapon = resolveWeapon(
    weapon,
    input.equipment.mainHand.requirementAttributeId,
    rankOf,
  );

  let baseArmor = baseArmorFor(input.primaryProfession);
  // Energy Storage (#532) adds to the maximum like Attunement does, once
  // at join; only an Elementalist primary holds its rank.
  let energyDelta = runes.energyDelta + energyStorageBonus(rankOf(ENERGY_STORAGE_ATTRIBUTE));
  let offhandId: OffhandId | undefined;

  const offHand = input.equipment.offHand;
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
    }
  }

  return {
    maxHealth: Math.max(rules.minimumMaxHealth, rules.baseHealth + runes.healthDelta),
    maxEnergy: Math.max(1, rules.baseEnergy + energyDelta),
    baseEnergyPips: baseEnergyPipsFor(input.primaryProfession),
    attributeRanks,
    equipment: {
      mainHand: resolvedWeapon,
      baseArmor,
      conditionalArmor: conditionalArmorOf(input.primaryProfession, input.equipment),
      flatPhysicalReduction: runes.flatPhysicalReduction,
      statusDurationScale: runes.statusDurationScale,
      attributeBonuses: runes.attributeBonuses,
      offhandId,
    },
  };
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
    // Fists and anything else with no attribute link are always "met":
    // there is no training that would improve them.
    requirementMet: attributeId === undefined || rankOf(attributeId) >= resolved.requirement.rank,
  };
}

/** Fists, no armor bonuses, nothing slotted. The default for a bare combatant. */
export function unarmedResolvedEquipment(baseArmor: number): ResolvedEquipment {
  const unarmed = getWeapon("unarmed");
  if (unarmed === undefined) {
    throw new Error("internal: the unarmed fallback is missing from the weapon catalog");
  }
  return {
    mainHand: { weapon: unarmed, attributeId: undefined, requirementMet: true },
    baseArmor,
    conditionalArmor: [],
    flatPhysicalReduction: 0,
    statusDurationScale: new Map(),
    attributeBonuses: new Map(),
    offhandId: undefined,
  };
}
