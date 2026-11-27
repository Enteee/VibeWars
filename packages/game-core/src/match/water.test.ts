import { describe, expect, it } from "vitest";

import { WEAPONS } from "../equipment/weapons.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { Polygon, Segment } from "../geometry.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, ELEMENTALIST, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const FIREBALL = "elementalist.fireball";
const RADIUS = RULESET.collision.playerRadius;

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];
/** A body of water is a closed outline, as a wall is. */
const outline = (x: number, y: number, width: number, height: number): Segment[] => {
  const corners = rect(x, y, width, height);
  return corners.flatMap((a, at) => {
    const b = corners[(at + 1) % corners.length];
    return b === undefined ? [] : [{ a, b }];
  });
};

/**
 * A pond across the ground from y 100 to 700, with a way round it at
 * either end, and a pool on a deck to its east, over open ground.
 */
const POND = outline(700, 100, 100, 600);
const POOL_ON_DECK = outline(1300, 320, 60, 160);
const LAYERS: MatchLayers = {
  count: 2,
  ground: 0,
  pits: [],
  walls: [[], []],
  decks: [{ layer: 1, footprint: rect(1100, 300, 400, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(950, 300, 170, 200), uphill: UPHILL.e, pace: 1 }],
  outline: undefined,
  deepWater: [POND, POOL_ON_DECK],
  shallowWater: [[], []],
  dropOffs: [],
};

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  layer: number,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return fighter(id, team, RANGER, spawn, {
    layer,
    behaviour: undefined,
    skillBar: [null, null, null, null, null, null, null, null],
    ...extra,
  });
}

function arena(participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "water",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: LAYERS,
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

describe("deep water (#2983)", () => {
  it("stops a body walking into it, as a wall does", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 0)]);
    sim.setInputDirection("a", vec2(1, 0));
    run(sim, 3);
    expect(get(sim, "a").position.x).toBeCloseTo(700 - RADIUS, 0);
  });

  it("is walked round, not through, by a walk to its far side", () => {
    const sim = arena([spec("a", 0, vec2(600, 400), 0)]);
    sim.walkTo("a", vec2(900, 400), 0);
    run(sim, 1);
    // Heading for an end of the pond from the start, not pressing its shore.
    expect(Math.abs(get(sim, "a").position.y - 400)).toBeGreaterThan(50);
    run(sim, 20);
    const { position } = get(sim, "a");
    expect(position.x).toBeCloseTo(900, 0);
    expect(position.y).toBeCloseTo(400, 0);
  });

  it("lets sight and a spell cross it", () => {
    const sim = arena([
      fighter("a", 0, ELEMENTALIST, vec2(650, 400), {
        layer: 0,
        behaviour: undefined,
        skillBar: [FIREBALL, null, null, null, null, null, null, null],
      }),
      spec("foe", 1, vec2(850, 400), 0),
    ]);
    sim.setTarget("a", "foe");
    sim.requestSkill("a", 0);
    expect(get(sim, "a").combatant.cast.activeCast).toBeDefined();
  });

  it("lets an arrow cross it", () => {
    const sim = arena([
      spec("a", 0, vec2(640, 400), 0, {
        equipment: {
          ...unarmedResolvedEquipment(RULESET.combat.armorReferenceLevel),
          mainHand: {
            weapon: { ...WEAPONS.flatbow, range: 200, damageMin: 80, damageMax: 80 },
            attributeId: "ranger.marksmanship",
            damageType: WEAPONS.flatbow.damageType,
            requirementMet: true,
            creatureDamageScale: undefined,
          },
        },
        attributeRanks: new Map([["ranger.marksmanship", 12]]),
      }),
      spec("foe", 1, vec2(830, 400), 0),
    ]);
    const before = get(sim, "foe").combatant.health;
    sim.requestAttack("a", "foe");
    run(sim, 3);
    expect(get(sim, "foe").combatant.health).toBeLessThan(before);
    expect(get(sim, "a").position.x).toBeCloseTo(640, 0);
  });

  it("on a deck stops a body on the deck, not one on the ground under it", () => {
    const sim = arena([spec("up", 0, vec2(1200, 400), 1), spec("down", 0, vec2(1250, 400), 0)]);
    sim.setInputDirection("up", vec2(1, 0));
    sim.setInputDirection("down", vec2(1, 0));
    run(sim, 2);
    expect(get(sim, "up").position.x).toBeCloseTo(1300 - RADIUS, 0);
    expect(get(sim, "down").position.x).toBeGreaterThan(1400);
  });
});

/**
 * A ford across the ground from x 700 to 900, and a paddling pool on the
 * deck, over open ground (#3463).
 */
const SHALLOW_LAYERS: MatchLayers = {
  ...LAYERS,
  deepWater: [[], []],
  shallowWater: [[rect(700, 0, 200, 800)], [rect(1300, 320, 60, 160)]],
};
const FULL_STRIDE = RULESET.movement.maxSpeedUnitsPerSecond * DT;

function ford(participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "ford",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: SHALLOW_LAYERS,
    participants,
  });
}

/** How far `id` walks east in one tick from where it stands. */
function stride(sim: MatchSimulation, id: string): number {
  const before = get(sim, id).position.x;
  sim.step(DT);
  return get(sim, id).position.x - before;
}

describe("shallow water (#3463)", () => {
  it("slows a body walking through it to three quarters, and only there", () => {
    const sim = ford([spec("a", 0, vec2(600, 400), 0)]);
    sim.setInputDirection("a", vec2(1, 0));
    expect(stride(sim, "a")).toBeCloseTo(FULL_STRIDE, 5);
    while (get(sim, "a").position.x < 750) sim.step(DT);
    expect(stride(sim, "a")).toBeCloseTo(0.75 * FULL_STRIDE, 5);
    while (get(sim, "a").position.x < 950) sim.step(DT);
    expect(stride(sim, "a")).toBeCloseTo(FULL_STRIDE, 5);
  });

  it("on a deck slows a body on the deck, not one on the ground under it", () => {
    const sim = ford([spec("up", 0, vec2(1320, 400), 1), spec("down", 0, vec2(1320, 400), 0)]);
    sim.setInputDirection("up", vec2(1, 0));
    sim.setInputDirection("down", vec2(1, 0));
    expect(stride(sim, "up")).toBeCloseTo(0.75 * FULL_STRIDE, 5);
    expect(get(sim, "down").position.x - 1320).toBeCloseTo(FULL_STRIDE, 5);
  });

  it("stacks with Cripple: half of three quarters", () => {
    const sim = ford([spec("a", 0, vec2(800, 400), 0)]);
    get(sim, "a").combatant.statuses.apply("crippled", 1e6, "x", NO_RANKS);
    sim.setInputDirection("a", vec2(1, 0));
    expect(stride(sim, "a")).toBeCloseTo(0.375 * FULL_STRIDE, 5);
  });

  it("slows a fast body by a quarter, Dash past the cap (#4095)", () => {
    const sim = ford([spec("a", 0, vec2(500, 400), 0), spec("b", 0, vec2(800, 600), 0)]);
    for (const id of ["a", "b"]) {
      get(sim, id).combatant.statuses.apply("dash", 1e6, id, NO_RANKS);
      sim.setInputDirection(id, vec2(1, 0));
    }
    // Dash breaks the +33% cap: 1.5 on dry ground; in water 1.5 × 0.75 = 1.125.
    expect(stride(sim, "a")).toBeCloseTo(1.5 * FULL_STRIDE, 5);
    expect(get(sim, "b").position.x - 800).toBeCloseTo(1.125 * FULL_STRIDE, 5);
  });
});
