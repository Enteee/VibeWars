import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { KILL_COUNT_MATCH_RULES } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** A status from a script, not a skill or a zone (#3303): the tutorial's bleeding tutor. */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

function spec(id: string, spawn: number): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn: vec2(spawn, 0),
    facing: 0,
  };
}

function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "afflict",
    matchRules: KILL_COUNT_MATCH_RULES,
    participants: [spec("a", 0), spec("b", 100)],
  });
}

function health(sim: MatchSimulation, id: string): number {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant.health;
}

describe("MatchSimulation.afflict (#3303)", () => {
  it("bleeds the one it names for as long as it lasts, and nobody else", () => {
    const sim = match();
    const full = health(sim, "a");
    sim.afflict("a", "bleeding", 2, "script");
    for (let elapsed = 0; elapsed < 3; elapsed += DT) {
      sim.step(DT);
    }
    // Bleeding: −3 pips, 6 health a second, for 2 s.
    expect(health(sim, "a")).toBeCloseTo(full - 12, 0);
    expect(health(sim, "b")).toBe(full);
    const after = health(sim, "a");
    sim.step(DT);
    expect(health(sim, "a")).toBe(after);
  });

  it("does nothing to someone not in the match", () => {
    const sim = match();
    expect(() => {
      sim.afflict("nobody", "bleeding", 2, "script");
    }).not.toThrow();
  });
});
