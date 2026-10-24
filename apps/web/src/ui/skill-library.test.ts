import { IMPLEMENTED_SKILLS, getSkill } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { filterSkillsByName, groupSkillsByAttribute } from "./skill-library.js";

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

describe("filterSkillsByName", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterSkillsByName(IMPLEMENTED_SKILLS, "")).toHaveLength(IMPLEMENTED_SKILLS.length);
    expect(filterSkillsByName(IMPLEMENTED_SKILLS, "   ")).toHaveLength(IMPLEMENTED_SKILLS.length);
  });

  it("matches a substring, not just a prefix", () => {
    // Players search for "arrow" or "heal" far more than a skill's
    // opening letters.
    const matched = filterSkillsByName(IMPLEMENTED_SKILLS, "arrow");

    expect(matched.length).toBeGreaterThan(0);
    for (const skill of matched) {
      expect(skill.name.toLowerCase()).toContain("arrow");
    }
  });

  it("ignores case and surrounding whitespace", () => {
    const lower = filterSkillsByName(IMPLEMENTED_SKILLS, "fireball");
    const shouty = filterSkillsByName(IMPLEMENTED_SKILLS, "  FIREBALL ");

    expect(shouty).toEqual(lower);
    expect(lower.length).toBe(1);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filterSkillsByName(IMPLEMENTED_SKILLS, "zzzz")).toEqual([]);
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
