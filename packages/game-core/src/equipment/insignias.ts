import { STRENGTH_ATTRIBUTE } from "../primary-attributes.js";
import type { ProfessionId } from "../professions.js";
import type { StatusCategory } from "../skills/status.js";
import type { ModWhile } from "./mods.js";
import type { ConditionalArmor } from "./armor.js";
import type { ArmorSlot, DamageType } from "./types.js";

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
  | "sentrys"
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
  | "prismatic"
  | "infiltrators"
  | "saboteurs"
  | "vanguards"
  | "bonelace"
  | "earthbound"
  | "frostbound"
  | "pyrebound"
  | "stormbound"
  | "scouts"
  | "beastmasters"
  | "aeromancer"
  | "geomancer"
  | "hydromancer"
  | "pyromancer"
  | "artificers"
  | "virtuosos"
  | "mystics"
  | "ghost-forge"
  | "centurions";

/**
 * One test a conditional armor bonus needs to pass (#1142).
 *
 * Closed: every kind is answerable from the packet and the defender,
 * state the simulation already has. An insignia whose test the game
 * cannot answer is absent from the catalog and recorded in
 * `coverage.ts`: a number that is always zero is a lie with a tooltip.
 */
export type ArmorCondition =
  | { readonly kind: "vs-physical" }
  | { readonly kind: "vs-elemental" }
  | { readonly kind: "vs-type"; readonly type: DamageType }
  /** Shadow Refuge's test: swinging while standing, or casting an attack skill. */
  | { readonly kind: "attacking" }
  | { readonly kind: "enchantments-at-least"; readonly count: number }
  /** Skills on the bar still recharging. */
  | { readonly kind: "recharging-at-least"; readonly count: number }
  /** The rank now, runes, headgear and weakness included. */
  | { readonly kind: "attribute-at-least"; readonly attributeId: string; readonly rank: number }
  /** Any status on you of any of `categories`. */
  | { readonly kind: "affected-by"; readonly categories: readonly StatusCategory[] }
  | { readonly kind: "no-enchantment" }
  /** Health under `fraction` of the maximum now, morale included. */
  | { readonly kind: "health-below"; readonly fraction: number }
  /** Your living minions, spirits or pets. */
  | {
      readonly kind: "controls-at-least";
      readonly creature: "minion" | "spirit" | "pet";
      readonly count: number;
    }
  /** Activating any skill, attack skills included; a plain swing is not one. */
  | { readonly kind: "activating" }
  /** Slots of your bar whose skill now is a signet, an echoed one's copy counted. */
  | { readonly kind: "signets-at-least"; readonly count: number }
  /** A weapon mod's condition on the wielder (#2010): To the Pain!'s, Might makes Right's. */
  | { readonly kind: "mod-while"; readonly while: ModWhile };

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

  sentrys: Object.freeze({
    id: "sentrys",
    name: "Sentry's Insignia",
    profession: undefined,
    effect: armor(bonus(10, { kind: "affected-by", categories: ["stance"] })),
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
    effect: armor(bonus(15, { kind: "affected-by", categories: ["condition"] })),
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
    effect: armor(bonus(20, { kind: "affected-by", categories: ["hex"] })),
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

  infiltrators: Object.freeze({
    id: "infiltrators",
    name: "Infiltrator's Insignia",
    profession: "assassin",
    effect: armor(
      bonus(10, { kind: "vs-physical" }),
      bonus(10, { kind: "vs-type", type: "piercing" }),
    ),
  } satisfies Insignia),

  saboteurs: Object.freeze({
    id: "saboteurs",
    name: "Saboteur's Insignia",
    profession: "assassin",
    effect: armor(
      bonus(10, { kind: "vs-physical" }),
      bonus(10, { kind: "vs-type", type: "slashing" }),
    ),
  } satisfies Insignia),

  vanguards: Object.freeze({
    id: "vanguards",
    name: "Vanguard's Insignia",
    profession: "assassin",
    effect: armor(
      bonus(10, { kind: "vs-physical" }),
      bonus(10, { kind: "vs-type", type: "blunt" }),
    ),
  } satisfies Insignia),

  bonelace: Object.freeze({
    id: "bonelace",
    name: "Bonelace Insignia",
    profession: "necromancer",
    effect: armor(bonus(15, { kind: "vs-type", type: "piercing" })),
  } satisfies Insignia),

  earthbound: Object.freeze({
    id: "earthbound",
    name: "Earthbound Insignia",
    profession: "ranger",
    effect: armor(bonus(15, { kind: "vs-type", type: "earth" })),
  } satisfies Insignia),

  frostbound: Object.freeze({
    id: "frostbound",
    name: "Frostbound Insignia",
    profession: "ranger",
    effect: armor(bonus(15, { kind: "vs-type", type: "cold" })),
  } satisfies Insignia),

  pyrebound: Object.freeze({
    id: "pyrebound",
    name: "Pyrebound Insignia",
    profession: "ranger",
    effect: armor(bonus(15, { kind: "vs-type", type: "fire" })),
  } satisfies Insignia),

  stormbound: Object.freeze({
    id: "stormbound",
    name: "Stormbound Insignia",
    profession: "ranger",
    effect: armor(bonus(15, { kind: "vs-type", type: "lightning" })),
  } satisfies Insignia),

  scouts: Object.freeze({
    id: "scouts",
    name: "Scout's Insignia",
    profession: "ranger",
    effect: armor(bonus(10, { kind: "affected-by", categories: ["preparation"] })),
  } satisfies Insignia),

  beastmasters: Object.freeze({
    id: "beastmasters",
    name: "Beastmaster's Insignia",
    profession: "ranger",
    effect: armor(bonus(10, { kind: "controls-at-least", creature: "pet", count: 1 })),
  } satisfies Insignia),

  aeromancer: Object.freeze({
    id: "aeromancer",
    name: "Aeromancer Insignia",
    profession: "elementalist",
    effect: armor(
      bonus(10, { kind: "vs-elemental" }),
      bonus(10, { kind: "vs-type", type: "lightning" }),
    ),
  } satisfies Insignia),

  geomancer: Object.freeze({
    id: "geomancer",
    name: "Geomancer Insignia",
    profession: "elementalist",
    effect: armor(
      bonus(10, { kind: "vs-elemental" }),
      bonus(10, { kind: "vs-type", type: "earth" }),
    ),
  } satisfies Insignia),

  hydromancer: Object.freeze({
    id: "hydromancer",
    name: "Hydromancer Insignia",
    profession: "elementalist",
    effect: armor(
      bonus(10, { kind: "vs-elemental" }),
      bonus(10, { kind: "vs-type", type: "cold" }),
    ),
  } satisfies Insignia),

  pyromancer: Object.freeze({
    id: "pyromancer",
    name: "Pyromancer Insignia",
    profession: "elementalist",
    effect: armor(
      bonus(10, { kind: "vs-elemental" }),
      bonus(10, { kind: "vs-type", type: "fire" }),
    ),
  } satisfies Insignia),

  artificers: Object.freeze({
    id: "artificers",
    name: "Artificer's Insignia",
    profession: "mesmer",
    effect: armor(
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((count) => bonus(3, { kind: "signets-at-least", count })),
    ),
  } satisfies Insignia),

  virtuosos: Object.freeze({
    id: "virtuosos",
    name: "Virtuoso's Insignia",
    profession: "mesmer",
    effect: armor(bonus(15, { kind: "activating" })),
  } satisfies Insignia),

  mystics: Object.freeze({
    id: "mystics",
    name: "Mystic's Insignia",
    profession: "ritualist",
    effect: armor(bonus(15, { kind: "activating" })),
  } satisfies Insignia),

  "ghost-forge": Object.freeze({
    id: "ghost-forge",
    name: "Ghost Forge Insignia",
    profession: "ritualist",
    effect: armor(bonus(15, { kind: "affected-by", categories: ["weapon-spell"] })),
  } satisfies Insignia),

  centurions: Object.freeze({
    id: "centurions",
    name: "Centurion's Insignia",
    profession: "paragon",
    effect: armor(bonus(10, { kind: "affected-by", categories: ["shout", "chant"] })),
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
