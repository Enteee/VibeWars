import { describe, expect, it } from "vitest";

import { totalCost } from "./attributes.js";
import { SKILL_BAR_SLOTS, validatePlayerBuild } from "./build.js";
import { wieldsFor } from "./equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import { skillRoles } from "./skills/roles.js";
import { STARTER_TEAMS, pickStarterTeam } from "./starter-teams.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

/** A job title as a character name: capitalised words, short enough for a name plate. */
const NAME = /^[A-Z][a-z]+( [A-Z][a-z]+)+$/;
const NAME_MAX_LENGTH = 20;

describe("STARTER_TEAMS (#2035)", () => {
  it("are four teams of 4 and two of 8", () => {
    const sizes = STARTER_TEAMS.map((team) => team.members.length);
    expect(sizes.filter((size) => size === 4)).toHaveLength(4);
    expect(sizes.filter((size) => size === 8)).toHaveLength(2);
  });

  it("have unique names", () => {
    const names = STARTER_TEAMS.map((team) => team.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const team of STARTER_TEAMS) {
    describe(team.name, () => {
      it("names each member once, by its job", () => {
        const names = team.members.map((member) => member.name);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) {
          expect(name).toMatch(NAME);
          expect(name.length, name).toBeLessThanOrEqual(NAME_MAX_LENGTH);
        }
      });

      it("has a healer", () => {
        const heals = team.members.some((member) =>
          member.build.skillBar.some((id) => {
            const skill = id === null ? undefined : getSkill(id);
            return skill !== undefined && skillRoles(skill).includes("healing");
          }),
        );
        expect(heals).toBe(true);
      });

      for (const member of team.members) {
        describe(member.name, () => {
          const { build } = member;

          it("is legal and spends every attribute point", () => {
            expect(validatePlayerBuild(build, RULES)).toEqual([]);
            expect(totalCost(build.attributes)).toBe(RULES.attributePointBudget);
          });

          it("fills all eight slots with catalog skills, at most one elite", () => {
            expect(build.skillBar).toHaveLength(SKILL_BAR_SLOTS);
            for (const id of build.skillBar) {
              expect(id !== null && getSkill(id) !== undefined, String(id)).toBe(true);
            }
            const elites = build.skillBar.filter(
              (id) => id !== null && getSkill(id)?.elite === true,
            );
            expect(elites.length).toBeLessThanOrEqual(1);
          });

          it("can use every attack skill on its bar with its weapon", () => {
            const weapon = build.equipment.weaponSets[0].mainHand.weaponId;
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
  }
});

describe("pickStarterTeam (#2035)", () => {
  it("picks the first at 0 and the last just under 1", () => {
    expect(pickStarterTeam(() => 0)).toBe(STARTER_TEAMS[0]);
    expect(pickStarterTeam(() => 0.9999999)).toBe(STARTER_TEAMS[STARTER_TEAMS.length - 1]);
  });

  it("never picks the team it is told not to, by name", () => {
    for (const team of STARTER_TEAMS) {
      const not = { ...team, members: [] };
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.9999999]) {
        expect(pickStarterTeam(() => r, not).name).not.toBe(team.name);
      }
    }
  });

  it("reaches every team from a seeded random", () => {
    let seed = 2035;
    // A small LCG: deterministic, and spread enough over [0, 1).
    const random = (): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(pickStarterTeam(random).name);
    }
    expect([...seen].sort()).toEqual(STARTER_TEAMS.map((team) => team.name).sort());
  });
});
