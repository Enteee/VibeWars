import { describe, expect, it } from "vitest";

import { SKILL_BAR_SLOTS, validatePlayerBuild } from "./build.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";
import { getSkill } from "./skills/catalog.js";
import { STARTER_TEAMS, pickStarterTeam } from "./starter-teams.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

describe("STARTER_TEAMS (#2035, #2555)", () => {
  it("are teams of 2, 4 or 8, a size Team Builder offers (#2109)", () => {
    expect(STARTER_TEAMS.length).toBeGreaterThan(0);
    for (const team of STARTER_TEAMS) {
      expect([2, 4, 8], team.name).toContain(team.members.length);
    }
  });

  it("have unique names", () => {
    const names = STARTER_TEAMS.map((team) => team.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const team of STARTER_TEAMS) {
    describe(team.name, () => {
      it("names each member once", () => {
        const names = team.members.map((member) => member.name);
        expect(new Set(names).size).toBe(names.length);
      });

      for (const member of team.members) {
        it(`${member.name} is legal, its eight slots catalog skills`, () => {
          const { build } = member;
          expect(validatePlayerBuild(build, RULES)).toEqual([]);
          expect(build.skillBar).toHaveLength(SKILL_BAR_SLOTS);
          for (const id of build.skillBar) {
            expect(id === null || getSkill(id) !== undefined, String(id)).toBe(true);
          }
        });
      }
    });
  }
});

describe("pickStarterTeam (#2035)", () => {
  const EIGHTS = STARTER_TEAMS.filter((team) => team.members.length === 8);

  it("picks the first of the size at 0 and the last just under 1", () => {
    expect(pickStarterTeam(() => 0, 8)).toBe(EIGHTS[0]);
    expect(pickStarterTeam(() => 0.9999999, 8)).toBe(EIGHTS[EIGHTS.length - 1]);
  });

  it("never picks the team it is told not to, by name, but always one", () => {
    for (const team of STARTER_TEAMS) {
      const not = { name: team.name };
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.9999999]) {
        const next = pickStarterTeam(() => r, team.members.length, not);
        expect(next?.members).toHaveLength(team.members.length);
        expect(next?.name).not.toBe(team.name);
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
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 200; i += 1) {
      for (const size of new Set(STARTER_TEAMS.map((team) => team.members.length))) {
        seen.add(pickStarterTeam(random, size)?.name);
      }
    }
    expect([...seen].sort()).toEqual(STARTER_TEAMS.map((team) => team.name).sort());
  });
});
