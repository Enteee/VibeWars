import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { KILL_COUNT_MATCH_RULES, type MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHORT: MatchRules = { ...KILL_COUNT_MATCH_RULES, timeLimitSeconds: 10 };

function spec(id: string, team: number, x: number): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn: vec2(x, 0),
    facing: 0,
  };
}

/** `a` on team 0 and `x` on team 1, far apart: nobody kills but `kill`. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "sudden-death",
    matchRules: SHORT,
    participants: [spec("a", 0, 0), spec("x", 1, 600)],
  });
}

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** Kill every one of `ids` in the same tick, as burning would: each death is the other team's kill. */
function kill(sim: MatchSimulation, ...ids: string[]): void {
  for (const id of ids) {
    const victim = sim.get(id)?.combatant;
    if (victim === undefined) {
      throw new Error(`no participant ${id}`);
    }
    victim.statuses.apply("burning", 10, "foe", NO_RANKS);
    victim.health = 0.2;
  }
  sim.step(DT);
}

describe("kill count's sudden death (#4069)", () => {
  it("plays on past the time limit tied, and the next kill wins in sudden death", () => {
    const sim = match();
    stepFor(sim, SHORT.timeLimitSeconds + 5);
    expect(sim.phase).toBe("active");

    kill(sim, "x");
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "sudden-death" });
  });

  it("plays on after a double kill in sudden death that keeps the tie", () => {
    const sim = match();
    stepFor(sim, SHORT.timeLimitSeconds + 1);
    kill(sim, "a", "x");
    expect(sim.phase).toBe("active");
  });

  it("is won at time by a team ahead at the limit", () => {
    const sim = match();
    kill(sim, "a");
    stepFor(sim, SHORT.timeLimitSeconds);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 1, reason: "time" });
  });
});
