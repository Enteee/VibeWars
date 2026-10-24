import type { ArmorSlot } from "./types.js";

/**
 * Armor insignias (ADR-0012).
 *
 * The prefix half of an armor piece, where the rune is the suffix. An
 * insignia is a flat, unconditional stat or a conditional slab of armor;
 * nothing here scales with an attribute, which is what keeps it a
 * different kind of choice from a rune.
 */

export type InsigniaId = "survivor" | "radiant" | "stalwart" | "blessed";

/**
 * When a conditional armor bonus applies.
 *
 * Every member of this union must be answerable from state the
 * simulation already has. The reference data also has "while in a
 * stance" and "while attacking" insignias; this game has neither stances
 * nor an attack in progress, so both are absent from the catalog
 * entirely and recorded as gaps in `coverage.ts` (`"stances"`,
 * `"attack-state"`). A number that is always zero is a lie with a
 * tooltip.
 */
export type ArmorCondition = "vs-physical" | "while-enchanted";

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
  | {
      readonly kind: "conditional-armor";
      readonly amount: number;
      readonly condition: ArmorCondition;
    };

export interface Insignia {
  readonly id: InsigniaId;
  readonly name: string;
  readonly effect: InsigniaEffect;
}

export const INSIGNIAS: Readonly<Record<InsigniaId, Insignia>> = Object.freeze({
  survivor: Object.freeze({
    id: "survivor",
    name: "Survivor Insignia",
    effect: Object.freeze({ kind: "health", chest: 15, legs: 10, other: 5 }),
  } satisfies Insignia),

  radiant: Object.freeze({
    id: "radiant",
    name: "Radiant Insignia",
    effect: Object.freeze({ kind: "energy", chest: 3, legs: 2, other: 1 }),
  } satisfies Insignia),

  stalwart: Object.freeze({
    id: "stalwart",
    name: "Stalwart Insignia",
    effect: Object.freeze({ kind: "conditional-armor", amount: 10, condition: "vs-physical" }),
  } satisfies Insignia),

  blessed: Object.freeze({
    id: "blessed",
    name: "Blessed Insignia",
    effect: Object.freeze({ kind: "conditional-armor", amount: 10, condition: "while-enchanted" }),
  } satisfies Insignia),
});

export function isInsigniaId(value: unknown): value is InsigniaId {
  return typeof value === "string" && Object.hasOwn(INSIGNIAS, value);
}

export function getInsignia(id: string): Insignia | undefined {
  return isInsigniaId(id) ? INSIGNIAS[id] : undefined;
}

export const ALL_INSIGNIAS: readonly Insignia[] = Object.freeze(Object.values(INSIGNIAS));

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
