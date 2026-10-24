import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { accessibleAttributeIds } from "../character.js";
import { PROFESSIONS, getAttribute, type ProfessionId } from "../professions.js";
import { SKILL_BAR_SLOTS, validatePlayerBuild, type PlayerBuild } from "../build.js";
import { bareArmorSet } from "./armor.js";
import { GEAR_OMISSIONS, gearOmission, openGearGaps } from "./coverage.js";
import { defaultEquipmentFor, defaultWeaponFor, unarmedEquipment } from "./loadout.js";
import { parseBuildEquipment } from "./parse.js";
import { reconcileEquipment } from "./reconcile.js";
import { validateEquipment } from "./validate.js";
import { ALL_WEAPONS, WEAPONS, allowsOffhand, getWeapon } from "./weapons.js";
import { ALL_INSIGNIAS } from "./insignias.js";
import { ALL_OFFHANDS, SHIELD_REQUIREMENT_ATTRIBUTES } from "./offhands.js";
import { ATTRIBUTE_RUNE_TIERS, UNIVERSAL_RUNES } from "./runes.js";
import { ARMOR_SLOTS } from "./types.js";

const PROFESSION_IDS = Object.keys(PROFESSIONS) as readonly ProfessionId[];

function contextFor(primary: ProfessionId, secondary?: ProfessionId) {
  return {
    primaryProfession: primary,
    accessibleAttributeIds: new Set(accessibleAttributeIds(primary, secondary)),
  };
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

describe("default loadouts", () => {
  it.each(PROFESSION_IDS)("gives %s a legal build straight out of the box", (profession) => {
    // The load-bearing test of this whole phase. A character migrated
    // from before weapons existed receives exactly this, and a migration
    // that produces an invalid build has destroyed it.
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
      const weapon = getWeapon(equipment.mainHand.weaponId);
      expect(weapon).toBeDefined();
      if (weapon === undefined || equipment.offHand === null) {
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
        mainHand: { weaponId: "hammer", requirementAttributeId: null },
        offHand: { offhandId: "shield", requirementAttributeId: "warrior.strength" },
        armor: bareArmorSet(),
      },
      contextFor("warrior"),
    );
    expect(problems.map((p) => p.field)).toContain("equipment.offHand");
    expect(problems.some((p) => p.message.includes("both hands"))).toBe(true);
  });

  it("refuses a nomination on a weapon whose attribute is fixed", () => {
    const problems = validateEquipment(
      {
        mainHand: { weaponId: "sword", requirementAttributeId: "warrior.axe-mastery" },
        offHand: null,
        armor: bareArmorSet(),
      },
      contextFor("warrior"),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain("always linked to");
  });

  it("refuses a shield linked to an attribute shields do not use", () => {
    const problems = validateEquipment(
      {
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: { offhandId: "shield", requirementAttributeId: "monk.divine-favor" },
        armor: bareArmorSet(),
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
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: { offhandId: "focus", requirementAttributeId: "elementalist.fire-magic" },
        armor: bareArmorSet(),
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
        mainHand: { weaponId: "hammer", requirementAttributeId: null },
        offHand: null,
        armor: bareArmorSet(),
      },
      contextFor("mesmer"),
    );
    expect(problems).toEqual([]);
  });

  it("refuses an attribute rune for an attribute the character cannot raise", () => {
    const armor = { ...bareArmorSet() };
    const problems = validateEquipment(
      {
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: null,
        armor: {
          ...armor,
          head: {
            insigniaId: null,
            rune: { kind: "attribute", attributeId: "monk.divine-favor", tier: "superior" },
          },
        },
      },
      contextFor("warrior"),
    );
    expect(problems.some((p) => p.message.includes("cannot access"))).toBe(true);
  });

  it("refuses Absorption on anyone who is not a primary warrior", () => {
    const problems = validateEquipment(
      {
        mainHand: { weaponId: "wand", requirementAttributeId: "monk.divine-favor" },
        offHand: null,
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
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: null,
        armor: {
          ...bareArmorSet(),
          head: { insigniaId: null, rune },
          chest: { insigniaId: null, rune },
        },
      },
      contextFor("warrior"),
    );
    expect(problems.some((p) => p.message.includes("duplicates"))).toBe(true);
  });

  it("refuses an unknown weapon rather than quietly substituting one", () => {
    const problems = validateEquipment(
      {
        // Only reachable from a hand-edited record; the parser rejects
        // this shape. Validation still has to have an answer for it.
        mainHand: { weaponId: "chainsaw" as never, requirementAttributeId: null },
        offHand: null,
        armor: bareArmorSet(),
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
          mainHand: { weaponId: "sword", requirementAttributeId: null },
          offHand: { offhandId: offhand.id, requirementAttributeId: attributeId },
          armor: bareArmorSet(),
        },
        contextFor("warrior"),
      );
      expect(problems, offhand.id).toEqual([]);
    }
  });
});

