import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import type { AttackWeaponClass, OnHitEffect } from "../skills/types.js";
import { EQUIPMENT_REQUIREMENT_RANK, type DamageType, type EquipmentRequirement } from "./types.js";

/**
 * The weapon catalog (ADR-0012).
 *
 * A weapon here is a *class*, not an item: there is no inventory, no
 * drop table, no upgrade component and no inscription. You pick "axe"
 * and you get the axe numbers. That is the PvP half of the genre's
 * equipment model, and it is the only half that fits a game with no
 * database and builds that travel as a line of text.
 *
 * The damage ranges, attack intervals and requirement rank are numeric
 * facts taken from public reference data (ADR-0004 treats those as
 * uncopyrightable fact). Ranges are **not** — see the scaling note
 * below.
 */

/* -------------------------------------------------------------------------- */
/* Distance                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reference distances rescaled into this project's world units.
 *
 * The reference game measures in its own unit; this one has shipped,
 * playtested constants (`RANGE_MELEE = 40`, `RANGE_SPELL = 420` in
 * `distances.ts`) and arenas roughly 900 units across. Copying the
 * reference numbers would break every map, so the *ratios* are adopted
 * and anchored on spellcasting range, which is the one value both
 * systems already agree on.
 */
const UNITS_PER_REFERENCE_UNIT = RANGE_SPELL / 1248;

function rescale(referenceUnits: number): number {
  return Math.round(referenceUnits * UNITS_PER_REFERENCE_UNIT);
}

/*
 * Melee reach is `RANGE_MELEE`, not its arithmetic rescaling of 48, and
 * casting reach is `RANGE_SPELL`, the anchor the rescaling uses.
 *
 * Deliberate: weapon range must equal melee-skill range. If a sword
 * swing reached 48 and Swift Chop reached 40 there would be an eight-unit
 * band where you auto-attack someone you cannot use a skill on, which is
 * the kind of discrepancy a player experiences as the game being broken
 * rather than as a rule.
 */

const SPEAR_RANGE = rescale(1000);
const SHORTBOW_RANGE = rescale(1050);
const MEDIUM_BOW_RANGE = rescale(1400);
/** The longest any weapon reaches; the music director calls this engaged (#370). */
export const LONG_BOW_RANGE = rescale(1600);

/**
 * Projectile speed is **derived**, never stored.
 *
 * The reference data publishes a flight *time* measured at the weapon's
 * maximum range. Storing that time directly would mean a point-blank
 * arrow took just as long to arrive as one across the arena. Deriving a
 * speed from it reproduces the published figure at max range and behaves
 * sensibly everywhere else.
 */
function speedFor(range: number, flightSecondsAtMaxRange: number): number {
  return Math.round(range / flightSecondsAtMaxRange);
}

/* -------------------------------------------------------------------------- */
/* The weapon                                                                  */
/* -------------------------------------------------------------------------- */

export type WeaponId =
  | "unarmed"
  | "sword"
  | "axe"
  | "hammer"
  | "daggers"
  | "scythe"
  | "spear"
  | "wand"
  | "staff"
  | "flatbow"
  | "shortbow"
  | "longbow"
  | "recurve-bow"
  | "hornbow";

/** Whether an off-hand may be carried alongside. */
export type WeaponGrip = "one-handed" | "two-handed";

export interface DoubleStrikeRule {
  readonly attributeId: string;
  /** Chance with no investment at all. */
  readonly baseChance: number;
  /** Added per rank of `attributeId`. */
  readonly perRank: number;
}

export interface Weapon {
  readonly id: WeaponId;
  readonly name: string;
  readonly grip: WeaponGrip;
  readonly requirement: EquipmentRequirement;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damageType: DamageType;
  /** Seconds between swings, before any attack-speed modifier. */
  readonly attackIntervalSeconds: number;
  /** Reach, in world units. */
  readonly range: number;
  /** World units per second. `undefined` means the hit lands immediately. */
  readonly projectileSpeed: number | undefined;
  /** What a hit does besides its damage, a spirit's (#1239); none for a player's weapon. */
  readonly onHit: readonly OnHitEffect[];
  /** Fraction of the target's armor ignored, 0..1. */
  readonly armorPenetration: number;
  /** Foes adjacent to the target also struck. Scythes cleave; nothing else does. */
  readonly cleaveTargets: number;
  /** Base damage on a critical is `damageMax` times this. */
  readonly criticalMultiplier: number;
  /** Daggers strike twice sometimes; every other weapon never does. */
  readonly doubleStrike: DoubleStrikeRule | undefined;
}

