import type { StatusId } from "../skills/status.js";
import type { OffhandId } from "./offhands.js";
import type { DamageType } from "./types.js";
import type { WeaponId } from "./weapons.js";

/**
 * Weapon upgrades without items (ADR-0047, #2007).
 *
 * A mod is an id on an equipped weapon or off-hand, always at its perfect
 * value, picked in the builder: there is no loot, no inventory, no roll.
 * One prefix, one suffix and one inscription per item, where the item has
 * that slot (`MOD_SLOTS`). Resolution reads these the way it reads runes,
 * once at join, into the set that holds the item (ADR-0036).
 */

export type ModSlot = "prefix" | "suffix" | "inscription";

export const MOD_SLOT_KEYS: readonly ModSlot[] = Object.freeze(["prefix", "suffix", "inscription"]);

/** Kebab-case, e.g. `"of-fortitude"`, `"strength-and-honor"`. */
export type ModId = string;

/** What can carry a mod: everything but fists. */
export type ModItem = Exclude<WeaponId, "unarmed"> | OffhandId;

export type ModEffect =
  | { readonly kind: "max-health"; readonly amount: number }
  | { readonly kind: "max-energy"; readonly amount: number }
  /** Energy regeneration, in pips; GW1's inscriptions take one away. */
  | { readonly kind: "energy-regen"; readonly pips: number }
  | { readonly kind: "armor"; readonly amount: number }
  | {
      readonly kind: "armor-vs";
      readonly against: "physical" | "elemental" | DamageType;
      readonly amount: number;
    }
  /** That condition lasts `reduction` less on the bearer (0.2: 20% shorter). */
  | {
      readonly kind: "condition-duration";
      readonly statusId: StatusId;
      readonly reduction: number;
    }
  /** Each hit of the weapon steals this much Health, by weapon (#2009). */
  | {
      readonly kind: "life-steal-on-hit";
      readonly amountByWeapon: Readonly<Partial<Record<WeaponId, number>>>;
    }
  /** Health regeneration, in pips; Vampiric takes one away. */
  | { readonly kind: "health-regen"; readonly pips: number }
  | { readonly kind: "energy-on-hit"; readonly amount: number }
  /** Sundering: `chance` a hit has `penetration` more armor penetration. */
  | {
      readonly kind: "armor-penetration-chance";
      readonly chance: number;
      readonly penetration: number;
    }
  /** Furious: `chance` a hit's adrenaline is doubled. */
  | { readonly kind: "double-adrenaline-chance"; readonly chance: number }
  /** That condition, caused by the weapon's attacks, lasts `increase` longer (0.33: 33%). */
  | {
      readonly kind: "inflicted-condition-duration";
      readonly statusId: StatusId;
      readonly increase: number;
    }
  /** The weapon's damage becomes this type: Ebon, Fiery, Icy, Shocking. */
  | { readonly kind: "damage-type"; readonly type: DamageType };

export interface WeaponMod {
  readonly id: ModId;
  /** `of Fortitude`, `"I have the power!"`. */
  readonly name: string;
  readonly slot: ModSlot;
  readonly fits: readonly ModItem[];
  readonly effects: readonly ModEffect[];
  /** The tooltip line, numbers written out. */
  readonly text: string;
}

/** What sits on one item. `null` is no mod; every key is always there. */
export interface ItemUpgrades {
  readonly prefix: ModId | null;
  readonly suffix: ModId | null;
  readonly inscription: ModId | null;
}

export const NO_UPGRADES: ItemUpgrades = Object.freeze({
  prefix: null,
  suffix: null,
  inscription: null,
});

const FULL: readonly ModSlot[] = MOD_SLOT_KEYS;
const NO_PREFIX: readonly ModSlot[] = Object.freeze(["suffix", "inscription"]);

/** Which slots each item has (GW1: a wand, shield or focus takes no prefix). */
export const MOD_SLOTS: Readonly<Record<ModItem, readonly ModSlot[]>> = Object.freeze({
  sword: FULL,
  axe: FULL,
  hammer: FULL,
  daggers: FULL,
  scythe: FULL,
  spear: FULL,
  flatbow: FULL,
  shortbow: FULL,
  longbow: FULL,
  "recurve-bow": FULL,
  hornbow: FULL,
  staff: FULL,
  wand: NO_PREFIX,
  shield: NO_PREFIX,
  focus: NO_PREFIX,
});

