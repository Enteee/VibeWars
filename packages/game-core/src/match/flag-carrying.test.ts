import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedWeaponSet } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { FLAG_STAND_ID } from "./carried.js";
import {
  FLAG_CARRIER_SPEED_MULTIPLIER,
  FLAG_REACH_UNITS,
  STAND_HOLD_SECONDS,
  flagId,
  type FlagField,
} from "./flags.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Flags in the simulation (#1225): Space on a flag walks to it and takes
 * it up; a carrier's hands are full and it walks slower; it drops on
 * death, leaving, the Drop button and a weapon swap; planted, the stand
 * boosts its holder's morale every two minutes.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPEED = RULES.movement.maxSpeedUnitsPerSecond;
const FIREBALL = "elementalist.fireball";
const SWIFT_CHOP = "warrior.swift-chop";

const FIELD: FlagField = {
  stand: vec2(1000, 300),
  spawns: [
    { team: 0, position: vec2(300, 300) },
    { team: 1, position: vec2(1700, 300) },
  ],
};

const AXE: ResolvedWeaponSet = {
  equipment: {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.axe,
      attributeId: "warrior.axe-mastery",
      damageType: WEAPONS.axe.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  },
  maxEnergy: 40,
};

/** An axe in hand, an attack skill and a spell on the bar, a spare axe in set 2. */
function fighter(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [SWIFT_CHOP, FIREBALL],
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment: AXE.equipment,
    maxEnergy: AXE.maxEnergy,
    spareWeaponSets: [AXE, null, null],
    spawn,
    facing: 0,
    maxHealth: 480,
  };
}

/** `a` on team 0 beside its flag, `x` on team 1 beside its own. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "flags",
    bounds: { width: 2000, height: 600 },
    flagField: FIELD,
    participants: [fighter("a", 0, vec2(200, 300)), fighter("x", 1, vec2(1800, 300))],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** Space on `id`'s own flag, and the walk until it is in hand. */
function pickUp(sim: MatchSimulation, id: string): void {
  const team = get(sim, id).combatant.team;
  expect(applyIntent(sim, id, { kind: "target", targetSessionId: flagId(team) })).toBeNull();
  expect(applyIntent(sim, id, { kind: "attack", targetId: flagId(team) })).toBeNull();
  for (let tick = 0; tick < 200 && !sim.carriesBundle(id); tick += 1) {
    sim.step(DT);
  }
  expect(sim.carriesBundle(id)).toBe(true);
}

/** `a` carries its flag next to the stand. */
function atStand(sim: MatchSimulation): void {
  pickUp(sim, "a");
  get(sim, "a").position = vec2(FIELD.stand.x - 100, FIELD.stand.y);
}

describe("Space on a flag", () => {
  it("walks to its own flag and takes it up in reach", () => {
    const sim = match();
    expect(get(sim, "a").targetId).toBeUndefined();
    pickUp(sim, "a");
    expect(get(sim, "a").targetId).toBe(flagId(0));
    expect(distance(get(sim, "a").position, FIELD.spawns[0]?.position ?? vec2(0, 0))).toBeLessThan(
      FLAG_REACH_UNITS + 0.001,
    );
    expect(sim.flags[0]).toEqual({ team: 0, place: { kind: "carried", carrierId: "a" } });
    expect(get(sim, "a").interact).toBeUndefined();
  });

  it("refuses a foe's flag, and nobody walks", () => {
    const sim = match();
    expect(applyIntent(sim, "a", { kind: "attack", targetId: flagId(1) })).toEqual({
      kind: "attack",
      reason: "not-your-flag",
    });
    sim.step(DT);
    expect(get(sim, "a").position).toEqual(vec2(200, 300));
  });

  it("refuses the stand with no flag in hand", () => {
    const sim = match();
    expect(applyIntent(sim, "a", { kind: "attack", targetId: FLAG_STAND_ID })).toEqual({
      kind: "attack",
      reason: "no-flag-carried",
    });
  });

  it("is ended by a move, and takes nothing", () => {
    const sim = match();
    applyIntent(sim, "a", { kind: "attack", targetId: flagId(0) });
    sim.step(DT);
    applyIntent(sim, "a", { kind: "move", dirX: -1, dirY: 0 });
    stepFor(sim, 3);
    expect(get(sim, "a").interact).toBeUndefined();
    expect(sim.carriesBundle("a")).toBe(false);
  });

  it("dies with its walker: back on its feet, it walks nowhere", () => {
    const sim = new MatchSimulation({
      seed: "flags",
      bounds: { width: 2000, height: 600 },
      flagField: FIELD,
      participants: [
        { ...fighter("a", 0, vec2(200, 300)), reset: { kind: "on-death", afterSeconds: 1 } },
      ],
    });
    const a = get(sim, "a");
    applyIntent(sim, "a", { kind: "attack", targetId: flagId(0) });
    sim.step(DT);
    a.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
    a.combatant.health = 0.2;
    sim.step(DT);
    expect(a.combatant.dead).toBe(true);
    expect(a.interact).toBeUndefined();
    for (let tick = 0; tick < 200 && a.combatant.dead; tick += 1) {
      sim.step(DT);
    }
    expect(a.combatant.dead).toBe(false);
    const risen = a.position;
    stepFor(sim, 2);
    expect(a.position).toEqual(risen);
    expect(sim.carriesBundle("a")).toBe(false);
  });

  it("is ended by a reset", () => {
    const sim = match();
    applyIntent(sim, "a", { kind: "attack", targetId: flagId(0) });
    sim.step(DT);
    sim.resetParticipant("a");
    expect(get(sim, "a").interact).toBeUndefined();
    stepFor(sim, 2);
    expect(get(sim, "a").position).toEqual(vec2(200, 300));
  });

  it("waits out a knockdown at the stand, then plants", () => {
    const sim = match();
    atStand(sim);
    get(sim, "a").combatant.knockdownRemaining = 1;
    applyIntent(sim, "a", { kind: "attack", targetId: FLAG_STAND_ID });
    stepFor(sim, 0.5);
    expect(sim.carriesBundle("a")).toBe(true);
    stepFor(sim, 2);
    expect(sim.carriesBundle("a")).toBe(false);
    expect(sim.stand).toEqual({ holder: 0, heldSeconds: expect.any(Number) as number });
  });

  it("ignores a flag on a map without a stand: an attack on nobody", () => {
    const sim = new MatchSimulation({
      seed: "no-flags",
      participants: [fighter("a", 0, vec2(200, 300))],
    });
    expect(applyIntent(sim, "a", { kind: "attack", targetId: flagId(0) })).toEqual({
      kind: "attack",
      reason: "no-target",
    });
    expect(sim.flags).toEqual([]);
    expect(sim.stand).toBeUndefined();
  });
});