function martial(
  id: WeaponId,
  name: string,
  attributeId: string,
  grip: WeaponGrip,
  damageMin: number,
  damageMax: number,
  damageType: DamageType,
  attackIntervalSeconds: number,
  range: number,
  overrides: Partial<Weapon> = {},
): Weapon {
  const requirement: EquipmentRequirement = {
    kind: "fixed",
    attributeId,
    rank: EQUIPMENT_REQUIREMENT_RANK,
  };
  const base: Weapon = {
    id,
    name,
    grip,
    requirement,
    damageMin,
    damageMax,
    damageType,
    attackIntervalSeconds,
    range,
    projectileSpeed: undefined,
    armorPenetration: 0,
    cleaveTargets: 0,
    criticalMultiplier: Math.SQRT2,
    doubleStrike: undefined,
    onHit: [],
  };
  return Object.freeze({ ...base, ...overrides });
}

function bow(
  id: WeaponId,
  name: string,
  interval: number,
  range: number,
  flight: number,
  overrides: Partial<Weapon> = {},
): Weapon {
  return martial(
    id,
    name,
    "ranger.marksmanship",
    "two-handed",
    15,
    28,
    "piercing",
    interval,
    range,
    {
      projectileSpeed: speedFor(range, flight),
      ...overrides,
    },
  );
}

/**
 * Fists. The fallback when a build names a weapon that does not exist.
 *
 * Genuinely bad on purpose: it has to be a visible downgrade, or
 * "the server did not understand your build" would be an invisible
 * failure mode.
 */
const UNARMED: Weapon = Object.freeze({
  id: "unarmed",
  name: "Unarmed",
  grip: "one-handed",
  // No attribute can improve fists, so the requirement is trivially met
  // at rank 0 rather than being a `fixed` link to an attribute nobody has.
  requirement: { kind: "chosen", from: [], rank: 0 },
  damageMin: 3,
  damageMax: 5,
  damageType: "blunt",
  attackIntervalSeconds: 1.33,
  range: RANGE_MELEE,
  projectileSpeed: undefined,
  armorPenetration: 0,
  cleaveTargets: 0,
  criticalMultiplier: Math.SQRT2,
  doubleStrike: undefined,
  onHit: [],
} satisfies Weapon);

/**
 * Caster weapons take whichever attribute their owner nominates: a fire
 * wand and an air wand are the same class with a different link, so the
 * nomination lives on the build rather than forking the catalog into one
 * entry per casting attribute.
 */
const CASTER_REQUIREMENT: EquipmentRequirement = Object.freeze({
  kind: "chosen",
  from: "any-accessible",
  rank: EQUIPMENT_REQUIREMENT_RANK,
});

export const WEAPONS: Readonly<Record<WeaponId, Weapon>> = Object.freeze({
  unarmed: UNARMED,

  sword: martial(
    "sword",
    "Sword",
    "warrior.swordsmanship",
    "one-handed",
    15,
    22,
    "slashing",
    1.33,
    RANGE_MELEE,
  ),
  axe: martial(
    "axe",
    "Axe",
    "warrior.axe-mastery",
    "one-handed",
    6,
    28,
    "slashing",
    1.33,
    RANGE_MELEE,
  ),
  hammer: martial(
    "hammer",
    "Hammer",
    "warrior.hammer-mastery",
    "two-handed",
    19,
    35,
    "blunt",
    1.75,
    RANGE_MELEE,
  ),

  daggers: martial(
    "daggers",
    "Daggers",
    "assassin.dagger-mastery",
    "two-handed",
    7,
    17,
    "piercing",
    1.33,
    RANGE_MELEE,
    {
      doubleStrike: Object.freeze({
        attributeId: "assassin.dagger-mastery",
        baseChance: 0.02,
        perRank: 0.02,
      }),
    },
  ),

  scythe: martial(
    "scythe",
    "Scythe",
    "dervish.scythe-mastery",
    "two-handed",
    9,
    41,
    "slashing",
    1.75,
    RANGE_MELEE,
    {
      cleaveTargets: 2,
      // A lower critical multiplier than everything else, because a
      // scythe's maximum is already enormous — 41 x √2 would be a
      // one-shot. The reference data makes the same correction.
      criticalMultiplier: 1.1,
    },
  ),

  spear: martial(
    "spear",
    "Spear",
    "paragon.spear-mastery",
    "one-handed",
    14,
    27,
    "piercing",
    1.5,
    SPEAR_RANGE,
    {
      projectileSpeed: 700,
    },
  ),

  wand: Object.freeze({
    id: "wand",
    name: "Wand",
    grip: "one-handed",
    requirement: CASTER_REQUIREMENT,
    damageMin: 11,
    damageMax: 22,
    damageType: "typeless",
    attackIntervalSeconds: 1.75,
    range: RANGE_SPELL,
    projectileSpeed: 900,
    armorPenetration: 0,
    cleaveTargets: 0,
    criticalMultiplier: Math.SQRT2,
    doubleStrike: undefined,
    onHit: [],
  } satisfies Weapon),

  staff: Object.freeze({
    id: "staff",
    name: "Staff",
    grip: "two-handed",
    requirement: CASTER_REQUIREMENT,
    damageMin: 11,
    damageMax: 22,
    damageType: "typeless",
    attackIntervalSeconds: 1.75,
    range: RANGE_SPELL,
    projectileSpeed: 900,
    armorPenetration: 0,
    cleaveTargets: 0,
    criticalMultiplier: Math.SQRT2,
    doubleStrike: undefined,
    onHit: [],
  } satisfies Weapon),

  // The five bows differ only in interval, reach and how long the arrow
  // is in the air — which is the whole point of having five of them.
  flatbow: bow("flatbow", "Flatbow", 2.0, LONG_BOW_RANGE, 0.88),
  shortbow: bow("shortbow", "Shortbow", 2.0, SHORTBOW_RANGE, 0.59),
  longbow: bow("longbow", "Longbow", 2.4, LONG_BOW_RANGE, 0.59),
  "recurve-bow": bow("recurve-bow", "Recurve Bow", 2.4, MEDIUM_BOW_RANGE, 0.4),
  hornbow: bow("hornbow", "Hornbow", 2.7, MEDIUM_BOW_RANGE, 0.59, { armorPenetration: 0.1 }),
});

