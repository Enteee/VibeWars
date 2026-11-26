import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS } from "./status.js";
import type { Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Unyielding Aura (#2470), its PvP version: a maintained resurrection at
 * full Health and Energy whose end kills the ally again and leaves its
 * corpse exploited, with no death penalty for either death.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ID = "monk.unyielding-aura";
const DP: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: true,
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[], favor: number) {
  const participant: ParticipantSpec = {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: new Map([["monk.divine-favor", favor]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
  return participant;
}

function record(sim: MatchSimulation, id: string) {
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

/** `id` burns to death this tick. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = record(sim, id);
  combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  combatant.health = 0.2;
  sim.step(DT);
  expect(combatant.dead).toBe(true);
}

/**
 * `a` dies, then `m` casts Unyielding Aura on its corpse at Divine Favor
 * `favor`; `x`, a foe, far off. Whether the cast took.
 */
function aura(favor = 12, seed = "unyielding-aura") {
  const sim = new MatchSimulation({
    seed,
    matchRules: DP,
    participants: [
      spec("a", 0, vec2(0, 0), [], 0),
      spec("m", 0, vec2(200, 0), [ID], favor),
      spec("x", 1, vec2(900, 0), [], 0),
    ],
  });
  kill(sim, "a");
  sim.setTarget("m", "a");
  expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
  stepFor(sim, skill(ID).activationSeconds + 0.1);
  const a = record(sim, "a");
  return { sim, a, raised: !a.combatant.dead };
}

describe("Unyielding Aura (#2470)", () => {
  it("is the corpus's PvP version: 5 Energy, upkeep, 3 s, 15 s, elite, Divine Favor", () => {
    expect(skill(ID)).toMatchObject({
      gwId: 268,
      type: "enchantment",
      elite: true,
      attributeId: "monk.divine-favor",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 3,
      rechargeSeconds: 15,
      target: "single-dead-ally",
    });
    expect(skill(ID).effects.map(({ kind }) => kind)).toEqual(["resurrect", "if"]);
  });

  it("raises the ally at full Health and Energy, maintained by its caster", () => {
    const { sim, a } = aura();
    expect(a.combatant.dead).toBe(false);
    expect(a.combatant.health).toBe(a.combatant.maxHealth);
    expect(a.combatant.energy).toBe(a.combatant.maxEnergy);
    expect(a.combatant.statuses.has("unyielding-aura")).toBe(true);
    expect(sim.pips(record(sim, "m")).energy).toBe(sim.pips(record(sim, "x")).energy - 1);
  });

  it("an ally another raised mid-cast is left as it is: no aura, no upkeep", () => {
    const sim = new MatchSimulation({
      seed: "unyielding-aura",
      matchRules: DP,
      participants: [
        spec("a", 0, vec2(0, 0), [], 0),
        spec("m", 0, vec2(200, 0), [ID], 12),
        spec("x", 1, vec2(900, 0), [], 0),
      ],
    });
    kill(sim, "a");
    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1);
    // Another resurrection lands first, at half Health.
    const a = record(sim, "a").combatant;
    a.dead = false;
    a.health = a.maxHealth / 2;
    stepFor(sim, skill(ID).activationSeconds);
    expect(a.health).toBeLessThan(a.maxHealth);
    expect(a.statuses.has("unyielding-aura")).toBe(false);
    expect(sim.pips(record(sim, "m")).energy).toBe(sim.pips(record(sim, "x")).energy);
  });

  it("cancelled, the ally dies and its corpse is exploited, paying no death penalty", () => {
    const { sim, a } = aura();
    stepFor(sim, 5);
    expect(a.combatant.dead).toBe(false);
    expect(sim.endUpkeep("m", "a", "unyielding-aura")).toBe(true);
    sim.step(DT);
    expect(a.combatant.dead).toBe(true);
    expect(a.corpseExploited).toBe(true);
    expect(a.combatant.morale).toBe(-15);
  });

  it("removed from the ally, the same", () => {
    const { sim, a } = aura();
    a.combatant.statuses.removeByCategory("enchantment");
    sim.step(DT);
    expect(a.combatant.dead).toBe(true);
    expect(a.corpseExploited).toBe(true);
  });

  it("its caster dies, the same", () => {
    const { sim, a } = aura();
    kill(sim, "m");
    sim.step(DT);
    expect(a.combatant.dead).toBe(true);
    expect(a.corpseExploited).toBe(true);
  });

  it("killed while enchanted, the ally dies once, its corpse not exploited, no death penalty", () => {
    const { sim, a } = aura();
    kill(sim, "a");
    sim.step(DT);
    expect(a.corpseExploited).toBe(false);
    expect(a.combatant.morale).toBe(-15);
  });

  it("fails half the time at Divine Favor 4, and never at 5", () => {
    const low = Array.from({ length: 12 }, (_, i) => aura(4, `unyielding-${String(i)}`).raised);
    expect(low).toContain(true);
    expect(low).toContain(false);
    for (let i = 0; i < 12; i += 1) {
      expect(aura(5, `unyielding-${String(i)}`).raised).toBe(true);
    }
  });

  it("describes the end-death and the exploited corpse", () => {
    const text = describeStatus("unyielding-aura", undefined, EN_WORDS, EN_NAMES);
    expect(text).toContain("dies when it ends");
    expect(text).toContain("leaves an exploited corpse");
    expect(text).toContain("no death penalty");
  });
});
