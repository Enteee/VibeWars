import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Area, type MapLayers } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The discrete layers (#2827, ADR-0051): a body is on one layer, walks up
 * and down a ramp, and collides only with its own layer.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;

function rect(x: number, y: number, width: number, height: number): Area {
  return [vec2(x, y), vec2(x + width, y), vec2(x + width, y + height), vec2(x, y + height)];
}

/** A deck from x 500 to 1100, reached by a ramp from x 350 to 520. */
const LAYERS: MapLayers = {
  count: 2,
  decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200) }],
  walls: new Map(),
};

function body(
  id: string,
  spawn: Vec2,
  layer?: number,
  extra?: Partial<ParticipantSpec>,
): ParticipantSpec {
  return {
    id,
    team: id.startsWith("foe") ? 1 : 0,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    spawn,
    ...(layer === undefined ? {} : { layer }),
    facing: 0,
    ...extra,
  };
}

function simulation(participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: 1,
    ruleset: RULES,
    bounds: { width: 1600, height: 800 },
    layers: LAYERS,
    participants,
  });
}

function of(sim: MatchSimulation, id: string): Participant {
  const found = [...sim.participants()].find((participant) => participant.id === id);
  if (found === undefined) {
    throw new Error(`no ${id}`);
  }
  return found;
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < seconds / DT; tick += 1) {
    sim.step(DT);
  }
}

/** `id` uses `slot` at `targetId`, and the skill resolves. */
function use(sim: MatchSimulation, id: string, targetId: string): void {
  sim.setTarget(id, targetId);
  expect(sim.requestSkill(id, 0)?.check).toEqual({ ok: true });
  run(sim, 2);
}

/** An assassin on `layer` with `skill` in its first slot. */
function assassin(spawn: Vec2, layer: number, skill: string): ParticipantSpec {
  return body("sin", spawn, layer, {
    skillBar: [skill],
    attributeRanks: new Map([["assassin.shadow-arts", 12]]),
  });
}

describe("layers (#2827, ADR-0051)", () => {
  it("walks up a ramp onto the deck and down again", () => {
    const sim = simulation([body("a", vec2(300, 400))]);
    sim.walkTo("a", vec2(800, 400), 1);
    run(sim, 8);
    expect(of(sim, "a").layer).toBe(1);
    expect(of(sim, "a").position.x).toBeCloseTo(800, 0);

    sim.walkTo("a", vec2(300, 400), 0);
    run(sim, 8);
    expect(of(sim, "a").layer).toBe(0);
    expect(of(sim, "a").position.x).toBeCloseTo(300, 0);
  });

  it("changes layer only inside the transition", () => {
    const sim = simulation([body("a", vec2(300, 400))]);
    sim.walkTo("a", vec2(800, 400), 1);
    for (let tick = 0; tick < 8 / DT; tick += 1) {
      const before = of(sim, "a").layer;
      sim.step(DT);
      const { layer, position } = of(sim, "a");
      if (layer !== before) {
        expect(position.x).toBeGreaterThanOrEqual(350);
        expect(position.x).toBeLessThanOrEqual(520);
        return;
      }
    }
    throw new Error("never changed layer");
  });

  it("walks the same on the same seed", () => {
    const walk = (): readonly [number, number] => {
      const sim = simulation([body("a", vec2(300, 400))]);
      sim.walkTo("a", vec2(800, 400), 1);
      run(sim, 2);
      return [of(sim, "a").position.x, of(sim, "a").layer];
    };
    expect(walk()).toEqual(walk());
  });

  it("lets bodies at one x, y on different layers pass", () => {
    const sim = simulation([body("a", vec2(760, 400), 0), body("foe", vec2(760, 400), 1)]);
    sim.walkTo("a", vec2(820, 400));
    run(sim, 4);
    expect(of(sim, "a").position).toEqual(vec2(820, 400));
    expect(of(sim, "foe").position.x).toBe(760);
  });

  it("still blocks bodies on the same layer", () => {
    const sim = simulation([body("a", vec2(700, 400), 1), body("foe", vec2(760, 400), 1)]);
    sim.walkTo("a", vec2(820, 400));
    for (let tick = 0; tick < 2 / DT; tick += 1) {
      sim.step(DT);
      expect(distance(of(sim, "a").position, of(sim, "foe").position)).toBeGreaterThanOrEqual(
        2 * RADIUS - 1e-6,
      );
    }
  });

  it("refuses a layer the map lacks, and one with no floor at the point: the body stands", () => {
    const sim = simulation([body("a", vec2(300, 400))]);
    sim.walkTo("a", vec2(800, 400), 2);
    run(sim, 1);
    expect(of(sim, "a").position).toEqual(vec2(300, 400));

    sim.walkTo("a", vec2(800, 100), 1);
    run(sim, 1);
    expect(of(sim, "a").position).toEqual(vec2(300, 400));
    expect(of(sim, "a").layer).toBe(0);
  });

  it("stops a body at the edge of its deck", () => {
    const sim = simulation([body("a", vec2(1050, 400), 1)]);
    sim.walkTo("a", vec2(1400, 400));
    run(sim, 4);
    expect(of(sim, "a").layer).toBe(1);
    expect(of(sim, "a").position.x).toBeCloseTo(1100, 0);
  });

  it("clamps a forced move at the deck's edge", () => {
    const sim = simulation([
      assassin(vec2(1050, 400), 1, "assassin.heart-of-shadow"),
      body("foe", vec2(1000, 400), 1),
    ]);
    use(sim, "sin", "foe");
    expect(of(sim, "sin").layer).toBe(1);
    expect(of(sim, "sin").position.x).toBeCloseTo(1100, 6);
  });

  it("lands a step beside a target on another layer on the stepper's own", () => {
    const sim = simulation([
      assassin(vec2(1050, 400), 1, "assassin.deaths-charge"),
      body("foe", vec2(1300, 400), 0),
    ]);
    use(sim, "sin", "foe");
    expect(of(sim, "sin").layer).toBe(1);
    expect(of(sim, "sin").position.x).toBeCloseTo(1100, 6);
  });

  it("respawns on its spawn's layer", () => {
    const sim = simulation([body("a", vec2(800, 400), 1)]);
    sim.walkTo("a", vec2(400, 400), 0);
    run(sim, 5);
    expect(of(sim, "a").layer).toBe(0);
    sim.resetParticipant("a");
    expect(of(sim, "a").layer).toBe(1);
  });

  it("refuses a participant on a layer the map lacks", () => {
    expect(() => simulation([body("a", vec2(800, 400), 2)])).toThrow(/no layer 2/);
  });

  it("reads only its own layer's walls", () => {
    const wall = [segment(vec2(800, 300), vec2(800, 500))];
    const sim = new MatchSimulation({
      seed: 1,
      ruleset: RULES,
      layers: { ...LAYERS, walls: new Map([[1, wall]]) },
      participants: [body("a", vec2(700, 400), 0), body("b", vec2(700, 350), 1)],
    });
    sim.walkTo("a", vec2(900, 400));
    sim.walkTo("b", vec2(900, 350));
    run(sim, 4);
    expect(of(sim, "a").position.x).toBeCloseTo(900, 0);
    expect(of(sim, "b").position.x).toBeLessThan(800);
  });
});
