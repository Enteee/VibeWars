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

/**
 * What a conditional mod waits on (#2010), the wielder's state now:
 * Health strictly above or below half its maximum, any enchantment, stance
 * or hex on it, an attack or a spell under way, or, for damage only, a
 * hexed target.
 */
export type ModWhile =
  | "health-above-half"
  | "health-below-half"
  | "enchanted"
  | "in-stance"
  | "hexed"
  | "attacking"
  | "casting"
  | "target-hexed";

/** The conditions a maximum may wait on: never Health, which the maximum moves. */
export type ModStatusWhile = Extract<ModWhile, "enchanted" | "in-stance" | "hexed">;

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
  | { readonly kind: "damage-type"; readonly type: DamageType }
  /** The weapon's own roll, `increase` more (0.15: +15%), never a skill's bonus. */
  | { readonly kind: "attack-damage"; readonly increase: number; readonly while?: ModWhile }
  | { readonly kind: "conditional-armor"; readonly amount: number; readonly while: ModWhile }
  | {
      readonly kind: "conditional-max-health";
      readonly amount: number;
      readonly while: ModStatusWhile;
    }
  | { readonly kind: "conditional-max-energy"; readonly amount: number; readonly while: ModWhile }
  /** Each physical hit on the bearer, `amount` less, after armor; at `chance`, when given. */
  | {
      readonly kind: "physical-reduction";
      readonly amount: number;
      readonly while?: ModWhile;
      readonly chance?: number;
    }
  /**
   * At `chance`, a spell casts in half the time (#2011): one of the item's
   * attribute, as Adept's, or `any`, as Swift's.
   */
  | { readonly kind: "cast-halve-chance"; readonly chance: number; readonly of: ModSpells }
  /** At `chance`, a spell recharges in half the time (#2011): of Memory's, of Quickening's. */
  | { readonly kind: "recharge-halve-chance"; readonly chance: number; readonly of: ModSpells }
  /** At `chance`, the item's attribute is 1 higher for a spell (#2011): of Mastery's. */
  | { readonly kind: "attribute-plus-one-chance"; readonly chance: number }
  /** Enchantments the wielder casts last `increase` longer (#2011): of Enchanting's 0.2. */
  | { readonly kind: "enchantment-duration"; readonly increase: number };

/** Which spells a chance mod acts on (#2011): the item's attribute's, or every one. */
export type ModSpells = "item-attribute" | "any";

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
const ALL_WEAPONS: readonly ModItem[] = Object.freeze([...MARTIAL_AND_STAFF, "wand"]);
/** Staff wrapping, shield handle, focus core: of Devotion, of Endurance, of Valor. */
const STAFF_AND_OFFHANDS: readonly ModItem[] = Object.freeze(["staff", ...OFFHANDS]);
/** A caster weapon's inscription (#2011): Aptitude not Attitude's. */
const STAFF_AND_WAND: readonly ModItem[] = Object.freeze(["staff", "wand"]);

/** How each condition reads in a tooltip. */
export const MOD_WHILE_TEXT: Readonly<Record<ModWhile, string>> = Object.freeze({
  "health-above-half": "while Health is above 50%",
  "health-below-half": "while Health is below 50%",
  enchanted: "while Enchanted",
  "in-stance": "while in a Stance",
  hexed: "while Hexed",
  attacking: "while attacking",
  casting: "while casting",
  "target-hexed": "vs. Hexed foes",
});

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

/** A spell's casting time halved at `chance` (#2011). */
function hastened(
  id: ModId,
  name: string,
  slot: ModSlot,
  fits: readonly ModItem[],
  chance: number,
  of: ModSpells,
): WeaponMod {
  const spells = of === "any" ? "spells" : "item's attribute spells";
  return mod(
    id,
    name,
    slot,
    fits,
    [{ kind: "cast-halve-chance", chance, of }],
    `Halves casting time of ${spells} (Chance: ${String(chance * 100)}%)`,
  );
}

