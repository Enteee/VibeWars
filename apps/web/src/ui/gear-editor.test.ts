import {
  NO_UPGRADES,
  ARMOR_SLOTS,
  INSIGNIAS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  getWeapon,
  primaryAttributeIds,
  type InsigniaId,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import { newCharacter, setProfessions, setRank } from "./build-editor.js";
import {
  applyGearDrop,
  clearWeaponSet,
  canEquipOffhand,
  clearArmorUpgrades,
  decodeGearDrag,
  decodeRune,
  describeConditions,
  encodeGearDrag,
  encodeRune,
  armorTarget,
  firstFreeArmorSlot,
  headgearChoices,
  insigniaChoices,
  insigniaEffectNote,
  offhandAttributeChoices,
  runeChoices,
  setHeadgearAttribute,
  setInsignia,
  setOffhand,
  setRequirementAttribute,
  setRune,
  setWeapon,
  summariseGear,
  type GearSummary,
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

/** Set 1's summary, which is never empty. */
function firstSummary(character: StoredCharacter): GearSummary {
  const summary = summariseGear(character, 0);
  if (summary === undefined) {
    throw new Error("set 1 is never empty");
  }
  return summary;
}

describe("setWeapon", () => {
  it("swaps the weapon class", () => {
    const character = setWeapon(warrior(), 0, "hammer");
    expect(character.equipment.weaponSets[0].mainHand.weaponId).toBe("hammer");
  });

  it("puts the off-hand down when the new weapon needs both hands", () => {
    // The coupling the whole gear trade-off rests on: a shield or a
    // two-hander, never both.
    const withShield = setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield");
    expect(withShield.equipment.weaponSets[0].offHand).not.toBeNull();

    const twoHanded = setWeapon(withShield, 0, "scythe");
    expect(twoHanded.equipment.weaponSets[0].offHand).toBeNull();
  });

  it("keeps the off-hand when swapping between one-handers", () => {
    const withShield = setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield");
    expect(setWeapon(withShield, 0, "axe").equipment.weaponSets[0].offHand).not.toBeNull();
  });

  it("nominates an attribute for a weapon that needs one", () => {
    const character = setWeapon(monk(), 0, "staff");
    expect(character.equipment.weaponSets[0].mainHand.requirementAttributeId).not.toBeNull();
    expect(validateBuild(character)).toEqual([]);
  });

  it("nominates nothing for a weapon whose attribute is fixed", () => {
    expect(
      setWeapon(warrior(), 0, "sword").equipment.weaponSets[0].mainHand.requirementAttributeId,
    ).toBeNull();
  });

  it("prefers the primary attribute when nominating", () => {
    // The one the player is most likely to have invested in.
    expect(
      setWeapon(monk(), 0, "wand").equipment.weaponSets[0].mainHand.requirementAttributeId,
    ).toBe("monk.divine-favor");
  });

  it("ignores an unknown weapon rather than clearing the slot", () => {
    const before = warrior();
    // Only reachable from a stale DOM value; it must not blank the build.
    expect(setWeapon(before, 0, "chainsaw" as never)).toBe(before);
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
      expect(validateBuild(setWeapon(warrior(), 0, weaponId)), weaponId).toEqual([]);
    }
  });
});

describe("setOffhand", () => {
  it("equips and clears an off-hand", () => {
    const withFocus = setOffhand(setWeapon(monk(), 0, "wand"), 0, "focus");
    expect(withFocus.equipment.weaponSets[0].offHand?.offhandId).toBe("focus");
    expect(setOffhand(withFocus, 0, null).equipment.weaponSets[0].offHand).toBeNull();
  });

  it("refuses silently when both hands are full", () => {
    const twoHanded = setWeapon(warrior(), 0, "hammer");
    expect(canEquipOffhand(twoHanded, 0)).toBe(false);
    expect(setOffhand(twoHanded, 0, "shield")).toBe(twoHanded);
  });

  it("produces a build that validates", () => {
    expect(validateBuild(setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield"))).toEqual([]);
  });
});

describe("attribute nominations", () => {
  it("offers nothing for a fixed-requirement weapon", () => {
    expect(weaponAttributeChoices(setWeapon(warrior(), 0, "sword"), 0)).toEqual([]);
  });

  it("offers every reachable attribute for a caster weapon", () => {
    const choices = weaponAttributeChoices(setWeapon(monk(), 0, "wand"), 0);
    expect(choices).toContain("monk.divine-favor");
    expect(choices).toContain("monk.healing-prayers");
    expect(choices).not.toContain("warrior.strength");
  });

  it("offers a shield only the attributes shields use", () => {
    const character = setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield");
    const choices = offhandAttributeChoices(character, "shield");
    expect(choices).toContain("warrior.strength");
    expect(choices).toContain("warrior.tactics");
    // Axe Mastery is reachable but is not a shield attribute.
    expect(choices).not.toContain("warrior.axe-mastery");
  });

  it("re-links gear without disturbing anything else", () => {
    const before = setWeapon(monk(), 0, "wand");
    const after = setRequirementAttribute(before, 0, "mainHand", "monk.healing-prayers");
    expect(after.equipment.weaponSets[0].mainHand.requirementAttributeId).toBe(
      "monk.healing-prayers",
    );
    expect(after.equipment.weaponSets[0].mainHand.weaponId).toBe("wand");
  });

  it("ignores a re-link on an absent off-hand", () => {
    const character = setWeapon(warrior(), 0, "hammer");
    expect(setRequirementAttribute(character, 0, "offHand", "warrior.strength")).toBe(character);
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

  it("keeps the headgear's attribute when clearing upgrades: it is the piece (#1140)", () => {
    const character = setHeadgearAttribute(warrior(), "warrior.tactics");
    expect(clearArmorUpgrades(character).equipment.armor.head.headgearAttributeId).toBe(
      "warrior.tactics",
    );
  });

  it("offers only runes this character could legally wear", () => {
    const monkChoices = runeChoices(monk()).map((c) => c.key);
    // Absorption is warrior-primary only.
    expect(monkChoices.some((k) => k.includes("absorption"))).toBe(false);
    expect(runeChoices(warrior()).some((c) => c.key.includes("absorption"))).toBe(true);
    // An attribute rune for an attribute a monk cannot raise.
    expect(monkChoices.some((k) => k.includes("warrior.strength"))).toBe(false);
  });

  it("offers attribute runes of the primary only, never the secondary (#1141)", () => {
    const warriorMonk = setProfessions(newCharacter("c1"), "warrior", "monk");
    const attributes = new Set(
      runeChoices(warriorMonk).flatMap((c) =>
        c.rune.kind === "attribute" ? [c.rune.attributeId] : [],
      ),
    );
    expect([...attributes].sort()).toEqual([...primaryAttributeIds("warrior")].sort());
    const universal = (character: StoredCharacter) =>
      runeChoices(character).filter((c) => c.rune.kind === "universal");
    expect(universal(warriorMonk)).toEqual(universal(warrior()));
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

describe("headgear (#1140)", () => {
  it("offers the primary attribute first, the primary's others, then the secondary's", () => {
    const character = setProfessions(newCharacter("c1"), "warrior", "monk");
    expect(headgearChoices(character)).toEqual([
      "warrior.strength",
      ...primaryAttributeIds("warrior").filter((id) => id !== "warrior.strength"),
      "monk.healing-prayers",
      "monk.protection-prayers",
      "monk.smiting-prayers",
    ]);
  });

  it("points the +1 at the attribute picked, and nothing else on the head moves", () => {
    const character = setHeadgearAttribute(
      setInsignia(warrior(), "head", "stalwart"),
      "warrior.tactics",
    );
    expect(character.equipment.armor.head).toEqual({
      insigniaId: "stalwart",
      rune: null,
      headgearAttributeId: "warrior.tactics",
    });
    expect(validateBuild(character)).toEqual([]);
  });
});

describe("profession insignias (#1142)", () => {
  it("offers a Mesmer the six common insignias and its own three", () => {
    const mesmer = setProfessions(newCharacter("c1"), "mesmer", undefined);
    expect(insigniaChoices(mesmer).map((insignia) => insignia.id)).toEqual([
      "survivor",
      "radiant",
      "stalwart",
      "blessed",
      "brawlers",
      "sentrys",
      "prodigys",
      "artificers",
      "virtuosos",
    ]);
  });

  it("describes Sentinel's conditions together and Prodigy's tiers short", () => {
    const sentinels = INSIGNIAS.sentinels.effect;
    if (sentinels.kind !== "conditional-armor") {
      throw new Error("Sentinel's is armor");
    }
    expect(describeConditions(sentinels.bonuses[0]?.conditions ?? [])).toBe(
      "vs elemental damage, with 13+ Strength",
    );
    const prodigys = INSIGNIAS.prodigys.effect;
    if (prodigys.kind !== "conditional-armor") {
      throw new Error("Prodigy's is armor");
    }
    expect(describeConditions(prodigys.bonuses[0]?.conditions ?? [])).toBe(
      "while 1+ skills recharge",
    );
    expect(insigniaEffectNote(prodigys)).toBe(
      "+5 armor while 1+ skills recharge, +5 at 3+, +5 at 5+",
    );
  });

  it("describes #1188's conditions, Undertaker's in full and Minion Master's short", () => {
    const conditionOf = (id: "disciples" | "blighters" | "forsaken" | "prismatic"): string => {
      const effect = INSIGNIAS[id].effect;
      if (effect.kind !== "conditional-armor") {
        throw new Error(`${id} is armor`);
      }
      return describeConditions(effect.bonuses[0]?.conditions ?? []);
    };
    expect(conditionOf("disciples")).toBe("while you have a condition");
    expect(conditionOf("blighters")).toBe("while hexed");
    expect(conditionOf("forsaken")).toBe("while not enchanted");
    expect(conditionOf("prismatic")).toBe("with 9+ Air Magic");
    const undertakers = INSIGNIAS.undertakers.effect;
    const minionMasters = INSIGNIAS["minion-masters"].effect;
    const shamans = INSIGNIAS.shamans.effect;
    if (
      undertakers.kind !== "conditional-armor" ||
      minionMasters.kind !== "conditional-armor" ||
      shamans.kind !== "conditional-armor"
    ) {
      throw new Error("they are armor");
    }
    expect(insigniaEffectNote(undertakers)).toBe(
      "+5 armor below 80% Health, +5 armor below 60% Health, +5 armor below 40% Health, " +
        "+5 armor below 20% Health",
    );
    expect(insigniaEffectNote(minionMasters)).toBe(
      "+5 armor while you control 1+ minions, +5 at 3+, +5 at 5+",
    );
    expect(insigniaEffectNote(shamans)).toBe(
      "+5 armor while you control 1+ spirits, +5 at 2+, +5 at 3+",
    );
  });

  it("describes #1206's conditions, and Artificer's in one line", () => {
    const conditionsOf = (id: InsigniaId): string[] => {
      const effect = INSIGNIAS[id].effect;
      if (effect.kind !== "conditional-armor") {
        throw new Error(`${id} is armor`);
      }
      return effect.bonuses.map((bonus) => describeConditions(bonus.conditions));
    };
    expect(conditionsOf("bonelace")).toEqual(["vs piercing damage"]);
    expect(conditionsOf("pyromancer")).toEqual(["vs elemental damage", "vs fire damage"]);
    expect(conditionsOf("sentrys")).toEqual(["while in a stance"]);
    expect(conditionsOf("scouts")).toEqual(["while using a preparation"]);
    expect(conditionsOf("ghost-forge")).toEqual(["while under a weapon spell"]);
    expect(conditionsOf("centurions")).toEqual(["while under a shout or chant"]);
    expect(conditionsOf("beastmasters")).toEqual(["while your pet is alive"]);
    expect(conditionsOf("virtuosos")).toEqual(["while activating a skill"]);
    const artificers = INSIGNIAS.artificers.effect;
    if (artificers.kind !== "conditional-armor") {
      throw new Error("Artificer's is armor");
    }
    expect(insigniaEffectNote(artificers)).toBe("+3 armor per signet on your bar");
  });

  it("takes Knight's off a Warrior turned Monk, and keeps Brawler's", () => {
    const worn = setInsignia(setInsignia(warrior(), "chest", "knights"), "legs", "brawlers");
    const turned = setProfessions(worn, "monk", undefined);
    expect(turned.equipment.armor.chest.insigniaId).toBeNull();
    expect(turned.equipment.armor.legs.insigniaId).toBe("brawlers");
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
    const summary = firstSummary(setOffhand(setWeapon(monk(), 0, "wand"), 0, null));
    expect(summary.maxHealth).toBe(BASE_HEALTH);
    expect(summary.maxEnergy).toBe(BASE_ENERGY);
    expect(summary.armor).toBe(60);
    expect(summary.weaponName).toBe("Wand");
  });

  it("shows a warrior's higher base armor", () => {
    // Off-hand cleared explicitly: a warrior's default kit includes a
    // shield, and this is asserting the profession's own armor.
    const bare = setOffhand(setWeapon(warrior(), 0, "sword"), 0, null);
    expect(firstSummary(bare).armor).toBe(80);
  });

  it("counts a shield's armor, and the extra once its requirement is met", () => {
    const base = setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield");
    expect(firstSummary(base).armor).toBe(88);

    const trained = setRank(base, "warrior.strength", 9);
    expect(firstSummary(trained).armor).toBe(96);
  });

  it("shows the primary profession's energy regeneration in pips", () => {
    expect(firstSummary(warrior()).baseEnergyPips).toBe(2);
  });

  it("shows the health a rune costs, not just the rank it gives", () => {
    // The trade the player is actually making, both halves visible.
    const runed = setRune(warrior(), "head", {
      kind: "attribute",
      attributeId: "warrior.swordsmanship",
      tier: "superior",
    });
    const summary = firstSummary(runed);
    expect(summary.maxHealth).toBe(BASE_HEALTH - 75);
    // A new Warrior's headgear raises Strength (#1140).
    expect(summary.attributeBonuses).toEqual([
      { attributeId: "warrior.strength", bonus: 1, sources: "headgear +1" },
      { attributeId: "warrior.swordsmanship", bonus: 3, sources: "rune +3" },
    ]);
  });

  it("splits a rune and the headgear on one attribute: rune +3, headgear +1 (#1140)", () => {
    const character = setHeadgearAttribute(
      setRune(warrior(), "head", {
        kind: "attribute",
        attributeId: "warrior.swordsmanship",
        tier: "superior",
      }),
      "warrior.swordsmanship",
    );
    expect(firstSummary(character).attributeBonuses).toEqual([
      { attributeId: "warrior.swordsmanship", bonus: 4, sources: "rune +3, headgear +1" },
    ]);
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
    const summary = firstSummary(character);
    expect(summary.maxHealth).toBe(BASE_HEALTH - 150);
    // A new Warrior's headgear raises Strength (#1140).
    expect(summary.attributeBonuses).toEqual([
      { attributeId: "warrior.strength", bonus: 1, sources: "headgear +1" },
      { attributeId: "warrior.swordsmanship", bonus: 3, sources: "rune +3" },
    ]);
  });

  it("gives Survivor more health on the chest than on the gloves", () => {
    const chest = firstSummary(setInsignia(warrior(), "chest", "survivor")).maxHealth;
    const hands = firstSummary(setInsignia(warrior(), "hands", "survivor")).maxHealth;
    expect(chest).toBe(BASE_HEALTH + 15);
    expect(hands).toBe(BASE_HEALTH + 5);
  });

  it("adds Radiant energy per piece", () => {
    expect(firstSummary(setInsignia(warrior(), "chest", "radiant")).maxEnergy).toBe(
      BASE_ENERGY + 3,
    );
  });

  it("lists a conditional insignia rather than folding it into armor", () => {
    const bare = setOffhand(setWeapon(warrior(), 0, "sword"), 0, null);
    const summary = firstSummary(setInsignia(bare, "chest", "stalwart"));
    // It is not unconditional, so it must not inflate the headline number.
    expect(summary.armor).toBe(80);
    // A Warrior's own +20 first, then the insignia's, on its piece (#1135).
    expect(summary.conditionalArmor).toEqual([
      "+20 armor vs physical damage",
      "+10 armor vs physical damage on chest (avg +3.8)",
    ]);
  });

  it("lists five Stalwart as one line on every hit, two as one line on both pieces (#1135)", () => {
    let five = setOffhand(setWeapon(warrior(), 0, "sword"), 0, null);
    for (const slot of ARMOR_SLOTS) {
      five = setInsignia(five, slot, "stalwart");
    }
    expect(firstSummary(five).conditionalArmor).toEqual([
      "+20 armor vs physical damage",
      "+10 armor vs physical damage",
    ]);
    const two = setInsignia(setInsignia(warrior(), "chest", "stalwart"), "legs", "stalwart");
    expect(firstSummary(two).conditionalArmor).toEqual([
      "+20 armor vs physical damage",
      "+10 armor vs physical damage on chest, legs (avg +6.3)",
    ]);
  });

  it("lists Knight's cut per piece, after the armor lines (#1142)", () => {
    const bare = setOffhand(setWeapon(warrior(), 0, "sword"), 0, null);
    expect(firstSummary(setInsignia(bare, "chest", "knights")).conditionalArmor).toEqual([
      "+20 armor vs physical damage",
      "−3 physical damage taken on chest (avg −1.1)",
    ]);
  });

  it("lists Artificer's as one line a signet, not eight (#1206)", () => {
    const mesmer = setProfessions(newCharacter("c1"), "mesmer", undefined);
    expect(firstSummary(setInsignia(mesmer, "chest", "artificers")).conditionalArmor).toEqual([
      "+3 armor per signet on your bar on chest (avg +1.1 a signet)",
    ]);
  });

  it("lists a Ranger's inherent armor vs elemental damage (#759)", () => {
    const ranger = setProfessions(newCharacter("c1"), "ranger", undefined);
    expect(firstSummary(ranger).conditionalArmor).toEqual(["+30 armor vs elemental damage"]);
    expect(firstSummary(monk()).conditionalArmor).toEqual([]);
  });

  it("reports Absorption's flat reduction", () => {
    const runed = setRune(warrior(), "feet", {
      kind: "universal",
      runeId: "absorption",
      tier: "major",
    });
    expect(firstSummary(runed).flatPhysicalReduction).toBe(2);
  });

  it("flags an unmet weapon requirement", () => {
    // A monk holding a hammer is legal and bad; the editor says so
    // rather than letting them find out in a match.
    const unskilled = setWeapon(monk(), 0, "hammer");
    expect(firstSummary(unskilled).unmetRequirement).toEqual({
      attributeId: "warrior.hammer-mastery",
      rank: 9,
    });

    const trained = setRank(setWeapon(warrior(), 0, "hammer"), "warrior.hammer-mastery", 9);
    expect(firstSummary(trained).unmetRequirement).toBeUndefined();
  });

  it("shows the damage an unmet requirement actually deals, a third (#571)", () => {
    const hammer = getWeapon("hammer");
    if (hammer === undefined) {
      throw new Error("no hammer");
    }
    const trained = setRank(setWeapon(warrior(), 0, "hammer"), "warrior.hammer-mastery", 9);
    expect(firstSummary(trained).damageRange).toBe(
      `${String(hammer.damageMin)}–${String(hammer.damageMax)}`,
    );
    expect(firstSummary(setWeapon(monk(), 0, "hammer")).damageRange).toBe(
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
    const { maxHealth } = firstSummary(character);
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
      { from: "hand", set: 0, hand: "offHand" },
      { from: "hand", set: 2, hand: "mainHand" },
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
    ["bad hand", "gear-hand:0:tail"],
    ["bad set", "gear-hand:4:mainHand"],
    ["no set", "gear-hand:mainHand"],
  ])("refuses %s", (_label, raw) => {
    expect(decodeGearDrag(raw)).toBeUndefined();
  });

  it("equips a weapon dropped on the weapon slot", () => {
    const after = applyGearDrop(
      warrior(),
      { from: "weapon-library", weaponId: "scythe" },
      { kind: "main-hand", set: 0 },
    );
    expect(after.equipment.weaponSets[0].mainHand.weaponId).toBe("scythe");
    // A scythe needs both hands, so the shield comes off with it.
    expect(after.equipment.weaponSets[0].offHand).toBeNull();
  });

  it("ignores gear dropped where it does not belong", () => {
    const before = warrior();
    const nonsense = [
      [
        { from: "rune-library", rune: { kind: "universal", runeId: "vigor", tier: "minor" } },
        { kind: "main-hand", set: 0 },
      ],
      [
        { from: "insignia-library", insigniaId: "survivor" },
        { kind: "off-hand", set: 0 },
      ],
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
    expect(firstSummary(moved).maxHealth).toBe(BASE_HEALTH + 50);
  });

  it("moves an insignia between pieces, re-pricing it for the new slot", () => {
    // Survivor is worth 15 on the chest and 5 everywhere else, so moving
    // it has to change the number rather than carry the old one along.
    const seeded = setInsignia(warrior(), "chest", "survivor");
    expect(firstSummary(seeded).maxHealth).toBe(BASE_HEALTH + 15);

    const moved = applyGearDrop(
      seeded,
      { from: "armor-slot", slot: "chest", part: "insignia" },
      { kind: "armor", slot: "hands", part: "insignia" },
    );
    expect(moved.equipment.armor.chest.insigniaId).toBeNull();
    expect(firstSummary(moved).maxHealth).toBe(BASE_HEALTH + 5);
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
    const withShield = setOffhand(setWeapon(warrior(), 0, "sword"), 0, "shield");
    expect(
      applyGearDrop(withShield, { from: "hand", set: 0, hand: "offHand" }, { kind: "library" })
        .equipment.weaponSets[0].offHand,
    ).toBeNull();

    // There is no "no weapon" — bare hands are a weapon, so dragging the
    // main hand away has nothing sensible to do.
    expect(
      applyGearDrop(withShield, { from: "hand", set: 0, hand: "mainHand" }, { kind: "library" }),
    ).toBe(withShield);
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

describe("weapon sets 2-4 (#489)", () => {
  /** A warrior whose set 3 holds an axe and a shield. */
  function withSet3(): StoredCharacter {
    return setOffhand(setWeapon(warrior(), 2, "axe"), 2, "shield");
  }

  it("creates an empty set from a weapon, off hand empty, and leaves set 1 alone", () => {
    const before = warrior();
    const after = setWeapon(before, 1, "hammer");
    expect(before.equipment.weaponSets[1]).toBeNull();
    expect(after.equipment.weaponSets[1]).toEqual({
      mainHand: { weaponId: "hammer", requirementAttributeId: null, upgrades: NO_UPGRADES },
      offHand: null,
    });
    expect(after.equipment.weaponSets[0]).toEqual(before.equipment.weaponSets[0]);
    expect(validateBuild(after)).toEqual([]);
  });

  it("edits only the set it is given", () => {
    const character = withSet3();
    expect(character.equipment.weaponSets[2]?.offHand?.offhandId).toBe("shield");
    expect(canEquipOffhand(character, 2)).toBe(true);
    const relinked = setRequirementAttribute(
      setWeapon(character, 2, "wand"),
      2,
      "mainHand",
      "warrior.strength",
    );
    expect(relinked.equipment.weaponSets[2]?.mainHand.requirementAttributeId).toBe(
      "warrior.strength",
    );
    expect(relinked.equipment.weaponSets[0]).toEqual(character.equipment.weaponSets[0]);
    expect(weaponAttributeChoices(relinked, 2)).toContain("warrior.strength");
    expect(weaponAttributeChoices(relinked, 0)).toEqual([]);
  });

  it("puts down only that set's off hand for a two-hander", () => {
    const character = setOffhand(withSet3(), 0, "shield");
    const after = setWeapon(character, 2, "hammer");
    expect(after.equipment.weaponSets[2]?.offHand).toBeNull();
    expect(after.equipment.weaponSets[0].offHand?.offhandId).toBe("shield");
  });

  it("does nothing to an empty set but take a weapon", () => {
    const character = warrior();
    expect(canEquipOffhand(character, 3)).toBe(false);
    expect(setOffhand(character, 3, "shield")).toBe(character);
    expect(setOffhand(character, 3, null)).toBe(character);
    expect(setRequirementAttribute(character, 3, "mainHand", "warrior.strength")).toBe(character);
    expect(weaponAttributeChoices(character, 3)).toEqual([]);
    expect(summariseGear(character, 3)).toBeUndefined();
    expect(
      applyGearDrop(
        character,
        { from: "offhand-library", offhandId: "shield" },
        { kind: "off-hand", set: 3 },
      ),
    ).toBe(character);
  });

  it("summarises the set it is asked about", () => {
    expect(summariseGear(withSet3(), 2)?.weaponName).toBe("Axe");
    expect(summariseGear(withSet3(), 0)?.weaponName).toBe("Sword");
  });

  it("empties a set with clearWeaponSet, or by dragging its weapon to the library", () => {
    const character = withSet3();
    expect(clearWeaponSet(character, 2).equipment.weaponSets[2]).toBeNull();
    const dragged = applyGearDrop(
      character,
      { from: "hand", set: 2, hand: "mainHand" },
      { kind: "library" },
    );
    expect(dragged.equipment.weaponSets[2]).toBeNull();
    expect(dragged.equipment.weaponSets[0]).toEqual(character.equipment.weaponSets[0]);
    // Set 1's weapon still cannot be dragged away.
    expect(
      applyGearDrop(character, { from: "hand", set: 0, hand: "mainHand" }, { kind: "library" }),
    ).toBe(character);
  });

  it("drops a library weapon into the set the drop names", () => {
    const after = applyGearDrop(
      warrior(),
      { from: "weapon-library", weaponId: "daggers" },
      { kind: "main-hand", set: 1 },
    );
    expect(after.equipment.weaponSets[1]?.mainHand.weaponId).toBe("daggers");
    expect(after.equipment.weaponSets[0].mainHand.weaponId).toBe("sword");
  });
});
