import { MINIMAL_GW_INSPIRED_PVP_V1, getWeapon } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter, setProfessions, setRank } from "./build-editor.js";
import {
  applyGearDrop,
  canEquipOffhand,
  clearArmorUpgrades,
  decodeGearDrag,
  decodeRune,
  encodeGearDrag,
  encodeRune,
  armorTarget,
  firstFreeArmorSlot,
  offhandAttributeChoices,
  runeChoices,
  setInsignia,
  setOffhand,
  setRequirementAttribute,
  setRune,
  setWeapon,
  summariseGear,
  weaponAttributeChoices,
} from "./gear-editor.js";

/**
 * The gear rules, exercised without a DOM.
 *
 * Same contract as `build-editor.test.ts`: every rule a player can hit
 * lives in a pure function and is verified here, so the browser tests
 * only have to prove the controls are wired to it rather than
 * re-checking the arithmetic through a `<select>`.
 */

const BASE_HEALTH = MINIMAL_GW_INSPIRED_PVP_V1.combat.baseHealth;
const BASE_ENERGY = MINIMAL_GW_INSPIRED_PVP_V1.combat.baseEnergy;

function warrior(): StoredCharacter {
  return setProfessions(newCharacter("c1"), "warrior", undefined);
}

function monk(): StoredCharacter {
  return setProfessions(newCharacter("c1"), "monk", undefined);
}

describe("setWeapon", () => {
  it("swaps the weapon class", () => {
    const character = setWeapon(warrior(), "hammer");
    expect(character.equipment.mainHand.weaponId).toBe("hammer");
  });

  it("puts the off-hand down when the new weapon needs both hands", () => {
    // The coupling the whole gear trade-off rests on: a shield or a
    // two-hander, never both.
    const withShield = setOffhand(setWeapon(warrior(), "sword"), "shield");
    expect(withShield.equipment.offHand).not.toBeNull();

    const twoHanded = setWeapon(withShield, "scythe");
    expect(twoHanded.equipment.offHand).toBeNull();
  });

  it("keeps the off-hand when swapping between one-handers", () => {
    const withShield = setOffhand(setWeapon(warrior(), "sword"), "shield");
    expect(setWeapon(withShield, "axe").equipment.offHand).not.toBeNull();
  });

  it("nominates an attribute for a weapon that needs one", () => {
    const character = setWeapon(monk(), "staff");
    expect(character.equipment.mainHand.requirementAttributeId).not.toBeNull();
    expect(validateBuild(character)).toEqual([]);
  });

  it("nominates nothing for a weapon whose attribute is fixed", () => {
    expect(setWeapon(warrior(), "sword").equipment.mainHand.requirementAttributeId).toBeNull();
  });

  it("prefers the primary attribute when nominating", () => {
    // The one the player is most likely to have invested in.
    expect(setWeapon(monk(), "wand").equipment.mainHand.requirementAttributeId).toBe(
      "monk.divine-favor",
    );
  });

  it("ignores an unknown weapon rather than clearing the slot", () => {
    const before = warrior();
    // Only reachable from a stale DOM value; it must not blank the build.
    expect(setWeapon(before, "chainsaw" as never)).toBe(before);
  });

  it("leaves a build that still validates, for every weapon", () => {
    const weapons = [
      "sword",
      "axe",
      "hammer",
      "daggers",
      "scythe",
      "spear",
      "wand",
      "staff",
      "flatbow",
      "shortbow",
      "longbow",
      "recurve-bow",
      "hornbow",
      "unarmed",
    ] as const;
    for (const weaponId of weapons) {
      expect(validateBuild(setWeapon(warrior(), weaponId)), weaponId).toEqual([]);
    }
  });
});

describe("setOffhand", () => {
  it("equips and clears an off-hand", () => {
    const withFocus = setOffhand(setWeapon(monk(), "wand"), "focus");
    expect(withFocus.equipment.offHand?.offhandId).toBe("focus");
    expect(setOffhand(withFocus, null).equipment.offHand).toBeNull();
  });

  it("refuses silently when both hands are full", () => {
    const twoHanded = setWeapon(warrior(), "hammer");
    expect(canEquipOffhand(twoHanded)).toBe(false);
    expect(setOffhand(twoHanded, "shield")).toBe(twoHanded);
  });

  it("produces a build that validates", () => {
    expect(validateBuild(setOffhand(setWeapon(warrior(), "sword"), "shield"))).toEqual([]);
  });
});

