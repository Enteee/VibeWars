import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { KILL_COUNT_MATCH_RULES, moraleMaximum, type MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Morale and the death penalty (#843, GW1): −15% a death down to −60%,
 * +2% back to the living foes, a boost up to +10%, and the maxima follow
 * it on the base, before upgrades.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BASE_HEALTH = RULES.combat.baseHealth;
const BASE_ENERGY = RULES.combat.baseEnergy;
const DP: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 1,
  deathPenalty: true,
};
const RESTORE_LIFE = "monk.restore-life";

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [RESTORE_LIFE],
    attributeRanks: new Map([["monk.healing-prayers", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** `a` and `m` (a Monk) on team 0, `x` and `y` on team 1, far apart. */
function match(rules: MatchRules = DP): MatchSimulation {
  return new MatchSimulation({
    seed: "morale",
    matchRules: rules,
    participants: [
      spec("a", 0, vec2(0, 0)),
      spec("m", 0, vec2(30, 0)),
      spec("x", 1, vec2(600, 0)),
      spec("y", 1, vec2(600, 60)),
    ],
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

/** Kill every one of `ids` in the same tick, as burning would. */
function kill(sim: MatchSimulation, ...ids: string[]): void {
  for (const id of ids) {
    const victim = get(sim, id).combatant;
    victim.statuses.apply("burning", 10, "foe", NO_RANKS);
    victim.health = 0.2;
  }
  sim.step(DT);
  for (const id of ids) {
    expect(get(sim, id).combatant.dead).toBe(true);
  }
}

/** Kill `id` and wait out its respawn. */
function killAndRespawn(sim: MatchSimulation, id: string): void {
  kill(sim, id);
  stepFor(sim, DP.respawnSeconds + DT);
  expect(get(sim, id).combatant.dead).toBe(false);
}

const morale = (sim: MatchSimulation, id: string) => get(sim, id).combatant.morale;

describe("morale and the death penalty (#843)", () => {
  it("takes 15% a death, down to −60%, and keeps it through the respawn", () => {
    const sim = match();
    const expected = [-15, -30, -45, -60, -60];
    for (const value of expected) {
      killAndRespawn(sim, "a");
      expect(morale(sim, "a")).toBe(value);
    }
    const a = get(sim, "a").combatant;
    expect(a.maxHealth).toBe(Math.floor(BASE_HEALTH * 0.4));
    expect(a.health).toBe(a.maxHealth);
  });

  it("a reset clears it: morale 0, the full maxima, at full health", () => {
    const sim = match();
    killAndRespawn(sim, "a");
    killAndRespawn(sim, "a");
    sim.resetParticipant("a");
    const a = get(sim, "a").combatant;
    expect(a.morale).toBe(0);
    expect(a.maxHealth).toBe(BASE_HEALTH);
    expect(a.health).toBe(BASE_HEALTH);
    expect(a.maxEnergy).toBe(BASE_ENERGY);
  });

  it("takes nothing with the death penalty off: the kill-count match", () => {
    expect(KILL_COUNT_MATCH_RULES.deathPenalty).toBe(false);
    const sim = match(KILL_COUNT_MATCH_RULES);
    kill(sim, "a", "x");
    stepFor(sim, KILL_COUNT_MATCH_RULES.respawnSeconds + DT);
    for (const id of ["a", "m", "x", "y"]) {
      expect(morale(sim, id)).toBe(0);
    }
    expect(get(sim, "a").combatant.maxHealth).toBe(BASE_HEALTH);
  });

  it("takes nothing for a death within 5 s of a resurrection, and 15% at 5.1 s", () => {
    const sim = match({ ...DP, deathRule: "resurrection-only" });
    const raise = () => {
      sim.setTarget("m", "a");
      expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
      stepFor(sim, 4 + 2 * DT);
      expect(get(sim, "a").combatant.dead).toBe(false);
    };
    kill(sim, "a");
    raise();
    expect(morale(sim, "a")).toBe(-15);
    stepFor(sim, 4.8);
    kill(sim, "a");
    expect(morale(sim, "a")).toBe(-15);

    // Restore Life's recharge.
    stepFor(sim, 10);
    raise();
    stepFor(sim, 5.1);
    kill(sim, "a");
    expect(morale(sim, "a")).toBe(-30);
  });

  it("gives the living foes 2% back, up to 0, and nothing to a foe who is dead", () => {
    const sim = match();
    killAndRespawn(sim, "x");
    killAndRespawn(sim, "y");
    kill(sim, "y");
    expect(morale(sim, "x")).toBe(-15);
    expect(morale(sim, "y")).toBe(-30);

    kill(sim, "a");
    expect(morale(sim, "x")).toBe(-13);
    expect(morale(sim, "y")).toBe(-30);
    // At 0 a kill gives nothing: no boost from kills.
    expect(morale(sim, "m")).toBe(0);

    sim.moraleBoost(1, 12);
    expect(morale(sim, "x")).toBe(-1);
    kill(sim, "m");
    expect(morale(sim, "x")).toBe(0);
  });

  it("two deaths in one tick: neither victim gains from the other's", () => {
    const sim = match();
    killAndRespawn(sim, "a");
    killAndRespawn(sim, "x");
    killAndRespawn(sim, "y");
    // Each death so far gave the living foes 2% back: a −11, and x and y, on one team, −15.
    kill(sim, "a", "x");
    expect(morale(sim, "a")).toBe(-26);
    expect(morale(sim, "x")).toBe(-30);
    // The living one gains from `a`'s death only.
    expect(morale(sim, "y")).toBe(-13);
  });

  it("boosts the whole team, dead or alive, up to +10%; from −30 a 10 boost is −20", () => {
    const sim = match();
    killAndRespawn(sim, "a");
    killAndRespawn(sim, "a");
    kill(sim, "m");
    sim.moraleBoost(0, 10);
    expect(morale(sim, "a")).toBe(-20);
    expect(morale(sim, "m")).toBe(-5);
    expect(morale(sim, "x")).toBe(0);
    sim.moraleBoost(0, 40);
    expect(morale(sim, "a")).toBe(10);
    expect(morale(sim, "m")).toBe(10);
    expect(get(sim, "a").combatant.maxHealth).toBe(Math.floor(BASE_HEALTH * 1.1));
  });

  it("clamps energy to the lowered maximum, and leaves health alone on a rise", () => {
    const sim = match();
    const a = get(sim, "a").combatant;
    a.energy = BASE_ENERGY;
    kill(sim, "a");
    expect(a.maxEnergy).toBe(Math.floor(BASE_ENERGY * 0.85));
    expect(a.energy).toBeLessThanOrEqual(a.maxEnergy);

    stepFor(sim, DP.respawnSeconds + DT);
    const before = a.health;
    expect(before).toBe(Math.floor(BASE_HEALTH * 0.85));
    sim.moraleBoost(0, 15);
    expect(a.maxHealth).toBe(BASE_HEALTH);
    expect(a.health).toBe(before);
  });

  it("applies the share to the base and keeps what equipment adds", () => {
    expect(moraleMaximum(480, 480, -15)).toBe(408);
    expect(moraleMaximum(480, 520, -15)).toBe(448);
    expect(moraleMaximum(50, 50, -15)).toBe(42);
    expect(moraleMaximum(480, 480, 10)).toBe(528);
    expect(moraleMaximum(480, 480, 0)).toBe(480);

    const sim = new MatchSimulation({
      seed: "morale",
      matchRules: DP,
      participants: [
        spec("a", 0, vec2(0, 0), { maxHealth: BASE_HEALTH + 40, maxEnergy: BASE_ENERGY + 5 }),
      ],
    });
    kill(sim, "a");
    const a = get(sim, "a").combatant;
    expect(a.maxHealth).toBe(Math.floor(BASE_HEALTH * 0.85) + 40);
    expect(a.maxEnergy).toBe(Math.floor(BASE_ENERGY * 0.85) + 5);
  });

  it("keeps the dead dead past respawnSeconds under resurrection-only", () => {
    const sim = match({ ...DP, deathRule: "resurrection-only" });
    kill(sim, "a");
    stepFor(sim, DP.respawnSeconds * 5);
    expect(get(sim, "a").combatant.dead).toBe(true);
  });
});
