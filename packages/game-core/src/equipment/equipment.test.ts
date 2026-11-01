import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { createRng, type SimulationRng } from "../rng.js";
import { accessibleAttributeIds } from "../character.js";
import { PROFESSIONS, getAttribute, type ProfessionId } from "../professions.js";
import { SKILL_BAR_SLOTS, validatePlayerBuild, type PlayerBuild } from "../build.js";
import {
  HEADGEAR_BONUS,
  HIT_LOCATION_WEIGHTS,
  NO_PIECE_ARMOR,
  bareArmorSet,
  rollHitLocation,
  type ArmorSet,
} from "./armor.js";
import { GEAR_OMISSIONS, gearOmission, openGearGaps } from "./coverage.js";
import {
  defaultEquipmentFor,
  defaultWeaponFor,
  type BuildEquipment,
  type WeaponSet,
} from "./loadout.js";
import { NO_UPGRADES, type ItemUpgrades } from "./mods.js";
import { parseBuildEquipment } from "./parse.js";
import { reconcileEquipment } from "./reconcile.js";
import { validateEquipment } from "./validate.js";
import {
  ALL_WEAPONS,
  CASTER_WEAPON_ELEMENT,
  WEAPONS,
  allowsOffhand,
  getWeapon,
  type WeaponId,
} from "./weapons.js";
import { ALL_INSIGNIAS, type InsigniaId } from "./insignias.js";
import { ALL_OFFHANDS, SHIELD_REQUIREMENT_ATTRIBUTES } from "./offhands.js";
import {
  creatureResolvedEquipment,
  effectiveRanks,
  resolveLoadout,
  unarmedResolvedEquipment,
} from "./resolve.js";
import {
  ATTRIBUTE_RUNE_TIERS,
  UNIVERSAL_RUNES,
  type EquippedRune,
  type RuneTier,
} from "./runes.js";
import { ARMOR_SLOTS, type ArmorSlot } from "./types.js";

const PROFESSION_IDS = Object.keys(PROFESSIONS) as readonly ProfessionId[];

function contextFor(primary: ProfessionId, secondary?: ProfessionId) {
  return {
    primaryProfession: primary,
    secondaryProfession: secondary,
    accessibleAttributeIds: new Set(accessibleAttributeIds(primary, secondary)),
  };
}

/** A bare armor set whose headgear raises `attributeId`, as a legal build's must (#1140). */
function armorWithHeadgear(attributeId: string | null): ArmorSet {
  return { ...bareArmorSet(), head: { ...bareArmorSet().head, headgearAttributeId: attributeId } };
}

function buildFor(primary: ProfessionId, secondary?: ProfessionId): PlayerBuild {
  return {
    name: "Fixture",
    primaryProfession: primary,
    secondaryProfession: secondary,
    attributes: [],
    skillBar: Array.from({ length: SKILL_BAR_SLOTS }, () => null),
    equipment: defaultEquipmentFor(primary),
  };
}

describe("the weapon catalog", () => {
  it("links every fixed requirement to an attribute that actually exists", () => {
    for (const weapon of ALL_WEAPONS) {
      if (weapon.requirement.kind !== "fixed") {
        continue;
      }
      expect(
        getAttribute(weapon.requirement.attributeId),
        `${weapon.id} requires ${weapon.requirement.attributeId}`,
      ).toBeDefined();
    }
  });

  it("restricts shields to attributes that exist", () => {
    for (const attributeId of SHIELD_REQUIREMENT_ATTRIBUTES) {
      expect(getAttribute(attributeId), attributeId).toBeDefined();
    }
  });

  it("never states a minimum above its maximum", () => {
    for (const weapon of ALL_WEAPONS) {
      expect(weapon.damageMin, weapon.id).toBeLessThanOrEqual(weapon.damageMax);
      expect(weapon.damageMin, weapon.id).toBeGreaterThan(0);
    }
  });

  it("gives every weapon a positive interval and reach", () => {
    for (const weapon of ALL_WEAPONS) {
      expect(weapon.attackIntervalSeconds, weapon.id).toBeGreaterThan(0);
      expect(weapon.range, weapon.id).toBeGreaterThan(0);
    }
  });

  it("agrees with its own id as the catalog key", () => {
    for (const [key, weapon] of Object.entries(WEAPONS)) {
      expect(weapon.id).toBe(key);
    }
  });

  it("only gives a projectile speed to weapons that reach past melee", () => {
    for (const weapon of ALL_WEAPONS) {
      if (weapon.projectileSpeed !== undefined) {
        expect(weapon.range, `${weapon.id} is a projectile weapon`).toBeGreaterThan(100);
        expect(weapon.projectileSpeed).toBeGreaterThan(0);
      }
    }
  });

  it("makes a projectile outrun a sprinting player by a wide margin", () => {
    // Otherwise an arrow would be dodgeable by simply walking away from
    // it, which is not counterplay, it is a bug that looks like physics.
    const runSpeed = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    for (const weapon of ALL_WEAPONS) {
      if (weapon.projectileSpeed !== undefined) {
        expect(weapon.projectileSpeed, weapon.id).toBeGreaterThan(runSpeed * 3);
      }
    }
  });

  it("lets a one-handed weapon take an off-hand and a two-handed one refuse", () => {
    expect(allowsOffhand(WEAPONS.sword)).toBe(true);
    expect(allowsOffhand(WEAPONS.hammer)).toBe(false);
    expect(allowsOffhand(WEAPONS.daggers)).toBe(false);
    expect(allowsOffhand(WEAPONS.longbow)).toBe(false);
  });

  it("gives only daggers a double strike, and only scythes a cleave", () => {
    const doubleStrikers = ALL_WEAPONS.filter((w) => w.doubleStrike !== undefined).map((w) => w.id);
    expect(doubleStrikers).toEqual(["daggers"]);

    const cleavers = ALL_WEAPONS.filter((w) => w.cleaveTargets > 0).map((w) => w.id);
    expect(cleavers).toEqual(["scythe"]);
  });

  it("reaches 26% double strike at rank 12, as the reference does", () => {
    const rule = WEAPONS.daggers.doubleStrike;
    expect(rule).toBeDefined();
    if (rule === undefined) {
      return;
    }
    expect(rule.baseChance + rule.perRank * 12).toBeCloseTo(0.26, 10);
  });

  it("holds the scythe's critical multiplier below everything else", () => {
    // 41 x 1.41 would be a one-shot; the reference makes the same
    // correction, and the comment in the catalog says why.
    for (const weapon of ALL_WEAPONS) {
      if (weapon.id !== "scythe") {
        expect(weapon.criticalMultiplier, weapon.id).toBeGreaterThan(
          WEAPONS.scythe.criticalMultiplier,
        );
      }
    }
  });

  it("gives the hornbow the only armor penetration", () => {
    const penetrating = ALL_WEAPONS.filter((w) => w.armorPenetration > 0).map((w) => w.id);
    expect(penetrating).toEqual(["hornbow"]);
  });

  it("makes unarmed strictly worse than every real weapon", () => {
    // Fists are the "we did not understand your build" fallback. If they
    // were competitive, that failure would be invisible.
    for (const weapon of ALL_WEAPONS) {
      if (weapon.id !== "unarmed") {
        expect(weapon.damageMax, weapon.id).toBeGreaterThan(WEAPONS.unarmed.damageMax);
      }
    }
  });
});

