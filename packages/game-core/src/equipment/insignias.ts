import { STRENGTH_ATTRIBUTE } from "../primary-attributes.js";
import type { ProfessionId } from "../professions.js";
import type { ConditionalArmor } from "./armor.js";
import type { ArmorSlot } from "./types.js";

/**
 * Armor insignias (ADR-0012).
 *
 * The prefix half of an armor piece, where the rune is the suffix. An
 * insignia is a flat, unconditional stat or a conditional slab of armor;
 * nothing here scales with an attribute, which is what keeps it a
 * different kind of choice from a rune.
 */

export type InsigniaId =
  | "survivor"
  | "radiant"
  | "stalwart"
  | "blessed"
  | "brawlers"
  | "knights"
  | "sentinels"
  | "nightstalkers"
  | "prodigys"
  | "windwalker"
  | "anchorites"
  | "disciples"
  | "wanderers"
  | "dreadnought"
  | "blighters"
  | "undertakers"
  | "minion-masters"
  | "forsaken"
  | "shamans"
  | "prismatic";

/**
 * One test a conditional armor bonus needs to pass (#1142).
 *
 * Closed: every kind is answerable from the packet and the defender,
 * state the simulation already has. The reference also has "while in a
 * stance" insignias; this game has no stances, so they are absent from
 * the catalog entirely and recorded as a gap in `coverage.ts`
 * (`"stances"`). A number that is always zero is a lie with a tooltip.
 */
export type ArmorCondition =
  | { readonly kind: "vs-physical" }
  | { readonly kind: "vs-elemental" }
  /** Shadow Refuge's test: swinging while standing, or casting an attack skill. */
  | { readonly kind: "attacking" }
  | { readonly kind: "enchantments-at-least"; readonly count: number }
  /** Skills on the bar still recharging. */
  | { readonly kind: "recharging-at-least"; readonly count: number }
  /** The rank now, runes, headgear and weakness included. */
  | { readonly kind: "attribute-at-least"; readonly attributeId: string; readonly rank: number }
  /** Any status of category "condition" on you. */
  | { readonly kind: "has-condition" }
  /** Any status of category "hex" on you. */
  | { readonly kind: "has-hex" }
  | { readonly kind: "no-enchantment" }
  /** Health under `fraction` of the maximum now, morale included. */
  | { readonly kind: "health-below"; readonly fraction: number }
  /** Your living minions or spirits; a pet is neither. */
  | {
      readonly kind: "controls-at-least";
      readonly creature: "minion" | "spirit";
      readonly count: number;
    };

export type InsigniaEffect =
  /** Per-piece amounts: chest is worth most, legs next, the rest equal. */
  | {
      readonly kind: "health";
      readonly chest: number;
      readonly legs: number;
      readonly other: number;
    }
  | {
      readonly kind: "energy";
      readonly chest: number;
      readonly legs: number;
      readonly other: number;
    }
  /** Each entry on its own: a tiered insignia is one entry a tier. */
  | { readonly kind: "conditional-armor"; readonly bonuses: readonly ConditionalArmor[] }
  /** Off every physical hit on its piece, after armor (Knight's). */
  | { readonly kind: "physical-reduction"; readonly amount: number };

export interface Insignia {
  readonly id: InsigniaId;
  readonly name: string;
  /** The primary it needs, as a `requiresPrimary` rune does; `undefined` for a common one. */
  readonly profession: ProfessionId | undefined;
  readonly effect: InsigniaEffect;
}

/** `amount` armor while `conditions` all hold. */
function bonus(amount: number, ...conditions: ArmorCondition[]): ConditionalArmor {
  return Object.freeze({ amount, conditions: Object.freeze(conditions) });
}

function armor(...bonuses: ConditionalArmor[]): InsigniaEffect {
  return Object.freeze({ kind: "conditional-armor", bonuses: Object.freeze(bonuses) });
}

