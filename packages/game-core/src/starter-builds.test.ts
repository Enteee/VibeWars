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

describe("STARTER_BUILDS (#852, #2554)", () => {
  it("are the PvX builds, named <PvX name> (<Primary>/<Secondary>)", () => {
    expect(STARTER_BUILDS.length).toBeGreaterThan(50);
    for (const build of STARTER_BUILDS) {
      const professions = [build.primaryProfession, build.secondaryProfession]
        .flatMap((profession) =>
          profession === undefined ? [] : [PROFESSIONS[profession].abbreviation],
        )
        .join("/");
      expect(build.name).toMatch(new RegExp(` \\(${professions}\\)$`));
    }
  });

  for (const build of STARTER_BUILDS) {
    describe(build.name, () => {
      it("is legal", () => {
        expect(validatePlayerBuild(build, RULES)).toEqual([]);
      });

      it("wears headgear of an attribute, the head rune's (#1140)", () => {
        const { head } = build.equipment.armor;
        expect(head.headgearAttributeId).not.toBeNull();
        expect(head.rune?.kind === "attribute" ? head.rune.attributeId : undefined).toBe(
          head.headgearAttributeId,
        );
      });

      it("spends no more attribute points than a build has", () => {
        expect(totalCost(build.attributes)).toBeLessThanOrEqual(RULES.attributePointBudget);
      });

      it("has eight slots of skills the engine runs or empty, at most one elite", () => {
        expect(build.skillBar).toHaveLength(SKILL_BAR_SLOTS);
        for (const id of build.skillBar) {
          expect(id === null || IMPLEMENTED.has(id), String(id)).toBe(true);
        }
        const elites = build.skillBar.filter((id) => id !== null && getSkill(id)?.elite === true);
        expect(elites.length).toBeLessThanOrEqual(1);
      });

      it("can use every attack skill on its bar with one of its weapons", () => {
        const weapons = build.equipment.weaponSets.flatMap((set) =>
          set === null ? [] : [set.mainHand.weaponId],
        );
        for (const id of build.skillBar) {
          const rule = id === null ? undefined : getSkill(id)?.attack;
          if (rule !== undefined) {
            expect(
              weapons.some((weapon) => wieldsFor(weapon, rule.weapon)),
              `${String(id)} with ${weapons.join()}`,
            ).toBe(true);
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

  it("never picks the professions it is told not to, whatever the name (#1149)", () => {
    for (const build of STARTER_BUILDS) {
      const not = { ...build, name: "Kaelen Ashvale" };
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.9999999]) {
        const picked = pickStarterBuild(() => r, not);
        expect([picked.primaryProfession, picked.secondaryProfession]).not.toEqual([
          not.primaryProfession,
          not.secondaryProfession,
        ]);
      }
    }
  });

  it("still picks a build when the one it is told not to is the only one", () => {
    const only = STARTER_BUILDS.slice(0, 1);
    expect(pickBuildFrom(only, () => 0.5, only[0])).toBe(only[0]);
  });
});