describe("attribute nominations", () => {
  it("offers nothing for a fixed-requirement weapon", () => {
    expect(weaponAttributeChoices(setWeapon(warrior(), "sword"))).toEqual([]);
  });

  it("offers every reachable attribute for a caster weapon", () => {
    const choices = weaponAttributeChoices(setWeapon(monk(), "wand"));
    expect(choices).toContain("monk.divine-favor");
    expect(choices).toContain("monk.healing-prayers");
    expect(choices).not.toContain("warrior.strength");
  });

  it("offers a shield only the attributes shields use", () => {
    const character = setOffhand(setWeapon(warrior(), "sword"), "shield");
    const choices = offhandAttributeChoices(character, "shield");
    expect(choices).toContain("warrior.strength");
    expect(choices).toContain("warrior.tactics");
    // Axe Mastery is reachable but is not a shield attribute.
    expect(choices).not.toContain("warrior.axe-mastery");
  });

  it("re-links gear without disturbing anything else", () => {
    const before = setWeapon(monk(), "wand");
    const after = setRequirementAttribute(before, "mainHand", "monk.healing-prayers");
    expect(after.equipment.mainHand.requirementAttributeId).toBe("monk.healing-prayers");
    expect(after.equipment.mainHand.weaponId).toBe("wand");
  });

  it("ignores a re-link on an absent off-hand", () => {
    const character = setWeapon(warrior(), "hammer");
    expect(setRequirementAttribute(character, "offHand", "warrior.strength")).toBe(character);
  });
});

describe("runes and insignias", () => {
  it("slots and clears an insignia", () => {
    const withIt = setInsignia(warrior(), "chest", "survivor");
    expect(withIt.equipment.armor.chest.insigniaId).toBe("survivor");
    expect(setInsignia(withIt, "chest", null).equipment.armor.chest.insigniaId).toBeNull();
  });

  it("slots a rune without touching the insignia beside it", () => {
    let character = setInsignia(warrior(), "head", "stalwart");
    character = setRune(character, "head", {
      kind: "universal",
      runeId: "vigor",
      tier: "superior",
    });
    expect(character.equipment.armor.head.insigniaId).toBe("stalwart");
    expect(character.equipment.armor.head.rune?.kind).toBe("universal");
  });

  it("clears every upgrade at once", () => {
    let character = setInsignia(warrior(), "chest", "survivor");
    character = setRune(character, "feet", { kind: "universal", runeId: "vitae", tier: "minor" });
    const cleared = clearArmorUpgrades(character);
    for (const piece of Object.values(cleared.equipment.armor)) {
      expect(piece.insigniaId).toBeNull();
      expect(piece.rune).toBeNull();
    }
  });

  it("offers only runes this character could legally wear", () => {
    const monkChoices = runeChoices(monk()).map((c) => c.key);
    // Absorption is warrior-primary only.
    expect(monkChoices.some((k) => k.includes("absorption"))).toBe(false);
    expect(runeChoices(warrior()).some((c) => c.key.includes("absorption"))).toBe(true);
    // An attribute rune for an attribute a monk cannot raise.
    expect(monkChoices.some((k) => k.includes("warrior.strength"))).toBe(false);
  });

  it("names the health cost in the label, where the decision is made", () => {
    const superiorStrength = runeChoices(warrior()).find(
      (c) => c.key === "attribute:warrior.strength:superior",
    );
    expect(superiorStrength?.label).toContain("+3");
    expect(superiorStrength?.label).toContain("75");
  });

  it("produces only choices that validate", () => {
    for (const choice of runeChoices(warrior())) {
      expect(validateBuild(setRune(warrior(), "head", choice.rune)), choice.key).toEqual([]);
    }
  });
});

