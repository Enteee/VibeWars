import { describe, expect, it } from "vitest";

import { totalCost } from "./attributes.js";
import { SKILL_BAR_SLOTS, validatePlayerBuild } from "./build.js";
import { wieldsFor } from "./equipment/weapons.js";
import { PROFESSIONS } from "./professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./skills/catalog.js";
import { STARTER_BUILDS, pickStarterBuild } from "./starter-builds.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;
const IMPLEMENTED = new Set(IMPLEMENTED_SKILLS.map((skill) => skill.id));

describe("STARTER_BUILDS (#852)", () => {
  it("has five builds", () => {
    expect(STARTER_BUILDS).toHaveLength(5);
  });

  for (const build of STARTER_BUILDS) {
    describe(build.name, () => {
      it("is a legal build", () => {
        expect(validatePlayerBuild(build, RULES)).toEqual([]);
      });

      it("has two professions and is named after them", () => {
        expect(build.secondaryProfession).toBeDefined();
        expect(build.secondaryProfession).not.toBe(build.primaryProfession);
        const secondary = build.secondaryProfession ?? build.primaryProfession;
        expect(build.name).toBe(
          `${PROFESSIONS[build.primaryProfession].name}/${PROFESSIONS[secondary].name}`,
        );
      });

      it("fills all eight slots with implemented skills, at most one elite", () => {
        expect(build.skillBar).toHaveLength(SKILL_BAR_SLOTS);
        for (const id of build.skillBar) {
          expect(id !== null && IMPLEMENTED.has(id), String(id)).toBe(true);
        }
        const elites = build.skillBar.filter((id) => id !== null && getSkill(id)?.elite === true);
        expect(elites.length).toBeLessThanOrEqual(1);
      });

      it("spends every attribute point", () => {
        expect(totalCost(build.attributes)).toBe(RULES.attributePointBudget);
      });

      it("can use every attack skill on its bar with its weapon", () => {
        const weapon = build.equipment.mainHand.weaponId;
        for (const id of build.skillBar) {
          const rule = id === null ? undefined : getSkill(id)?.attack;
          if (rule !== undefined) {
            expect(wieldsFor(weapon, rule.weapon), `${String(id)} with ${weapon}`).toBe(true);
          }
        }
      });
    });
  }

  it("has a different primary for every build, and one Monk", () => {
    const primaries = STARTER_BUILDS.map((build) => build.primaryProfession);
    expect(new Set(primaries).size).toBe(primaries.length);
    expect(primaries).toContain("monk");
  });

  it("names every build differently", () => {
    const names = STARTER_BUILDS.map((build) => build.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("pickStarterBuild (#852)", () => {
  it("picks the first at 0 and the last just under 1", () => {
    expect(pickStarterBuild(() => 0)).toBe(STARTER_BUILDS[0]);
    expect(pickStarterBuild(() => 0.9999)).toBe(STARTER_BUILDS.at(-1));
  });

  it("never returns the build it is told not to", () => {
    for (const not of STARTER_BUILDS) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
        expect(pickStarterBuild(() => r, not).name).not.toBe(not.name);
      }
    }
  });

  it("still returns a build when the one excluded is the only one", () => {
    const [only] = STARTER_BUILDS;
    if (only === undefined) {
      throw new Error("no starter builds");
    }
    expect(pickStarterBuild(() => 0.5, only, [only])).toBe(only);
  });
});
