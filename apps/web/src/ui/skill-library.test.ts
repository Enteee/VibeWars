import { IMPLEMENTED_SKILLS, describeSkill, getSkill } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  filterEliteSkills,
  filterSkillsByText,
  filterSkillsByType,
  groupSkillsByAttribute,
  skillTypesOf,
} from "./skill-library.js";

/**
 * The library's filtering and grouping, tested without a DOM — the same
 * split the renderer uses elsewhere, so the behaviour a player depends
 * on is verifiable without a browser.
 */

function skills(...ids: string[]) {
  return ids.map((id) => {
    const skill = getSkill(id);
    if (skill === undefined) {
      throw new Error(`${id} is not in the catalog`);
    }
    return skill;
  });
}

describe("filterSkillsByText", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterSkillsByText(IMPLEMENTED_SKILLS, "")).toHaveLength(IMPLEMENTED_SKILLS.length);
    expect(filterSkillsByText(IMPLEMENTED_SKILLS, "   ")).toHaveLength(IMPLEMENTED_SKILLS.length);
  });

  it("matches a substring, not just a prefix", () => {
    // Players search for "arrow" or "heal" far more than a skill's
    // opening letters.
    const matched = filterSkillsByText(IMPLEMENTED_SKILLS, "arrow");

    expect(matched.length).toBeGreaterThan(0);
    for (const skill of matched) {
      expect(skill.name.toLowerCase()).toContain("arrow");
    }
  });

  it("matches the description's text too (#567)", () => {
    const matched = filterSkillsByText(IMPLEMENTED_SKILLS, "knocks down");
    expect(matched.length).toBeGreaterThan(0);
    for (const skill of matched) {
      expect(skill.name.toLowerCase()).not.toContain("knocks down");
      const lines = describeSkill(skill).effects.map((effect) => effect.text.toLowerCase());
      expect(lines.some((line) => line.includes("knocks down"))).toBe(true);
    }
  });

  it("ignores case and surrounding whitespace", () => {
    const lower = filterSkillsByText(IMPLEMENTED_SKILLS, "fireball");
    const shouty = filterSkillsByText(IMPLEMENTED_SKILLS, "  FIREBALL ");

    expect(shouty).toEqual(lower);
    expect(lower.length).toBe(1);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterSkillsByText(IMPLEMENTED_SKILLS, "zzzz")).toEqual([]);
  });
});

describe("groupSkillsByAttribute", () => {
  it("puts every skill in exactly one group", () => {
    const groups = groupSkillsByAttribute(IMPLEMENTED_SKILLS);
    const grouped = groups.flatMap((group) => group.skills);

    expect(grouped).toHaveLength(IMPLEMENTED_SKILLS.length);
    expect(new Set(grouped.map((s) => s.id)).size).toBe(IMPLEMENTED_SKILLS.length);
  });

  it("groups strictly by the attribute that drives the skill", () => {
    for (const group of groupSkillsByAttribute(IMPLEMENTED_SKILLS)) {
      for (const skill of group.skills) {
        expect(skill.attributeId).toBe(group.attributeId);
      }
    }
  });

  it("gives each group a readable attribute name", () => {
    const groups = groupSkillsByAttribute(skills("elementalist.fireball"));

    expect(groups[0]?.attributeName).toBe("Fire Magic");
  });

  it("keeps a stable order so the list does not reshuffle while typing", () => {
    const once = groupSkillsByAttribute(IMPLEMENTED_SKILLS).map((g) => g.attributeId);
    const twice = groupSkillsByAttribute(IMPLEMENTED_SKILLS).map((g) => g.attributeId);

    expect(twice).toEqual(once);
  });

  it("returns no groups for no skills", () => {
    expect(groupSkillsByAttribute([])).toEqual([]);
  });
});

describe("filterSkillsByType (#567)", () => {
  const listed = skills("warrior.backbreaker", "elementalist.fireball", "monk.orison-of-healing");

  it("lists everything with no chip on", () => {
    expect(filterSkillsByType(listed, new Set())).toEqual(listed);
  });

  it("lists the skills of every chip that is on, in order", () => {
    expect(filterSkillsByType(listed, new Set(["spell"])).map((skill) => skill.id)).toEqual([
      "elementalist.fireball",
      "monk.orison-of-healing",
    ]);
    expect(
      filterSkillsByType(listed, new Set(["attack", "spell"])).map((skill) => skill.id),
    ).toEqual(listed.map((skill) => skill.id));
  });

  it("offers a chip only for a type the skills have, in the given order", () => {
    expect(skillTypesOf(listed, ["hex", "spell", "attack"])).toEqual(["spell", "attack"]);
  });
});

describe("filterEliteSkills (#459)", () => {
  it("keeps Barrage, Backbreaker and Broad Head Arrow, and drops Fireball", () => {
    const ids = filterEliteSkills(IMPLEMENTED_SKILLS).map((skill) => skill.id);
    expect(ids).toEqual(
      expect.arrayContaining(["ranger.barrage", "warrior.backbreaker", "ranger.broad-head-arrow"]),
    );
    expect(ids).not.toContain("elementalist.fireball");
  });

  it("keeps the library's order, so the toggle does not reshuffle it", () => {
    const listed = skills("warrior.backbreaker", "elementalist.fireball", "ranger.barrage");
    expect(filterEliteSkills(listed).map((skill) => skill.id)).toEqual([
      "warrior.backbreaker",
      "ranger.barrage",
    ]);
  });
});