describe("rune encoding", () => {
  it("round-trips both kinds of rune", () => {
    const runes = [
      { kind: "attribute", attributeId: "warrior.strength", tier: "major" },
      { kind: "universal", runeId: "vigor", tier: "superior" },
    ] as const;
    for (const rune of runes) {
      expect(decodeRune(encodeRune(rune))).toEqual(rune);
    }
  });

  it.each([
    ["empty", ""],
    ["no tier", "attribute:warrior.strength"],
    ["bad tier", "attribute:warrior.strength:legendary"],
    ["unknown kind", "sigil:warrior.strength:minor"],
    ["unknown universal rune", "universal:nonsense:minor"],
    ["empty id", "attribute::minor"],
  ])("rejects %s rather than guessing", (_label, raw) => {
    expect(decodeRune(raw)).toBeUndefined();
  });
});

describe("the gear summary", () => {
  it("reports the plain numbers for a bare character", () => {
    // Off-hand cleared explicitly: becoming a Monk swaps the Sword for
    // the Monk default, a Wand with a Focus (#614).
    const summary = summariseGear(setOffhand(setWeapon(monk(), "wand"), null));
    expect(summary.maxHealth).toBe(BASE_HEALTH);
    expect(summary.maxEnergy).toBe(BASE_ENERGY);
    expect(summary.armor).toBe(60);
    expect(summary.weaponName).toBe("Wand");
  });

  it("shows a warrior's higher base armor", () => {
    // Off-hand cleared explicitly: a warrior's default kit includes a
    // shield, and this is asserting the profession's own armor.
    const bare = setOffhand(setWeapon(warrior(), "sword"), null);
    expect(summariseGear(bare).armor).toBe(80);
  });

  it("counts a shield's armor, and the extra once its requirement is met", () => {
    const base = setOffhand(setWeapon(warrior(), "sword"), "shield");
    expect(summariseGear(base).armor).toBe(88);

    const trained = setRank(base, "warrior.strength", 9);
    expect(summariseGear(trained).armor).toBe(96);
  });

  it("shows the primary profession's energy regeneration in pips", () => {
    expect(summariseGear(warrior()).baseEnergyPips).toBe(2);
  });

  it("shows the health a rune costs, not just the rank it gives", () => {
    // The trade the player is actually making, both halves visible.
    const runed = setRune(warrior(), "head", {
      kind: "attribute",
      attributeId: "warrior.swordsmanship",
      tier: "superior",
    });
    const summary = summariseGear(runed);
    expect(summary.maxHealth).toBe(BASE_HEALTH - 75);
    expect(summary.runeBonuses).toEqual([{ attributeId: "warrior.swordsmanship", bonus: 3 }]);
  });

  it("charges both penalties for two runes of the same attribute, and grants one bonus", () => {
    let character = setRune(warrior(), "head", {
      kind: "attribute",
      attributeId: "warrior.swordsmanship",
      tier: "superior",
    });
    character = setRune(character, "chest", {
      kind: "attribute",
      attributeId: "warrior.swordsmanship",
      tier: "superior",
    });
    const summary = summariseGear(character);
    expect(summary.maxHealth).toBe(BASE_HEALTH - 150);
    expect(summary.runeBonuses).toEqual([{ attributeId: "warrior.swordsmanship", bonus: 3 }]);
  });

  it("gives Survivor more health on the chest than on the gloves", () => {
    const chest = summariseGear(setInsignia(warrior(), "chest", "survivor")).maxHealth;
    const hands = summariseGear(setInsignia(warrior(), "hands", "survivor")).maxHealth;
    expect(chest).toBe(BASE_HEALTH + 15);
    expect(hands).toBe(BASE_HEALTH + 5);
  });

  it("adds Radiant energy per piece", () => {
    expect(summariseGear(setInsignia(warrior(), "chest", "radiant")).maxEnergy).toBe(
      BASE_ENERGY + 3,
    );
  });

  it("lists a conditional insignia rather than folding it into armor", () => {
    const bare = setOffhand(setWeapon(warrior(), "sword"), null);
    const summary = summariseGear(setInsignia(bare, "chest", "stalwart"));
    // It is not unconditional, so it must not inflate the headline number.
    expect(summary.armor).toBe(80);
    // A Warrior's own +20 first, then the insignia's.
    expect(summary.conditionalArmor).toEqual([
      "+20 armor vs physical damage",
      "+10 armor vs physical damage",
    ]);
  });

  it("lists a Ranger's inherent armor vs elemental damage (#759)", () => {
    const ranger = setProfessions(newCharacter("c1"), "ranger", undefined);
    expect(summariseGear(ranger).conditionalArmor).toEqual(["+30 armor vs elemental damage"]);
    expect(summariseGear(monk()).conditionalArmor).toEqual([]);
  });

  it("reports Absorption's flat reduction", () => {
    const runed = setRune(warrior(), "feet", {
      kind: "universal",
      runeId: "absorption",
      tier: "major",
    });
    expect(summariseGear(runed).flatPhysicalReduction).toBe(2);
  });

  it("flags an unmet weapon requirement", () => {
    // A monk holding a hammer is legal and bad; the editor says so
    // rather than letting them find out in a match.
    const unskilled = setWeapon(monk(), "hammer");
    expect(summariseGear(unskilled).unmetRequirement).toEqual({
      attributeId: "warrior.hammer-mastery",
      rank: 9,
    });

    const trained = setRank(setWeapon(warrior(), "hammer"), "warrior.hammer-mastery", 9);
    expect(summariseGear(trained).unmetRequirement).toBeUndefined();
  });

  it("shows the damage an unmet requirement actually deals, a third (#571)", () => {
    const hammer = getWeapon("hammer");
    if (hammer === undefined) {
      throw new Error("no hammer");
    }
    const trained = setRank(setWeapon(warrior(), "hammer"), "warrior.hammer-mastery", 9);
    expect(summariseGear(trained).damageRange).toBe(
      `${String(hammer.damageMin)}–${String(hammer.damageMax)}`,
    );
    expect(summariseGear(setWeapon(monk(), "hammer")).damageRange).toBe(
      `${String(Math.round(hammer.damageMin / 3))}–${String(Math.round(hammer.damageMax / 3))}`,
    );
  });

  it("charges for all five superior runes, and still stays above the floor", () => {
    // Worth pinning: with five slots at 75 health each, the worst a
    // player can do to themselves is 375 — so the minimum-health floor
    // is unreachable through runes alone and exists only as a guard
    // against a future source of penalties.
    let character = warrior();
    for (const slot of ["head", "chest", "hands", "legs", "feet"] as const) {
      character = setRune(character, slot, {
        kind: "attribute",
        attributeId: "warrior.swordsmanship",
        tier: "superior",
      });
    }
    const { maxHealth } = summariseGear(character);
    expect(maxHealth).toBe(BASE_HEALTH - 5 * 75);
    expect(maxHealth).toBeGreaterThan(MINIMAL_GW_INSPIRED_PVP_V1.combat.minimumMaxHealth);
  });
});

