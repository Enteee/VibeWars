import { describe, expect, it } from "vitest";

import { MAX_ATTRIBUTE_RANK, MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";

import { SKILL_BAR_SLOTS } from "../storage/build-validation.js";
import {
  canRaise,
  newCharacter,
  remainingPoints,
  setProfessions,
  setRank,
  setSkill,
} from "./build-editor.js";

/**
 * The editor's *rules* are tested here; its DOM rendering is covered by
 * the browser tests. Keeping the rules as pure functions is what makes
 * that split possible.
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
    // Spend almost everything across several attributes, then check the
    // editor will not let the player overspend.
    let character = newCharacter("c1");
    character = setProfessions(character, "warrior", "monk");
    character = setRank(character, "warrior.strength", MAX_ATTRIBUTE_RANK);
    character = setRank(character, "warrior.axe-mastery", MAX_ATTRIBUTE_RANK);
    character = setRank(character, "warrior.swordsmanship", MAX_ATTRIBUTE_RANK);

    const before = remainingPoints(character);
    expect(before).toBeLessThan(cumulativeNextRankCost());
    expect(canRaise(character, "warrior.tactics")).toBe(false);
  });

  function cumulativeNextRankCost(): number {
    // Cost of a 12th rank, the most expensive single step.
    return MAX_ATTRIBUTE_RANK;
  }
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
