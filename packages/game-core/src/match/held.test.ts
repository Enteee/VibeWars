import { describe, expect, it } from "vitest";

import { SPAWN_BUBBLE_RADIUS } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment } from "../geometry.js";
import { clampToCircle } from "../movement.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
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
    skillBar: [FIREBALL],
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
    sim.stepHeld(DT);
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

  it("drops a skill or an attack asked for while held, and nothing fires at the start", () => {
    const sim = pair();
    sim.stepHeld(DT);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)).toBeUndefined();
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

  it("changes nobody's health or energy", () => {
    const sim = pair();
    one(sim, "a").combatant.energy = 10;
    one(sim, "b").combatant.health = 100;
    hold(sim, 5);
    expect(one(sim, "a").combatant.energy).toBe(10);
    expect(one(sim, "b").combatant.health).toBe(100);
  });

  it("keeps a bot still: it neither chases nor swings", () => {
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
    sim.stepHeld(DT);
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
    const result = sim.stepHeld(DT);
    expect(result.tick).toBe(1);
    expect(one(sim, "a").position).toEqual(before);
  });

  it("does nothing once the match is over", () => {
    const sim = pair();
    sim.forfeit(1, new Set([0, 1]));
    sim.step(DT);
    expect(sim.phase).toBe("finished");
    const tick = sim.tick;
    sim.stepHeld(DT);
    expect(sim.tick).toBe(tick);
  });
});
