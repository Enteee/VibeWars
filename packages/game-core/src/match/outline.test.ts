import { describe, expect, it } from "vitest";

import { pointInPolygon, type Polygon } from "../geometry.js";
import {
  buildGatedNavGraph,
  createPathFinder,
  isStandable,
  navGraphFor,
  nearestStandable,
} from "../pathing.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, ELEMENTALIST, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const RADIUS = RULESET.collision.playerRadius;
const HEART_OF_SHADOW = "assassin.heart-of-shadow";
const FIREBALL = "elementalist.fireball";

/**
 * The ground of `BOUNDS` with a notch out of its south side, x 600 to
 * 1000 from y 300 down: two bays, west and east, joined round its north.
 */
const GROUND: Polygon = [
  vec2(0, 0),
  vec2(1600, 0),
  vec2(1600, 800),
  vec2(1000, 800),
  vec2(1000, 300),
  vec2(600, 300),
  vec2(600, 800),
  vec2(0, 800),
];
const layers = (blocksSight: boolean): MatchLayers => ({
  count: 1,
  ground: 0,
  pits: [],
  walls: [[]],
  decks: [],
  transitions: [],
  outline: { polygon: GROUND, blocksSight },
  deepWater: [[]],
  dropOffs: [],
});

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
): ParticipantSpec {
  return fighter(id, team, RANGER, spawn, {
    layer: 0,
    behaviour: undefined,
    skillBar: [...skillBar, null, null, null, null, null, null, null, null].slice(0, 8),
  });
}

function arena(participants: readonly ParticipantSpec[], blocksSight = false): MatchSimulation {
  return new MatchSimulation({
    seed: "outline",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: layers(blocksSight),
    participants,
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Steps `sim` for `seconds`, checking `id` is on the ground after every tick. */
function runInside(sim: MatchSimulation, seconds: number, id: string): void {
  for (let i = 0; i < seconds / DT; i += 1) {
    sim.step(DT);
    expect(pointInPolygon(get(sim, id).position, GROUND)).toBe(true);
  }
}

describe("a ground outline (#3066)", () => {
  it("slides a body walking into a concave edge along it, and keeps it inside", () => {
    const sim = arena([spec("a", 0, vec2(500, 600))]);
    sim.setInputDirection("a", vec2(1, -0.3));
    runInside(sim, 3, "a");
    const { position } = get(sim, "a");
    expect(position.x).toBeCloseTo(600 - RADIUS, 0);
    expect(position.y).toBeLessThan(550);
  });

  it("walks a body out of one bay and round into the other", () => {
    const sim = arena([spec("a", 0, vec2(400, 600))]);
    sim.walkTo("a", vec2(1200, 600), 0);
    runInside(sim, 20, "a");
    const { position } = get(sim, "a");
    expect(position.x).toBeCloseTo(1200, 0);
    expect(position.y).toBeCloseTo(600, 0);
  });

  it("stops a displacement into the outside at the edge", () => {
    const sim = arena([
      spec("a", 0, vec2(560, 600), [HEART_OF_SHADOW]),
      spec("foe", 1, vec2(460, 600)),
    ]);
    sim.setTarget("a", "foe");
    expect(sim.requestSkill("a", 0)?.check.ok).toBe(true);
    runInside(sim, 1, "a");
    expect(get(sim, "a").position.x).toBeGreaterThan(560);
  });

  it("finds a path round the notch, and snaps a goal outside to the nearest ground", () => {
    const gated = buildGatedNavGraph([], [], BOUNDS, RADIUS, [], [GROUND]);
    const graph = navGraphFor(gated, 0);
    const path = createPathFinder(graph).find(vec2(400, 600), vec2(1200, 600));
    expect(path).toBeDefined();
    expect(path?.every((point) => isStandable(graph, point))).toBe(true);
    expect(Math.min(...(path ?? []).map((point) => point.y))).toBeLessThan(300);
    const goal = nearestStandable(graph, vec2(800, 700));
    expect(isStandable(graph, goal)).toBe(true);
    expect(pointInPolygon(goal, GROUND)).toBe(true);
  });

  it("blocks sight across the outside where the outside is rock or forest, not where it is a cliff", () => {
    const across = (blocksSight: boolean): boolean => {
      // Either lip of the notch, a spell's range apart across it.
      const sim = arena(
        [
          fighter("a", 0, ELEMENTALIST, vec2(595, 500), {
            layer: 0,
            behaviour: undefined,
            skillBar: [FIREBALL, null, null, null, null, null, null, null],
          }),
          spec("foe", 1, vec2(1005, 500)),
        ],
        blocksSight,
      );
      sim.setTarget("a", "foe");
      sim.requestSkill("a", 0);
      return get(sim, "a").combatant.cast.activeCast !== undefined;
    };
    expect(across(false)).toBe(true);
    expect(across(true)).toBe(false);
  });
});
