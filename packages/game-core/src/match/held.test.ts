import { describe, expect, it } from "vitest";

import { SPAWN_BUBBLE_RADIUS } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment, type Polygon, type Segment } from "../geometry.js";
import { clampToCircle } from "../movement.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import { BOT, BOUNDS, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
/** A timed enchantment on the caster alone: allowed before the start (#3910). */
const AURA = "elementalist.aura-of-restoration";
/** Floating point puts a clamped point a hair past the edge, no more. */
const EDGE = SPAWN_BUBBLE_RADIUS + 1e-9;

function swordsman(id: string, team: number, spawn: Vec2, behaviour?: Behaviour): ParticipantSpec {
  const equipment: ResolvedEquipment = {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.sword,
      attributeId: "warrior.swordsmanship",
      damageType: WEAPONS.sword.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
  return {
    id,
    team,
    skillBar: [FIREBALL, AURA],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment,
    maxEnergy: 50,
    maxHealth: 500,
    spawn,
    facing: 0,
    ...(behaviour === undefined ? {} : { behaviour }),
  };
}

/** `a` at the origin, and `b`, a foe within reach of a sword and a Fireball. */
function pair(behaviour?: Behaviour, walls: ReturnType<typeof segment>[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "held",
    walls,
    participants: [swordsman("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(60, 0), behaviour)],
  });
}

function one(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function hold(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.stepHeld(DT, null);
  }
}

describe("clampToCircle (#3817)", () => {
  it("keeps a point inside, and brings one outside to the nearest point on the edge", () => {
    const inside = vec2(3, 4);
    expect(clampToCircle(inside, vec2(0, 0), 10)).toBe(inside);
    expect(clampToCircle(vec2(30, 40), vec2(0, 0), 10)).toEqual(vec2(6, 8));
    expect(clampToCircle(vec2(110, 0), vec2(100, 0), 5)).toEqual(vec2(105, 0));
  });
});

describe("held before the start (#3817)", () => {
  const rect = (x: number, y: number, width: number, height: number): Polygon => [
    vec2(x, y),
    vec2(x + width, y),
    vec2(x + width, y + height),
    vec2(x, y + height),
  ];
  /** `layer-test`'s bridge, with a drop-off along its north edge (as drop-offs.test.ts). */
  const deckLayers = (ground: readonly Segment[] = []): MatchLayers => ({
    count: 2,
    ground: 0,
    pits: [],
    walls: [ground, []],
    decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
    transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200), uphill: UPHILL.e, pace: 1 }],
    outline: undefined,
    deepWater: [[], []],
    shallowWater: [[], []],
    dropOffs: [{ layer: 1, edge: { a: vec2(700, 300), b: vec2(900, 300) }, outward: vec2(0, -1) }],
  });

  function onDeck(spawn: Vec2, ground: readonly Segment[] = []): MatchSimulation {
    return new MatchSimulation({
      seed: "held-deck",
      ruleset: RULESET,
      bounds: BOUNDS,
      walls: [],
      layers: deckLayers(ground),
      participants: [fighter("a", 0, RANGER, spawn, { layer: 1, behaviour: undefined })],
    });
  }

  it("walks by keys to the edge of the spawn bubble and no further", () => {
    const sim = pair();
    sim.setInputDirection("a", vec2(-1, 0));
    hold(sim, 5);
    const position = one(sim, "a").position;
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(distance(position, vec2(0, 0))).toBeGreaterThan(SPAWN_BUBBLE_RADIUS - 1);
  });

  it("slides along the edge with a key held across it", () => {
    const sim = pair();
    sim.setInputDirection("a", vec2(-1, 0));
    hold(sim, 2);
    sim.setInputDirection("a", vec2(-1, 1));
    hold(sim, 2);
    const position = one(sim, "a").position;
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(position.y).toBeGreaterThan(20);
  });

  it("keeps out of a wall inside the bubble, sliding along both", () => {
    const sim = pair(undefined, [segment(vec2(-40, -200), vec2(-40, 200))]);
    sim.setInputDirection("a", vec2(-1, 1));
    hold(sim, 5);
    const position = one(sim, "a").position;
    expect(position.x).toBeGreaterThan(-40);
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(position.y).toBeGreaterThan(SPAWN_BUBBLE_RADIUS / 2);
  });

  it("stops a click-to-walk to a far point at the edge", () => {
    const sim = pair();
    sim.walkTo("a", vec2(-1000, 0));
    hold(sim, 5);
    const a = one(sim, "a");
    expect(distance(a.position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(a.position.x).toBeLessThan(-(SPAWN_BUBBLE_RADIUS - 1));
  });

  it("counts ticks but not the match clock", () => {
    const sim = pair();
    hold(sim, 1);
    expect(sim.tick).toBe(RULES.tickRateHz);
    expect(sim.elapsedSeconds).toBe(0);
    sim.step(DT);
    expect(sim.tick).toBe(RULES.tickRateHz + 1);
    expect(sim.elapsedSeconds).toBeCloseTo(DT, 9);
  });

  it("refuses a foe's skill and an attack while held, and nothing fires at the start", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)).toEqual({
      skillId: FIREBALL,
      check: { ok: false, reason: "pre-match" },
    });
    expect(sim.requestAttack("a", "b")).toBeUndefined();
    hold(sim, 3);
    const a = one(sim, "a");
    const b = one(sim, "b");
    expect(a.combatant.cast.activeCast).toBeUndefined();
    expect(a.combatant.energy).toBe(50);
    expect(b.combatant.health).toBe(500);

    for (let tick = 0; tick < 3 * RULES.tickRateHz; tick += 1) {
      sim.step(DT);
    }
    expect(a.combatant.energy).toBe(50);
    expect(b.combatant.health).toBe(500);
  });

  it("casts an enchantment on oneself while held, and it runs down (#3910)", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 1)?.check).toEqual({ ok: true });
    hold(sim, 3);
    const aura = one(sim, "a").combatant.statuses.active.find(
      ({ id }) => id === "aura-of-restoration",
    );
    expect(aura).toBeDefined();
    expect(aura?.remainingSeconds).toBeLessThan(60);
    // Still selected: casting on oneself does not drop the foe.
    expect(one(sim, "a").targetId).toBe("b");
    expect(one(sim, "b").combatant.health).toBe(500);
  });

  it("regenerates energy while held, and the match clock stays at 0 (#3910)", () => {
    const sim = pair();
    one(sim, "a").combatant.energy = 10;
    one(sim, "a").combatant.baseEnergyPips = 4;
    hold(sim, 5);
    expect(one(sim, "a").combatant.energy).toBeGreaterThan(10);
    expect(sim.elapsedSeconds).toBe(0);
  });

  it("lets a bot wander within half its bubble, and move at least once in 10 s (#3910)", () => {
    const sim = pair(BOT);
    const b = one(sim, "b");
    let moved = false;
    for (let tick = 0; tick < 10 * RULES.tickRateHz; tick += 1) {
      sim.stepHeld(DT, null);
      moved ||= distance(b.position, vec2(60, 0)) > 1;
      expect(distance(b.position, vec2(60, 0))).toBeLessThanOrEqual(0.5 * SPAWN_BUBBLE_RADIUS + 1);
    }
    expect(moved).toBe(true);
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("keeps a chasing creature still: it neither chases nor swings", () => {
    const sim = pair({
      kind: "parallel",
      behaviours: [
        { kind: "chase", targeting: { kind: "nearest-enemy" }, standOffUnits: 0 },
        { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: undefined },
      ],
    });
    hold(sim, 3);
    expect(one(sim, "b").position).toEqual(vec2(60, 0));
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("holds a participant added while held in its own bubble", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.add(swordsman("c", 0, vec2(0, -300)));
    sim.walkTo("c", vec2(0, 1000));
    hold(sim, 5);
    expect(distance(one(sim, "c").position, vec2(0, -300))).toBeLessThanOrEqual(EDGE);
  });

  it("does nothing once the match has started", () => {
    const sim = pair();
    sim.step(DT);
    sim.setInputDirection("a", vec2(-1, 0));
    const before = one(sim, "a").position;
    const result = sim.stepHeld(DT, null);
    expect(result.tick).toBe(1);
    expect(one(sim, "a").position).toEqual(before);
  });

  it("does nothing once the match is over", () => {
    const sim = pair();
    sim.forfeit(1, new Set([0, 1]));
    sim.step(DT);
    expect(sim.phase).toBe("finished");
    const tick = sim.tick;
    sim.stepHeld(DT, null);
    expect(sim.tick).toBe(tick);
  });

  it("keeps a deck spawn's bubble standable across a drop-off, and spawn on its own layer", () => {
    const spawn = vec2(800, 340);
    const sim = onDeck(spawn);
    const a = one(sim, "a");
    let dropped = false;
    for (const direction of [vec2(0, -1), vec2(1, -1), vec2(0, 1), vec2(-1, 0), vec2(0, -1)]) {
      sim.setInputDirection("a", direction);
      for (let tick = 0; tick < 2 * RULES.tickRateHz; tick += 1) {
        sim.stepHeld(DT, null);
        dropped ||= a.layer === 0;
        expect(distance(a.position, spawn)).toBeLessThanOrEqual(SPAWN_BUBBLE_RADIUS + 1);
        if (a.position.x === spawn.x && a.position.y === spawn.y) {
          expect(a.layer).toBe(1);
        }
      }
      // At rest against the bubble: standing somewhere it may, on the layer it is on.
      expect(sim.standable(a.position, a.layer), JSON.stringify(direction)).toBe(true);
    }
    // It did step off the deck: the bubble holds on the layer below too.
    expect(dropped).toBe(true);
  });

  it("puts one displaced to another layer back at its spawn on the spawn's layer", () => {
    const spawn = vec2(800, 400);
    // Under the deck, a wall right where the bubble's edge would hold it.
    const sim = onDeck(spawn, [segment(vec2(700, 481), vec2(900, 481))]);
    const a = one(sim, "a");
    a.layer = 0;
    a.position = vec2(800, 520);
    sim.stepHeld(DT, null);
    expect(a.position).toEqual(spawn);
    expect(a.layer).toBe(1);
  });
});

describe("bots prepare before the start (#3910)", () => {
  const MENDING = "monk.mending";
  /** A 10 s stance on oneself. */
  const STEADY = "warrior.steady-stance";
  const COUNTDOWN_SECONDS = 10;

  function prepping(): MatchSimulation {
    return new MatchSimulation({
      seed: "prep",
      participants: [
        swordsman("a", 0, vec2(0, 0)),
        {
          ...swordsman("b", 1, vec2(600, 0), BOT),
          skillBar: [MENDING, STEADY],
          attributeRanks: new Map([
            ["monk.healing-prayers", 12],
            ["warrior.tactics", 12],
          ]),
          baseEnergyPips: 4,
        },
      ],
    });
  }

  /** 3 s waiting for the players, then the countdown: what `b` used, when, and where it ended. */
  function hold(sim: MatchSimulation) {
    const used: { readonly skillId: string; readonly secondsLeft: number | null }[] = [];
    const countdown = Math.round(COUNTDOWN_SECONDS / DT);
    const ticks = Math.round(3 / DT) + countdown;
    for (let tick = 0; tick < ticks; tick += 1) {
      const counted = tick - (ticks - countdown);
      const secondsLeft = counted < 0 ? null : (countdown - counted) * DT;
      for (const entry of sim.stepHeld(DT, secondsLeft).log) {
        if (entry.sourceId === "b" && entry.skillId !== undefined) {
          used.push({ skillId: entry.skillId, secondsLeft });
        }
      }
    }
    return { used, at: one(sim, "b").position };
  }

  it("puts a maintained enchantment up while waiting, and a stance only once it lasts past the start", () => {
    const sim = prepping();
    const { used } = hold(sim);
    const mending = used.find(({ skillId }) => skillId === MENDING);
    const steady = used.find(({ skillId }) => skillId === STEADY);
    expect(mending?.secondsLeft).toBeNull();
    expect(steady?.secondsLeft).not.toBeNull();
    expect(steady?.secondsLeft).toBeLessThanOrEqual(8);
    const b = one(sim, "b");
    expect(b.combatant.statuses.has("mending")).toBe(true);
    expect(b.combatant.statuses.has("steady-stance")).toBe(true);
    expect(b.combatant.energy).toBeGreaterThanOrEqual(0.5 * b.combatant.maxEnergy);
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("does the same, in the same places, for the same seed", () => {
    expect(hold(prepping())).toEqual(hold(prepping()));
  });
});
