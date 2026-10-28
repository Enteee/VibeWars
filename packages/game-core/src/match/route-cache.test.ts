import { beforeEach, describe, expect, it, vi } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import type * as Pathing from "../pathing.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { add, distance, vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, REPLAN_GOAL_UNITS, type Participant } from "./simulation.js";

/**
 * A walker's route is kept from tick to tick (#1157): A* runs again only
 * when the goal has moved a body width, or the body has been pushed out
 * of sight of its next waypoint. Every `find` the simulation asks is
 * counted here.
 */

const FINDS = vi.hoisted(() => ({ count: 0 }));

vi.mock("../pathing.js", async (importOriginal) => {
  const original = await importOriginal<typeof Pathing>();
  return {
    ...original,
    createPathFinder: (graph: Pathing.NavGraph): Pathing.PathFinder => {
      const paths = original.createPathFinder(graph);
      return {
        find: (from, to) => {
          FINDS.count += 1;
          return paths.find(from, to);
        },
      };
    },
  };
});

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BOUNDS = { width: 960, height: 640 };

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** A pillar across the straight line from (100, 320) to (800, 320), longer above it. */
const PILLAR = rect(440, 100, 24, 400);

/** The walker at (100, 320), left of the pillar, and an idle foe at `foe`. */
function field(foe: Vec2): MatchSimulation {
  const body = (id: string, team: number, spawn: Vec2) => ({
    id,
    team,
    skillBar: [],
    attributeRanks: new Map<string, number>(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
  });
  return new MatchSimulation({
    seed: "route-cache",
    walls: PILLAR,
    bounds: BOUNDS,
    participants: [body("p", 0, vec2(100, 320)), body("foe", 1, foe)],
  });
}

function participant(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function steps(sim: MatchSimulation, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    sim.step(DT);
  }
}

beforeEach(() => {
  FINDS.count = 0;
});

describe("a walk keeps its route (#1157)", () => {
  it("plans once for a goal that stays put, and still gets round the pillar", () => {
    const sim = field(vec2(900, 600));
    sim.walkTo("p", vec2(800, 320));

    steps(sim, 21);
    // The walk's settling query, which the route starts from.
    expect(FINDS.count).toBe(1);

    steps(sim, Math.round(6 / DT));
    expect(distance(participant(sim, "p").position, vec2(800, 320))).toBeLessThanOrEqual(1);
  });

  it("keeps the route through a shove that leaves its next waypoint in sight", () => {
    const sim = field(vec2(900, 600));
    sim.walkTo("p", vec2(800, 320));
    steps(sim, 5);
    const p = participant(sim, "p");
    p.position = add(p.position, vec2(0, 10));

    steps(sim, 5);
    expect(FINDS.count).toBe(1);
  });

  it("plans again once shoved behind the pillar, out of sight of its next waypoint", () => {
    const sim = field(vec2(900, 600));
    sim.walkTo("p", vec2(800, 320));
    steps(sim, 5);
    participant(sim, "p").position = vec2(700, 320);

    steps(sim, 1);
    expect(FINDS.count).toBe(2);
    steps(sim, 5);
    expect(FINDS.count).toBe(2);
  });
});

describe("an approach keeps its route while the target creeps (#1157)", () => {
  it("plans again once its target is a body width from where it was planned to", () => {
    const sim = field(vec2(800, 320));
    sim.requestAttack("p", "foe");
    steps(sim, 20);
    expect(FINDS.count).toBe(1);

    // A unit a tick: the plan holds until the target is more than 28 off.
    const foe = participant(sim, "foe");
    for (let moved = 1; moved <= 40; moved += 1) {
      foe.position = vec2(800, 320 + moved);
      steps(sim, 1);
      expect(FINDS.count, `after ${String(moved)}`).toBe(moved > REPLAN_GOAL_UNITS ? 2 : 1);
    }
  });

  it("plans again at once when its target jumps 29", () => {
    const sim = field(vec2(800, 320));
    sim.requestAttack("p", "foe");
    steps(sim, 20);

    participant(sim, "foe").position = vec2(800, 320 + REPLAN_GOAL_UNITS + 1);
    steps(sim, 1);
    expect(FINDS.count).toBe(2);
  });
});