describe("the rune catalog", () => {
  it("charges nothing for a minor rune and progressively more above it", () => {
    expect(ATTRIBUTE_RUNE_TIERS.minor.healthPenalty).toBe(0);
    expect(ATTRIBUTE_RUNE_TIERS.major.healthPenalty).toBeGreaterThan(
      ATTRIBUTE_RUNE_TIERS.minor.healthPenalty,
    );
    expect(ATTRIBUTE_RUNE_TIERS.superior.healthPenalty).toBeGreaterThan(
      ATTRIBUTE_RUNE_TIERS.major.healthPenalty,
    );
  });

  it("raises the bonus one rank at a time", () => {
    expect(ATTRIBUTE_RUNE_TIERS.minor.bonus).toBe(1);
    expect(ATTRIBUTE_RUNE_TIERS.major.bonus).toBe(2);
    expect(ATTRIBUTE_RUNE_TIERS.superior.bonus).toBe(3);
  });

  it("locks Absorption to a primary warrior and leaves everything else open", () => {
    expect(UNIVERSAL_RUNES.absorption.requiresPrimary).toBe("warrior");
    for (const rune of Object.values(UNIVERSAL_RUNES)) {
      if (rune.id !== "absorption") {
        expect(rune.requiresPrimary, rune.id).toBeUndefined();
      }
    }
  });

  it("gives a non-tiered rune the same effect at every tier", () => {
    expect(UNIVERSAL_RUNES.vitae.tiered).toBe(false);
    expect(UNIVERSAL_RUNES.vitae.byTier.minor).toEqual(UNIVERSAL_RUNES.vitae.byTier.superior);
  });
});

describe("resolving universal runes", () => {
  function maxHealthWearing(...runes: ["vigor" | "vitae", RuneTier][]): number {
    const armor = { ...bareArmorSet() };
    ARMOR_SLOTS.forEach((slot, index) => {
      const worn = runes[index];
      if (worn !== undefined) {
        const [runeId, tier] = worn;
        armor[slot] = {
          insigniaId: null,
          rune: { kind: "universal", runeId, tier },
          headgearAttributeId: null,
        };
      }
    });
    return resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor,
        },
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    ).weaponSets[0].maxHealth;
  }

  it("counts a rune that does not stack once, at the best tier worn (GW1)", () => {
    const base = maxHealthWearing();
    expect(maxHealthWearing(["vigor", "superior"], ["vigor", "minor"])).toBe(base + 50);
    expect(maxHealthWearing(["vigor", "minor"], ["vigor", "superior"])).toBe(base + 50);
  });

  it("counts every Rune of Vitae, which stacks (GW1)", () => {
    expect(maxHealthWearing(["vitae", "minor"], ["vitae", "minor"])).toBe(maxHealthWearing() + 20);
  });
});

describe("what a weapon deals (#761)", () => {
  function damageTypeOf(weaponId: WeaponId, nominated: string | null): string {
    return resolveLoadout(
      {
        primaryProfession: "elementalist",
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId, requirementAttributeId: nominated, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: bareArmorSet(),
        },
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    ).weaponSets[0].equipment.mainHand.damageType;
  }

  it("gives a wand or staff its nominated attribute's element", () => {
    expect(damageTypeOf("wand", "elementalist.fire-magic")).toBe("fire");
    expect(damageTypeOf("staff", "elementalist.air-magic")).toBe("lightning");
    expect(damageTypeOf("wand", "mesmer.domination-magic")).toBe("chaos");
  });

  it("leaves it typeless for an attribute with no element, or none nominated", () => {
    expect(damageTypeOf("wand", "elementalist.energy-storage")).toBe("typeless");
    expect(damageTypeOf("wand", "mesmer.fast-casting")).toBe("typeless");
    expect(damageTypeOf("staff", null)).toBe("typeless");
  });

  it("keeps every other weapon's own type", () => {
    expect(damageTypeOf("sword", null)).toBe("slashing");
    expect(damageTypeOf("unarmed", null)).toBe("blunt");
  });

  it("names only attributes that exist", () => {
    for (const attributeId of Object.keys(CASTER_WEAPON_ELEMENT)) {
      expect(getAttribute(attributeId), attributeId).toBeDefined();
    }
  });
});

describe("inherent armor by profession (#759) and insignia armor per piece (#1135)", () => {
  function armorOf(primaryProfession: ProfessionId, insignia: InsigniaId | null) {
    return resolveLoadout(
      {
        primaryProfession,
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: { ...bareArmorSet(), chest: { insigniaId: insignia, rune: null } },
        },
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    ).weaponSets[0].equipment;
  }

  it("holds a Warrior's +20 vs physical on every hit, and Stalwart on the chest alone", () => {
    const { conditionalArmor, pieceArmor } = armorOf("warrior", "stalwart");
    expect(conditionalArmor).toEqual([{ amount: 20, conditions: [{ kind: "vs-physical" }] }]);
    expect(pieceArmor.chest).toEqual([{ amount: 10, conditions: [{ kind: "vs-physical" }] }]);
    for (const slot of ["head", "hands", "legs", "feet"] as const) {
      expect(pieceArmor[slot]).toEqual([]);
    }
  });

  it("holds a Ranger's +30 vs elemental on every hit", () => {
    expect(armorOf("ranger", "stalwart").conditionalArmor).toEqual([
      { amount: 30, conditions: [{ kind: "vs-elemental" }] },
    ]);
  });

  it("gives a Monk none without insignias", () => {
    const { conditionalArmor, pieceArmor } = armorOf("monk", null);
    expect(conditionalArmor).toEqual([]);
    expect(pieceArmor).toEqual(NO_PIECE_ARMOR);
  });

  it("puts each of Prodigy's tiers in its piece, and Knight's cut (#1142)", () => {
    expect(armorOf("mesmer", "prodigys").pieceArmor.chest).toEqual(
      [1, 3, 5].map((count) => ({
        amount: 5,
        conditions: [{ kind: "recharging-at-least", count }],
      })),
    );
    const knight = armorOf("warrior", "knights");
    expect(knight.pieceReduction).toEqual({ head: 0, chest: 3, hands: 0, legs: 0, feet: 0 });
    expect(knight.pieceArmor).toEqual(NO_PIECE_ARMOR);
  });

  it("resolves another primary's insignia to nothing, and validation names it once (#1142)", () => {
    expect(armorOf("monk", "prodigys").pieceArmor).toEqual(NO_PIECE_ARMOR);
    expect(armorOf("monk", "knights").pieceReduction.chest).toBe(0);
    const equipment: BuildEquipment = {
      ...defaultEquipmentFor("monk"),
      // Headgear of an attribute both builds below reach: the monk/mesmer
      // and the mesmer.
      armor: {
        ...armorWithHeadgear("mesmer.inspiration-magic"),
        chest: { insigniaId: "prodigys", rune: null },
      },
    };
    expect(validateEquipment(equipment, contextFor("monk", "mesmer"))).toEqual([
      { field: "equipment.armor.chest", message: "Prodigy's Insignia needs a primary mesmer" },
    ]);
    expect(
      validateEquipment(
        { ...defaultEquipmentFor("mesmer"), armor: equipment.armor },
        contextFor("mesmer"),
      ),
    ).toEqual([]);
  });

  it("refuses Blighter's on a Monk (#1188)", () => {
    const equipment: BuildEquipment = {
      ...defaultEquipmentFor("monk"),
      armor: {
        ...armorWithHeadgear("monk.divine-favor"),
        legs: { insigniaId: "blighters", rune: null },
      },
    };
    expect(validateEquipment(equipment, contextFor("monk"))).toEqual([
      { field: "equipment.armor.legs", message: "Blighter's Insignia needs a primary necromancer" },
    ]);
  });

  it("refuses Pyromancer on a Monk, allows Sentry's on anyone (#1206)", () => {
    const armorWith = (insigniaId: InsigniaId): BuildEquipment => ({
      ...defaultEquipmentFor("monk"),
      armor: {
        ...armorWithHeadgear("monk.divine-favor"),
        legs: { insigniaId, rune: null },
      },
    });
    expect(validateEquipment(armorWith("pyromancer"), contextFor("monk"))).toEqual([
      {
        field: "equipment.armor.legs",
        message: "Pyromancer Insignia needs a primary elementalist",
      },
    ]);
    expect(validateEquipment(armorWith("sentrys"), contextFor("monk"))).toEqual([]);
  });
});

