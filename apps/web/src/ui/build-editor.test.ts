import { describe, expect, it } from "vitest";

import {
  MAX_ATTRIBUTE_RANK,
  MINIMAL_GW_INSPIRED_PVP_V1,
  accessibleAttributeIds,
  primaryAttributeOf,
} from "@vibewars/game-core";

import { SKILL_BAR_SLOTS, validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import {
  applySkillDrop,
  canRaise,
  decodeDragSource,
  encodeDragSource,
  equipTarget,
  newCharacter,
  remainingPoints,
  setProfessions,
  setRank,
  equipSkill,
  setSkill,
  swapSkillSlots,
} from "./build-editor.js";
import { setWeapon } from "./gear-editor.js";

/**
 * The editor's *rules* are tested here; its DOM rendering is covered by
 * the Playwright suite in `e2e/`. Keeping the rules as pure functions is
 * what makes that split possible.
 */

describe("newCharacter", () => {
  it("starts with a full, empty skill bar and no attributes spent", () => {
    const character = newCharacter("c1");
    expect(character.skillBar).toHaveLength(SKILL_BAR_SLOTS);
    expect(character.skillBar.every((slot) => slot === null)).toBe(true);
    expect(character.attributes).toEqual([]);
  });

  it("starts with the full point budget available", () => {
    expect(remainingPoints(newCharacter("c1"))).toBe(
      MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget,
    );
  });
});

describe("setRank and remainingPoints", () => {
  it("spends points as a rank is raised", () => {
    const character = setRank(newCharacter("c1"), "warrior.strength", 5);
    expect(remainingPoints(character)).toBeLessThan(
      MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget,
    );
  });

  it("refunds points when a rank is lowered back to zero", () => {
    const raised = setRank(newCharacter("c1"), "warrior.strength", 8);
    const lowered = setRank(raised, "warrior.strength", 0);
    expect(remainingPoints(lowered)).toBe(
      MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget,
    );
  });

  it("drops the attribute entirely at rank 0 rather than storing a useless entry", () => {
    const raised = setRank(newCharacter("c1"), "warrior.strength", 3);
    expect(setRank(raised, "warrior.strength", 0).attributes).toEqual([]);
  });

  it("replaces rather than duplicates when the same attribute is set twice", () => {
    let character = setRank(newCharacter("c1"), "warrior.strength", 3);
    character = setRank(character, "warrior.strength", 7);
    expect(character.attributes).toHaveLength(1);
    expect(character.attributes[0]?.rank).toBe(7);
  });
});

describe("canRaise", () => {
  it("allows raising from zero on a fresh character", () => {
    expect(canRaise(newCharacter("c1"), "warrior.strength")).toBe(true);
  });

  it("refuses to raise past the rank cap", () => {
    const maxed = setRank(newCharacter("c1"), "warrior.strength", MAX_ATTRIBUTE_RANK);
    expect(canRaise(maxed, "warrior.strength")).toBe(false);
  });

  it("refuses to raise when the remaining budget cannot cover the next rank", () => {
    // 12/12/3 spends GW1's 200 points exactly (97 + 97 + 6), so the
    // editor will not let the player raise anything further.
    let character = newCharacter("c1");
    character = setProfessions(character, "warrior", "monk");
    character = setRank(character, "warrior.strength", MAX_ATTRIBUTE_RANK);
    character = setRank(character, "warrior.swordsmanship", MAX_ATTRIBUTE_RANK);
    character = setRank(character, "warrior.tactics", 3);

    expect(remainingPoints(character)).toBe(0);
    expect(canRaise(character, "warrior.tactics")).toBe(false);
    expect(canRaise(character, "warrior.axe-mastery")).toBe(false);
  });

  it("counts points left from game-core's table: 12/10/8 leaves 5", () => {
    let character = newCharacter("c1");
    character = setRank(character, "warrior.strength", 12);
    character = setRank(character, "warrior.swordsmanship", 10);
    character = setRank(character, "warrior.tactics", 8);
    expect(remainingPoints(character)).toBe(200 - (97 + 61 + 37));
  });
});

describe("setProfessions", () => {
  it("drops attributes the new profession pair cannot access", () => {
    let character = setProfessions(newCharacter("c1"), "warrior", "monk");
    character = setRank(character, "monk.healing-prayers", 8);
    expect(character.attributes).toHaveLength(1);

    const switched = setProfessions(character, "warrior", "ranger");
    expect(switched.attributes).toEqual([]);
  });

  it("keeps attributes that remain accessible", () => {
    let character = setProfessions(newCharacter("c1"), "warrior", "monk");
    character = setRank(character, "warrior.strength", 8);
    const switched = setProfessions(character, "warrior", "ranger");
    expect(switched.attributes).toHaveLength(1);
  });

  it("clears skills the new profession pair can no longer equip", () => {
    let character = setProfessions(newCharacter("c1"), "elementalist", "monk");
    character = setSkill(character, 0, "monk.orison-of-healing");
    expect(character.skillBar[0]).toBe("monk.orison-of-healing");

    const switched = setProfessions(character, "elementalist", "ranger");
    expect(switched.skillBar[0]).toBeNull();
  });

  it("refuses a secondary identical to the primary, treating it as none", () => {
    const character = setProfessions(newCharacter("c1"), "warrior", "warrior");
    expect(character.secondaryProfession).toBeUndefined();
  });

  it("allows clearing the secondary profession", () => {
    const withSecondary = setProfessions(newCharacter("c1"), "warrior", "monk");
    const cleared = setProfessions(withSecondary, "warrior", undefined);
    expect(cleared.secondaryProfession).toBeUndefined();
  });

  it("swaps a weapon nothing can govern for the new primary's default (#614)", () => {
    const warrior = setProfessions(newCharacter("c1"), "warrior", undefined);
    expect(warrior.equipment.mainHand.weaponId).toBe("sword");

    const mesmer = setProfessions(warrior, "mesmer", undefined);
    expect(mesmer.equipment.mainHand).toEqual({
      weaponId: "wand",
      requirementAttributeId: primaryAttributeOf("mesmer").id,
    });
    expect(mesmer.equipment.offHand?.offhandId).toBe("focus");
    expect(validateBuild(mesmer)).toEqual([]);
  });

  it("gives a Warrior turned Assassin daggers and no off-hand (#614)", () => {
    const warrior = setProfessions(newCharacter("c1"), "warrior", undefined);
    const assassin = setProfessions(warrior, "assassin", undefined);
    expect(assassin.equipment.mainHand.weaponId).toBe("daggers");
    expect(assassin.equipment.offHand).toBeNull();
  });

  it("keeps a weapon the new pair can still govern, because it is a choice (#614)", () => {
    // Swordsmanship is still on the bar through the secondary: a weapon
    // is a choice, and only one no attribute can govern is swapped.
    const warrior = setProfessions(newCharacter("c1"), "warrior", "assassin");
    const swapped = setProfessions(warrior, "assassin", "warrior");
    expect(swapped.equipment.mainHand.weaponId).toBe("sword");
  });

  it("keeps a wand and re-points its nomination (#614)", () => {
    const elementalist = setProfessions(newCharacter("c1"), "elementalist", undefined);
    expect(elementalist.equipment.mainHand.weaponId).toBe("wand");

    const monk = setProfessions(elementalist, "monk", undefined);
    expect(monk.equipment.mainHand.weaponId).toBe("wand");
    expect(accessibleAttributeIds("monk", undefined)).toContain(
      monk.equipment.mainHand.requirementAttributeId,
    );
  });

  it("drops an off-hand the new professions cannot link", () => {
    // Fists are never swapped, so the shield is reconciled on its own.
    const warrior = setWeapon(setProfessions(newCharacter("c1"), "warrior", undefined), "unarmed");
    expect(warrior.equipment.offHand).not.toBeNull();

    const switched = setProfessions(warrior, "mesmer", undefined);
    expect(switched.equipment.mainHand.weaponId).toBe("unarmed");
    expect(switched.equipment.offHand).toBeNull();
  });

  it("leaves a build that still validates after any profession change", () => {
    // The practical consequence of the reconcile rule: toggling
    // professions in the editor must never produce a build you cannot
    // save.
    let character = setProfessions(newCharacter("c1"), "warrior", "monk");
    character = setRank(character, "warrior.strength", 8);
    for (const next of ["monk", "ranger", "elementalist", "warrior"] as const) {
      character = setProfessions(character, next, undefined);
      expect(validateBuild(character), next).toEqual([]);
    }
  });
});

describe("setSkill", () => {
  it("equips a skill into a slot", () => {
    const character = setSkill(newCharacter("c1"), 2, "warrior.swift-chop");
    expect(character.skillBar[2]).toBe("warrior.swift-chop");
  });

  it("clears a slot with null", () => {
    const equipped = setSkill(newCharacter("c1"), 2, "warrior.swift-chop");
    expect(setSkill(equipped, 2, null).skillBar[2]).toBeNull();
  });

  it("moves a skill rather than duplicating it when equipped into a second slot", () => {
    let character = setSkill(newCharacter("c1"), 0, "warrior.swift-chop");
    character = setSkill(character, 5, "warrior.swift-chop");
    expect(character.skillBar[0]).toBeNull();
    expect(character.skillBar[5]).toBe("warrior.swift-chop");
    expect(character.skillBar.filter((id) => id === "warrior.swift-chop")).toHaveLength(1);
  });

  it("leaves other slots untouched", () => {
    let character = setSkill(newCharacter("c1"), 0, "warrior.swift-chop");
    character = setSkill(character, 1, "warrior.backbreaker");
    expect(character.skillBar[0]).toBe("warrior.swift-chop");
    expect(character.skillBar[1]).toBe("warrior.backbreaker");
  });
});

describe("skill bar drag and drop", () => {
  const warrior = (): StoredCharacter => ({
    ...newCharacter("c1"),
    skillBar: ["a", "b", null, null, null, null, null, null],
  });

  it("swaps two occupied slots rather than destroying one", () => {
    // `setSkill` moves and clears the origin, which would delete a skill
    // when a player drags one slot onto another to reorder.
    const swapped = swapSkillSlots(warrior(), 0, 1);

    expect(swapped.skillBar.slice(0, 2)).toEqual(["b", "a"]);
  });

  it("swaps an occupied slot with an empty one", () => {
    const swapped = swapSkillSlots(warrior(), 0, 3);

    expect(swapped.skillBar[0]).toBeNull();
    expect(swapped.skillBar[3]).toBe("a");
  });

  it("is a no-op when a slot is dropped on itself", () => {
    const before = warrior();

    expect(swapSkillSlots(before, 2, 2)).toBe(before);
  });

  it("round-trips a drag payload", () => {
    expect(decodeDragSource(encodeDragSource({ from: "library", skillId: "x.y" }))).toEqual({
      from: "library",
      skillId: "x.y",
    });
    expect(decodeDragSource(encodeDragSource({ from: "slot", slot: 3 }))).toEqual({
      from: "slot",
      slot: 3,
    });
  });

  it("refuses a payload dragged in from anywhere else", () => {
    // A drop can carry text from any application on the desktop. It must
    // do nothing rather than throw or equip something invented.
    for (const raw of ["", "nonsense", "slot:", "slot:abc", "slot:-1", "slot:99", "library:"]) {
      expect(decodeDragSource(raw), `${JSON.stringify(raw)} was accepted`).toBeUndefined();
    }
  });

  it("equips from the library on drop", () => {
    const { character: after } = applySkillDrop(
      newCharacter("c1"),
      { from: "library", skillId: "elementalist.fireball" },
      2,
    );

    expect(after.skillBar[2]).toBe("elementalist.fireball");
  });

  it("moves rather than duplicates when dragging a library skill already on the bar", () => {
    const { character: after } = applySkillDrop(warrior(), { from: "library", skillId: "a" }, 4);

    expect(after.skillBar[4]).toBe("a");
    expect(after.skillBar.filter((id) => id === "a")).toHaveLength(1);
  });

  it("swaps when the drag came from another slot", () => {
    const { character: after } = applySkillDrop(warrior(), { from: "slot", slot: 0 }, 1);

    expect(after.skillBar.slice(0, 2)).toEqual(["b", "a"]);
  });
});

describe("equipTarget (#564)", () => {
  const full = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("goes to the first empty slot when none is picked", () => {
    expect(equipTarget(["a", null, "c", null, null, null, null, null], undefined)).toEqual({
      slot: 1,
      replaces: false,
    });
  });

  it("has nowhere to go on a full bar with none picked: nothing is overwritten", () => {
    expect(equipTarget(full, undefined)).toBeUndefined();
  });

  it("goes to the picked slot, replacing what is there", () => {
    expect(equipTarget(full, 5)).toEqual({ slot: 5, replaces: true });
  });

  it("goes to a picked empty slot over an earlier empty one", () => {
    expect(equipTarget([null, null, null, null, null, null, null, null], 6)).toEqual({
      slot: 6,
      replaces: false,
    });
  });
});

describe("one elite per bar (#459)", () => {
  /** A warrior/ranger holding Barrage in slot 1 and Sprint in slot 2. */
  const withBarrage = (): StoredCharacter => ({
    ...newCharacter("c1"),
    secondaryProfession: "ranger",
    skillBar: ["ranger.barrage", "warrior.sprint", null, null, null, null, null, null],
  });

  it("replaces the elite already on the bar, and says so", () => {
    const { character, notice } = equipSkill(withBarrage(), 3, "ranger.broad-head-arrow");
    expect(character.skillBar.slice(0, 4)).toEqual([
      null,
      "warrior.sprint",
      null,
      "ranger.broad-head-arrow",
    ]);
    expect(notice).toBe("Broad Head Arrow replaced Barrage: only one elite skill per bar.");
  });

  it("replaces in the elite's own slot without a notice", () => {
    const { character, notice } = equipSkill(withBarrage(), 0, "warrior.backbreaker");
    expect(character.skillBar.slice(0, 2)).toEqual(["warrior.backbreaker", "warrior.sprint"]);
    expect(notice).toBeUndefined();
  });

  it("moves an elite between slots, or equips a non-elite, without a notice", () => {
    const moved = equipSkill(withBarrage(), 5, "ranger.barrage");
    expect(moved.character.skillBar[5]).toBe("ranger.barrage");
    expect(moved.character.skillBar[0]).toBeNull();
    expect(moved.notice).toBeUndefined();
    const plain = equipSkill(withBarrage(), 4, "ranger.troll-unguent");
    expect(plain.character.skillBar[0]).toBe("ranger.barrage");
    expect(plain.notice).toBeUndefined();
  });

  it("follows the same rule when an elite is dropped from the library", () => {
    const { character, notice } = applySkillDrop(
      withBarrage(),
      { from: "library", skillId: "warrior.backbreaker" },
      1,
    );
    expect(character.skillBar.slice(0, 2)).toEqual([null, "warrior.backbreaker"]);
    expect(notice).toBe("Backbreaker replaced Barrage: only one elite skill per bar.");
  });

  it("never lets setSkill leave two elites on the bar", () => {
    const character = setSkill(withBarrage(), 7, "warrior.backbreaker");
    expect(validateBuild(character)).toEqual([]);
  });

  it("refuses to save a two-elite bar that arrived from storage or an import", () => {
    // The editor's save button is disabled while validateBuild reports anything.
    const stored: StoredCharacter = {
      ...withBarrage(),
      skillBar: ["ranger.barrage", "warrior.backbreaker", null, null, null, null, null, null],
    };
    expect(validateBuild(stored).map((problem) => problem.message)).toEqual([
      "Only one elite skill per bar",
    ]);
  });
});
