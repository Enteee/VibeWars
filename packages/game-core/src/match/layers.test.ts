import { describe, expect, it } from "vitest";

import type { Polygon, Segment } from "../geometry.js";
import { CAPTURE_POINTS_MATCH_RULES, PRIEST_WAVE_SECONDS } from "../match-rules.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { CAPTURE_SECONDS, MAX_PIPS } from "./capture-points.js";
import { flagId, FLAG_REACH_UNITS, type FlagField } from "./flags.js";
import type { GateField } from "./gates.js";
import { guildLordId } from "./guild-lord.js";
import { switchTargetId } from "./switches.js";
import { BOUNDS, DT, fighter, RANGER, RULESET, WARRIOR } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
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
/** A wall is a closed outline, as a map's are: a thin rectangle's four sides. */
const wall = (x: number, y: number, width: number, height: number): Segment[] => {
  const corners = rect(x, y, width, height);
  return corners.flatMap((a, at) => {
    const b = corners[(at + 1) % corners.length];
    return b === undefined ? [] : [{ a, b }];
  });
};
const WALL_ON_DECK = wall(698, 300, 4, 200);
const WALL_ON_GROUND = wall(238, 300, 4, 200);
const LAYERS: MatchLayers = {
  count: 2,
  ground: 0,
  pits: [],
  walls: [WALL_ON_GROUND, WALL_ON_DECK],
  decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200), uphill: UPHILL.e }],
  outline: undefined,
  deepWater: [[], []],
};

const WIRE = "assassin.scorpion-wire";
const HEART_OF_SHADOW = "assassin.heart-of-shadow";

const ON_DECK = vec2(800, 400);
const ON_RAMP = vec2(430, 400);
const ALONE_SECONDS = CAPTURE_SECONDS * MAX_PIPS;

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
        ground: 0,
        pits: [],
        walls: [[], []],
        decks: [
          { layer: 1, footprint: rect(100, 300, 1000, 200) },
          { layer: 1, footprint: rect(490, 640, 80, 60) },
        ],
        transitions: [{ from: 0, to: 1, area: rect(480, 500, 100, 100), uphill: UPHILL.n }],
        outline: undefined,
        deepWater: [[], []],
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
    const sim = arena([spec("a", 0, vec2(600, 440), 1, [WIRE]), spec("foe", 1, vec2(600, 640), 0)]);
    sim.setTarget("a", "foe");
    expect(sim.requestSkill("a", 0)?.check.ok).toBe(true);
    run(sim, 2);
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

  it("crosses a ramp on the ground when its route stays on the ground", () => {
    const sim = arena([spec("a", 0, vec2(300, 450), 0)]);
    sim.walkTo("a", vec2(600, 450), 0);
    run(sim, 6);
    expect(get(sim, "a").layer).toBe(0);
    expect(get(sim, "a").position.x).toBeCloseTo(600, 0);
  });

  it("does not climb a ramp its route only passes over on the way to another", () => {
    const sim = arena([spec("a", 0, vec2(100, 400), 0)], {
      layers: {
        ...LAYERS,
        walls: [[], []],
        decks: [
          { layer: 1, footprint: rect(400, 300, 100, 200) },
          { layer: 1, footprint: rect(900, 300, 300, 200) },
        ],
        transitions: [
          { from: 0, to: 1, area: rect(290, 300, 130, 200), uphill: UPHILL.e },
          { from: 0, to: 1, area: rect(790, 300, 130, 200), uphill: UPHILL.e },
        ],
      },
    });
    sim.walkTo("a", vec2(1050, 400), 1);
    run(sim, 30);
    expect(get(sim, "a").layer).toBe(1);
    expect(get(sim, "a").position.x).toBeCloseTo(1050, 0);
  });

  it("chases a target onto the deck, up the ramp", () => {
    const sim = arena([
      fighter("a", 0, WARRIOR, vec2(300, 400), { layer: 0, behaviour: undefined }),
      spec("b", 1, vec2(620, 400), 1),
    ]);
    expect(sim.requestAttack("a", "b")).toEqual({ ok: true });
    run(sim, 6);
    expect(get(sim, "a").layer).toBe(1);
  });

  it("stands when no ramp leads to the walk's layer or a chase's", () => {
    const none = { layers: { ...LAYERS, transitions: [] } };
    const walker = arena([spec("a", 0, vec2(300, 400), 0)], none);
    walker.walkTo("a", vec2(600, 400), 1);
    run(walker, 1);
    expect(get(walker, "a").position).toEqual(vec2(300, 400));
    const chaser = arena(
      [
        fighter("a", 0, WARRIOR, vec2(450, 400), { layer: 0, behaviour: undefined }),
        spec("b", 1, vec2(620, 400), 1),
      ],
      none,
    );
    chaser.requestAttack("a", "b");
    run(chaser, 1);
    expect(get(chaser, "a").position).toEqual(vec2(450, 400));
    expect(get(chaser, "a").layer).toBe(0);
  });

  it("sends a pet after an owner on another layer, up the ramp", () => {
    const sim = arena([spec("r", 0, vec2(100, 600), 0, ["ranger.charm-animal"])]);
    const pet = [...sim.participants()].find((other) => other.creature?.ownerId === "r");
    expect(pet).toBeDefined();
    sim.walkTo("r", vec2(650, 400), 1);
    run(sim, 10);
    expect(get(sim, "r").layer).toBe(1);
    expect(get(sim, pet?.id ?? "").layer).toBe(1);
  });

  describe("a closing gate", () => {
    const SPANS = wall(796, 300, 4, 200);
    const field = (layer: number): GateField => ({
      segments: SPANS,
      opener: { kind: "plate", plate: vec2(100, 700), team: null },
      blocks: "all",
      layer,
    });

    /** A body beside the gate's line on layer 1, the plate held, then let go. */
    function closed(layer: number): MatchSimulation {
      const sim = arena(
        [spec("deck", 0, vec2(800, 400), 1), spec("holder", 0, vec2(100, 700), 0)],
        { gates: [field(layer)] },
      );
      sim.walkTo("holder", vec2(100, 100), 0);
      run(sim, 3);
      return sim;
    }

    it("on the ground leaves a body on the deck above where it is", () => {
      expect(get(closed(0), "deck").position).toEqual(vec2(800, 400));
    });

    it("on the deck moves a body on the deck", () => {
      expect(get(closed(1), "deck").position).not.toEqual(vec2(800, 400));
    });
  });

  const DECK_SWITCH: Partial<MatchSimulationOptions> = {
    gates: [{ segments: wall(1396, 0, 8, 800), opener: { kind: "switch" }, blocks: "all" }],
    switches: [
      { id: "lever", layer: 1, position: ON_DECK, gates: [0], teleports: [], decks: [], lifts: [] },
    ],
  };

  it("a switch on a deck is not flipped from beneath it, however near (#3025)", () => {
    const sim = arena([spec("a", 0, ON_DECK, 0)], DECK_SWITCH);
    sim.requestAttack("a", switchTargetId("lever"));
    sim.step(DT);
    sim.step(DT);
    expect(sim.switches[0]?.up).toBe(true);
    expect(sim.gates[0]?.open).toBe(false);
  });

  it("a switch on a deck is flipped from the deck (#3025)", () => {
    const sim = arena([spec("a", 0, vec2(ON_DECK.x + 20, ON_DECK.y), 1)], DECK_SWITCH);
    sim.requestAttack("a", switchTargetId("lever"));
    sim.step(DT);
    sim.step(DT);
    expect(sim.switches[0]?.up).toBe(false);
    expect(sim.gates[0]?.open).toBe(true);
  });

  it("refuses a participant on a layer the map does not have", () => {
    expect(() => arena([spec("a", 0, vec2(600, 400), 2)])).toThrow(/layer 2/);
  });
});

