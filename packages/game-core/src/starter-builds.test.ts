import { describe, expect, it } from "vitest";

import { totalCost } from "./attributes.js";
import { SKILL_BAR_SLOTS, validatePlayerBuild } from "./build.js";
import { wieldsFor } from "./equipment/weapons.js";
import { PROFESSIONS } from "./professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./skills/catalog.js";
import { STARTER_BUILDS, pickBuildFrom, pickStarterBuild } from "./starter-builds.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;
const IMPLEMENTED = new Set(IMPLEMENTED_SKILLS.map((skill) => skill.id));

describe("STARTER_BUILDS (#852)", () => {
  it("are five, of five different primaries, one a Monk", () => {
    expect(STARTER_BUILDS).toHaveLength(5);
    const primaries = STARTER_BUILDS.map((build) => build.primaryProfession);
    expect(new Set(primaries).size).toBe(primaries.length);
    expect(primaries).toContain("monk");
  });

  it("are named <Primary>/<Secondary>, each name once", () => {
    for (const build of STARTER_BUILDS) {
      const secondary = build.secondaryProfession;
      expect(secondary, build.name).toBeDefined();
      if (secondary !== undefined) {
        expect(build.name).toBe(
          `${PROFESSIONS[build.primaryProfession].name}/${PROFESSIONS[secondary].name}`,
        );
      }
    }
    const names = STARTER_BUILDS.map((build) => build.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const build of STARTER_BUILDS) {
    describe(build.name, () => {
      it("is legal", () => {
        expect(validatePlayerBuild(build, RULES)).toEqual([]);
      });

      it("spends every attribute point", () => {
        expect(totalCost(build.attributes)).toBe(RULES.attributePointBudget);
      });

      it("fills all eight slots with skills the engine runs, at most one elite", () => {
        expect(build.skillBar).toHaveLength(SKILL_BAR_SLOTS);
        for (const id of build.skillBar) {
          expect(id !== null && IMPLEMENTED.has(id), String(id)).toBe(true);
        }
        const elites = build.skillBar.filter((id) => id !== null && getSkill(id)?.elite === true);
        expect(elites.length).toBeLessThanOrEqual(1);
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
});

describe("pickStarterBuild (#852)", () => {
  it("picks the first at 0 and the last just under 1", () => {
    expect(pickStarterBuild(() => 0)).toBe(STARTER_BUILDS[0]);
    expect(pickStarterBuild(() => 0.9999999)).toBe(STARTER_BUILDS[STARTER_BUILDS.length - 1]);
  });

  it("never picks the build it is told not to", () => {
    for (const not of STARTER_BUILDS) {
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.9999999]) {
        expect(pickStarterBuild(() => r, not).name).not.toBe(not.name);
      }
    }
  });

  it("still picks a build when the one it is told not to is the only one", () => {
    const only = STARTER_BUILDS.slice(0, 1);
    expect(pickBuildFrom(only, () => 0.5, only[0])).toBe(only[0]);
  });
});
