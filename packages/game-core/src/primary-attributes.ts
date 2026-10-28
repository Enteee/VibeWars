/**
 * What each profession's primary attribute does (#473): small pure
 * functions of the bearer's effective rank, runes included, called from
 * the seams they act on. Only a primary holds its rank, so no profession
 * check is needed.
 */

import { isSpell, type Skill } from "./skills/types.js";

/** The Assassin's primary. */
export const CRITICAL_STRIKES_ATTRIBUTE = "assassin.critical-strikes";

/** Crit chance each rank of Critical Strikes adds to weapon blows. */
export const CRITICAL_STRIKES_CHANCE_PER_RANK = 0.01;

/** Energy a critical blow gives its striker: GW1's 1 / 2 / 3 at ranks 3–7 / 8–12 / 13+. */
export function criticalStrikesEnergy(rank: number): number {
  if (rank >= 13) {
    return 3;
  }
  if (rank >= 8) {
    return 2;
  }
  return rank >= 3 ? 1 : 0;
}

/** The Ranger's primary. */
export const EXPERTISE_ATTRIBUTE = "ranger.expertise";

/** Share of an energy cost each rank of Expertise takes off. */
export const EXPERTISE_COST_CUT_PER_RANK = 0.04;

/**
 * What `skill`'s energy cost comes to with this rank of Expertise (#528):
 * 4% less a rank, rounded once, never below 0, for an attack skill, a
 * ritual of any profession (#1100) or any Ranger skill. Any other skill's
 * cost stands.
 */
export function expertiseEnergyCost(rank: number, skill: Skill, cost: number): number {
  if (!expertiseCuts(skill)) {
    return cost;
  }
  return Math.max(0, Math.round(cost * (1 - EXPERTISE_COST_CUT_PER_RANK * rank)));
}

/** Whether Expertise cuts `skill`'s cost: an attack, a ritual or a Ranger skill. */
function expertiseCuts(skill: Skill): boolean {
  return (
    skill.type === "attack" ||
    skill.type === "nature-ritual" ||
    skill.type === "binding-ritual" ||
    skill.profession === "ranger"
  );
}

/** The Warrior's primary. */
export const STRENGTH_ATTRIBUTE = "warrior.strength";

/** Armor penetration each rank of Strength gives an attack skill. */
export const STRENGTH_PENETRATION_PER_RANK = 0.01;

/**
 * An attack skill's armor penetration with this rank of Strength (#528):
 * 1% a rank, unless the weapon has penetration of its own, which stands
 * instead; the two do not add.
 */
export function strengthArmorPenetration(rank: number, weaponPenetration: number): number {
  return weaponPenetration > 0 ? weaponPenetration : STRENGTH_PENETRATION_PER_RANK * rank;
}

/** The Mesmer's primary. */
export const FAST_CASTING_ATTRIBUTE = "mesmer.fast-casting";

/** A non-Mesmer spell or signet this slow or slower is sped up by Fast Casting too. */
export const FAST_CASTING_MIN_FOREIGN_ACTIVATION_SECONDS = 2;

/**
 * What Fast Casting multiplies an activation it speeds up by, GW1's
 * 2^(−rank/15): ×0.574 at rank 12.
 */
export function fastCastingSpeed(rank: number): number {
  return 2 ** (-rank / 15);
}

/** Share of a signet's activation each rank of Fast Casting takes off (#1100). */
export const FAST_CASTING_SIGNET_CUT_PER_RANK = 0.03;

/**
 * What Fast Casting multiplies a signet's activation by: 3% less a rank,
 * linear, ×0.64 at rank 12. Never below 0, for ranks no build reaches.
 */
export function fastCastingSignetSpeed(rank: number): number {
  return Math.max(0, 1 - FAST_CASTING_SIGNET_CUT_PER_RANK * rank);
}

/**
 * What Fast Casting multiplies this spell's or signet's activation by:
 * a spell's by GW1's 2^(−rank/15), ×0.574 at rank 12, still shrinking
 * above it; a signet's by 3% less a rank, ×0.64 at rank 12 (#1100). Every
 * Mesmer spell or signet, and another profession's whose base activation
 * is 2 s or more; 1 for anything else.
 */
export function fastCastingMultiplier(rank: number, skill: Skill): number {
  if (!isSpell(skill.type) && skill.type !== "signet") {
    return 1;
  }
  if (
    skill.profession !== "mesmer" &&
    skill.activationSeconds < FAST_CASTING_MIN_FOREIGN_ACTIVATION_SECONDS
  ) {
    return 1;
  }
  return skill.type === "signet" ? fastCastingSignetSpeed(rank) : fastCastingSpeed(rank);
}

/** The Monk's primary. */
export const DIVINE_FAVOR_ATTRIBUTE = "monk.divine-favor";

/**
 * The extra heal Divine Favor gives the ally a Monk spell is cast on, the
 * caster included (#529): floor(3.2 × rank), +38 at rank 12. 0 for any
 * other skill, and for a Monk spell cast at a foe.
 */
export function divineFavorBonusHeal(rank: number, skill: Skill, targetIsAlly: boolean): number {
  if (skill.profession !== "monk" || !isSpell(skill.type) || !targetIsAlly) {
    return 0;
  }
  return divineFavorHeal(rank);
}

/** Divine Favor's extra heal for a spell it applies to: floor(3.2 × rank). */
export function divineFavorHeal(rank: number): number {
  // 3.2 × rank in whole numbers, so no float lands a hair under an integer.
  return Math.floor((16 * rank) / 5);
}

/** The Necromancer's primary. */
export const SOUL_REAPING_ATTRIBUTE = "necromancer.soul-reaping";

