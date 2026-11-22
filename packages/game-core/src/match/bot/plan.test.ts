import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../../vec2.js";
import type { MatchSimulation, Participant } from "../simulation.js";
import { PLAN_SECONDS, flankParty, flankWaypoint, teamPlan } from "./plan.js";
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

  it("never plays two non-push phases running", () => {
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

/** The ids of team 0 in `sim` that flank in `phase`. */
function party(sim: MatchSimulation, phase: number, isBot = (_id: string): boolean => true) {
  return [...sim.participants()]
    .filter((one) => one.combatant.team === 0)
    .filter((one) => flankParty(contextFor(sim, one.id, { isBot }), one, phase))
    .map((one) => one.id);
}

/** A team 0 of `builds`, ids `t0`, `t1`, …, against one foe. */
function team(builds: readonly (typeof WARRIOR)[]): MatchSimulation {
  return match([
    ...builds.map((build, index) =>
      fighter(`t${String(index)}`, 0, build, vec2(100, 100 + index * 80)),
    ),
    fighter("foe", 1, WARRIOR, vec2(1100, 400)),
  ]);
}

describe("flankParty (#3832)", () => {
  it("sends max(1, floor(n/2)) of the team", () => {
    for (const [n, size] of [
      [2, 1],
      [3, 1],
      [4, 2],
      [5, 2],
      [8, 4],
    ] as const) {
      const sim = team(Array.from({ length: n }, () => WARRIOR));
      for (let phase = 1; phase < 20; phase += 1) {
        expect(party(sim, phase), `n ${String(n)}`).toHaveLength(size);
      }
    }
  });

  it("sends nobody on a team of one", () => {
    expect(party(team([WARRIOR]), 1)).toEqual([]);
  });

  it("sends nobody on a team with a human (#3833)", () => {
    const sim = team([WARRIOR, WARRIOR, WARRIOR, WARRIOR]);
    expect(party(sim, 1, (id) => id !== "t2")).toEqual([]);
  });

  it("rolls who flanks per phase", () => {
    const sim = team([WARRIOR, WARRIOR, WARRIOR, WARRIOR]);
    const parties = new Set(Array.from({ length: 20 }, (_, phase) => party(sim, phase + 1).join()));
    expect(parties.size).toBeGreaterThan(1);
  });

  it("chooses no healer while a non-healer is left", () => {
    const two = team([MONK, WARRIOR, MONK, WARRIOR]);
    const one = team([MONK, MONK, WARRIOR, MONK]);
    for (let phase = 1; phase < 50; phase += 1) {
      expect(party(two, phase).sort()).toEqual(["t1", "t3"]);
      expect(party(one, phase)).toContain("t2");
    }
  });
});

describe("flankWaypoint (#3832)", () => {
  // Team 0 starts round (100,500), team 1 round (1100,500): 60% of the
  // way is (700,500), 35% of the 1000 between them off to either side.
  const sim = match([
    fighter("bot", 0, WARRIOR, vec2(100, 400)),
    fighter("mate", 0, WARRIOR, vec2(100, 600)),
    fighter("foe", 1, WARRIOR, vec2(1100, 500)),
  ]);
  const sides = [vec2(700, 850), vec2(700, 150)];
  const self = (): Participant => {
    const found = sim.get("bot");
    if (found === undefined) throw new Error("no bot");
    return found;
  };
  /** The waypoint with no route within 1 of `blocked`. */
  const waypoint = (now: number, ...blocked: Vec2[]) =>
    flankWaypoint(
      contextFor(sim, "bot", {
        now,
        routeLength: (to) =>
          blocked.some((point) => distance(point, to) < 1) ? Number.POSITIVE_INFINITY : 1,
      }),
      self(),
      1,
    );

  it("swings 35% of the spawns' distance off the line, 60% of the way", () => {
    const at = waypoint(50);
    expect(sides).toContainEqual(at?.point);
    expect(at?.layer).toBe(0);
  });

  it("rolls the side per phase", () => {
    const seen = new Set(
      Array.from({ length: 20 }, (_, phase) => waypoint((phase + 1) * PLAN_SECONDS)?.point.y),
    );
    expect(seen).toEqual(new Set([150, 850]));
  });

  it("takes the other side where the rolled one has no route, then none", () => {
    const rolled = waypoint(50)?.point ?? vec2(0, 0);
    const other = sides.find((side) => side.y !== rolled.y);
    expect(waypoint(50, rolled)?.point).toEqual(other);
    expect(waypoint(50, ...sides)).toBeUndefined();
  });
});
