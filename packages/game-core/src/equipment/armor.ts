import type { ProfessionId } from "../professions.js";
import type { EquippedRune } from "./runes.js";
import type { InsigniaId } from "./insignias.js";
import { ARMOR_SLOTS, type ArmorSlot } from "./types.js";

/**
 * Armor (ADR-0012).
 *
 * Five pieces, each carrying at most one insignia and one rune — so a
 * character has at most five runes, which is the budget that makes the
 * attribute-rune health trade a real decision rather than a free
 * +15 to everything.
 */

/**
 * Base armor by **primary** profession.
 *
 * The secondary profession does not contribute. That is both faithful to
 * the reference and load-bearing for build identity: if a Mesmer/Warrior
 * got warrior armor, the primary choice would be worth noticeably less.
 *
 * These are the numbers the damage curve in `skills/damage.ts` is
 * calibrated against — 60 is the reference point at which mitigation is
 * exactly 1.0, which is why the caster professions sit there.
 *
 * One number for the whole character rather than a rating per piece.
 * That matches the reference at max armor, where every set within a
 * profession has the same rating and the differences between sets are
 * carried by insignias instead. It also means armor cannot be chosen:
 * armor is profession-locked in the reference, so a light profession
 * wearing heavy armor is not a trade-off, it is a rule that does not
 * exist. Recorded in `coverage.ts` as `"per-piece-armor-ratings"`.
 */
export const BASE_ARMOR_BY_PROFESSION: Readonly<Record<ProfessionId, number>> = Object.freeze({
  warrior: 80,
  paragon: 80,
  ranger: 70,
  assassin: 70,
  dervish: 70,
  monk: 60,
  necromancer: 60,
  mesmer: 60,
  elementalist: 60,
  ritualist: 60,
});

export function baseArmorFor(profession: ProfessionId): number {
  return BASE_ARMOR_BY_PROFESSION[profession];
}

/**
 * Energy regeneration by primary profession, in pips (GW1, Q63): every
 * character has 2, and the armor adds 0, +1 or +2. Armor is
 * profession-locked here, so the sum is a table, as armor is.
 */
export const BASE_ENERGY_PIPS_BY_PROFESSION: Readonly<Record<ProfessionId, number>> = Object.freeze(
  {
    warrior: 2,
    paragon: 2,
    ranger: 3,
    monk: 4,
    necromancer: 4,
    mesmer: 4,
    elementalist: 4,
    assassin: 4,
    ritualist: 4,
    dervish: 4,
  },
);

export function baseEnergyPipsFor(profession: ProfessionId): number {
  return BASE_ENERGY_PIPS_BY_PROFESSION[profession];
}

/** One of the five pieces, as a build stores it. */
export interface ArmorPiece {
  readonly insigniaId: InsigniaId | null;
  readonly rune: EquippedRune | null;
}

export type ArmorSet = Readonly<Record<ArmorSlot, ArmorPiece>>;

const BARE_PIECE: ArmorPiece = Object.freeze({ insigniaId: null, rune: null });

/** Five pieces with nothing slotted into them. The honest default. */
export function bareArmorSet(): ArmorSet {
  return Object.freeze({
    head: BARE_PIECE,
    chest: BARE_PIECE,
    hands: BARE_PIECE,
    legs: BARE_PIECE,
    feet: BARE_PIECE,
  });
}

/** Pieces in a stable order, so iteration never depends on key order. */
export function armorPieces(set: ArmorSet): readonly (readonly [ArmorSlot, ArmorPiece])[] {
  return ARMOR_SLOTS.map((slot) => [slot, set[slot]] as const);
}