describe("rollHitLocation (#1135)", () => {
  const stub = (value: number): SimulationRng => ({ ...createRng(1), nextFloat: () => value });

  it("lays the pieces out chest, legs, head, hands, feet", () => {
    const at = (value: number) => rollHitLocation(stub(value));
    expect([0, 0.374].map(at)).toEqual(["chest", "chest"]);
    expect([0.375, 0.624].map(at)).toEqual(["legs", "legs"]);
    expect(at(0.625)).toBe("head");
    expect(at(0.75)).toBe("hands");
    expect([0.875, 0.999].map(at)).toEqual(["feet", "feet"]);
  });

  it("lands within 1% of GW1's weights over 80 000 seeded draws", () => {
    const rng = createRng(1135);
    const counts = new Map<ArmorSlot, number>();
    const draws = 80_000;
    for (let i = 0; i < draws; i += 1) {
      const slot = rollHitLocation(rng);
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    for (const slot of ARMOR_SLOTS) {
      expect(Math.abs((counts.get(slot) ?? 0) / draws - HIT_LOCATION_WEIGHTS[slot])).toBeLessThan(
        0.01,
      );
    }
  });
});

describe("default loadouts", () => {
  it.each(PROFESSION_IDS)("gives %s a legal build straight out of the box", (profession) => {
    // The build editor hands exactly this to every new character and on
    // every profession change, so a default that is not a legal build
    // would make the editor's first screen an error.
    const problems = validatePlayerBuild(
      buildFor(profession),
      MINIMAL_GW_INSPIRED_PVP_V1.attributes,
    );
    expect(problems).toEqual([]);
  });

  it.each(PROFESSION_IDS)(
    "never pairs %s's default off-hand with both hands full",
    (profession) => {
      const equipment = defaultEquipmentFor(profession);
      const [set1] = equipment.weaponSets;
      const weapon = getWeapon(set1.mainHand.weaponId);
      expect(weapon).toBeDefined();
      if (weapon === undefined || set1.offHand === null) {
        return;
      }
      expect(allowsOffhand(weapon), `${profession} holds a ${weapon.id}`).toBe(true);
    },
  );

  it("arms a warrior with a sword and a caster with a wand", () => {
    expect(defaultWeaponFor("warrior")).toBe("sword");
    expect(defaultWeaponFor("monk")).toBe("wand");
    expect(defaultWeaponFor("dervish")).toBe("scythe");
  });

  it("slots no runes or insignias, because those are trades nobody chose", () => {
    for (const profession of PROFESSION_IDS) {
      const { armor } = defaultEquipmentFor(profession);
      for (const slot of ARMOR_SLOTS) {
        expect(armor[slot].rune).toBeNull();
        expect(armor[slot].insigniaId).toBeNull();
      }
    }
  });
});

describe("validateEquipment", () => {
  it("accepts a bare, sensible loadout", () => {
    expect(validateEquipment(defaultEquipmentFor("warrior"), contextFor("warrior"))).toEqual([]);
  });

  it("refuses an off-hand alongside a two-handed weapon", () => {
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "shield",
              requirementAttributeId: "warrior.strength",
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("warrior.strength"),
      },
      contextFor("warrior"),
    );
    expect(problems.map((p) => p.field)).toContain("equipment.weaponSets[0].offHand");
    expect(problems.some((p) => p.message.includes("both hands"))).toBe(true);
  });

  it("refuses a nomination on a weapon whose attribute is fixed", () => {
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: {
              weaponId: "sword",
              requirementAttributeId: "warrior.axe-mastery",
              upgrades: NO_UPGRADES,
            },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("warrior.strength"),
      },
      contextFor("warrior"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("always linked to");
  });

  it("refuses a shield linked to an attribute shields do not use", () => {
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "shield",
              requirementAttributeId: "monk.divine-favor",
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("warrior.strength"),
      },
      contextFor("warrior", "monk"),
    );
    expect(problems.some((p) => p.message.includes("cannot be linked to"))).toBe(true);
  });

  it("refuses gear linked to an attribute the character cannot reach", () => {
    const problems = validateEquipment(
      {
        // A monk may hold a sword — weapons are not profession-gated —
        // but a focus linked to Fire Magic is a rule they do not have.
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "focus",
              requirementAttributeId: "elementalist.fire-magic",
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("monk.divine-favor"),
      },
      contextFor("monk"),
    );
    expect(problems.some((p) => p.message.includes("cannot access"))).toBe(true);
  });

  it("lets anyone hold any weapon, however badly it suits them", () => {
    // Weapons are gated by requirement, not by profession: a mesmer with
    // a hammer has made a poor choice, not an illegal one.
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("mesmer.fast-casting"),
      },
      contextFor("mesmer"),
    );
    expect(problems).toEqual([]);
  });

  it("refuses an attribute rune for an attribute the character cannot raise", () => {
    const armor = { ...bareArmorSet() };
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: {
          ...armor,
          head: {
            insigniaId: null,
            rune: { kind: "attribute", attributeId: "monk.divine-favor", tier: "superior" },
            headgearAttributeId: "warrior.strength",
          },
        },
      },
      contextFor("warrior"),
    );
    expect(problems.some((p) => p.message.includes("not a Warrior attribute"))).toBe(true);
  });

  it("fits an attribute rune only to the primary's attributes (#1141)", () => {
    const withHeadRune = (attributeId: string): BuildEquipment => ({
      weaponSets: [
        {
          mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
          offHand: null,
        },
        null,
        null,
        null,
      ],
      armor: {
        ...bareArmorSet(),
        // Tactics is the headgear a W/Mo and a Mo/W can both wear.
        head: {
          insigniaId: null,
          rune: { kind: "attribute", attributeId, tier: "minor" },
          headgearAttributeId: "warrior.tactics",
        },
      },
    });
    expect(
      validateEquipment(withHeadRune("monk.healing-prayers"), contextFor("warrior", "monk")),
    ).toEqual([
      {
        field: "equipment.armor.head",
        message: "a rune of Healing Prayers, which is not a Warrior attribute",
      },
    ]);
    expect(
      validateEquipment(withHeadRune("warrior.strength"), contextFor("warrior", "monk")),
    ).toEqual([]);
    expect(
      validateEquipment(withHeadRune("warrior.strength"), contextFor("monk", "warrior")),
    ).toHaveLength(1);
  });

  it("refuses Absorption on anyone who is not a primary warrior", () => {
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: {
              weaponId: "wand",
              requirementAttributeId: "monk.divine-favor",
              upgrades: NO_UPGRADES,
            },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: {
          ...bareArmorSet(),
          chest: {
            insigniaId: null,
            rune: { kind: "universal", runeId: "absorption", tier: "minor" },
          },
        },
      },
      contextFor("monk", "warrior"),
    );
    expect(problems.some((p) => p.message.includes("primary warrior"))).toBe(true);
  });

  it("reports a duplicated attribute rune, since both penalties still apply", () => {
    const rune = { kind: "attribute", attributeId: "warrior.strength", tier: "superior" } as const;
    const problems = validateEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: {
          ...bareArmorSet(),
          head: { insigniaId: null, rune, headgearAttributeId: "warrior.strength" },
          chest: { insigniaId: null, rune },
        },
      },
      contextFor("warrior"),
    );
    expect(problems.some((p) => p.message.includes("duplicates"))).toBe(true);
  });

  it("reports a duplicated universal rune that does not stack, and not Vitae, which does", () => {
    const twoOf = (runeId: "clarity" | "vitae") => {
      const rune = { kind: "universal", runeId, tier: "minor" } as const;
      return validateEquipment(
        {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: {
            ...bareArmorSet(),
            head: { insigniaId: null, rune, headgearAttributeId: "warrior.strength" },
            chest: { insigniaId: null, rune },
          },
        },
        contextFor("warrior"),
      );
    };
    expect(twoOf("clarity")).toEqual([
      {
        field: "equipment.armor.chest",
        message: "Rune of Clarity duplicates another rune of the same kind; only one applies",
      },
    ]);
    expect(twoOf("vitae")).toEqual([]);
  });

  it("refuses an unknown weapon rather than quietly substituting one", () => {
    const problems = validateEquipment(
      {
        // Only reachable from a hand-edited record; the parser rejects
        // this shape. Validation still has to have an answer for it.
        weaponSets: [
          {
            mainHand: {
              weaponId: "chainsaw" as never,
              requirementAttributeId: null,
              upgrades: NO_UPGRADES,
            },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: armorWithHeadgear("warrior.strength"),
      },
      contextFor("warrior"),
    );
    expect(problems.some((p) => p.message.includes("unknown weapon"))).toBe(true);
  });

  it("accepts every off-hand on a profession that can link it", () => {
    for (const offhand of ALL_OFFHANDS) {
      const attributeId = offhand.id === "shield" ? "warrior.strength" : "warrior.tactics";
      const problems = validateEquipment(
        {
          weaponSets: [
            {
              mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: {
                offhandId: offhand.id,
                requirementAttributeId: attributeId,
                upgrades: NO_UPGRADES,
              },
            },
            null,
            null,
            null,
          ],
          armor: armorWithHeadgear("warrior.strength"),
        },
        contextFor("warrior"),
      );
      expect(problems, offhand.id).toEqual([]);
    }
  });
});

