import { describe, expect, it } from "vitest";

import type { Polygon, Segment } from "../geometry.js";
import { PRIEST_WAVE_SECONDS } from "../match-rules.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import {
  MatchSimulation,
  type MatchLayers,
  type MatchSimulationOptions,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

/** The shape of `packages/game-maps/test-maps/layer-test`: a bridge with a ramp at its west end. */
const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];
const WALL_ON_DECK: Segment = { a: vec2(700, 300), b: vec2(700, 500) };
const WALL_ON_GROUND: Segment = { a: vec2(240, 300), b: vec2(240, 500) };
const LAYERS: MatchLayers = {
  count: 2,
  walls: [[WALL_ON_GROUND], [WALL_ON_DECK]],
  decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200) }],
};

const WIRE = "assassin.scorpion-wire";
const HEART_OF_SHADOW = "assassin.heart-of-shadow";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  layer: number,
  skillBar: readonly string[] = [],
): ParticipantSpec {
  return fighter(id, team, RANGER, spawn, {
    layer,
    behaviour: undefined,
    skillBar: [...skillBar, null, null, null, null, null, null, null, null].slice(0, 8),
  });
}

function arena(
  participants: readonly ParticipantSpec[],
  options: Partial<MatchSimulationOptions> = {},
): MatchSimulation {
  return new MatchSimulation({
    seed: "layers",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: LAYERS,
    participants,
    ...options,
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

describe("a body's layer (ADR-0051)", () => {
  it("climbs a ramp to the deck a walk names, and stands there on layer 1", () => {
    const sim = arena([spec("a", 0, vec2(300, 400), 0)]);
    sim.walkTo("a", vec2(600, 400), 1);
    run(sim, 8);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.x).toBeCloseTo(600, 0);
  });

  it("comes down a ramp a walk names the ground across", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 1)]);
    sim.walkTo("a", vec2(300, 400), 0);
    run(sim, 8);
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "a").position.x).toBeCloseTo(300, 0);
  });

  it("stays on its layer across a ramp when the walk names that layer", () => {
    const sim = arena([spec("a", 0, vec2(300, 400), 0)]);
    sim.walkTo("a", vec2(600, 400), 0);
    run(sim, 8);
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "a").position.x).toBeCloseTo(600, 0);
  });

  it("goes up a ramp walked uphill by keyboard, and down it walked downhill", () => {
    const sim = arena([spec("a", 0, vec2(300, 400), 0)]);
    sim.setInputDirection("a", vec2(1, 0));
    run(sim, 2);
    expect(get(sim, "a").layer).toBe(1);
    sim.setInputDirection("a", vec2(-1, 0));
    run(sim, 2);
    expect(get(sim, "a").layer).toBe(0);
  });

  it("climbs a ramp joining a long deck side-on, beside a nearer-centred deck", () => {
    const sim = arena([spec("a", 0, vec2(530, 620), 0)], {
      layers: {
        count: 2,
        walls: [[], []],
        decks: [
          { layer: 1, footprint: rect(100, 300, 1000, 200) },
          { layer: 1, footprint: rect(490, 640, 80, 60) },
        ],
        transitions: [{ from: 0, to: 1, area: rect(480, 500, 100, 100) }],
      },
    });
    sim.setInputDirection("a", vec2(0, -1));
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(1);
  });

  it("does not change layer standing still on a ramp", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), 0)]);
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(0);
  });

  it("lets two bodies share a point on different layers", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 0), spec("b", 1, vec2(600, 400), 1)]);
    run(sim, 1);
    expect(get(sim, "a").position).toEqual(vec2(600, 400));
    expect(get(sim, "b").position).toEqual(vec2(600, 400));
  });

  it("blocks a walker only with its own layer's walls", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 0), spec("b", 1, vec2(640, 420), 1)]);
    sim.setInputDirection("a", vec2(1, 0));
    sim.setInputDirection("b", vec2(1, 0));
    run(sim, 2);
    expect(get(sim, "a").position.x).toBeGreaterThan(700);
    expect(get(sim, "b").position.x).toBeLessThan(700);
  });

  it("refuses a layer the map does not have, and the body stands", () => {
    const sim = arena([spec("a", 0, vec2(300, 400), 0)]);
    sim.walkTo("a", vec2(600, 400), 5);
    run(sim, 1);
    expect(get(sim, "a").position).toEqual(vec2(300, 400));
    expect(get(sim, "a").walkGoal).toBeUndefined();
  });

  it("refuses a point not on the named layer, and ends the walk under way", () => {
    const sim = arena([spec("a", 0, vec2(300, 400), 0)]);
    sim.walkTo("a", vec2(200, 400));
    sim.walkTo("a", vec2(900, 100), 1);
    run(sim, 1);
    expect(get(sim, "a").position).toEqual(vec2(300, 400));
  });

  it("stops a walker at the deck's edge and keeps it on the deck", () => {
    const sim = arena([spec("a", 0, vec2(600, 480), 1)]);
    sim.setInputDirection("a", vec2(0, 1));
    run(sim, 2);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.y).toBeCloseTo(500, 5);
  });

  it("clamps a displacement to the deck's edge, on the deck", () => {
    const sim = arena([
      spec("a", 0, vec2(600, 480), 1, [HEART_OF_SHADOW]),
      spec("foe", 1, vec2(600, 400), 1),
    ]);
    sim.setTarget("a", "foe");
    expect(sim.requestSkill("a", 0)?.check.ok).toBe(true);
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.y).toBeCloseTo(500, 5);
  });

  it("steps beside a target on another layer on the stepper's own", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 1, [WIRE]), spec("foe", 1, vec2(600, 640), 0)]);
    sim.setTarget("a", "foe");
    expect(sim.requestSkill("a", 0)?.check.ok).toBe(true);
    run(sim, 1);
    get(sim, "foe").position = vec2(600, 760);
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.y).toBeLessThanOrEqual(500);
    expect(get(sim, "a").position.y).toBeCloseTo(500, 5);
  });

  it("respawns on its spawn's layer", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), 0), spec("b", 1, vec2(600, 400), 1)]);
    sim.walkTo("a", vec2(600, 450), 1);
    sim.walkTo("b", vec2(300, 450), 0);
    run(sim, 6);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "b").layer).toBe(0);
    sim.resetParticipant("a");
    sim.resetParticipant("b");
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "b").layer).toBe(1);
  });

  it("rises at a shrine on its spawn's layer, having died on a deck", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), 0)], {
      shrines: [{ team: 0, position: vec2(150, 400) }],
    });
    sim.walkTo("a", vec2(600, 450), 1);
    run(sim, 6);
    expect(get(sim, "a").layer).toBe(1);
    const { combatant } = get(sim, "a");
    combatant.statuses.apply("burning", 10, "nobody", NO_RANKS);
    combatant.health = 0.2;
    run(sim, PRIEST_WAVE_SECONDS - sim.elapsedSeconds + 1);
    const risen = get(sim, "a");
    expect(risen.combatant.dead).toBe(false);
    expect(risen.layer).toBe(0);
    expect(risen.position.x).toBeLessThan(240);
  });

  it("refuses a participant on a layer the map does not have", () => {
    expect(() => arena([spec("a", 0, vec2(600, 400), 2)])).toThrow(/layer 2/);
  });
});