describe("parseBuildEquipment", () => {
  it("treats absent gear as old rather than broken", () => {
    // A build saved before weapons existed must stay playable. This is
    // the parser half of the same promise the storage migration makes.
    expect(parseBuildEquipment(undefined, "ranger")).toEqual(defaultEquipmentFor("ranger"));
    expect(parseBuildEquipment(null, "ranger")).toEqual(defaultEquipmentFor("ranger"));
  });

  it("round-trips gear through JSON unchanged", () => {
    const original = defaultEquipmentFor("warrior");
    const parsed = parseBuildEquipment(JSON.parse(JSON.stringify(original)), "warrior");
    expect(parsed).toEqual(original);
  });

  it("rejects gear that is present and structurally wrong", () => {
    const cases: readonly unknown[] = [
      42,
      "sword",
      [],
      { mainHand: null },
      { mainHand: { weaponId: "chainsaw" }, offHand: null, armor: {} },
      { mainHand: { weaponId: "sword" }, offHand: { offhandId: "bagpipes" }, armor: {} },
      { mainHand: { weaponId: "sword" }, offHand: null, armor: null },
      {
        mainHand: { weaponId: "sword" },
        offHand: null,
        armor: { head: { rune: { kind: "attribute" } } },
      },
    ];
    for (const value of cases) {
      expect(parseBuildEquipment(value, "warrior"), JSON.stringify(value)).toBeUndefined();
    }
  });

  it("fills in missing armor slots rather than failing on a sparse record", () => {
    const parsed = parseBuildEquipment(
      { mainHand: { weaponId: "sword" }, offHand: null, armor: {} },
      "warrior",
    );
    expect(parsed).toBeDefined();
    for (const slot of ARMOR_SLOTS) {
      expect(parsed?.armor[slot]).toEqual({ insigniaId: null, rune: null });
    }
  });
});

describe("reconcileEquipment", () => {
  it("keeps the weapon class when the character changes profession", () => {
    // A hammer on a mesmer is a bad build, not an illegal one, and
    // deleting the player's choice would be the editor overruling them.
    const reconciled = reconcileEquipment(
      {
        mainHand: { weaponId: "hammer", requirementAttributeId: null },
        offHand: null,
        armor: bareArmorSet(),
      },
      contextFor("mesmer"),
    );
    expect(reconciled.mainHand.weaponId).toBe("hammer");
  });

  it("drops an off-hand whose attribute is no longer reachable", () => {
    const reconciled = reconcileEquipment(
      {
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: { offhandId: "shield", requirementAttributeId: "warrior.strength" },
        armor: bareArmorSet(),
      },
      contextFor("mesmer"),
    );
    expect(reconciled.offHand).toBeNull();
  });

  it("drops an off-hand when the weapon became two-handed", () => {
    const reconciled = reconcileEquipment(
      {
        mainHand: { weaponId: "hammer", requirementAttributeId: null },
        offHand: { offhandId: "shield", requirementAttributeId: "warrior.strength" },
        armor: bareArmorSet(),
      },
      contextFor("warrior"),
    );
    expect(reconciled.offHand).toBeNull();
  });

  it("re-points a caster weapon rather than dropping it", () => {
    const reconciled = reconcileEquipment(
      {
        mainHand: { weaponId: "wand", requirementAttributeId: "monk.divine-favor" },
        offHand: null,
        armor: bareArmorSet(),
      },
      contextFor("elementalist"),
    );
    expect(reconciled.mainHand.weaponId).toBe("wand");
    expect(reconciled.mainHand.requirementAttributeId).not.toBe("monk.divine-favor");
    expect(reconciled.mainHand.requirementAttributeId).not.toBeNull();
  });

  it("picks the same replacement attribute every time", () => {
    // An editor that chose a different attribute each time you toggled
    // professions would be maddening to use.
    const before = {
      mainHand: { weaponId: "wand", requirementAttributeId: "monk.divine-favor" } as const,
      offHand: null,
      armor: bareArmorSet(),
    };
    const first = reconcileEquipment(before, contextFor("elementalist"));
    const second = reconcileEquipment(before, contextFor("elementalist"));
    expect(first.mainHand.requirementAttributeId).toBe(second.mainHand.requirementAttributeId);
  });

  it("clears a rune the character can no longer use, keeping the rest", () => {
    const reconciled = reconcileEquipment(
      {
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: null,
        armor: {
          ...bareArmorSet(),
          head: {
            insigniaId: "survivor",
            rune: { kind: "attribute", attributeId: "warrior.strength", tier: "major" },
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
        mainHand: { weaponId: "sword", requirementAttributeId: null },
        offHand: null,
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
});

describe("unarmedEquipment", () => {
  it("is legal for anyone, since it is the universal fallback", () => {
    for (const primary of PROFESSION_IDS) {
      expect(validateEquipment(unarmedEquipment(), contextFor(primary)), primary).toEqual([]);
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

  it("does not claim a stance insignia exists", () => {
    // The specific thing the record was written to keep honest: the
    // reference's stance insignia is absent from the catalog, not
    // shipped inert.
    expect(gearOmission("stances")).toBeDefined();
    expect(ALL_INSIGNIAS.map((insignia) => insignia.id)).not.toContain("sentrys");
    for (const insignia of ALL_INSIGNIAS) {
      if (insignia.effect.kind === "conditional-armor") {
        expect(insignia.effect.condition).not.toBe("while-in-a-stance");
      }
    }
  });

  it("separates deliberate simplifications from real gaps", () => {
    // Per-piece armor ratings are a decision, not a backlog item:
    // armor is profession-locked and every max set within a profession
    // has the same rating.
    expect(gearOmission("per-piece-armor-ratings")?.kind).toBe("simplification");
    expect(gearOmission("weapon-upgrades")?.kind).toBe("simplification");
    // Attribute headgear is the one genuinely non-cosmetic per-piece
    // choice in the reference, and it is missing.
    expect(gearOmission("attribute-headgear")?.kind).toBe("gap");
    expect(openGearGaps().length).toBeGreaterThan(0);
  });
});