describe("a carrier", () => {
  it("cannot swing a weapon or use an attack skill, but can cast a spell", () => {
    const sim = match();
    pickUp(sim, "a");
    get(sim, "x").position = vec2(400, 300);
    expect(applyIntent(sim, "a", { kind: "attack", targetId: "x" })).toEqual({
      kind: "attack",
      reason: "hands-full",
    });
    applyIntent(sim, "a", { kind: "target", targetSessionId: "x" });
    expect(applyIntent(sim, "a", { kind: "use-skill", slot: 0 })).toEqual({
      kind: "skill",
      slot: 0,
      skillId: SWIFT_CHOP,
      reason: "hands-full",
    });
    expect(applyIntent(sim, "a", { kind: "use-skill", slot: 1 })).toBeNull();
    expect(get(sim, "a").combatant.cast.activeCast?.skillId).toBe(FIREBALL);
  });

  it("walks at 1/1.2 of its speed", () => {
    const sim = match();
    pickUp(sim, "a");
    const before = get(sim, "a").position;
    applyIntent(sim, "a", { kind: "move", dirX: 1, dirY: 0 });
    stepFor(sim, 1);
    const walked = get(sim, "a").position.x - before.x;
    expect(walked).toBeCloseTo(SPEED / FLAG_CARRIER_SPEED_MULTIPLIER, 3);
  });
});

describe("dropping the flag", () => {
  it("leaves it where the carrier dies, for its team to take up again", () => {
    const sim = match();
    pickUp(sim, "a");
    const where = get(sim, "a").position;
    const carrier = get(sim, "a").combatant;
    carrier.statuses.apply("burning", 10, "x", NO_RANKS);
    carrier.health = 0.2;
    sim.step(DT);
    expect(carrier.dead).toBe(true);
    expect(sim.flags[0]).toEqual({ team: 0, place: { kind: "ground", position: where } });
  });

  it("on the Drop button, where they stand", () => {
    const sim = match();
    pickUp(sim, "a");
    const where = get(sim, "a").position;
    expect(applyIntent(sim, "a", { kind: "drop-bundle" })).toBeNull();
    expect(sim.flags[0]).toEqual({ team: 0, place: { kind: "ground", position: where } });
    expect(applyIntent(sim, "a", { kind: "attack", targetId: "x" })).toBeNull();
  });

  it("on a weapon swap", () => {
    const sim = match();
    pickUp(sim, "a");
    applyIntent(sim, "a", { kind: "weapon-set", set: 1 });
    expect(sim.flags[0]?.place.kind).toBe("ground");
  });

  it("when the carrier leaves the match", () => {
    const sim = match();
    pickUp(sim, "a");
    const where = get(sim, "a").position;
    sim.remove("a");
    expect(sim.flags[0]).toEqual({ team: 0, place: { kind: "ground", position: where } });
  });
});

describe("the stand", () => {
  it("boosts its holder's morale by 10 every two minutes, and readies spent skills", () => {
    const sim = match();
    atStand(sim);
    applyIntent(sim, "a", { kind: "attack", targetId: FLAG_STAND_ID });
    for (let tick = 0; tick < 200 && sim.stand?.holder === undefined; tick += 1) {
      sim.step(DT);
    }
    expect(sim.stand).toEqual({ holder: 0, heldSeconds: 0 });
    get(sim, "a").combatant.cast.spend(FIREBALL);
    expect(get(sim, "a").combatant.cast.spent.size).toBe(1);
    stepFor(sim, STAND_HOLD_SECONDS - 1);
    expect(get(sim, "a").combatant.morale).toBe(0);
    stepFor(sim, 1);
    expect(get(sim, "a").combatant.morale).toBe(10);
    expect(get(sim, "x").combatant.morale).toBe(0);
    expect(get(sim, "a").combatant.cast.spent.size).toBe(0);
  });

  it("sends the foe's flag home when planted over it", () => {
    const sim = match();
    atStand(sim);
    applyIntent(sim, "a", { kind: "attack", targetId: FLAG_STAND_ID });
    stepFor(sim, 1);
    pickUp(sim, "x");
    get(sim, "x").position = vec2(FIELD.stand.x + 100, FIELD.stand.y);
    applyIntent(sim, "x", { kind: "attack", targetId: FLAG_STAND_ID });
    stepFor(sim, 1);
    expect(sim.flags).toEqual([
      { team: 0, place: { kind: "spawn" } },
      { team: 1, place: { kind: "stand" } },
    ]);
    expect(sim.stand?.holder).toBe(1);
  });
});
