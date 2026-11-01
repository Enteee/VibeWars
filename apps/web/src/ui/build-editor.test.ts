import { describe, expect, it } from "vitest";

import {
  MAX_ATTRIBUTE_RANK,
  MINIMAL_GW_INSPIRED_PVP_V1,
  accessibleAttributeIds,
  getSkill,
  primaryAttributeOf,
} from "@vibewars/game-core";

import { exportBuild } from "../storage/build-transfer.js";
import { SKILL_BAR_SLOTS, validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter } from "../storage/schema.js";
import {
  applySkillDrop,
  budgetSegments,
  canRaise,
  decodeDragSource,
  describeProfessionChange,
  editorProblems,
  encodeDragSource,
  equipTarget,
  isUnsaved,
  loadCode,
  newCharacter,
  nextRankCost,
  pipTarget,
  rankChange,
  remainingPoints,
  professionChoices,
  setProfessions,
  setRank,
  equipSkill,
  setSkill,
  swapSkillSlots,
  trySetRank,
  weaponWarning,
} from "./build-editor.js";
import { TEAM_FORMAT } from "../storage/team-transfer.js";
import { setHeadgearAttribute, setWeapon } from "./gear-editor.js";

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

describe("rank pips (#565)", () => {
  /** 12 Strength and 12 Swordsmanship: 194 of 200 points, 6 left. */
  const nearlySpent = (): StoredCharacter =>
    setRank(setRank(newCharacter("c1"), "warrior.strength", 12), "warrior.swordsmanship", 12);

  it("sets the rank of the pip clicked, up or down", () => {
    const character = setRank(newCharacter("c1"), "warrior.tactics", 5);
    expect(pipTarget(character, "warrior.tactics", 9)).toBe(9);
    expect(pipTarget(character, "warrior.tactics", 2)).toBe(2);
    const raised = trySetRank(character, "warrior.tactics", 9);
    expect("character" in raised && raised.character.attributes).toEqual([
      { attributeId: "warrior.tactics", rank: 9 },
    ]);
  });

  it("lowers by one when the top pip is clicked, down to zero", () => {
    const character = setRank(newCharacter("c1"), "warrior.tactics", 5);
    expect(pipTarget(character, "warrior.tactics", 5)).toBe(4);
    const one = setRank(newCharacter("c1"), "warrior.tactics", 1);
    expect(pipTarget(one, "warrior.tactics", 1)).toBe(0);
  });

  it("refuses a pip the points cannot pay for, saying how many more it needs", () => {
    const character = nearlySpent();
    // Tactics 4 costs 10; 6 are left.
    expect(trySetRank(character, "warrior.tactics", 4)).toEqual({ needs: 4 });
    const three = trySetRank(character, "warrior.tactics", 3);
    expect("character" in three && remainingPoints(three.character)).toBe(0);
  });

  it("always lowers, however little is left", () => {
    const lowered = trySetRank(nearlySpent(), "warrior.strength", 11);
    expect("character" in lowered && remainingPoints(lowered.character)).toBe(26);
  });

  it("previews a pip's cost and what it would leave, a refund as a negative cost", () => {
    const character = nearlySpent();
    expect(rankChange(character, "warrior.tactics", 2)).toEqual({ cost: 3, left: 3 });
    expect(rankChange(character, "warrior.tactics", 4)).toEqual({ cost: 10, left: -4 });
    expect(rankChange(character, "warrior.strength", 10)).toEqual({ cost: -36, left: 42 });
  });

  it("prices the next rank, and has none at the cap", () => {
    const character = setRank(newCharacter("c1"), "warrior.tactics", 11);
    expect(nextRankCost(character, "warrior.tactics")).toBe(20);
    expect(nextRankCost(character, "warrior.strength")).toBe(1);
    expect(nextRankCost(nearlySpent(), "warrior.strength")).toBeUndefined();
  });

  it("splits the spent points into one budget segment per ranked attribute, in row order", () => {
    let character = setProfessions(newCharacter("c1"), "warrior", "monk");
    character = setRank(character, "monk.healing-prayers", 8);
    character = setRank(character, "warrior.strength", 3);
    character = setRank(character, "warrior.tactics", 10);
    const segments = budgetSegments(character);
    const rows = accessibleAttributeIds("warrior", "monk");
    expect(segments.map((segment) => segment.attributeId)).toEqual(
      rows.filter((id) =>
        ["monk.healing-prayers", "warrior.strength", "warrior.tactics"].includes(id),
      ),
    );
    expect(segments.reduce((sum, segment) => sum + segment.points, 0)).toBe(
      MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget - remainingPoints(character),
    );
  });
});