describe("parseBuildEquipment", () => {
  it("rejects absent gear like any other missing field", () => {
    // Gear is not optional, and a build without it is malformed, not old
    // (ADR-0016). Nothing fills it in.
    expect(parseBuildEquipment(undefined)).toBeUndefined();
    expect(parseBuildEquipment(null)).toBeUndefined();
  });

  it("round-trips gear through JSON unchanged", () => {
    const original = defaultEquipmentFor("warrior");
    const parsed = parseBuildEquipment(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original);
  });

  it("rejects gear that is present and structurally wrong", () => {
    const cases: readonly unknown[] = [
      42,
      "sword",
      [],
      { mainHand: null },
      {
        weaponSets: [{ mainHand: { weaponId: "chainsaw" }, offHand: null }, null, null, null],
        armor: { head: { headgearAttributeId: null } },
      },
      {
        weaponSets: [
          { mainHand: { weaponId: "sword" }, offHand: { offhandId: "bagpipes" } },
          null,
          null,
          null,
        ],
        armor: { head: { headgearAttributeId: null } },
      },
      {
        weaponSets: [{ mainHand: { weaponId: "sword" }, offHand: null }, null, null, null],
        armor: null,
      },
      {
        weaponSets: [{ mainHand: { weaponId: "sword" }, offHand: null }, null, null, null],
        armor: { head: { rune: { kind: "attribute" }, headgearAttributeId: null } },
      },
    ];
    for (const value of cases) {
      expect(parseBuildEquipment(value), JSON.stringify(value)).toBeUndefined();
    }
  });

  it("fills in missing armor slots rather than failing on a sparse record", () => {
    const parsed = parseBuildEquipment({
      weaponSets: [
        { mainHand: { weaponId: "sword", upgrades: NO_UPGRADES }, offHand: null },
        null,
        null,
        null,
      ],
      armor: { head: { headgearAttributeId: null } },
    });
    expect(parsed).toBeDefined();
    expect(parsed?.armor.head).toEqual({ insigniaId: null, rune: null, headgearAttributeId: null });
    for (const slot of ["chest", "hands", "legs", "feet"] as const) {
      expect(parsed?.armor[slot]).toEqual({ insigniaId: null, rune: null });
    }
  });

  it("needs the head's headgear attribute, a string or null, never absent (#1140)", () => {
    const withHead = (head: unknown) =>
      parseBuildEquipment({
        weaponSets: [
          { mainHand: { weaponId: "sword", upgrades: NO_UPGRADES }, offHand: null },
          null,
          null,
          null,
        ],
        armor: { head },
      });
    expect(withHead({ insigniaId: null, rune: null })).toBeUndefined();
    expect(withHead(undefined)).toBeUndefined();
    expect(withHead({ headgearAttributeId: 7 })).toBeUndefined();
    expect(withHead({ headgearAttributeId: "warrior.strength" })?.armor.head).toEqual({
      insigniaId: null,
      rune: null,
      headgearAttributeId: "warrior.strength",
    });
    expect(withHead({ headgearAttributeId: null })?.armor.head.headgearAttributeId).toBeNull();
  });
});

