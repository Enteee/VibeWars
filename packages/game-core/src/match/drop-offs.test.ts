import { describe, expect, it } from "vitest";

import type { Polygon } from "../geometry.js";
import { CLIMB_PACE } from "../movement.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, ELEMENTALIST, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];

/** `layer-test`'s bridge and its west ramp, with a drop-off mid-way along its north edge. */
const RAMP = rect(350, 300, 170, 200);
const layersWith = (pace: number): MatchLayers => ({
  count: 2,
  ground: 0,
  pits: [],
  walls: [[], []],
  decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
  transitions: [{ from: 0, to: 1, area: RAMP, uphill: UPHILL.e, pace }],
  outline: undefined,
  deepWater: [[], []],
  dropOffs: [{ layer: 1, edge: { a: vec2(700, 300), b: vec2(900, 300) }, outward: vec2(0, -1) }],
});

function spec(id: string, team: number, spawn: Vec2, layer: number): ParticipantSpec {
  return fighter(id, team, RANGER, spawn, { layer, behaviour: undefined });
}

function arena(
  participants: readonly ParticipantSpec[],
  pace: number = CLIMB_PACE.ramp,
): MatchSimulation {
  return new MatchSimulation({
    seed: "drop-offs",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: layersWith(pace),
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

function run(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < seconds / DT; i += 1) {
    sim.step(DT);
  }
}

describe("a drop-off (#3069)", () => {
  it("puts a body walking off it on the layer below, where it stepped", () => {
    const sim = arena([spec("a", 0, vec2(800, 400), 1)]);
    sim.setInputDirection("a", vec2(0, -1));
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "a").position.y).toBeLessThan(300);
    expect(get(sim, "a").position.x).toBeCloseTo(800, 5);
  });

  it("holds a body at the deck's edge either side of it", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 1)]);
    sim.setInputDirection("a", vec2(0, -1));
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.y).toBeCloseTo(300, 5);
  });

  it("is nothing from below: a body walking under it stays on the ground", () => {
    const sim = arena([spec("a", 0, vec2(800, 200), 0)]);
    sim.setInputDirection("a", vec2(0, 1));
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "a").position.y).toBeGreaterThan(300);
  });

  it("is the way down a walk takes, and never the way up", () => {
    const down = arena([spec("a", 0, vec2(800, 400), 1)]);
    down.walkTo("a", vec2(800, 150), 0);
    run(down, 1.5);
    expect(get(down, "a")).toMatchObject({ layer: 0, position: { x: 800, y: 150 } });
    const up = arena([spec("a", 0, vec2(800, 150), 0)]);
    up.walkTo("a", vec2(800, 400), 1);
    let westmost = 800;
    for (let i = 0; i < 8 / DT; i += 1) {
      up.step(DT);
      westmost = Math.min(westmost, get(up, "a").position.x);
    }
    expect(get(up, "a").layer).toBe(1);
    expect(westmost).toBeLessThan(520);
  });

  it("lets a cast at a body carry on as it drops", () => {
    const sim = new MatchSimulation({
      seed: "drop-offs",
      ruleset: RULESET,
      bounds: BOUNDS,
      walls: [],
      layers: layersWith(1),
      participants: [
        fighter("caster", 0, ELEMENTALIST, vec2(800, 100), {
          layer: 0,
          behaviour: undefined,
          skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
        }),
        spec("foe", 1, vec2(800, 320), 1),
      ],
    });
    sim.setTarget("caster", "foe");
    sim.requestSkill("caster", 0);
    expect(get(sim, "caster").combatant.cast.activeCast).toBeDefined();
    const health = get(sim, "foe").combatant.health;
    sim.setInputDirection("foe", vec2(0, -1));
    run(sim, 0.3);
    expect(get(sim, "foe").layer).toBe(0);
    sim.setInputDirection("foe", vec2(0, 0));
    run(sim, 3);
    expect(get(sim, "foe").combatant.health).toBeLessThan(health);
  });
});

describe("climbing pace (#3069)", () => {
  /** Seconds a body steered uphill from the ramp's foot takes to reach the deck. */
  const climbSeconds = (pace: number): number => {
    const sim = arena([spec("a", 0, vec2(360, 400), 0)], pace);
    sim.setInputDirection("a", vec2(1, 0));
    let ticks = 0;
    while (get(sim, "a").layer === 0 && ticks < 10 / DT) {
      sim.step(DT);
      ticks += 1;
    }
    return ticks * DT;
  };

  it("takes a ladder twice as long as a ramp of the same shape, rough steps a quarter longer", () => {
    const ramp = climbSeconds(CLIMB_PACE.ramp);
    expect(climbSeconds(CLIMB_PACE.ladder) / ramp).toBeCloseTo(2, 1);
    expect(climbSeconds(CLIMB_PACE["rough-steps"]) / ramp).toBeCloseTo(1.25, 1);
    expect(climbSeconds(CLIMB_PACE.stairs)).toBe(ramp);
  });
});