describe("an objective on a layer (ADR-0051, #2900)", () => {
  /** How far one body fills a shrine at `shrine` on the deck, standing at `at` on `layer`. */
  function filled(shrine: Vec2, at: Vec2, layer: number): number {
    const sim = arena([spec("a", 0, at, layer), spec("x", 1, vec2(1500, 900), 0)], {
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      capturePoints: [{ ...shrine, layer: 1 }],
    });
    run(sim, ALONE_SECONDS / 4);
    return sim.capturePoints[0]?.progress ?? 0;
  }

  it("a shrine on a deck fills for a body on the deck", () => {
    expect(filled(ON_DECK, ON_DECK, 1)).toBeGreaterThan(0);
  });

  it("a shrine on a deck does not fill for a body on the ground beneath it", () => {
    expect(filled(ON_DECK, ON_DECK, 0)).toBe(0);
  });

  it("a shrine on a deck fills for a body in a ramp connecting to it", () => {
    expect(filled(ON_RAMP, ON_RAMP, 0)).toBeGreaterThan(0);
  });

  const DECK_FLAGS: FlagField = {
    stand: vec2(1000, 400),
    spawns: [
      { team: 0, position: ON_DECK, layer: 1 },
      { team: 1, position: vec2(1500, 900) },
    ],
  };

  it("a flag on a deck is not taken up from beneath it, however near", () => {
    const sim = arena([spec("a", 0, ON_DECK, 0)], { flagField: DECK_FLAGS });
    sim.requestAttack("a", flagId(0));
    sim.step(DT);
    expect(sim.flags[0]?.place).toEqual({ kind: "spawn" });
  });

  it("a flag on a deck is taken up from the deck, and lies on its dropper's layer", () => {
    const within = vec2(ON_DECK.x + FLAG_REACH_UNITS / 2, ON_DECK.y);
    const sim = arena([spec("a", 0, within, 1)], { flagField: DECK_FLAGS });
    sim.requestAttack("a", flagId(0));
    sim.step(DT);
    sim.step(DT);
    expect(sim.flags[0]?.place).toEqual({ kind: "carried", carrierId: "a" });
    sim.dropBundle("a");
    expect(sim.flags[0]?.place).toEqual({ kind: "ground", position: within, layer: 1 });
  });

  it("a Guild Lord starts on its objective's layer", () => {
    const sim = arena([spec("a", 0, vec2(100, 100), 0)], {
      guildLords: [{ team: 0, position: ON_DECK, layer: 1 }],
    });
    expect(get(sim, guildLordId(0)).layer).toBe(1);
  });
});