describe("reconcileEquipment", () => {
  it("keeps the primary's attribute runes across professions, clears the rest (#1141)", () => {
    const equipment: BuildEquipment = {
      weaponSets: [
        {
          mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
          offHand: null,
        },
        null,
        null,
        null,
      ],
      armor: {
        ...bareArmorSet(),
        head: {
          insigniaId: null,
          rune: { kind: "attribute", attributeId: "warrior.tactics", tier: "minor" },
          headgearAttributeId: "warrior.tactics",
        },
        chest: {
          insigniaId: null,
          rune: { kind: "attribute", attributeId: "monk.healing-prayers", tier: "minor" },
        },
      },
    };
    // A new secondary leaves the Warrior's rune alone.
    const meWarrior = reconcileEquipment(equipment, contextFor("warrior", "mesmer"));
    expect(meWarrior.armor.head.rune).toEqual(equipment.armor.head.rune);
    // Swapped to Mo/W: the Warrior rune goes, the Monk one stays.
    const monkWarrior = reconcileEquipment(equipment, contextFor("monk", "warrior"));
    expect(monkWarrior.armor.head.rune).toBeNull();
    expect(monkWarrior.armor.chest.rune).toEqual(equipment.armor.chest.rune);
  });

  it("takes another primary's insignias off and keeps the common ones (#1142)", () => {
    const equipment: BuildEquipment = {
      ...defaultEquipmentFor("warrior"),
      armor: {
        ...bareArmorSet(),
        head: { insigniaId: "knights", rune: null, headgearAttributeId: "warrior.strength" },
        chest: { insigniaId: "sentinels", rune: null },
        legs: { insigniaId: "brawlers", rune: null },
      },
    };
    expect(reconcileEquipment(equipment, contextFor("warrior", "monk")).armor).toEqual(
      equipment.armor,
    );
    const monk = reconcileEquipment(equipment, contextFor("monk", "warrior")).armor;
    expect([monk.head.insigniaId, monk.chest.insigniaId, monk.legs.insigniaId]).toEqual([
      null,
      null,
      "brawlers",
    ]);
  });

  it("keeps the weapon class when the character changes profession", () => {
    // A hammer on a mesmer is a bad build, not an illegal one, and
    // deleting the player's choice would be the editor overruling them.
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
      contextFor("mesmer"),
    );
    expect(reconciled.weaponSets[0].mainHand.weaponId).toBe("hammer");
  });

  it("drops an off-hand whose attribute is no longer reachable", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "shield",
              requirementAttributeId: "warrior.strength",
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
      contextFor("mesmer"),
    );
    expect(reconciled.weaponSets[0].offHand).toBeNull();
  });

  it("drops an off-hand when the weapon became two-handed", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "shield",
              requirementAttributeId: "warrior.strength",
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
      contextFor("warrior"),
    );
    expect(reconciled.weaponSets[0].offHand).toBeNull();
  });

  it("re-points a caster weapon rather than dropping it", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: {
              weaponId: "wand",
              requirementAttributeId: "monk.divine-favor",
              upgrades: NO_UPGRADES,
            },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
      contextFor("elementalist"),
    );
    expect(reconciled.weaponSets[0].mainHand.weaponId).toBe("wand");
    expect(reconciled.weaponSets[0].mainHand.requirementAttributeId).not.toBe("monk.divine-favor");
    expect(reconciled.weaponSets[0].mainHand.requirementAttributeId).not.toBeNull();
  });

  it("picks the same replacement attribute every time", () => {
    // An editor that chose a different attribute each time you toggled
    // professions would be maddening to use.
    const before: BuildEquipment = {
      weaponSets: [
        {
          mainHand: {
            weaponId: "wand",
            requirementAttributeId: "monk.divine-favor",
            upgrades: NO_UPGRADES,
          } as const,
          offHand: null,
        },
        null,
        null,
        null,
      ],
      armor: bareArmorSet(),
    };
    const first = reconcileEquipment(before, contextFor("elementalist"));
    const second = reconcileEquipment(before, contextFor("elementalist"));
    expect(first.weaponSets[0].mainHand.requirementAttributeId).toBe(
      second.weaponSets[0].mainHand.requirementAttributeId,
    );
  });

  it("clears a rune the character can no longer use, keeping the rest", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: {
          ...bareArmorSet(),
          head: {
            insigniaId: "survivor",
            rune: { kind: "attribute", attributeId: "warrior.strength", tier: "major" },
            headgearAttributeId: "warrior.strength",
          },
          chest: { insigniaId: null, rune: { kind: "universal", runeId: "vigor", tier: "minor" } },
        },
      },
      contextFor("monk"),
    );
    expect(reconciled.armor.head.rune).toBeNull();
    // The insignia is profession-agnostic and must survive.
    expect(reconciled.armor.head.insigniaId).toBe("survivor");
    expect(reconciled.armor.chest.rune).not.toBeNull();
  });

  it("clears Absorption when the primary profession stops being warrior", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: {
          ...bareArmorSet(),
          feet: {
            insigniaId: null,
            rune: { kind: "universal", runeId: "absorption", tier: "superior" },
          },
        },
      },
      contextFor("ranger", "warrior"),
    );
    expect(reconciled.armor.feet.rune).toBeNull();
  });

  it("leaves already-legal gear completely untouched", () => {
    const equipment = defaultEquipmentFor("warrior");
    expect(reconcileEquipment(equipment, contextFor("warrior"))).toEqual(equipment);
  });

  it("produces gear that validates, for every profession pairing", () => {
    const warriorKit = defaultEquipmentFor("warrior");
    for (const primary of PROFESSION_IDS) {
      const context = contextFor(primary);
      const problems = validateEquipment(reconcileEquipment(warriorKit, context), context);
      expect(problems, primary).toEqual([]);
    }
  });

  describe("the headgear's attribute (#1140)", () => {
    const wearing = (attributeId: string): BuildEquipment => ({
      ...defaultEquipmentFor("warrior"),
      armor: armorWithHeadgear(attributeId),
    });
    const headgearAfter = (
      attributeId: string,
      primary: ProfessionId,
      secondary?: ProfessionId,
    ): string | null =>
      reconcileEquipment(wearing(attributeId), contextFor(primary, secondary)).armor.head
        .headgearAttributeId;

    it("moves to the new primary's primary attribute when the primary changes", () => {
      // W/Mo to R/Mo: Strength is no Ranger's, so Expertise.
      expect(headgearAfter("warrior.strength", "ranger", "monk")).toBe("ranger.expertise");
    });

    it("moves to the primary attribute when the secondary that had it goes", () => {
      // W/Mo to W/R: Healing Prayers went with the Monk.
      expect(headgearAfter("monk.healing-prayers", "warrior", "ranger")).toBe("warrior.strength");
    });

    it("stays across a swap of primary and secondary when both ways can reach it", () => {
      // W/Mo to Mo/W. Tactics is a Warrior secondary attribute and Healing
      // Prayers a Monk one; Strength is the Warrior's primary, which a
      // secondary Warrior does not have, so it moves.
      expect(headgearAfter("warrior.tactics", "monk", "warrior")).toBe("warrior.tactics");
      expect(headgearAfter("monk.healing-prayers", "monk", "warrior")).toBe("monk.healing-prayers");
      expect(headgearAfter("warrior.strength", "monk", "warrior")).toBe("monk.divine-favor");
    });

    it("stays on a primary attribute when only an unrelated secondary changes", () => {
      // W/Mo to W/Me.
      expect(headgearAfter("warrior.strength", "warrior", "mesmer")).toBe("warrior.strength");
    });
  });
});