/** Soul Reaping triggers at most this often in any `SOUL_REAPING_WINDOW_SECONDS`. */
export const SOUL_REAPING_MAX_TRIGGERS = 3;

/** The window `SOUL_REAPING_MAX_TRIGGERS` counts over. */
export const SOUL_REAPING_WINDOW_SECONDS = 15;

/** Energy one Soul Reaping trigger gives, before the maximum caps it: the rank. */
export function soulReapingEnergy(rank: number): number {
  return rank;
}

/**
 * The trigger times after a death at `atSeconds` (#530), or `undefined`
 * if it does not trigger: it does when fewer than 3 of `triggers` fall in
 * (atSeconds − 15, atSeconds]. Older entries are dropped.
 */
export function soulReapingTrigger(
  triggers: readonly number[],
  atSeconds: number,
): readonly number[] | undefined {
  const recent = triggers.filter((at) => at > atSeconds - SOUL_REAPING_WINDOW_SECONDS);
  return recent.length < SOUL_REAPING_MAX_TRIGGERS ? [...recent, atSeconds] : undefined;
}

/** The Paragon's primary. */
export const LEADERSHIP_ATTRIBUTE = "paragon.leadership";

/**
 * Energy Leadership gives for one shout (#625): 1 for each ally it
 * affected, the shouter included, up to 1 for every 2 ranks.
 */
export function leadershipEnergy(rank: number, alliesAffected: number): number {
  return Math.min(alliesAffected, Math.floor(rank / 2));
}

/** The Elementalist's primary. */
export const ENERGY_STORAGE_ATTRIBUTE = "elementalist.energy-storage";

/** Maximum energy each rank of Energy Storage adds (Q69). */
export const ENERGY_STORAGE_ENERGY_PER_RANK = 3;

/** The maximum energy Energy Storage adds at this rank (#532): +3 a rank, +36 at rank 12. */
export function energyStorageBonus(rank: number): number {
  return ENERGY_STORAGE_ENERGY_PER_RANK * rank;
}

/** The Dervish's primary. */
export const MYSTICISM_ATTRIBUTE = "dervish.mysticism";

/** Share of a Dervish enchantment's energy cost each rank of Mysticism takes off. */
export const MYSTICISM_COST_CUT_PER_RANK = 0.04;

/** Armor each rank of Mysticism gives its bearer while enchanted. */
export const MYSTICISM_ARMOR_PER_RANK = 1;

/**
 * What `skill`'s energy cost comes to with this rank of Mysticism (#874):
 * 4% less a rank, rounded once, never below 0, for a Dervish enchantment.
 * Any other skill's cost stands.
 */
export function mysticismEnergyCost(rank: number, skill: Skill, cost: number): number {
  if (skill.type !== "enchantment" || skill.profession !== "dervish") {
    return cost;
  }
  return Math.max(0, Math.round(cost * (1 - MYSTICISM_COST_CUT_PER_RANK * rank)));
}

/** The armor Mysticism gives an enchanted bearer at this rank (#874): +1 a rank. */
export function mysticismArmor(rank: number): number {
  return MYSTICISM_ARMOR_PER_RANK * rank;
}

/** A share in [0, 1] as a whole percentage, for a readout. */
function percent(share: number): string {
  return `${String(Math.round(share * 100))}%`;
}

/**
 * What a primary attribute does at `rank`, in one line, for the build
 * editor (#531): "spells cast 43% faster". Every number comes from the
 * function the simulation uses. `undefined` at rank 0, and for an
 * attribute with no effect of its own: every secondary, and a primary
 * whose effect is not in yet.
 */
export function describePrimaryAttribute(attributeId: string, rank: number): string | undefined {
  if (rank <= 0) {
    return undefined;
  }
  switch (attributeId) {
    case FAST_CASTING_ATTRIBUTE:
      return (
        `spells cast ${percent(1 - fastCastingSpeed(rank))} faster, ` +
        `signets ${percent(1 - fastCastingSignetSpeed(rank))} faster`
      );
    case EXPERTISE_ATTRIBUTE:
      return `attack skills, rituals and Ranger skills cost ${percent(EXPERTISE_COST_CUT_PER_RANK * rank)} less energy`;
    case STRENGTH_ATTRIBUTE:
      return `attack skills ${percent(strengthArmorPenetration(rank, 0))} armor penetration`;
    case DIVINE_FAVOR_ATTRIBUTE:
      return `Monk spells on allies heal +${String(divineFavorHeal(rank))}`;
    case CRITICAL_STRIKES_ATTRIBUTE:
      return (
        `+${percent(CRITICAL_STRIKES_CHANCE_PER_RANK * rank)} critical chance, ` +
        `+${String(criticalStrikesEnergy(rank))} energy per critical`
      );
    case SOUL_REAPING_ATTRIBUTE:
      return (
        `+${String(soulReapingEnergy(rank))} energy when someone nearby dies ` +
        `(${String(SOUL_REAPING_MAX_TRIGGERS)} per ${String(SOUL_REAPING_WINDOW_SECONDS)} s)`
      );
    case ENERGY_STORAGE_ATTRIBUTE:
      return `+${String(energyStorageBonus(rank))} maximum energy`;
    case LEADERSHIP_ATTRIBUTE:
      return (
        `up to ${String(leadershipEnergy(rank, Number.POSITIVE_INFINITY))} energy per shout, ` +
        "1 per ally affected"
      );
    case MYSTICISM_ATTRIBUTE:
      return (
        `Dervish enchantments cost ${percent(MYSTICISM_COST_CUT_PER_RANK * rank)} less energy, ` +
        `+${String(mysticismArmor(rank))} armor while enchanted`
      );
    default:
      return undefined;
  }
}
