import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import {
  MORALE_FLOOR,
  PRIEST_ANNIHILATION_MATCH_RULES,
  PRIEST_WAVE_SECONDS,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { effectiveMaxEnergy } from "../skills/overcast.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { PRIEST_HEALTH, priestId } from "./priest.js";
import { countsForTeam, MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Priest Annihilation's priest (#1186): it stands on its team's shrine,
 * heals with Heal Area, and raises the team's dead every 2 minutes.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHRINE_0 = vec2(100, 300);
const SHRINE_1 = vec2(900, 300);

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 30,
  };
}

/** `a` and `b` on team 0, `x` on team 1, far from both shrines and each other. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "priest",
    matchRules: PRIEST_ANNIHILATION_MATCH_RULES,
    bounds: { width: 1000, height: 600 },
    shrines: [
      { team: 0, position: SHRINE_0 },
      { team: 1, position: SHRINE_1 },
    ],
    participants: [
      spec("a", 0, vec2(400, 100)),
      spec("b", 0, vec2(400, 500)),
      spec("x", 1, vec2(600, 300)),
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

/** Step until the match clock reaches `seconds`, every log entry on the way. */
function stepTo(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  while (sim.elapsedSeconds < seconds - DT / 2 && sim.phase === "active") {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "x");
  victim.combatant.health = 0.2;
  sim.step(DT);
}

describe("the priest (#1186)", () => {
  it("stands on its team's shrine as a creature nobody owns, counting for nobody", () => {
    const sim = match();
    const priest = get(sim, priestId(0));
    expect(priest.position).toEqual(SHRINE_0);
    expect(priest.combatant.team).toBe(0);
    expect(priest.combatant.maxHealth).toBe(PRIEST_HEALTH);
    expect(priest.creature).toMatchObject({ kind: "priest", ownerId: undefined });
    expect(countsForTeam(priest)).toBe(false);
    expect(get(sim, priestId(1)).position).toEqual(SHRINE_1);
  });

  it("never moves, even with a body walking into it", () => {
    const sim = match();
    const a = get(sim, "a");
    a.position = vec2(SHRINE_0.x + 60, SHRINE_0.y);
    sim.setInputDirection("a", vec2(-1, 0));
    stepTo(sim, 3);
    expect(get(sim, priestId(0)).position).toEqual(SHRINE_0);
  });

  it("casts Heal Area when it is hurt, and not while everyone near is whole", () => {
    const sim = match();
    const priest = get(sim, priestId(0));
    stepTo(sim, 2);
    expect(priest.combatant.energy).toBe(30);

    priest.combatant.health = 300;
    const log = stepTo(sim, 4);
    const heals = log.filter(
      (entry) => entry.sourceId === priest.id && entry.skillId === "monk.heal-area",
    );
    expect(heals).toHaveLength(1);
    expect(priest.combatant.health).toBe(300 + 170);
  });

  it("raises its team's dead on its shrine at 2 minutes, whole, their morale kept", () => {
    const sim = match();
    kill(sim, "a");
    const a = get(sim, "a");
    expect(a.combatant.dead).toBe(true);
    const morale = a.combatant.morale;
    expect(morale).toBe(-15);

    stepTo(sim, PRIEST_WAVE_SECONDS - 1);
    expect(a.combatant.dead).toBe(true);
    const log = stepTo(sim, PRIEST_WAVE_SECONDS + DT);

    expect(a.combatant.dead).toBe(false);
    expect(a.combatant.morale).toBe(morale);
    expect(a.combatant.health).toBe(effectiveMaxHealth(a.combatant));
    expect(a.combatant.energy).toBe(effectiveMaxEnergy(a.combatant));
    expect(distance(a.position, SHRINE_0)).toBeLessThanOrEqual(
      2 * RULES.collision.playerRadius + 1,
    );
    const raised = log.filter((entry) => entry.sourceId === priestId(0));
    expect(raised.flatMap((entry) => entry.events)).toEqual([
      { kind: "resurrected", targetId: "a", healthFraction: 1, energyFraction: 1 },
    ]);
  });

  it("leaves a player at the morale floor dead through the wave", () => {
    const sim = match();
    get(sim, "a").combatant.morale = MORALE_FLOOR;
    kill(sim, "a");
    kill(sim, "b");
    stepTo(sim, PRIEST_WAVE_SECONDS + DT);
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(get(sim, "b").combatant.dead).toBe(false);
  });

  it("raises nobody once it is dead, and is gone for good", () => {
    const sim = match();
    kill(sim, "a");
    kill(sim, priestId(0));
    expect(sim.get(priestId(0))).toBeUndefined();
    stepTo(sim, PRIEST_WAVE_SECONDS * 2 + DT);
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(sim.phase).toBe("active");
  });

  it("keeps a wiped team in the match until its priest falls too", () => {
    const sim = match();
    kill(sim, "x");
    sim.step(DT);
    expect(sim.phase).toBe("active");
    kill(sim, priestId(1));
    sim.step(DT);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });

  it("raises a wiped team's dead while its priest lives", () => {
    const sim = match();
    kill(sim, "x");
    stepTo(sim, PRIEST_WAVE_SECONDS + DT);
    expect(get(sim, "x").combatant.dead).toBe(false);
    expect(sim.phase).toBe("active");
  });
});