export const UNARMED_WEAPON_ID = "unarmed" satisfies WeaponId;

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === "string" && Object.hasOwn(WEAPONS, value);
}

export function getWeapon(id: string): Weapon | undefined {
  return isWeaponId(id) ? WEAPONS[id] : undefined;
}

/** Every weapon, in catalog order. Handy for a picker and for data tests. */
export const ALL_WEAPONS: readonly Weapon[] = Object.freeze(Object.values(WEAPONS));

/** Whether `weapon` is a wand or a staff: a spellcaster's, not a martial one. */
export function isCasterWeapon(weapon: Weapon): boolean {
  return weapon.requirement === CASTER_REQUIREMENT;
}

/** A two-handed weapon leaves no hand free for a shield or a focus. */
export function allowsOffhand(weapon: Weapon): boolean {
  return weapon.grip === "one-handed";
}

const MELEE_WEAPONS: readonly WeaponId[] = ["sword", "axe", "hammer", "daggers", "scythe", "spear"];

/** The weapons each class of attack skill can be used with (ADR-0029). */
const WIELDS: Readonly<Record<AttackWeaponClass, readonly WeaponId[]>> = Object.freeze({
  axe: ["axe"],
  sword: ["sword"],
  hammer: ["hammer"],
  daggers: ["daggers"],
  scythe: ["scythe"],
  spear: ["spear"],
  bow: ["flatbow", "shortbow", "longbow", "recurve-bow", "hornbow"],
  melee: MELEE_WEAPONS,
});

/** Whether `weaponId` is one an attack skill needing `required` can be used with. */
export function wieldsFor(weaponId: WeaponId, required: AttackWeaponClass): boolean {
  return WIELDS[required].includes(weaponId);
}

/**
 * The element a wand or staff deals, by the attribute its owner nominated
 * (GW1, #761). An attribute not listed, or none nominated, leaves the
 * weapon typeless.
 */
export const CASTER_WEAPON_ELEMENT: Readonly<Record<string, DamageType>> = Object.freeze({
  "elementalist.fire-magic": "fire",
  "elementalist.air-magic": "lightning",
  "elementalist.water-magic": "cold",
  "elementalist.earth-magic": "earth",
  "monk.healing-prayers": "holy",
  "monk.protection-prayers": "holy",
  "monk.smiting-prayers": "holy",
  "monk.divine-favor": "holy",
  "mesmer.domination-magic": "chaos",
  "mesmer.illusion-magic": "chaos",
  "mesmer.inspiration-magic": "chaos",
  // The Necromancer lines are unverified against GW1.
  "necromancer.blood-magic": "dark",
  "necromancer.soul-reaping": "dark",
  "necromancer.curses": "cold",
  "necromancer.death-magic": "cold",
});

/**
 * What a blow from `weapon` deals, linked to `attributeId`: a caster
 * weapon's element, every other weapon its own type.
 */
export function weaponDamageType(weapon: Weapon, attributeId: string | undefined): DamageType {
  if (
    !isCasterWeapon(weapon) ||
    attributeId === undefined ||
    !Object.hasOwn(CASTER_WEAPON_ELEMENT, attributeId)
  ) {
    return weapon.damageType;
  }
  return CASTER_WEAPON_ELEMENT[attributeId] ?? weapon.damageType;
}
