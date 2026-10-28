import { accessibleAttributeIds } from "../character.js";
import type { ProfessionId } from "../professions.js";
import type { SimulationRng } from "../rng.js";
import type { EquippedRune } from "./runes.js";
import type { ArmorCondition, InsigniaId } from "./insignias.js";
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
 * Insignias are per piece, though (#1135): see `rollHitLocation`.
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

/** Armor that applies only when its condition holds, from a profession or an insignia. */
export interface ConditionalArmor {
  readonly amount: number;
  readonly condition: ArmorCondition;
}

/** Each piece's own conditional armor: its insignia's (#1135). */
export type PieceArmor = Readonly<Record<ArmorSlot, readonly ConditionalArmor[]>>;

/** No piece armor at all: a bare body, a creature, a dummy. */
export const NO_PIECE_ARMOR: PieceArmor = Object.freeze({
  head: [],
  chest: [],
  hands: [],
  legs: [],
  feet: [],
});

/**
 * Armor a **primary** profession carries against one kind of damage
 * (GW1, #759): a Warrior's armor is 80 and +20 vs physical, a Ranger's 70
 * and +30 vs elemental. Every other profession has none; a Paragon sits
 * at a plain 80, with no inherent bonus that applies in PvP.
 */
export const INHERENT_ARMOR_BY_PROFESSION: Readonly<
  Record<ProfessionId, readonly ConditionalArmor[]>
> = Object.freeze({
  warrior: Object.freeze([Object.freeze({ amount: 20, condition: "vs-physical" })]),
  ranger: Object.freeze([Object.freeze({ amount: 30, condition: "vs-elemental" })]),
  paragon: [],
  assassin: [],
  dervish: [],
  monk: [],
  necromancer: [],
  mesmer: [],
  elementalist: [],
  ritualist: [],
});

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

/** What attribute headgear adds to its attribute (GW1, #1140): stacks with any rune. */
export const HEADGEAR_BONUS = 1;

/** The head piece: an insignia and a rune, like any, and the attribute its headgear raises (#1140). */
export interface HeadPiece extends ArmorPiece {
  /** `null` only in `bareArmorSet` (creatures, fixtures); a player build must name one. */
  readonly headgearAttributeId: string | null;
}

export type ArmorSet = Readonly<Record<Exclude<ArmorSlot, "head">, ArmorPiece>> & {
  readonly head: HeadPiece;
};

const BARE_PIECE: ArmorPiece = Object.freeze({ insigniaId: null, rune: null });

const BARE_HEAD: HeadPiece = Object.freeze({ ...BARE_PIECE, headgearAttributeId: null });

/** Five pieces with nothing slotted into them. The honest default. */
export function bareArmorSet(): ArmorSet {
  return Object.freeze({
    head: BARE_HEAD,
    chest: BARE_PIECE,
    hands: BARE_PIECE,
    legs: BARE_PIECE,
    feet: BARE_PIECE,
  });
}

/**
 * The attribute `head`'s headgear raises (#1140): one the character can
 * put points in, of the primary or the secondary. Anything else is wrong
 * data, `null` included, and gives no bonus; validation reports it.
 */
export function headgearAttributeOf(
  head: HeadPiece,
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): string | undefined {
  const attributeId = head.headgearAttributeId;
  return attributeId !== null && accessibleAttributeIds(primary, secondary).includes(attributeId)
    ? attributeId
    : undefined;
}

/** Pieces in a stable order, so iteration never depends on key order. */
export function armorPieces(set: ArmorSet): readonly (readonly [ArmorSlot, ArmorPiece])[] {
  return ARMOR_SLOTS.map((slot) => [slot, set[slot]] as const);
}

/**
 * How often a hit lands on each piece (GW1, Q127): the chest 3/8, the
 * legs 2/8, the head, hands and feet 1/8 each. An insignia's armor
 * counts only on hits to its own piece (#1135).
 */
export const HIT_LOCATION_WEIGHTS: Readonly<Record<ArmorSlot, number>> = Object.freeze({
  head: 1 / 8,
  chest: 3 / 8,
  hands: 1 / 8,
  legs: 2 / 8,
  feet: 1 / 8,
});

/** The order `rollHitLocation` lays the weights out in, heaviest first. */
const HIT_LOCATION_ORDER: readonly ArmorSlot[] = ["chest", "legs", "head", "hands", "feet"];

/** The piece a hit lands on: one `nextFloat`, cumulative in `HIT_LOCATION_ORDER`. */
export function rollHitLocation(rng: SimulationRng): ArmorSlot {
  const roll = rng.nextFloat();
  let cumulative = 0;
  for (const slot of HIT_LOCATION_ORDER) {
    cumulative += HIT_LOCATION_WEIGHTS[slot];
    if (roll < cumulative) {
      return slot;
    }
  }
  return "feet";
}