const MARTIAL: readonly ModItem[] = Object.freeze([
  "sword",
  "axe",
  "hammer",
  "daggers",
  "scythe",
  "spear",
  "flatbow",
  "shortbow",
  "longbow",
  "recurve-bow",
  "hornbow",
]);
const MARTIAL_AND_STAFF: readonly ModItem[] = Object.freeze([...MARTIAL, "staff"]);
const BOWS: readonly ModItem[] = Object.freeze([
  "flatbow",
  "shortbow",
  "longbow",
  "recurve-bow",
  "hornbow",
]);
const MARTIAL_BUT_BOWS: readonly ModItem[] = Object.freeze(
  MARTIAL.filter((item) => !BOWS.includes(item)),
);
const MARTIAL_BUT_HAMMER: readonly ModItem[] = Object.freeze(
  MARTIAL.filter((item) => item !== "hammer"),
);
/** Vampiric's steal: 3 on the lighter weapons, 5 on hammer, scythe and bows. */
const VAMPIRIC_STEAL: Readonly<Partial<Record<WeaponId, number>>> = Object.freeze(
  Object.fromEntries(
    MARTIAL.map((item) => [item, ["sword", "axe", "daggers", "spear"].includes(item) ? 3 : 5]),
  ),
);
const OFFHANDS: readonly ModItem[] = Object.freeze(["shield", "focus"]);

function mod(
  id: ModId,
  name: string,
  slot: ModSlot,
  fits: readonly ModItem[],
  effects: readonly ModEffect[],
  text: string,
): WeaponMod {
  return Object.freeze({ id, name, slot, fits, effects: Object.freeze([...effects]), text });
}

/** `+10 armor vs <type>` on a shield or focus inscription. */
function versus(id: ModId, name: string, type: DamageType, label: string): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    OFFHANDS,
    [{ kind: "armor-vs", against: type, amount: 10 }],
    `Armor +10 (vs. ${label} damage)`,
  );
}

/** A shield or focus inscription that shortens one condition on you by 20%. */
function shorter(id: ModId, name: string, statusId: StatusId, label: string): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    OFFHANDS,
    [{ kind: "condition-duration", statusId, reduction: 0.2 }],
    `Reduces ${label} duration on you by 20%`,
  );
}

/** A martial prefix that makes a condition the weapon causes last 33% longer. */
function longer(
  id: ModId,
  name: string,
  fits: readonly ModItem[],
  statusId: StatusId,
  label: string,
): WeaponMod {
  return mod(
    id,
    name,
    "prefix",
    fits,
    [{ kind: "inflicted-condition-duration", statusId, increase: 0.33 }],
    `Lengthens ${label} duration on foes by 33%`,
  );
}

/** A martial prefix that turns the weapon's damage into an element. */
function elemental(id: ModId, name: string, type: DamageType, label: string): WeaponMod {
  return mod(id, name, "prefix", MARTIAL, [{ kind: "damage-type", type }], `${label} Dmg`);
}

