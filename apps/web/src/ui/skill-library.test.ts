import { IMPLEMENTED_SKILLS, describeSkill, getSkill, type SkillType } from "@vibewars/game-core";
import { corpusSkills, type CorpusSkill } from "@vibewars/game-data/corpus";
import { describe, expect, it } from "vitest";

import {
  corpusByAccess,
  corpusCastText,
  corpusCostText,
  corpusRechargeText,
  filterCorpus,
  filterEliteSkills,
  filterSkillsByText,
  filterSkillsByType,
  groupSkillsByAttribute,
  lockedSkills,
  missingFromCatalog,
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

describe("lockedSkills (#568)", () => {
  it("lists every skill of a profession you do not have, and none of yours", () => {
    const locked = lockedSkills(IMPLEMENTED_SKILLS, "elementalist", "monk");
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.length).toBe(
      IMPLEMENTED_SKILLS.filter(
        (s) =>
          s.profession !== "elementalist" && s.profession !== "monk" && s.profession !== "common",
      ).length,
    );
    expect(locked.some((skill) => skill.profession === "ranger")).toBe(true);
    expect(locked.some((skill) => ["elementalist", "monk"].includes(skill.profession))).toBe(false);
  });

  it("locks the secondary's skills too once there is none, in catalogue order", () => {
    const locked = lockedSkills(IMPLEMENTED_SKILLS, "elementalist", undefined);
    expect(locked.some((skill) => skill.profession === "monk")).toBe(true);
    const order = IMPLEMENTED_SKILLS.filter((skill) => locked.includes(skill));
    expect(locked).toEqual(order);
  });

  it("never locks a Common skill, and groups it as No Attribute (Common) (#474)", () => {
    for (const primary of ["warrior", "monk", "dervish"] as const) {
      expect(
        lockedSkills(IMPLEMENTED_SKILLS, primary, undefined).some(
          (skill) => skill.id === "common.resurrection-signet",
        ),
      ).toBe(false);
    }
    const group = groupSkillsByAttribute(IMPLEMENTED_SKILLS).find((each) =>
      each.skills.some((skill) => skill.id === "common.resurrection-signet"),
    );
    expect(group?.attributeName).toBe("No Attribute (Common)");
  });

  it("goes through the search and type filters like the rest of the library", () => {
    const locked = filterSkillsByText(
      lockedSkills(IMPLEMENTED_SKILLS, "warrior", undefined),
      "arrow",
    );
    expect(locked.length).toBeGreaterThan(0);
    expect(locked.every((skill) => skill.profession !== "warrior")).toBe(true);
  });
});

describe("the GW1 skills not in the game yet (#1220)", () => {
  const corpusSkill = (
    overrides: Partial<CorpusSkill> & Pick<CorpusSkill, "gwId">,
  ): CorpusSkill => ({
    name: `GW1 skill ${String(overrides.gwId)}`,
    description: "Spell. Does a thing.",
    profession: "elementalist",
    attributeId: "elementalist.fire-magic",
    typeText: "Spell",
    skillType: "spell",
    elite: false,
    energy: 10,
    adrenaline: 0,
    sacrifice: 0,
    upkeep: 0,
    activation: 2,
    recharge: 8,
    ...overrides,
  });

  it("leaves out every one the catalog has, by GW1 id", () => {
    const missing = missingFromCatalog(corpusSkills(), IMPLEMENTED_SKILLS);
    const have = new Set(IMPLEMENTED_SKILLS.map((skill) => skill.gwId));
    expect(missing.length).toBeGreaterThan(1000);
    expect(missing.some((skill) => have.has(skill.gwId))).toBe(false);
    expect(missing.find((skill) => skill.name === "Fireball")).toBeUndefined();
  });

  it("joins its attribute's group after the playable skills; an attribute only it has comes last", () => {
    const flare = corpusSkill({ gwId: 9001 });
    const water = corpusSkill({ gwId: 9002, attributeId: "elementalist.water-magic" });
    const common = corpusSkill({ gwId: 9003, profession: "common", attributeId: undefined });
    const groups = groupSkillsByAttribute(
      skills("elementalist.fireball", "monk.orison-of-healing"),
      [flare, water, common],
    );
    expect(
      groups.map((group) => [group.attributeName, group.skills.length, group.corpus.length]),
    ).toEqual([
      ["Fire Magic", 1, 1],
      ["Healing Prayers", 1, 0],
      ["Water Magic", 0, 1],
      ["No Attribute (Common)", 0, 1],
    ]);
  });

  it("is found by name and by GW1's text, case-insensitively", () => {
    const meteor = corpusSkill({ gwId: 9001, name: "Meteor", description: "Knocks down." });
    const other = corpusSkill({ gwId: 9002 });
    const none = new Set<SkillType>();
    expect(filterCorpus([meteor, other], " METEOR ", none, false)).toEqual([meteor]);
    expect(filterCorpus([meteor, other], "knocks", none, false)).toEqual([meteor]);
    expect(filterCorpus([meteor, other], "", none, false)).toEqual([meteor, other]);
  });

  it("is under its type's chip, and one of a type this game lacks only with none on", () => {
    const hex = corpusSkill({ gwId: 9001, typeText: "Hex Spell", skillType: "hex" });
    const echo = corpusSkill({ gwId: 9002, typeText: "Echo", skillType: undefined });
    expect(filterCorpus([hex, echo], "", new Set<SkillType>(["hex"]), false)).toEqual([hex]);
    expect(filterCorpus([hex, echo], "", new Set<SkillType>(), false)).toEqual([hex, echo]);
  });

  it("follows the elite toggle", () => {
    const elite = corpusSkill({ gwId: 9001, elite: true });
    expect(filterCorpus([elite, corpusSkill({ gwId: 9002 })], "", new Set(), true)).toEqual([
      elite,
    ]);
  });

  it("is open for your professions and Common, locked for the rest", () => {
    const fire = corpusSkill({ gwId: 9001 });
    const common = corpusSkill({ gwId: 9002, profession: "common", attributeId: undefined });
    const warrior = corpusSkill({ gwId: 9003, profession: "warrior" });
    expect(corpusByAccess([fire, common, warrior], "elementalist", "monk")).toEqual({
      open: [fire, common],
      locked: [warrior],
    });
  });

  it("reads its cost, cast and recharge from GW1's numbers", () => {
    expect(corpusCostText(corpusSkill({ gwId: 1 }))).toBe("10 energy");
    expect(corpusCostText(corpusSkill({ gwId: 1, energy: 0, adrenaline: 6 }))).toBe("6 adrenaline");
    expect(corpusCostText(corpusSkill({ gwId: 1, energy: 5, sacrifice: 17 }))).toBe(
      "5 energy, 17% Health",
    );
    expect(corpusCostText(corpusSkill({ gwId: 1, energy: 0 }))).toBe("Free");
    expect(corpusCastText(corpusSkill({ gwId: 1, activation: 0.25 }))).toBe("0.25s");
    expect(corpusCastText(corpusSkill({ gwId: 1, activation: 0 }))).toBe("Instant");
    expect(corpusRechargeText(corpusSkill({ gwId: 1, recharge: 0 }))).toBe("None");
  });
});