/** A spell's recharge halved at `chance` (#2011). */
function remembered(
  id: ModId,
  name: string,
  slot: ModSlot,
  fits: readonly ModItem[],
  chance: number,
  of: ModSpells,
): WeaponMod {
  const spells = of === "any" ? "spells" : "item's attribute spells";
  return mod(
    id,
    name,
    slot,
    fits,
    [{ kind: "recharge-halve-chance", chance, of }],
    `Halves skill recharge of ${spells} (Chance: ${String(chance * 100)}%)`,
  );
}

/** The item's attribute +1 for a spell, at 20% (#2011). */
function mastered(id: ModId, name: string, slot: ModSlot, fits: readonly ModItem[]): WeaponMod {
  return mod(
    id,
    name,
    slot,
    fits,
    [{ kind: "attribute-plus-one-chance", chance: 0.2 }],
    "Item's attribute +1 (Chance: 20%)",
  );
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

/** A martial inscription: `increase` more damage from the weapon's roll `condition`. */
function damage(id: ModId, name: string, increase: number, condition: ModWhile): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    MARTIAL,
    [{ kind: "attack-damage", increase, while: condition }],
    `Damage +${String(Math.round(increase * 100))}% (${MOD_WHILE_TEXT[condition]})`,
  );
}

/** A weapon inscription: `amount` more maximum Energy `condition`. */
function energyWhile(id: ModId, name: string, amount: number, condition: ModWhile): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    ALL_WEAPONS,
    [{ kind: "conditional-max-energy", amount, while: condition }],
    `Energy +${String(amount)} (${MOD_WHILE_TEXT[condition]})`,
  );
}

/** A staff, shield or focus suffix: `amount` more maximum Health `condition`. */
function healthWhile(
  id: ModId,
  name: string,
  amount: number,
  condition: ModStatusWhile,
): WeaponMod {
  return mod(
    id,
    name,
    "suffix",
    STAFF_AND_OFFHANDS,
    [{ kind: "conditional-max-health", amount, while: condition }],
    `Health +${String(amount)} (${MOD_WHILE_TEXT[condition]})`,
  );
}

/** A shield or focus inscription: `amount` less from each physical hit `condition`. */
function sheltered(id: ModId, name: string, amount: number, condition: ModWhile): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    OFFHANDS,
    [{ kind: "physical-reduction", amount, while: condition }],
    `Received physical damage -${String(amount)} (${MOD_WHILE_TEXT[condition]})`,
  );
}