export const INSIGNIAS: Readonly<Record<InsigniaId, Insignia>> = Object.freeze({
  survivor: Object.freeze({
    id: "survivor",
    name: "Survivor Insignia",
    profession: undefined,
    effect: Object.freeze({ kind: "health", chest: 15, legs: 10, other: 5 }),
  } satisfies Insignia),

  radiant: Object.freeze({
    id: "radiant",
    name: "Radiant Insignia",
    profession: undefined,
    effect: Object.freeze({ kind: "energy", chest: 3, legs: 2, other: 1 }),
  } satisfies Insignia),

  stalwart: Object.freeze({
    id: "stalwart",
    name: "Stalwart Insignia",
    profession: undefined,
    effect: armor(bonus(10, { kind: "vs-physical" })),
  } satisfies Insignia),

  blessed: Object.freeze({
    id: "blessed",
    name: "Blessed Insignia",
    profession: undefined,
    effect: armor(bonus(10, { kind: "enchantments-at-least", count: 1 })),
  } satisfies Insignia),

  brawlers: Object.freeze({
    id: "brawlers",
    name: "Brawler's Insignia",
    profession: undefined,
    effect: armor(bonus(10, { kind: "attacking" })),
  } satisfies Insignia),

  knights: Object.freeze({
    id: "knights",
    name: "Knight's Insignia",
    profession: "warrior",
    effect: Object.freeze({ kind: "physical-reduction", amount: 3 }),
  } satisfies Insignia),

  sentinels: Object.freeze({
    id: "sentinels",
    name: "Sentinel's Insignia",
    profession: "warrior",
    effect: armor(
      bonus(
        20,
        { kind: "vs-elemental" },
        { kind: "attribute-at-least", attributeId: STRENGTH_ATTRIBUTE, rank: 13 },
      ),
    ),
  } satisfies Insignia),

  nightstalkers: Object.freeze({
    id: "nightstalkers",
    name: "Nightstalker's Insignia",
    profession: "assassin",
    effect: armor(bonus(15, { kind: "attacking" })),
  } satisfies Insignia),

  prodigys: Object.freeze({
    id: "prodigys",
    name: "Prodigy's Insignia",
    profession: "mesmer",
    effect: armor(
      bonus(5, { kind: "recharging-at-least", count: 1 }),
      bonus(5, { kind: "recharging-at-least", count: 3 }),
      bonus(5, { kind: "recharging-at-least", count: 5 }),
    ),
  } satisfies Insignia),

  windwalker: Object.freeze({
    id: "windwalker",
    name: "Windwalker Insignia",
    profession: "dervish",
    effect: armor(
      bonus(5, { kind: "enchantments-at-least", count: 1 }),
      bonus(5, { kind: "enchantments-at-least", count: 2 }),
      bonus(5, { kind: "enchantments-at-least", count: 3 }),
      bonus(5, { kind: "enchantments-at-least", count: 4 }),
    ),
  } satisfies Insignia),

  anchorites: Object.freeze({
    id: "anchorites",
    name: "Anchorite's Insignia",
    profession: "monk",
    effect: armor(
      bonus(5, { kind: "recharging-at-least", count: 1 }),
      bonus(5, { kind: "recharging-at-least", count: 3 }),
      bonus(5, { kind: "recharging-at-least", count: 5 }),
    ),
  } satisfies Insignia),

  disciples: Object.freeze({
    id: "disciples",
    name: "Disciple's Insignia",
    profession: "monk",
    effect: armor(bonus(15, { kind: "has-condition" })),
  } satisfies Insignia),

  wanderers: Object.freeze({
    id: "wanderers",
    name: "Wanderer's Insignia",
    profession: "monk",
    effect: armor(bonus(10, { kind: "vs-elemental" })),
  } satisfies Insignia),

  dreadnought: Object.freeze({
    id: "dreadnought",
    name: "Dreadnought Insignia",
    profession: "warrior",
    effect: armor(bonus(10, { kind: "vs-elemental" })),
  } satisfies Insignia),

  blighters: Object.freeze({
    id: "blighters",
    name: "Blighter's Insignia",
    profession: "necromancer",
    effect: armor(bonus(20, { kind: "has-hex" })),
  } satisfies Insignia),

  undertakers: Object.freeze({
    id: "undertakers",
    name: "Undertaker's Insignia",
    profession: "necromancer",
    effect: armor(
      bonus(5, { kind: "health-below", fraction: 0.8 }),
      bonus(5, { kind: "health-below", fraction: 0.6 }),
      bonus(5, { kind: "health-below", fraction: 0.4 }),
      bonus(5, { kind: "health-below", fraction: 0.2 }),
    ),
  } satisfies Insignia),

  "minion-masters": Object.freeze({
    id: "minion-masters",
    name: "Minion Master's Insignia",
    profession: "necromancer",
    effect: armor(
      bonus(5, { kind: "controls-at-least", creature: "minion", count: 1 }),
      bonus(5, { kind: "controls-at-least", creature: "minion", count: 3 }),
      bonus(5, { kind: "controls-at-least", creature: "minion", count: 5 }),
    ),
  } satisfies Insignia),

  forsaken: Object.freeze({
    id: "forsaken",
    name: "Forsaken Insignia",
    profession: "dervish",
    effect: armor(bonus(10, { kind: "no-enchantment" })),
  } satisfies Insignia),

  shamans: Object.freeze({
    id: "shamans",
    name: "Shaman's Insignia",
    profession: "ritualist",
    effect: armor(
      bonus(5, { kind: "controls-at-least", creature: "spirit", count: 1 }),
      bonus(5, { kind: "controls-at-least", creature: "spirit", count: 2 }),
      bonus(5, { kind: "controls-at-least", creature: "spirit", count: 3 }),
    ),
  } satisfies Insignia),

  prismatic: Object.freeze({
    id: "prismatic",
    name: "Prismatic Insignia",
    profession: "elementalist",
    effect: armor(
      ...["air-magic", "earth-magic", "fire-magic", "water-magic"].map((attribute) =>
        bonus(5, {
          kind: "attribute-at-least",
          attributeId: `elementalist.${attribute}`,
          rank: 9,
        }),
      ),
    ),
  } satisfies Insignia),
});

export function isInsigniaId(value: unknown): value is InsigniaId {
  return typeof value === "string" && Object.hasOwn(INSIGNIAS, value);
}

export function getInsignia(id: string): Insignia | undefined {
  return isInsigniaId(id) ? INSIGNIAS[id] : undefined;
}

export const ALL_INSIGNIAS: readonly Insignia[] = Object.freeze(Object.values(INSIGNIAS));

/** Whether a `primary` character may wear `insignia`: a common one, or its own profession's. */
export function insigniaAllowed(insignia: Insignia, primary: ProfessionId): boolean {
  return insignia.profession === undefined || insignia.profession === primary;
}

/** The per-slot amount of a health or energy insignia. */
export function perSlotAmount(
  effect: Extract<InsigniaEffect, { kind: "health" | "energy" }>,
  slot: ArmorSlot,
): number {
  if (slot === "chest") {
    return effect.chest;
  }
  if (slot === "legs") {
    return effect.legs;
  }
  return effect.other;
}
