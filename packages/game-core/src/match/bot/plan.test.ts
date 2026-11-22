import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../vec2.js";
import {
  FLANK_SWING,
  PLAN_SECONDS,
  flankParty,
  flankWaypoint,
  planPhase,
  teamPlan,
} from "./plan.js";
import { roleOf } from "./role.js";
import { MONK, WARRIOR, contextFor, fighter, match } from "./rules/test-support.js";

const SEEDS = [1, 42, 0xdead_beef, 20_261_122];
const PHASES = 1000;

/** Team `team`'s plan in each of the first `PHASES` phases under `seed`. */
function plans(seed: number, team: number): string[] {
  return Array.from({ length: PHASES }, (_, phase) =>
    teamPlan(seed, team, phase * PLAN_SECONDS + PLAN_SECONDS / 2),
  );
}

describe("teamPlan (#3831, #3832)", () => {
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

  it("never plays two phases running other than push", () => {
    for (const seed of SEEDS) {
      for (const team of [0, 1]) {
        const each = plans(seed, team);
        for (let phase = 1; phase < PHASES; phase += 1) {
          expect(each[phase - 1] !== "push" && each[phase] !== "push").toBe(false);
        }
      }
    }
  });

  it("holds about 0.3/1.5 of phases and flanks about 0.2/1.5", () => {
    for (const seed of SEEDS) {
      const each = plans(seed, 1);
      const share = (plan: string): number =>
        each.filter((other) => other === plan).length / PHASES;
      expect(share("hold")).toBeGreaterThanOrEqual(0.14);
      expect(share("hold")).toBeLessThanOrEqual(0.3);
      expect(share("flank")).toBeGreaterThanOrEqual(0.08);
      expect(share("flank")).toBeLessThanOrEqual(0.22);
    }
  });

  it("rolls each team on its own", () => {
    expect(plans(42, 0)).not.toEqual(plans(42, 1));
  });
});

describe("the flank party (#3832)", () => {
  /** A team-0 bot team of `builds`, one foe far to the east. */
  function team(...builds: (typeof WARRIOR)[]) {
    return match([
      ...builds.map((build, index) =>
        fighter(`m${String(index)}`, 0, build, vec2(100, 300 + 40 * index)),
      ),
      fighter("foe", 1, WARRIOR, vec2(1100, 400)),
    ]);
  }

  /** Who flanks in `phase`. */
  function party(sim: ReturnType<typeof match>, phase: number): string[] {
    const context = contextFor(sim, "m0");
    return context.participants
      .filter((other) => other.combatant.team === 0 && flankParty(context, other, phase))
      .map((other) => other.id);
  }

  it("is max(1, floor(n/2)) of the team's bots, and nobody on a team of one", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 8]) {
      const sim = team(...Array.from({ length: n }, () => WARRIOR));
      for (let phase = 1; phase < 20; phase += 1) {
        expect(party(sim, phase)).toHaveLength(n === 1 ? 0 : Math.max(1, Math.floor(n / 2)));
      }
    }
  });

  it("is the same for the same phase and differs between phases", () => {
    const sim = team(WARRIOR, WARRIOR, WARRIOR, WARRIOR, WARRIOR, WARRIOR);
    expect(party(sim, 3)).toEqual(party(sim, 3));
    const all = new Set(Array.from({ length: 20 }, (_, phase) => party(sim, phase).join()));
    expect(all.size).toBeGreaterThan(1);
  });

  it("takes no healer while a non-healer is left", () => {
    const two = team(MONK, WARRIOR, MONK, WARRIOR);
    const one = team(MONK, WARRIOR, MONK, MONK);
    expect(roleOf(contextFor(two, "m0").self)).toBe("healer");
    for (let phase = 1; phase < 30; phase += 1) {
      expect(party(two, phase).sort()).toEqual(["m1", "m3"]);
      const mixed = party(one, phase);
      expect(mixed).toHaveLength(2);
      expect(mixed).toContain("m1");
    }
  });

  it("is nobody on a team with a human", () => {
    const sim = team(WARRIOR, WARRIOR, WARRIOR, WARRIOR);
    const context = contextFor(sim, "m0", { isBot: (id) => id !== "m3" });
    for (const other of context.participants) {
      expect(flankParty(context, other, 1)).toBe(false);
    }
  });
});

describe("flankWaypoint (#3832)", () => {
  // Team 0 starts round (100,500), team 1 round (1100,500): 1000 apart,
  // so the waypoint is 600 along and 350 to one side.
  const sim = match([
    fighter("bot", 0, WARRIOR, vec2(100, 400)),
    fighter("mate", 0, WARRIOR, vec2(100, 600)),
    fighter("foe-a", 1, WARRIOR, vec2(1100, 400)),
    fighter("foe-b", 1, WARRIOR, vec2(1100, 600)),
  ]);
  const north = vec2(700, 500 - 1000 * FLANK_SWING);
  const south = vec2(700, 500 + 1000 * FLANK_SWING);
  const waypoint = (extra: Parameters<typeof contextFor>[2] = {}) => {
    const context = contextFor(sim, "bot", extra);
    return flankWaypoint(context, context.self, 1);
  };

  it("swings to one side of the line between the spawns, on the spawn's layer", () => {
    const at = waypoint();
    expect(at?.layer).toBe(0);
    const point = at?.point ?? vec2(0, 0);
    expect(Math.min(distance(point, north), distance(point, south))).toBeLessThan(1e-9);
  });

  it("rolls the side per phase, both sides over a match", () => {
    const sides = new Set(
      Array.from(
        { length: 20 },
        (_, phase) => waypoint({ now: phase * PLAN_SECONDS + 1 })?.point.y,
      ),
    );
    expect(sides).toEqual(new Set([north.y, south.y]));
    expect(planPhase(PLAN_SECONDS * 3 + 1)).toBe(3);
  });

  it("takes the other side where the rolled one has no route, then none", () => {
    const blocked = (side: Vec2) => (to: Vec2) =>
      distance(to, side) < 1 ? Number.POSITIVE_INFINITY : 1;
    for (let phase = 0; phase < 10; phase += 1) {
      const now = phase * PLAN_SECONDS + 1;
      expect(waypoint({ now, routeLength: blocked(north) })?.point).toEqual(south);
      expect(waypoint({ now, routeLength: blocked(south) })?.point).toEqual(north);
    }
    expect(waypoint({ routeLength: () => Number.POSITIVE_INFINITY })).toBeUndefined();
  });

  it("is none on a team with a human", () => {
    expect(waypoint({ isBot: (id) => id !== "mate" })).toBeUndefined();
  });
});