/** A focus inscription: `amount` more armor `condition`. */
function guarded(id: ModId, name: string, amount: number, condition: ModWhile): WeaponMod {
  return mod(
    id,
    name,
    "inscription",
    ["focus"],
    [{ kind: "conditional-armor", amount, while: condition }],
    `Armor +${String(amount)} (${MOD_WHILE_TEXT[condition]})`,
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
  // The mods that wait on the wielder's state (#2010).
  damage("strength-and-honor", '"Strength and Honor"', 0.15, "health-above-half"),
  damage("guided-by-fate", '"Guided by Fate"', 0.15, "enchanted"),
  damage("dance-with-death", '"Dance with Death"', 0.15, "in-stance"),
  damage("too-much-information", '"Too Much Information"', 0.15, "target-hexed"),
  damage("vengeance-is-mine", '"Vengeance is Mine"', 0.2, "health-below-half"),
  damage("dont-fear-the-reaper", '"Don\'t Fear the Reaper"', 0.2, "hexed"),
  mod(
    "to-the-pain",
    '"To the Pain!"',
    "inscription",
    MARTIAL,
    [
      { kind: "attack-damage", increase: 0.15 },
      { kind: "conditional-armor", amount: -10, while: "attacking" },
    ],
    "Damage +15%, Armor -10 (while attacking)",
  ),
  mod(
    "brawn-over-brains",
    '"Brawn over Brains"',
    "inscription",
    MARTIAL,
    [
      { kind: "attack-damage", increase: 0.15 },
      { kind: "max-energy", amount: -5 },
    ],
    "Damage +15%, Energy -5",
  ),
  energyWhile("hale-and-hearty", '"Hale and Hearty"', 5, "health-above-half"),
  energyWhile("have-faith", '"Have Faith"', 5, "enchanted"),
  energyWhile("dont-call-it-a-comeback", '"Don\'t call it a comeback!"', 7, "health-below-half"),
  energyWhile("i-am-sorrow", '"I am Sorrow."', 7, "hexed"),
  healthWhile("of-devotion", "of Devotion", 45, "enchanted"),
  healthWhile("of-endurance", "of Endurance", 45, "in-stance"),
  healthWhile("of-valor", "of Valor", 60, "hexed"),
  mod(
    "luck-of-the-draw",
    '"Luck of the Draw"',
    "inscription",
    OFFHANDS,
    [{ kind: "physical-reduction", amount: 5, chance: 0.2 }],
    "Received physical damage -5 (Chance: 20%)",
  ),
  sheltered("sheltered-by-faith", '"Sheltered by Faith"', 2, "enchanted"),
  sheltered("run-for-your-life", '"Run For Your Life!"', 2, "in-stance"),
  sheltered("nothing-to-fear", '"Nothing to Fear"', 3, "hexed"),
  guarded("hail-to-the-king", '"Hail to the King"', 5, "health-above-half"),
  guarded("faith-is-my-shield", '"Faith is My Shield"', 5, "enchanted"),
  guarded("might-makes-right", '"Might makes Right"', 5, "attacking"),
  guarded("knowing-is-half-the-battle", '"Knowing is Half the Battle."', 5, "casting"),
  guarded("down-but-not-out", '"Down But Not Out"', 10, "health-below-half"),
  guarded("be-just-and-fear-not", '"Be Just and Fear Not"', 10, "hexed"),
  mod(
    "man-for-all-seasons",
    '"Man for All Seasons"',
    "inscription",
    ["focus"],
    [{ kind: "armor-vs", against: "elemental", amount: 5 }],
    "Armor +5 (vs. Elemental damage)",
  ),
  mod(
    "survival-of-the-fittest",
    '"Survival of the Fittest"',
    "inscription",
    ["focus"],
    [{ kind: "armor-vs", against: "physical", amount: 5 }],
    "Armor +5 (vs. Physical damage)",
  ),
  mod(
    "ignorance-is-bliss",
    '"Ignorance is Bliss"',
    "inscription",
    ["focus"],
    [
      { kind: "armor", amount: 5 },
      { kind: "max-energy", amount: -5 },
    ],
    "Armor +5, Energy -5",
  ),
  mod(
    "life-is-pain",
    '"Life is Pain"',
    "inscription",
    ["focus"],
    [
      { kind: "armor", amount: 5 },
      { kind: "max-health", amount: -20 },
    ],
    "Armor +5, Health -20",
  ),
  // Caster chance mods (#2011), at their perfect values.
  hastened("adept", "Adept", "prefix", ["staff"], 0.2, "item-attribute"),
  hastened("swift", "Swift", "prefix", ["staff"], 0.1, "any"),
  hastened("of-swiftness", "of Swiftness", "suffix", ["focus"], 0.1, "any"),
  hastened("of-aptitude", "of Aptitude", "suffix", ["focus"], 0.2, "item-attribute"),
  remembered("of-quickening", "of Quickening", "suffix", ["wand"], 0.1, "any"),
  remembered("of-memory", "of Memory", "suffix", ["wand"], 0.2, "item-attribute"),
  mastered("of-mastery", "of Mastery", "suffix", ["staff"]),
  mod(
    "of-enchanting",
    "of Enchanting",
    "suffix",
    MARTIAL_AND_STAFF,
    [{ kind: "enchantment-duration", increase: 0.2 }],
    "Enchantments last 20% longer",
  ),
  hastened(
    "aptitude-not-attitude",
    '"Aptitude not Attitude"',
    "inscription",
    STAFF_AND_WAND,
    0.2,
    "item-attribute",
  ),
  hastened("dont-think-twice", '"Don\'t think twice"', "inscription", STAFF_AND_WAND, 0.1, "any"),
  remembered(
    "let-the-memory-live-again",
    '"Let the Memory Live Again"',
    "inscription",
    STAFF_AND_WAND,
    0.1,
    "any",
  ),
  remembered("serenity-now", '"Serenity Now"', "inscription", ["focus"], 0.1, "any"),
  remembered("forget-me-not", '"Forget Me Not"', "inscription", ["focus"], 0.2, "item-attribute"),
  mastered("master-of-my-domain", '"Master of My Domain"', "inscription", OFFHANDS),
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
