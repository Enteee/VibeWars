import { describe, expect, it } from "vitest";

import { PLAN_SECONDS, teamPlan } from "./plan.js";

const SEEDS = [1, 42, 0xdead_beef, 20_261_122];
const PHASES = 1000;

/** Team `team`'s plan in each of the first `PHASES` phases under `seed`. */
function plans(seed: number, team: number): string[] {
  return Array.from({ length: PHASES }, (_, phase) =>
    teamPlan(seed, team, phase * PLAN_SECONDS + PLAN_SECONDS / 2),
  );
}

describe("teamPlan (#3831)", () => {
  it("gives the same plan for the same seed, team and second", () => {
    expect(plans(7, 1)).toEqual(plans(7, 1));
  });

  it("keeps one plan through a phase", () => {
    for (const seed of SEEDS) {
      for (let phase = 0; phase < 50; phase += 1) {
        const start = teamPlan(seed, 0, phase * PLAN_SECONDS);
        expect(teamPlan(seed, 0, (phase + 1) * PLAN_SECONDS - 0.01)).toBe(start);
      }
    }
  });

  it("pushes in phase 0", () => {
    for (const seed of SEEDS) {
      for (const team of [0, 1, 2]) {
        expect(teamPlan(seed, team, 0)).toBe("push");
        expect(teamPlan(seed, team, PLAN_SECONDS - 0.01)).toBe("push");
      }
    }
  });

  it("never holds two phases running", () => {
    for (const seed of SEEDS) {
      for (const team of [0, 1]) {
        const each = plans(seed, team);
        for (let phase = 1; phase < PHASES; phase += 1) {
          expect(each[phase - 1] === "hold" && each[phase] === "hold").toBe(false);
        }
      }
    }
  });

  it("holds about 0.4/1.4 of phases", () => {
    for (const seed of SEEDS) {
      const held = plans(seed, 1).filter((plan) => plan === "hold").length / PHASES;
      expect(held).toBeGreaterThanOrEqual(0.2);
      expect(held).toBeLessThanOrEqual(0.38);
    }
  });

  it("rolls each team on its own", () => {
    expect(plans(42, 0)).not.toEqual(plans(42, 1));
  });
});