export const WEAPON_MODS: readonly WeaponMod[] = Object.freeze([
  mod(
    "of-fortitude",
    "of Fortitude",
    "suffix",
    [...MARTIAL_AND_STAFF, ...OFFHANDS],
    [{ kind: "max-health", amount: 30 }],
    "+30 Health",
  ),
  mod(
    "of-defense",
    "of Defense",
    "suffix",
    MARTIAL_AND_STAFF,
    [{ kind: "armor", amount: 5 }],
    "Armor +5",
  ),
  mod(
    "of-shelter",
    "of Shelter",
    "suffix",
    MARTIAL_AND_STAFF,
    [{ kind: "armor-vs", against: "physical", amount: 7 }],
    "Armor +7 (vs. physical damage)",
  ),
  mod(
    "of-warding",
    "of Warding",
    "suffix",
    MARTIAL_AND_STAFF,
    [{ kind: "armor-vs", against: "elemental", amount: 7 }],
    "Armor +7 (vs. elemental damage)",
  ),
  mod("hale", "Hale", "prefix", ["staff"], [{ kind: "max-health", amount: 30 }], "+30 Health"),
  mod("defensive", "Defensive", "prefix", ["staff"], [{ kind: "armor", amount: 5 }], "Armor +5"),
  mod(
    "insightful",
    "Insightful",
    "prefix",
    ["staff"],
    [{ kind: "max-energy", amount: 5 }],
    "Energy +5",
  ),
  mod(
    "i-have-the-power",
    '"I have the power!"',
    "inscription",
    MARTIAL,
    [{ kind: "max-energy", amount: 5 }],
    "Energy +5",
  ),
  mod(
    "seize-the-day",
    '"Seize the Day"',
    "inscription",
    ["staff", "wand"],
    [
      { kind: "max-energy", amount: 15 },
      { kind: "energy-regen", pips: -1 },
    ],
    "Energy +15, Energy regeneration -1",
  ),
  mod(
    "live-for-today",
    '"Live for Today"',
    "inscription",
    ["focus"],
    [
      { kind: "max-energy", amount: 15 },
      { kind: "energy-regen", pips: -1 },
    ],
    "Energy +15, Energy regeneration -1",
  ),
  versus("not-the-face", '"Not the face!"', "blunt", "blunt"),
  versus("leaf-on-the-wind", '"Leaf on the Wind"', "cold", "cold"),
  versus("like-a-rolling-stone", '"Like a Rolling Stone"', "earth", "earth"),
  versus("sleep-now-in-the-fire", '"Sleep Now in the Fire"', "fire", "fire"),
  versus("riders-on-the-storm", '"Riders on the Storm"', "lightning", "lightning"),
  versus("through-thick-and-thin", '"Through Thick and Thin"', "piercing", "piercing"),
  versus("the-riddle-of-steel", '"The Riddle of Steel"', "slashing", "slashing"),
  shorter("fear-cuts-deeper", '"Fear Cuts Deeper"', "bleeding", "Bleeding"),
  shorter("i-can-see-clearly-now", '"I Can See Clearly Now"', "blind", "Blinded"),
  shorter("swift-as-the-wind", '"Swift as the Wind"', "crippled", "Crippled"),
  shorter("soundness-of-mind", '"Soundness of Mind"', "dazed", "Dazed"),
  shorter("strength-of-body", '"Strength of Body"', "deep-wound", "Deep Wound"),
  shorter("cast-out-the-unclean", '"Cast Out the Unclean"', "disease", "Disease"),
  shorter("pure-of-heart", '"Pure of Heart"', "poison", "Poison"),
  shorter("only-the-strong-survive", '"Only the Strong Survive"', "weakness", "Weakness"),
  // The martial prefixes that act on a hit (#2009).
  mod(
    "vampiric",
    "Vampiric",
    "prefix",
    MARTIAL,
    [
      { kind: "life-steal-on-hit", amountByWeapon: VAMPIRIC_STEAL },
      { kind: "health-regen", pips: -1 },
    ],
    "Life Draining: 3 (5 on hammer, scythe and bows), Health regeneration -1",
  ),
  mod(
    "zealous",
    "Zealous",
    "prefix",
    MARTIAL,
    [
      { kind: "energy-on-hit", amount: 1 },
      { kind: "energy-regen", pips: -1 },
    ],
    "Energy gain on hit: 1, Energy regeneration -1",
  ),
  mod(
    "sundering",
    "Sundering",
    "prefix",
    MARTIAL,
    [{ kind: "armor-penetration-chance", chance: 0.2, penetration: 0.2 }],
    "Armor penetration +20% (Chance: 20%)",
  ),
  mod(
    "furious",
    "Furious",
    "prefix",
    MARTIAL_BUT_BOWS,
    [{ kind: "double-adrenaline-chance", chance: 0.1 }],
    "Double Adrenaline on hit (Chance: 10%)",
  ),
  longer("barbed", "Barbed", MARTIAL_BUT_HAMMER, "bleeding", "Bleeding"),
  longer("crippling", "Crippling", MARTIAL_BUT_HAMMER, "crippled", "Cripple"),
  longer("poisonous", "Poisonous", MARTIAL_BUT_HAMMER, "poison", "Poison"),
  longer("cruel", "Cruel", MARTIAL_BUT_BOWS, "deep-wound", "Deep Wound"),
  longer("heavy", "Heavy", ["axe", "hammer", "scythe", "spear"], "weakness", "Weakness"),
  longer("silencing", "Silencing", ["daggers", "spear", ...BOWS], "dazed", "Daze"),
  elemental("ebon", "Ebon", "earth", "Earth"),
  elemental("fiery", "Fiery", "fire", "Fire"),
  elemental("icy", "Icy", "cold", "Cold"),
  elemental("shocking", "Shocking", "lightning", "Lightning"),
]);

const MODS_BY_ID: ReadonlyMap<ModId, WeaponMod> = new Map(WEAPON_MODS.map((m) => [m.id, m]));

export function getWeaponMod(id: ModId): WeaponMod | undefined {
  return MODS_BY_ID.get(id);
}

export function isModId(value: unknown): value is ModId {
  return typeof value === "string" && MODS_BY_ID.has(value);
}

/** Whether `item` has `slot` and `mod` may sit in it. */
export function modFits(mod: WeaponMod, item: WeaponId | OffhandId, slot: ModSlot): boolean {
  return (
    item !== "unarmed" &&
    mod.slot === slot &&
    MOD_SLOTS[item].includes(slot) &&
    mod.fits.includes(item)
  );
}

/** `upgrades` with every mod that does not fit `item` taken off (#2007). */
export function fittingUpgrades(item: WeaponId | OffhandId, upgrades: ItemUpgrades): ItemUpgrades {
  const keep = (slot: ModSlot): ModId | null => {
    const id = upgrades[slot];
    const definition = id === null ? undefined : getWeaponMod(id);
    return definition !== undefined && modFits(definition, item, slot) ? id : null;
  };
  return { prefix: keep("prefix"), suffix: keep("suffix"), inscription: keep("inscription") };
}

/** The mods on an item, known ones only, in slot order. */
export function wornMods(upgrades: ItemUpgrades): WeaponMod[] {
  return MOD_SLOT_KEYS.flatMap((slot) => {
    const id = upgrades[slot];
    const definition = id === null ? undefined : getWeaponMod(id);
    return definition === undefined ? [] : [definition];
  });
}
