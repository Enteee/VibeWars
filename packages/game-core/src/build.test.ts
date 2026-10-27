import { describe, expect, it } from "vitest";

import {
  ONE_ELITE_PER_BAR,
  defaultBuildEquipment,
  validatePlayerBuild,
  type PlayerBuild,
  type SkillBar,
} from "./build.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

/** A warrior/ranger, so all three of today's elites are reachable. */
function withBar(...skills: string[]): PlayerBuild {
  const skillBar: SkillBar = [...skills, ...Array<null>(8 - skills.length).fill(null)];
  return {
    name: "Elite Tester",
    primaryProfession: "warrior",
    secondaryProfession: "ranger",
    attributes: [],
    skillBar,
    equipment: defaultBuildEquipment("warrior"),
  };
}

function eliteProblems(build: PlayerBuild): string[] {
  return validatePlayerBuild(build, RULES)
    .map((problem) => problem.message)
    .filter((message) => message === ONE_ELITE_PER_BAR);
}

describe("one elite per bar (#459)", () => {
  it("allows a bar with no elite, an empty bar and exactly one elite", () => {
    expect(validatePlayerBuild(withBar("warrior.sprint", "ranger.troll-unguent"), RULES)).toEqual(
      [],
    );
    expect(validatePlayerBuild(withBar(), RULES)).toEqual([]);
    expect(validatePlayerBuild(withBar("ranger.barrage", "warrior.sprint"), RULES)).toEqual([]);
  });

  it("reports two or more elites once, in GW1's words", () => {
    expect(ONE_ELITE_PER_BAR).toBe("Only one elite skill per bar");
    expect(
      validatePlayerBuild(withBar("ranger.barrage", "ranger.broad-head-arrow"), RULES),
    ).toEqual([{ field: "skillBar", message: ONE_ELITE_PER_BAR }]);
    expect(
      eliteProblems(withBar("ranger.barrage", "ranger.broad-head-arrow", "warrior.backbreaker")),
    ).toEqual([ONE_ELITE_PER_BAR]);
  });

  it("reports the same elite twice as a duplicate, not as two elites", () => {
    const problems = validatePlayerBuild(withBar("ranger.barrage", "ranger.barrage"), RULES);
    expect(problems.map((problem) => problem.message)).toEqual([
      "ranger.barrage appears more than once on the bar",
    ]);
  });

  it("still counts two different elites when one of them is also duplicated", () => {
    const problems = validatePlayerBuild(
      withBar("ranger.barrage", "ranger.barrage", "warrior.backbreaker"),
      RULES,
    ).map((problem) => problem.message);
    expect(problems).toContain("ranger.barrage appears more than once on the bar");
    expect(problems).toContain(ONE_ELITE_PER_BAR);
  });
});

describe("the staples of #522 are legal for their professions", () => {
  const build = (primary: PlayerBuild["primaryProfession"], ...skills: string[]): PlayerBuild => ({
    ...withBar(...skills),
    primaryProfession: primary,
    secondaryProfession: undefined,
    equipment: defaultBuildEquipment(primary),
  });

  it.each([
    ["assassin", "assassin.jagged-strike"],
    ["warrior", "warrior.sever-artery", "warrior.eviscerate", "warrior.executioners-strike"],
    ["ranger", "ranger.punishing-shot", "ranger.throw-dirt"],
    ["necromancer", "necromancer.enfeebling-blood"],
  ] as const)("a %s with its new skills", (primary, ...skills) => {
    expect(validatePlayerBuild(build(primary, ...skills), RULES)).toEqual([]);
  });

  it("a monk may not take Jagged Strike", () => {
    expect(validatePlayerBuild(build("monk", "assassin.jagged-strike"), RULES)).not.toEqual([]);
  });
});
