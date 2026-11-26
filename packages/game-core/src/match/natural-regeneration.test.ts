import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS, HEALTH_PER_PIP } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ORISON = "monk.orison-of-healing";
const VITAL_TRANSFER = "necromancer.blood-renewal-lite";

/** Wounded to a tenth, so nothing in these tests heals it full. */
function wounded(
  id: string,
  team: number,
  spawn: Vec2,
  weapon: Weapon = WEAPONS.unarmed,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [FIREBALL, ORISON, VITAL_TRANSFER],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon,
        attributeId: "ranger.marksmanship",
        damageType: weapon.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    spawn,
    facing: 0,
    baseEnergyPips: 4,
    startHealthFraction: 0.1,
  };
}

/** a and b, both wounded, 200 apart on opposite teams; nobody does anything unless told. */
function pair(weapon?: Weapon): MatchSimulation {
  return new MatchSimulation({
    seed: "natural-regeneration",
    participants: [wounded("a", 0, vec2(0, 0), weapon), wounded("b", 1, vec2(200, 0))],
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
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** The health pips each of `ids` regenerates over the next tick, from how far its health moves. */
function pipsNextTick(sim: MatchSimulation, ...ids: string[]): number[] {
  const before = ids.map((id) => get(sim, id).combatant.health);
  sim.step(DT);
  return ids.map(
    (id, i) => (get(sim, id).combatant.health - (before[i] ?? 0)) / (HEALTH_PER_PIP * DT),
  );
}

describe("natural health regeneration (#460)", () => {
  it("starts at +1 after 5 s out of combat, then rises a pip every 2 s to +7", () => {
    const sim = pair();
    const a = get(sim, "a");
    const start = a.combatant.health;
    stepFor(sim, 5 - DT);
    expect(a.combatant.health).toBe(start);

    const ramp: number[] = [];
    for (let second = 5; second <= 21; second += 2) {
      // The tick ending at `second`, then the rest of the 2 s.
      ramp.push(pipsNextTick(sim, "a")[0] ?? Number.NaN);
      stepFor(sim, 2 - DT);
    }
    expect(ramp.map((pips) => Number(pips.toFixed(6)))).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 7]);
  });

  it("adds to the statuses' pips before the ±10 clamp", () => {
    const sim = pair();
    const a = get(sim, "a");
    a.combatant.statuses.apply("regeneration", 60, "a", NO_RANKS);
    expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(4, 6);
    stepFor(sim, 20);
    // Regeneration +4 and natural +7 is 11, clamped to 10.
    expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(10, 6);
  });

  it("is none at full health, and none for the dead", () => {
    const sim = new MatchSimulation({
      seed: "natural-regeneration",
      participants: [
        { ...wounded("full", 0, vec2(0, 0)), startHealthFraction: 1 },
        wounded("dead", 1, vec2(200, 0)),
      ],
    });
    const full = get(sim, "full");
    const dead = get(sim, "dead");
    dead.combatant.health = 1;
    dead.combatant.statuses.apply("burning", 1, "full", NO_RANKS);
    stepFor(sim, 10);
    expect(dead.combatant.dead).toBe(true);
    expect(full.combatant.health).toBe(full.combatant.maxHealth);
    expect(dead.combatant.health).toBe(0);
  });

  it("starts over from 0 on a respawn", () => {
    const sim = pair();
    stepFor(sim, 10);
    expect(pipsNextTick(sim, "a")[0]).toBeGreaterThan(0);
    sim.resetParticipant("a");
    expect(pipsNextTick(sim, "a")[0]).toBe(0);
    stepFor(sim, 5);
    expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(1, 6);
  });

  describe("goes straight back to 0", () => {
    it("for the caster and the foe, when a cast at a foe begins", () => {
      const sim = pair();
      stepFor(sim, 10);
      sim.setTarget("a", "b");
      expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
      expect(pipsNextTick(sim, "a", "b")).toEqual([0, 0]);
    });

    it("for both, when that cast is cancelled at once", () => {
      const sim = pair();
      stepFor(sim, 10);
      sim.setTarget("a", "b");
      sim.requestSkill("a", 0);
      sim.cancelAction("a");
      expect(get(sim, "a").combatant.cast.isCasting).toBe(false);
      expect(pipsNextTick(sim, "a", "b")).toEqual([0, 0]);
      stepFor(sim, 4);
      expect(pipsNextTick(sim, "a", "b")).toEqual([0, 0]);
    });

    it.each([
      ["a melee swing", WEAPONS.unarmed],
      ["a bow's shot", WEAPONS.longbow],
    ])("for the attacker on %s, and for the foe it hits", (_name, weapon) => {
      const sim = pair(weapon);
      stepFor(sim, 10);
      expect(sim.requestAttack("a", "b")).toEqual({ ok: true });
      stepFor(sim, 5);
      // Stopped, and every shot landed: neither has had 5 s since.
      sim.cancelAction("a");
      stepFor(sim, 2);
      expect(pipsNextTick(sim, "a", "b")).toEqual([0, 0]);
    });

    it("on degeneration", () => {
      const sim = pair();
      stepFor(sim, 10);
      get(sim, "a").combatant.statuses.apply("poison", 10, "b", NO_RANKS);
      expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(-4, 6);
      stepFor(sim, 6);
      expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(-4, 6);
    });

    it("on a sacrifice, even of a skill on yourself", () => {
      const sim = pair();
      stepFor(sim, 10);
      expect(sim.requestSkill("a", 2)?.check).toEqual({ ok: true });
      stepFor(sim, 2);
      expect(pipsNextTick(sim, "a")[0]).toBe(0);
    });
  });

  describe("keeps counting", () => {
    it("through a heal on yourself", () => {
      const sim = pair();
      stepFor(sim, 10);
      expect(sim.requestSkill("a", 1)?.check).toEqual({ ok: true });
      stepFor(sim, 2);
      // 12.05 s out of combat: +1 at 5 s, and one more for each 2 s since.
      expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(4, 6);
    });

    it("through a degeneration that a regeneration cancels", () => {
      const sim = pair();
      const a = get(sim, "a");
      a.combatant.statuses.apply("poison", 60, "b", NO_RANKS);
      a.combatant.statuses.apply("regeneration", 60, "a", NO_RANKS);
      stepFor(sim, 10);
      // Poison −4 and Regeneration +4 lose no health, so 10 s out of combat.
      expect(pipsNextTick(sim, "a")[0]).toBeCloseTo(3, 6);
    });
  });
});

describe("net pips (#504)", () => {
  it("are what the tick applies: +1 after 5 s out of combat with nothing else", () => {
    const sim = pair();
    stepFor(sim, 5);
    expect(sim.pips(get(sim, "a"))).toEqual({ health: 1, energy: 4 });
    const [applied] = pipsNextTick(sim, "a");
    expect(applied).toBeCloseTo(1, 9);
  });

  it("sum every status with natural regeneration and the base, then clamp at ±10", () => {
    const sim = pair();
    const a = get(sim, "a").combatant;
    a.statuses.apply("regeneration", 60, "a", NO_RANKS);
    a.statuses.apply("blood-ritual", 60, "a", NO_RANKS);
    expect(sim.pips(get(sim, "a"))).toEqual({ health: 4, energy: 7 });
    a.statuses.apply("burning", 60, "b", NO_RANKS);
    a.statuses.apply("bleeding", 60, "b", NO_RANKS);
    a.statuses.apply("poison", 60, "b", NO_RANKS);
    a.statuses.apply("faintheartedness", 60, "b", NO_RANKS);
    // 4 − 7 − 3 − 4 − 2 = −12: clamped.
    expect(sim.pips(get(sim, "a")).health).toBe(-10);
    const [applied] = pipsNextTick(sim, "a");
    expect(applied).toBeCloseTo(-10, 9);
  });

  it("are none for the dead", () => {
    const sim = pair();
    const a = get(sim, "a").combatant;
    a.statuses.apply("regeneration", 60, "a", NO_RANKS);
    a.dead = true;
    expect(sim.pips(get(sim, "a"))).toEqual({ health: 0, energy: 0 });
  });
});