describe("attribute headgear (#1140)", () => {
  const superior = {
    kind: "attribute",
    attributeId: "warrior.strength",
    tier: "superior",
  } as const;
  const minor = { kind: "attribute", attributeId: "warrior.strength", tier: "minor" } as const;

  /** A W/Mo's resolved ranks with `allocated` bought, wearing this headgear and these runes. */
  function resolveWith(
    allocated: readonly [string, number][],
    headgearAttributeId: string | null,
    runes: { head?: EquippedRune; chest?: EquippedRune } = {},
  ) {
    return resolveLoadout(
      {
        primaryProfession: "warrior",
        secondaryProfession: "monk",
        allocatedRanks: new Map(allocated),
        equipment: {
          ...defaultEquipmentFor("warrior"),
          armor: {
            ...bareArmorSet(),
            head: { insigniaId: null, rune: runes.head ?? null, headgearAttributeId },
            chest: { insigniaId: null, rune: runes.chest ?? null },
          },
        },
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    );
  }

  const validateWith = (headgearAttributeId: string | null, secondary?: ProfessionId) =>
    validateEquipment(
      { ...defaultEquipmentFor("warrior"), armor: armorWithHeadgear(headgearAttributeId) },
      contextFor("warrior", secondary),
    );

  it("adds +1 on top of a superior rune: 12 bought reaches 16", () => {
    const loadout = resolveWith([["warrior.strength", 12]], "warrior.strength", {
      head: superior,
    });
    expect(HEADGEAR_BONUS).toBe(1);
    expect(loadout.attributeRanks.get("warrior.strength")).toBe(16);
    expect(loadout.weaponSets[0].equipment.attributeBonuses.get("warrior.strength")).toBe(4);
  });

  it("gives skill text the ranks the resolver fights at (#1900)", () => {
    const equipmentWith = (allocated: readonly [string, number][]) => {
      const loadout = resolveWith(allocated, "warrior.strength", { head: superior });
      const ranks = effectiveRanks(
        new Map(allocated),
        {
          ...defaultEquipmentFor("warrior"),
          armor: {
            ...bareArmorSet(),
            head: { insigniaId: null, rune: superior, headgearAttributeId: "warrior.strength" },
          },
        },
        "warrior",
        "monk",
      );
      return { loadout, ranks };
    };
    const twelve = equipmentWith([["warrior.strength", 12]]);
    expect(twelve.ranks.get("warrior.strength")).toBe(12 + 3 + 1);
    expect(twelve.ranks).toEqual(twelve.loadout.attributeRanks);
    // Capped as the resolver caps it.
    const fifteen = equipmentWith([["warrior.strength", 15]]);
    expect(fifteen.ranks.get("warrior.strength")).toBe(16);
    expect(fifteen.ranks).toEqual(fifteen.loadout.attributeRanks);
  });

  it("never lifts a rank past 16, whatever was bought", () => {
    const loadout = resolveWith([["warrior.strength", 15]], "warrior.strength", {
      head: superior,
    });
    expect(loadout.attributeRanks.get("warrior.strength")).toBe(16);
  });

  it("stacks with the best of two runes on its attribute, not both", () => {
    const loadout = resolveWith([["warrior.strength", 10]], "warrior.strength", {
      head: minor,
      chest: superior,
    });
    expect(loadout.attributeRanks.get("warrior.strength")).toBe(10 + 3 + 1);
  });

  it("raises an attribute with no points in it to rank 1", () => {
    expect(resolveWith([], "warrior.tactics").attributeRanks.get("warrior.tactics")).toBe(1);
  });

  it("raises a secondary profession's attribute", () => {
    const loadout = resolveWith([["monk.healing-prayers", 8]], "monk.healing-prayers");
    expect(loadout.attributeRanks.get("monk.healing-prayers")).toBe(9);
    expect(validateWith("monk.healing-prayers", "monk")).toEqual([]);
  });

  it("gives nothing for a third profession's attribute, and says so once", () => {
    const loadout = resolveWith([], "mesmer.fast-casting");
    expect(loadout.attributeRanks.get("mesmer.fast-casting")).toBeUndefined();
    expect(loadout.weaponSets[0].equipment.attributeBonuses.size).toBe(0);
    expect(validateWith("mesmer.fast-casting", "monk")).toEqual([
      {
        field: "equipment.armor.head",
        message: "headgear of Fast Casting, which is not a Warrior or Monk attribute",
      },
    ]);
    expect(validateWith("mesmer.fast-casting")).toEqual([
      {
        field: "equipment.armor.head",
        message: "headgear of Fast Casting, which is not a Warrior attribute",
      },
    ]);
  });

  it("refuses the secondary's primary attribute, which only its primary can use", () => {
    expect(validateWith("monk.divine-favor", "monk")).toEqual([
      {
        field: "equipment.armor.head",
        message: "headgear of Divine Favor, which only a Monk primary can use",
      },
    ]);
  });

  it("refuses a head with no headgear attribute, which gives nothing", () => {
    expect(
      resolveWith([["warrior.strength", 12]], null).attributeRanks.get("warrior.strength"),
    ).toBe(12);
    expect(validateWith(null, "monk")).toEqual([
      { field: "equipment.armor.head", message: "headgear needs an attribute" },
    ]);
  });

  it("puts every default loadout's headgear on its primary attribute", () => {
    for (const profession of PROFESSION_IDS) {
      const primary = PROFESSIONS[profession].attributes.find((attribute) => attribute.isPrimary);
      expect(defaultEquipmentFor(profession).armor.head.headgearAttributeId, profession).toBe(
        primary?.id,
      );
    }
  });
});

describe("the gear coverage record", () => {
  it("gives every omission a non-empty reason", () => {
    // The whole point of the file. An omission with no reason is a
    // count masquerading as honesty — the same failure
    // `skills/coverage.test.ts` guards against for skills.
    for (const omission of GEAR_OMISSIONS) {
      expect(omission.reason.trim(), omission.mechanic).not.toBe("");
      expect(omission.description.trim(), omission.mechanic).not.toBe("");
    }
  });

  it("records each mechanic exactly once", () => {
    const mechanics = GEAR_OMISSIONS.map((omission) => omission.mechanic);
    expect(new Set(mechanics).size).toBe(mechanics.length);
  });

  it("names only catalog entries that exist", () => {
    for (const omission of GEAR_OMISSIONS) {
      for (const id of omission.affects) {
        const known =
          getWeapon(id) !== undefined ||
          ALL_OFFHANDS.some((offhand) => offhand.id === id) ||
          ALL_INSIGNIAS.some((insignia) => insignia.id === id);
        expect(known, `${omission.mechanic} affects ${id}`).toBe(true);
      }
    }
  });

  it("no longer records stances as a gap: Sentry's reads them (#1206)", () => {
    expect(GEAR_OMISSIONS.map((omission) => omission.mechanic)).not.toContain("stances");
    expect(ALL_INSIGNIAS.map((insignia) => insignia.id)).toContain("sentrys");
  });

  it("no longer records typed armor as a gap: professions carry it (#759)", () => {
    expect(GEAR_OMISSIONS.map((omission) => omission.mechanic)).not.toContain(
      "armor-damage-type-resistance",
    );
  });

  it("separates deliberate simplifications from real gaps", () => {
    // Per-piece armor ratings are a decision, not a backlog item:
    // armor is profession-locked and every max set within a profession
    // has the same rating.
    expect(gearOmission("per-piece-armor-ratings")?.kind).toBe("simplification");
    // Mods are ids on an item (ADR-0047); only the stat mods are in (#2007).
    expect(gearOmission("weapon-upgrades")?.kind).toBe("gap");
    expect(gearOmission("profession-insignias")?.kind).toBe("gap");
    expect(openGearGaps().length).toBeGreaterThan(0);
  });

  it("no longer records attribute headgear as a gap: the head carries it (#1140)", () => {
    expect(GEAR_OMISSIONS.map((omission) => omission.mechanic)).not.toContain("attribute-headgear");
  });
});

describe("Energy Storage (#532)", () => {
  /** An Elementalist's maximum energy at this Energy Storage, bare-handed but for a staff. */
  function maxEnergyAt(rank: number, chestRune: EquippedRune | null = null): number {
    return resolveLoadout(
      {
        primaryProfession: "elementalist",
        secondaryProfession: undefined,
        allocatedRanks: new Map([["elementalist.energy-storage", rank]]),
        equipment: {
          weaponSets: [
            {
              mainHand: { weaponId: "staff", requirementAttributeId: null, upgrades: NO_UPGRADES },
              offHand: null,
            },
            null,
            null,
            null,
          ],
          armor: { ...bareArmorSet(), chest: { insigniaId: null, rune: chestRune } },
        },
      },
      MINIMAL_GW_INSPIRED_PVP_V1.combat,
    ).weaponSets[0].maxEnergy;
  }

  const base = MINIMAL_GW_INSPIRED_PVP_V1.combat.baseEnergy;

  it("adds 3 maximum energy a rank: +36 at 12, nothing at 0", () => {
    expect(maxEnergyAt(0)).toBe(base);
    expect(maxEnergyAt(12)).toBe(base + 36);
  });

  it("keeps scaling past 12 with a rune", () => {
    const rune = {
      kind: "attribute",
      attributeId: "elementalist.energy-storage",
      tier: "superior",
    } as const;
    expect(maxEnergyAt(12, rune)).toBe(base + 3 * (12 + ATTRIBUTE_RUNE_TIERS.superior.bonus));
  });

  it("adds to Rune of Attunement, neither replacing the other", () => {
    const attunement = { kind: "universal", runeId: "attunement", tier: "superior" } as const;
    expect(maxEnergyAt(12, attunement)).toBe(base + 36 + 9);
  });
});

describe("weapon sets (#489, ADR-0036)", () => {
  const SWORD = {
    mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
    offHand: null,
  } as const;
  const WAND_FOCUS = {
    mainHand: {
      weaponId: "wand",
      requirementAttributeId: "elementalist.fire-magic",
      upgrades: NO_UPGRADES,
    },
    offHand: {
      offhandId: "focus",
      requirementAttributeId: "elementalist.fire-magic",
      upgrades: NO_UPGRADES,
    },
  } as const;
  const STAFF = {
    mainHand: {
      weaponId: "staff",
      requirementAttributeId: "elementalist.fire-magic",
      upgrades: NO_UPGRADES,
    },
    offHand: null,
  } as const;
  const SWORD_SHIELD = {
    mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
    offHand: {
      offhandId: "shield",
      requirementAttributeId: "warrior.strength",
      upgrades: NO_UPGRADES,
    },
  } as const;

  it("parses four sets, set 1 required and the others a set or empty, in any pattern", () => {
    const armor = bareArmorSet();
    expect(parseBuildEquipment({ weaponSets: [SWORD, null, STAFF, null], armor })).toEqual({
      weaponSets: [SWORD, null, STAFF, null],
      armor,
    });
    const malformed: readonly unknown[] = [
      { armor },
      { weaponSets: [SWORD, null, null], armor },
      { weaponSets: [SWORD, null, null, null, null], armor },
      { weaponSets: [null, SWORD, null, null], armor },
      { weaponSets: [SWORD, 7, null, null], armor },
      // The single-weapon shape: malformed, not old (ADR-0016).
      { mainHand: SWORD.mainHand, offHand: null, armor },
    ];
    for (const value of malformed) {
      expect(parseBuildEquipment(value), JSON.stringify(value)).toBeUndefined();
    }
  });

  it("checks every set, and says which one past set 1", () => {
    const problems = validateEquipment(
      {
        weaponSets: [
          SWORD,
          null,
          {
            mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: {
              offhandId: "shield",
              requirementAttributeId: "warrior.strength",
              upgrades: NO_UPGRADES,
            },
          },
          null,
        ],
        armor: armorWithHeadgear("warrior.strength"),
      },
      contextFor("warrior"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.field).toBe("equipment.weaponSets[2].offHand");
    expect(problems[0]?.message).toMatch(/^Set 3: Hammer needs both hands/);
  });

  it("re-points a wand's nomination in set 2, and never empties a set", () => {
    const reconciled = reconcileEquipment(
      {
        weaponSets: [
          SWORD,
          {
            mainHand: {
              weaponId: "wand",
              requirementAttributeId: "monk.divine-favor",
              upgrades: NO_UPGRADES,
            },
            offHand: null,
          },
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
      contextFor("elementalist"),
    );
    const set2 = reconciled.weaponSets[1];
    expect(set2?.mainHand.weaponId).toBe("wand");
    expect(set2?.mainHand.requirementAttributeId).not.toBe("monk.divine-favor");
    expect(set2?.mainHand.requirementAttributeId).not.toBeNull();
    expect(reconciled.weaponSets[2]).toBeNull();
  });

  it("resolves each set on its own: a focus's energy, a shield's armor, the runes once", () => {
    const superiorFire = {
      insigniaId: null,
      rune: { kind: "attribute", attributeId: "elementalist.fire-magic", tier: "superior" },
    } as const;
    const resolve = (primaryProfession: ProfessionId, equipment: BuildEquipment) =>
      resolveLoadout(
        {
          primaryProfession,
          secondaryProfession: undefined,
          allocatedRanks: new Map([
            ["elementalist.fire-magic", 9],
            ["warrior.strength", 9],
          ]),
          equipment,
        },
        MINIMAL_GW_INSPIRED_PVP_V1.combat,
      );

    const caster = resolve("elementalist", {
      weaponSets: [WAND_FOCUS, STAFF, null, WAND_FOCUS],
      armor: {
        ...bareArmorSet(),
        head: { ...superiorFire, headgearAttributeId: null },
        chest: superiorFire,
      },
    });
    const [focus, staff, empty, again] = caster.weaponSets;
    expect(empty).toBeNull();
    expect(focus.maxEnergy).toBe((staff?.maxEnergy ?? 0) + 12);
    expect(again).toEqual(focus);
    // Superior: +3, counted once however many sets or runes.
    expect(caster.attributeRanks.get("elementalist.fire-magic")).toBe(12);

    const warrior = resolve("warrior", {
      weaponSets: [SWORD_SHIELD, SWORD, null, null],
      armor: bareArmorSet(),
    });
    const [shield, bare] = warrior.weaponSets;
    expect(shield.equipment.baseArmor).toBe((bare?.equipment.baseArmor ?? 0) + 16);
  });
});

describe("creatureResolvedEquipment (#467)", () => {
  it("is unarmed with its armor when the creature never swings", () => {
    expect(creatureResolvedEquipment(51, undefined, 12)).toEqual(unarmedResolvedEquipment(51));
  });

  it("swings the attack's numbers, as fists keyed to the summoner's attribute, scaled by its rank", () => {
    const attack = {
      attributeId: "necromancer.death-magic",
      damageMin: 6,
      damageMax: 11,
      scaling: { kind: "level" as const, level: { atZero: 0, atTwelve: 10 } },
      damageType: "blunt" as const,
      attackIntervalSeconds: 3.1,
      range: 40,
      projectileSpeed: undefined,
      onHit: [],
    };
    const equipment = creatureResolvedEquipment(30, attack, 6);
    expect(equipment.baseArmor).toBe(30);
    expect(equipment.mainHand).toMatchObject({
      weapon: {
        id: "unarmed",
        damageMin: 6,
        damageMax: 11,
        damageType: "blunt",
        attackIntervalSeconds: 3.1,
        range: 40,
      },
      attributeId: "necromancer.death-magic",
      damageType: "blunt",
      requirementMet: true,
      creatureDamageScale: Math.pow(5 / 10, 1.5),
    });
    expect(creatureResolvedEquipment(30, attack, 12).mainHand.creatureDamageScale).toBe(1);
    // A pet scales as weapon mastery does (#1046).
    expect(
      creatureResolvedEquipment(30, { ...attack, scaling: { kind: "weapon-mastery" } }, 6).mainHand
        .creatureDamageScale,
    ).toBeUndefined();
    // A spirit's stated damage is linear in the rank (#1239): 5 at 0, 25 at 12.
    const spirit = { ...attack, damageMax: 25, scaling: { kind: "rank" as const, atZero: 5 } };
    expect(creatureResolvedEquipment(30, spirit, 6).mainHand.creatureDamageScale).toBe(15 / 25);
    expect(creatureResolvedEquipment(30, spirit, 15).mainHand.creatureDamageScale).toBe(30 / 25);
  });
});

describe("weapon mods (#2007)", () => {
  const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
  const mods = (upgrades: Partial<ItemUpgrades>): ItemUpgrades => ({ ...NO_UPGRADES, ...upgrades });
  const sword = (upgrades: Partial<ItemUpgrades> = {}): WeaponSet => ({
    mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: mods(upgrades) },
    offHand: null,
  });
  const withSets = (one: WeaponSet, two: WeaponSet | null = null): BuildEquipment => ({
    ...defaultEquipmentFor("warrior"),
    weaponSets: [one, two, null, null],
  });
  const resolve = (equipment: BuildEquipment, primary: ProfessionId = "warrior") =>
    resolveLoadout(
      {
        primaryProfession: primary,
        secondaryProfession: undefined,
        allocatedRanks: new Map(),
        equipment,
      },
      RULES,
    );

  it("gives +30 Health in the set that holds of Fortitude, and only there", () => {
    const [one, two] = resolve(withSets(sword({ suffix: "of-fortitude" }), sword())).weaponSets;
    expect(one.maxHealth).toBe(RULES.baseHealth + 30);
    expect(two?.maxHealth).toBe(RULES.baseHealth);
  });

  it("stacks two +30 Health sources in one set: sword and shield", () => {
    const set: WeaponSet = {
      ...sword({ suffix: "of-fortitude" }),
      offHand: {
        offhandId: "shield",
        requirementAttributeId: "warrior.tactics",
        upgrades: mods({ suffix: "of-fortitude" }),
      },
    };
    expect(resolve(withSets(set)).weaponSets[0].maxHealth).toBe(RULES.baseHealth + 60);
  });

  it("gives Live for Today's +15 Energy for a pip of regeneration", () => {
    const plain: WeaponSet = {
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "monk.divine-favor",
        upgrades: NO_UPGRADES,
      },
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "monk.divine-favor",
        upgrades: NO_UPGRADES,
      },
    };
    const live: WeaponSet = {
      ...plain,
      offHand: {
        offhandId: "focus",
        requirementAttributeId: "monk.divine-favor",
        upgrades: mods({ inscription: "live-for-today" }),
      },
    };
    const [before, after] = resolve(withSets(plain, live), "monk").weaponSets;
    expect(after?.maxEnergy).toBe(before.maxEnergy + 15);
    expect(after?.baseEnergyPips).toBe(before.baseEnergyPips - 1);
  });

  it("puts typed armor where a hit of that type meets it", () => {
    const [set] = resolve(
      withSets(sword({ suffix: "of-shelter" }), sword({ suffix: "of-defense" })),
    ).weaponSets;
    expect(set.equipment.conditionalArmor).toContainEqual({
      amount: 7,
      conditions: [{ kind: "vs-physical" }],
    });
    const plain = resolve(withSets(sword())).weaponSets[0];
    const defense = resolve(withSets(sword({ suffix: "of-defense" }))).weaponSets[0];
    expect(defense.equipment.baseArmor).toBe(plain.equipment.baseArmor + 5);
  });

  it("multiplies Pure of Heart with a Rune of Purity on Poison", () => {
    const shield = (inscription: string | null): WeaponSet => ({
      ...sword(),
      offHand: {
        offhandId: "shield",
        requirementAttributeId: "warrior.tactics",
        upgrades: mods({ inscription }),
      },
    });
    const base = defaultEquipmentFor("warrior");
    const armor: ArmorSet = {
      ...base.armor,
      chest: { insigniaId: null, rune: { kind: "universal", runeId: "purity", tier: "minor" } },
    };
    const scale = (set: WeaponSet): number | undefined =>
      resolve({ ...withSets(set), armor }).weaponSets[0].equipment.statusDurationScale.get(
        "poison",
      );
    const rune = scale(shield(null));
    expect(rune).toBeLessThan(1);
    expect(scale(shield("pure-of-heart"))).toBeCloseTo(0.8 * (rune ?? 1));
  });

  it("counts an off-hand's mods only where the off-hand counts", () => {
    const set: WeaponSet = {
      mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: {
        offhandId: "shield",
        requirementAttributeId: "warrior.tactics",
        upgrades: mods({ suffix: "of-fortitude" }),
      },
    };
    expect(resolve(withSets(set)).weaponSets[0].maxHealth).toBe(RULES.baseHealth);
  });

  it("rejects an item without its upgrades, or with an unknown mod", () => {
    const json = JSON.parse(JSON.stringify(withSets(sword()))) as {
      weaponSets: { mainHand: Record<string, unknown> }[];
    };
    const without = JSON.parse(JSON.stringify(json)) as typeof json;
    const first = without.weaponSets[0];
    if (first === undefined) {
      throw new Error("set 1 is always there");
    }
    delete first.mainHand.upgrades;
    expect(parseBuildEquipment(without)).toBeUndefined();

    const unknown = JSON.parse(JSON.stringify(json)) as typeof json;
    const set = unknown.weaponSets[0];
    if (set === undefined) {
      throw new Error("set 1 is always there");
    }
    set.mainHand.upgrades = { ...NO_UPGRADES, prefix: "vorpal" };
    expect(parseBuildEquipment(unknown)).toBeUndefined();

    expect(
      parseBuildEquipment(JSON.parse(JSON.stringify(withSets(sword({ suffix: "of-fortitude" }))))),
    ).toEqual(withSets(sword({ suffix: "of-fortitude" })));
  });

  it("calls a mod in the wrong slot, or on the wrong item, a problem", () => {
    const messages = (equipment: BuildEquipment, primary: ProfessionId): string[] =>
      validateEquipment(equipment, contextFor(primary)).map(({ message }) => message);
    // Staff heads are prefixes; a wand has no prefix at all.
    const wand: WeaponSet = {
      mainHand: {
        weaponId: "wand",
        requirementAttributeId: "monk.divine-favor",
        upgrades: mods({ prefix: "insightful" }),
      },
      offHand: null,
    };
    expect(
      messages({ ...withSets(wand), armor: defaultEquipmentFor("monk").armor }, "monk"),
    ).toContain("Insightful does not fit a wand.");
    // Live for Today is a focus's; a shield refuses it.
    const shield: WeaponSet = {
      ...sword(),
      offHand: {
        offhandId: "shield",
        requirementAttributeId: "warrior.tactics",
        upgrades: mods({ inscription: "live-for-today" }),
      },
    };
    expect(messages(withSets(shield), "warrior")).toContain(
      '"Live for Today" does not fit a shield.',
    );
    // A suffix under the prefix key.
    expect(messages(withSets(sword({ prefix: "of-fortitude" })), "warrior")).toContain(
      "of Fortitude does not fit a sword.",
    );
    expect(messages(withSets(sword({ suffix: "of-fortitude" })), "warrior")).toEqual([]);
  });

  it("drops a staff head when the staff becomes a sword", () => {
    const staff: WeaponSet = {
      mainHand: {
        weaponId: "staff",
        requirementAttributeId: "monk.divine-favor",
        upgrades: mods({ prefix: "hale", suffix: "of-fortitude", inscription: "seize-the-day" }),
      },
      offHand: null,
    };
    const swapped: WeaponSet = {
      mainHand: { ...staff.mainHand, weaponId: "sword", requirementAttributeId: null },
      offHand: null,
    };
    const reconciled = reconcileEquipment(
      { ...withSets(swapped), armor: defaultEquipmentFor("monk").armor },
      contextFor("monk"),
    );
    expect(reconciled.weaponSets[0].mainHand.upgrades).toEqual(mods({ suffix: "of-fortitude" }));
  });
});