describe("describeProfessionChange (#569)", () => {
  it("lists exactly what setProfessions dropped: ranks with points, skills, gear", () => {
    let monk = setProfessions(newCharacter("c1"), "warrior", "monk");
    monk = setRank(monk, "monk.healing-prayers", 9);
    monk = setRank(monk, "warrior.strength", 8);
    monk = setSkill(monk, 0, "monk.orison-of-healing");
    const ranger = setProfessions(monk, "warrior", "ranger");
    expect(describeProfessionChange(monk, ranger)).toEqual([
      "Healing Prayers 9 (48 points back)",
      "Orison of Healing from the bar",
    ]);
  });

  it("names a swapped weapon and off-hand (#614)", () => {
    const warrior = setProfessions(newCharacter("c1"), "warrior", undefined);
    const mesmer = setProfessions(warrior, "mesmer", undefined);
    expect(describeProfessionChange(warrior, mesmer)).toEqual([
      "Sword → Wand",
      "Shield → Focus",
      "Headgear: Strength → Fast Casting",
    ]);
  });

  it("names the headgear moved when its attribute left both professions (#1140)", () => {
    const monk = setHeadgearAttribute(
      setProfessions(newCharacter("c1"), "warrior", "monk"),
      "monk.healing-prayers",
    );
    const ranger = setProfessions(monk, "warrior", "ranger");
    expect(ranger.equipment.armor.head.headgearAttributeId).toBe("warrior.strength");
    expect(describeProfessionChange(monk, ranger)).toEqual([
      "Headgear: Healing Prayers → Strength",
    ]);
  });

  it("names a set 2-4 a profession change empties (#489)", () => {
    const warrior = setWeapon(setProfessions(newCharacter("c1"), "warrior", undefined), 1, "sword");
    const mesmer = setProfessions(warrior, "mesmer", undefined);
    expect(describeProfessionChange(warrior, mesmer)).toEqual([
      "Sword → Wand",
      "Shield → Focus",
      "Set 2: Sword removed",
      "Headgear: Strength → Fast Casting",
    ]);
  });

  it("is empty when nothing was dropped", () => {
    let warrior = setProfessions(newCharacter("c1"), "warrior", "monk");
    warrior = setRank(warrior, "warrior.strength", 8);
    expect(describeProfessionChange(warrior, setProfessions(warrior, "warrior", "ranger"))).toEqual(
      [],
    );
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
    expect(warrior.equipment.weaponSets[0].mainHand.weaponId).toBe("sword");

    const mesmer = setProfessions(warrior, "mesmer", undefined);
    expect(mesmer.equipment.weaponSets[0].mainHand).toEqual({
      weaponId: "wand",
      requirementAttributeId: primaryAttributeOf("mesmer").id,
    });
    expect(mesmer.equipment.weaponSets[0].offHand?.offhandId).toBe("focus");
    expect(validateBuild(mesmer)).toEqual([]);
  });

  it("empties a set 2-4 nothing can govern and keeps a reachable one (#489)", () => {
    const warrior = setWeapon(
      setWeapon(setProfessions(newCharacter("c1"), "warrior", undefined), 1, "sword"),
      2,
      "wand",
    );
    const mesmer = setProfessions(warrior, "mesmer", undefined);
    expect(mesmer.equipment.weaponSets[1]).toBeNull();
    expect(mesmer.equipment.weaponSets[2]?.mainHand.weaponId).toBe("wand");
    expect(validateBuild(mesmer)).toEqual([]);
  });

  it("gives a Warrior turned Assassin daggers and no off-hand (#614)", () => {
    const warrior = setProfessions(newCharacter("c1"), "warrior", undefined);
    const assassin = setProfessions(warrior, "assassin", undefined);
    expect(assassin.equipment.weaponSets[0].mainHand.weaponId).toBe("daggers");
    expect(assassin.equipment.weaponSets[0].offHand).toBeNull();
  });

  it("keeps a weapon the new pair can still govern, because it is a choice (#614)", () => {
    // Swordsmanship is still on the bar through the secondary: a weapon
    // is a choice, and only one no attribute can govern is swapped.
    const warrior = setProfessions(newCharacter("c1"), "warrior", "assassin");
    const swapped = setProfessions(warrior, "assassin", "warrior");
    expect(swapped.equipment.weaponSets[0].mainHand.weaponId).toBe("sword");
  });

  it("keeps a wand and re-points its nomination (#614)", () => {
    const elementalist = setProfessions(newCharacter("c1"), "elementalist", undefined);
    expect(elementalist.equipment.weaponSets[0].mainHand.weaponId).toBe("wand");

    const monk = setProfessions(elementalist, "monk", undefined);
    expect(monk.equipment.weaponSets[0].mainHand.weaponId).toBe("wand");
    expect(accessibleAttributeIds("monk", undefined)).toContain(
      monk.equipment.weaponSets[0].mainHand.requirementAttributeId,
    );
  });

  it("drops an off-hand the new professions cannot link", () => {
    // Fists are never swapped, so the shield is reconciled on its own.
    const warrior = setWeapon(
      setProfessions(newCharacter("c1"), "warrior", undefined),
      0,
      "unarmed",
    );
    expect(warrior.equipment.weaponSets[0].offHand).not.toBeNull();

    const switched = setProfessions(warrior, "mesmer", undefined);
    expect(switched.equipment.weaponSets[0].mainHand.weaponId).toBe("unarmed");
    expect(switched.equipment.weaponSets[0].offHand).toBeNull();
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

describe("professionChoices (#568)", () => {
  /** A Warrior/Monk with a warrior skill and two monk skills on the bar. */
  function warriorMonk(): StoredCharacter {
    let character = setProfessions(newCharacter("c1"), "warrior", "monk");
    character = setSkill(character, 0, "warrior.sever-artery");
    character = setSkill(character, 1, "monk.orison-of-healing");
    return setSkill(character, 2, "monk.guardian");
  }

  it("says how many of the bar's skills each primary keeps, and offers not the secondary", () => {
    const choices = professionChoices(warriorMonk(), "primary");
    const by = new Map(choices.map((choice) => [choice.id, choice]));
    expect(by.has("monk")).toBe(false);
    expect(by.get("warrior")).toMatchObject({ keeps: 3, of: 3, current: true });
    // Another primary loses the warrior skill and keeps the monk's two.
    expect(by.get("elementalist")).toMatchObject({ keeps: 2, of: 3, current: false });
    expect(by.get("warrior")?.attributes).toContain("Strength ★");
  });

  it("offers the secondary's (none) first, and not the primary", () => {
    const choices = professionChoices(warriorMonk(), "secondary");
    expect(choices[0]).toMatchObject({ id: undefined, name: "(none)", keeps: 1, of: 3 });
    const by = new Map(choices.map((choice) => [choice.id, choice]));
    expect(by.has("warrior")).toBe(false);
    expect(by.get("monk")).toMatchObject({ keeps: 3, current: true });
    expect(by.get("ranger")).toMatchObject({ keeps: 1, current: false });
    // A secondary brings no primary attribute.
    expect(by.get("monk")?.attributes.some((name) => name.endsWith("★"))).toBe(false);
  });

  it("keeps what setProfessions keeps, cell for cell", () => {
    const character = warriorMonk();
    for (const choice of professionChoices(character, "secondary")) {
      const next = setProfessions(character, character.primaryProfession, choice.id);
      expect(choice.keeps, String(choice.id)).toBe(
        next.skillBar.filter((id) => id !== null).length,
      );
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

describe("isUnsaved (#566)", () => {
  const opened = newCharacter("c1");

  it("is false for the character as opened, however late it was touched", () => {
    expect(isUnsaved(opened, opened)).toBe(false);
    expect(isUnsaved(opened, { ...opened, updatedAt: opened.updatedAt + 5000 })).toBe(false);
  });

  it("is true for a new name, a rank, a skill or a profession", () => {
    expect(isUnsaved(opened, { ...opened, name: "Renamed" })).toBe(true);
    expect(isUnsaved(opened, setRank(opened, "warrior.strength", 3))).toBe(true);
    expect(isUnsaved(opened, setSkill(opened, 0, "warrior.sprint"))).toBe(true);
    expect(isUnsaved(opened, setProfessions(opened, "warrior", "monk"))).toBe(true);
  });

  it("is false again once an edit is undone, whatever order the ranks were set in", () => {
    const ranked = setRank(setRank(opened, "warrior.strength", 3), "warrior.tactics", 2);
    const reordered = setRank(setRank(ranked, "warrior.strength", 0), "warrior.strength", 3);
    expect(isUnsaved(ranked, reordered)).toBe(false);
    expect(
      isUnsaved(opened, setRank(setRank(opened, "warrior.strength", 3), "warrior.strength", 0)),
    ).toBe(false);
  });
});

describe("editorProblems (#566)", () => {
  const texts = (character: StoredCharacter) =>
    editorProblems(character).map((problem) => [problem.text, problem.blocking]);

  it("says what blocks the save in a sentence, with no field prefix, and where", () => {
    const nameless = { ...setSkill(newCharacter("c1"), 0, "warrior.sprint"), name: " " };
    const [first] = editorProblems(nameless);
    expect(first).toEqual({
      text: "Give the character a name.",
      blocking: true,
      cause: { kind: "name" },
    });
  });

  it("names the slot of a skill the professions cannot reach", () => {
    const character = setSkill(newCharacter("c1"), 2, "elementalist.fireball");
    const [first] = editorProblems(character);
    expect(first?.text).toBe(
      "Slot 3: Fireball is an Elementalist skill, which this character cannot access.",
    );
    expect(first?.cause).toEqual({ kind: "slot", slot: 2 });
  });

  it("lists unspent points and empty slots as hints that never block", () => {
    const character = setSkill(newCharacter("c1"), 0, "warrior.sprint");
    expect(texts(character)).toEqual([
      [
        `${String(MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget)} attribute points unspent.`,
        false,
      ],
      ["7 empty skill slots.", false],
    ]);
    expect(validateBuild(character)).toEqual([]);
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

describe("weaponWarning (#417)", () => {
  const skill = (id: string) => {
    const found = getSkill(id);
    if (found === undefined) {
      throw new Error(`no skill ${id}`);
    }
    return found;
  };

  it("says what an attack skill needs and what is in hand", () => {
    expect(weaponWarning(skill("warrior.swift-chop"), ["sword"])).toEqual({
      badge: "Needs an axe",
      title: "Needs an axe — your weapon is a sword",
    });
    expect(weaponWarning(skill("ranger.barrage"), ["daggers"])?.title).toBe(
      "Needs a bow — your weapon is daggers",
    );
    expect(weaponWarning(skill("warrior.distracting-blow"), ["unarmed"])?.title).toBe(
      "Needs a melee weapon — you have no weapon",
    );
  });

  it("clears when the weapon fits, and never warns for a skill that is no attack", () => {
    expect(weaponWarning(skill("warrior.swift-chop"), ["axe"])).toBeUndefined();
    expect(weaponWarning(skill("ranger.barrage"), ["hornbow"])).toBeUndefined();
    expect(weaponWarning(skill("warrior.distracting-blow"), ["spear"])).toBeUndefined();
    expect(weaponWarning(skill("elementalist.fireball"), ["unarmed"])).toBeUndefined();
  });

  it("is quiet when any carried set wields it, and names set 1 when none does (#489)", () => {
    expect(weaponWarning(skill("warrior.swift-chop"), ["sword", "axe"])).toBeUndefined();
    expect(weaponWarning(skill("warrior.swift-chop"), ["sword", "daggers"])?.title).toBe(
      "Needs an axe — your weapon is a sword",
    );
  });
});

describe("loadCode (#2004)", () => {
  const problems = (text: string) => {
    const loaded = loadCode(text, "c1", 1);
    return loaded.ok ? [] : loaded.problems;
  };

  it("loads a GW1 template code, trimmed, as a character of the editor's", () => {
    // Warrior/Monk, Swift Chop and Orison of Healing (gw1-template.test.ts).
    const loaded = loadCode("  OUwQEROqaGBAAAAAAAAA\n", "c1", 1);
    expect(loaded).toMatchObject({
      ok: true,
      character: { id: "c1", name: "Warrior/Monk build", primaryProfession: "warrior" },
      missingSkills: [],
    });
  });

  it("loads a VibeWars build line too", () => {
    const line = exportBuild({ ...newCharacter("other"), name: "Sent" });
    expect(loadCode(line, "c1", 1)).toMatchObject({
      ok: true,
      character: { id: "c1", name: "Sent" },
    });
  });

  it("says why it loads nothing: empty, a team code, not a code", () => {
    expect(problems("  ")).toEqual(["Paste a code first."]);
    expect(problems(`{"format":"${TEAM_FORMAT}"}`)).toEqual([
      "That is a team code. Load it on Team Builder.",
    ]);
    expect(problems("gg, well played")).toEqual(["That is not a GW1 template code."]);
  });

  it("lists an illegal build's problems, as a paste's toast does", () => {
    const orphaned = exportBuild({
      ...newCharacter("other"),
      primaryProfession: "warrior",
      secondaryProfession: undefined,
      skillBar: ["monk.orison-of-healing", null, null, null, null, null, null, null],
    });
    expect(problems(orphaned).join()).toContain("Orison of Healing is a Monk skill");
  });
});