describe("gear drag and drop", () => {
  it("round-trips every kind of drag source", () => {
    const sources = [
      { from: "weapon-library", weaponId: "hammer" },
      { from: "offhand-library", offhandId: "shield" },
      { from: "insignia-library", insigniaId: "survivor" },
      {
        from: "rune-library",
        rune: { kind: "attribute", attributeId: "warrior.strength", tier: "major" },
      },
      { from: "rune-library", rune: { kind: "universal", runeId: "vigor", tier: "superior" } },
      { from: "armor-slot", slot: "chest", part: "rune" },
      { from: "hand", hand: "offHand" },
    ] as const;
    for (const source of sources) {
      expect(decodeGearDrag(encodeGearDrag(source))).toEqual(source);
    }
  });

  it.each([
    ["empty", ""],
    ["no payload", "gear-weapon:"],
    ["unknown weapon", "gear-weapon:chainsaw"],
    ["unknown kind", "gear-trousers:leather"],
    ["a skill drag", "library:elementalist.fireball"],
    ["a bar slot drag", "slot:3"],
    ["bad armor slot", "gear-worn:elbow:rune"],
    ["bad armor part", "gear-worn:chest:buckle"],
    ["bad hand", "gear-hand:tail"],
  ])("refuses %s", (_label, raw) => {
    expect(decodeGearDrag(raw)).toBeUndefined();
  });

  it("equips a weapon dropped on the weapon slot", () => {
    const after = applyGearDrop(
      warrior(),
      { from: "weapon-library", weaponId: "scythe" },
      { kind: "main-hand" },
    );
    expect(after.equipment.mainHand.weaponId).toBe("scythe");
    // A scythe needs both hands, so the shield comes off with it.
    expect(after.equipment.offHand).toBeNull();
  });

  it("ignores gear dropped where it does not belong", () => {
    const before = warrior();
    const nonsense = [
      [
        { from: "rune-library", rune: { kind: "universal", runeId: "vigor", tier: "minor" } },
        { kind: "main-hand" },
      ],
      [{ from: "insignia-library", insigniaId: "survivor" }, { kind: "off-hand" }],
      [
        { from: "weapon-library", weaponId: "sword" },
        { kind: "armor", slot: "chest", part: "rune" },
      ],
      [
        { from: "offhand-library", offhandId: "shield" },
        { kind: "armor", slot: "feet", part: "insignia" },
      ],
    ] as const;
    for (const [source, target] of nonsense) {
      expect(applyGearDrop(before, source, target)).toBe(before);
    }
  });

  it("moves a rune between pieces rather than cloning it", () => {
    const rune = { kind: "universal", runeId: "vigor", tier: "superior" } as const;
    const seeded = setRune(warrior(), "head", rune);
    const moved = applyGearDrop(
      seeded,
      { from: "armor-slot", slot: "head", part: "rune" },
      { kind: "armor", slot: "feet", part: "rune" },
    );
    expect(moved.equipment.armor.head.rune).toBeNull();
    expect(moved.equipment.armor.feet.rune).toEqual(rune);
    // The health cost is paid once, not twice.
    expect(summariseGear(moved).maxHealth).toBe(BASE_HEALTH + 50);
  });

  it("moves an insignia between pieces, re-pricing it for the new slot", () => {
    // Survivor is worth 15 on the chest and 5 everywhere else, so moving
    // it has to change the number rather than carry the old one along.
    const seeded = setInsignia(warrior(), "chest", "survivor");
    expect(summariseGear(seeded).maxHealth).toBe(BASE_HEALTH + 15);

    const moved = applyGearDrop(
      seeded,
      { from: "armor-slot", slot: "chest", part: "insignia" },
      { kind: "armor", slot: "hands", part: "insignia" },
    );
    expect(moved.equipment.armor.chest.insigniaId).toBeNull();
    expect(summariseGear(moved).maxHealth).toBe(BASE_HEALTH + 5);
  });

  it("takes worn gear off when it is dropped back on the library", () => {
    const seeded = setInsignia(warrior(), "legs", "radiant");
    const removed = applyGearDrop(
      seeded,
      { from: "armor-slot", slot: "legs", part: "insignia" },
      { kind: "library" },
    );
    expect(removed.equipment.armor.legs.insigniaId).toBeNull();
  });

  it("lets an off-hand be dropped away but never the weapon", () => {
    const withShield = setOffhand(setWeapon(warrior(), "sword"), "shield");
    expect(
      applyGearDrop(withShield, { from: "hand", hand: "offHand" }, { kind: "library" }).equipment
        .offHand,
    ).toBeNull();

    // There is no "no weapon" — bare hands are a weapon, so dragging the
    // main hand away has nothing sensible to do.
    expect(applyGearDrop(withShield, { from: "hand", hand: "mainHand" }, { kind: "library" })).toBe(
      withShield,
    );
  });

  it("fills the first free piece on click-to-equip, then wraps", () => {
    let character = warrior();
    expect(firstFreeArmorSlot(character, "rune")).toBe("head");
    character = setRune(character, "head", {
      kind: "universal",
      runeId: "vitae",
      tier: "minor",
    });
    expect(firstFreeArmorSlot(character, "rune")).toBe("chest");
  });

  it("puts a click on the selected piece, else the first free one (#570)", () => {
    const character = setInsignia(warrior(), "head", "survivor");
    expect(armorTarget(character, "insignia", undefined)).toBe("chest");
    expect(armorTarget(character, "insignia", "legs")).toBe("legs");
    // A selected piece takes the click even when it is already filled.
    expect(armorTarget(character, "insignia", "head")).toBe("head");
  });
});
