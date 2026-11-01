import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Restore Life in a match (#812): a Monk brings a dead ally back where
 * they fell, before the respawn timer would have.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 8,
  deathPenalty: false,
};
const RESTORE_LIFE = "monk.restore-life";
/** Restore Life's activation, and a tick to spare. */
const CAST_SECONDS = 4 + DT;

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [RESTORE_LIFE],
    attributeRanks: new Map([["monk.healing-prayers", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 30,
  };
}

/** Monks `m` and `n`, their ally `w` between them, and a foe far off. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "restore",
    matchRules: MATCH,
    participants: [
      spec("m", 0, vec2(0, 0)),
      spec("n", 0, vec2(60, 0)),
      spec("w", 0, vec2(30, 0)),
      spec("foe", 1, vec2(600, 0)),
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

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

/** Kill `id` as burning would, so its respawn timer starts. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "foe", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

const resurrections = (events: readonly CombatEvent[]) =>
  events.filter((event) => event.kind === "resurrected");

describe("Restore Life in a match (#812)", () => {
  it("brings a dead ally back where they fell, and cancels their respawn", () => {
    const sim = match();
    kill(sim, "w");
    const ally = get(sim, "w");
    const fell = ally.position;
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    const events = stepFor(sim, CAST_SECONDS);

    expect(resurrections(events)).toEqual([
      { kind: "resurrected", targetId: "w", healthFraction: 0.56, energyFraction: 0.8 },
    ]);
    expect(ally.combatant.dead).toBe(false);
    expect(ally.combatant.health).toBe(Math.floor(480 * 0.56));
    expect(ally.combatant.energy).toBe(Math.floor(30 * 0.8));
    expect(ally.combatant.statuses.active).toEqual([]);
    expect(ally.respawnInSeconds).toBe(0);
    expect(ally.position).toEqual(fell);

    // Past when the respawn would have come: still where it fell.
    stepFor(sim, MATCH.respawnSeconds);
    expect(ally.position).toEqual(fell);
  });

  it("refuses a living ally, and a dead foe", () => {
    const sim = match();
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: false, reason: "invalid-target-alive" });
    kill(sim, "foe");
    sim.setTarget("m", "foe");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: false, reason: "invalid-target-enemy" });
  });

  it("two on one corpse in the same tick: the first brings them back, the second does nothing", () => {
    const sim = match();
    kill(sim, "w");
    sim.setTarget("m", "w");
    sim.setTarget("n", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    expect(resurrections(stepFor(sim, CAST_SECONDS))).toHaveLength(1);
    expect(get(sim, "n").combatant.energy).toBeLessThan(30);
  });

  it("does nothing to a corpse that respawned while it was cast", () => {
    const sim = match();
    kill(sim, "w");
    get(sim, "w").respawnInSeconds = 1;
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    expect(resurrections(stepFor(sim, CAST_SECONDS))).toEqual([]);
    expect(get(sim, "w").combatant.health).toBe(480);
  });

  it("walks in to a corpse out of reach, then brings it back", () => {
    const sim = match();
    kill(sim, "w");
    get(sim, "w").position = vec2(200, 0);
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)).toMatchObject({ check: { ok: true }, queued: true });
    expect(resurrections(stepFor(sim, 3 + CAST_SECONDS))).toHaveLength(1);
    expect(get(sim, "w").position).toEqual(vec2(200, 0));
  });
});

describe("Restore Life meets death and overcast (#812)", () => {
  /** `match()` with the foe an Elementalist casting Chain Lightning from `at`. */
  function withCaster(at: Vec2): MatchSimulation {
    return new MatchSimulation({
      seed: "restore",
      matchRules: MATCH,
      participants: [
        spec("m", 0, vec2(0, 0)),
        spec("n", 0, vec2(60, 0)),
        spec("w", 0, vec2(30, 0)),
        {
          ...spec("foe", 1, at),
          skillBar: ["elementalist.chain-lightning"],
          attributeRanks: new Map([["elementalist.air-magic", 12]]),
        },
      ],
    });
  }

  it("a caster killed by a hit mid-cast comes back with no cast, and never finishes it", () => {
    const sim = withCaster(vec2(200, 0));
    kill(sim, "w");
    get(sim, "w").respawnInSeconds = 100;
    sim.setTarget("n", "w");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    const caster = get(sim, "n");
    caster.combatant.health = 1;
    sim.setTarget("foe", "n");
    expect(sim.requestSkill("foe", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 2 + DT);
    expect(caster.combatant.dead).toBe(true);
    expect(caster.combatant.cast.activeCast).toBeUndefined();

    sim.setTarget("m", "n");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    // Restore Life's cast, and the tick or two its start waits on.
    const events = stepFor(sim, CAST_SECONDS + 0.5);
    expect(caster.combatant.dead).toBe(false);
    expect(caster.combatant.cast.activeCast).toBeUndefined();

    events.push(...stepFor(sim, CAST_SECONDS));
    expect(resurrections(events).map((event) => event.targetId)).toEqual(["n"]);
    expect(get(sim, "w").combatant.dead).toBe(true);
  });

  it("brings energy back only up to the ceiling overcast leaves (#461)", () => {
    const sim = match();
    kill(sim, "w");
    const ally = get(sim, "w").combatant;
    ally.overcast = 20;
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    expect(resurrections(stepFor(sim, CAST_SECONDS))).toHaveLength(1);
    // 80% of 30 is 24, above the 10-odd that 20 overcast, less what
    // recovered over the cast, leaves.
    expect(ally.overcast).toBeGreaterThan(18);
    expect(ally.energy).toBeCloseTo(30 - ally.overcast, 1);
  });

  it("brings no energy back when overcast is above maximum energy (#461)", () => {
    const sim = match();
    kill(sim, "w");
    const ally = get(sim, "w").combatant;
    ally.overcast = 40;
    sim.setTarget("m", "w");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    expect(resurrections(stepFor(sim, CAST_SECONDS))).toHaveLength(1);
    expect(ally.energy).toBe(0);
  });
});
