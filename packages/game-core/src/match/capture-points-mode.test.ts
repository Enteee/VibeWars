import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { CAPTURE_POINTS_MATCH_RULES, POINT_TICK_SECONDS } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { CAPTURE_SECONDS } from "./capture-points.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Capture Points in the simulation (#1378), on Forgotten Shrines' five
 * shrines: standing on one takes it, every 30 s each one owned scores,
 * at 8 minutes the most points win, and a wipe ends it before.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

/** Forgotten Shrines' shrines (packages/game-maps/maps/forgotten-shrines). */
const SHRINES = [
  vec2(480, 700),
  vec2(1100, 260),
  vec2(1100, 700),
  vec2(1100, 1140),
  vec2(1720, 700),
];

function fighter(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
  };
}

/** Two a team at their spawns, on no shrine. */
function capturePoints(): MatchSimulation {
  return new MatchSimulation({
    seed: "capture-points",
    matchRules: CAPTURE_POINTS_MATCH_RULES,
    walls: [],
    bounds: { width: 2200, height: 1400 },
    capturePoints: SHRINES,
    participants: [
      fighter("a", 0, vec2(220, 560)),
      fighter("b", 0, vec2(220, 840)),
      fighter("x", 1, vec2(1980, 840)),
      fighter("y", 1, vec2(1980, 560)),
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

/** Stand `id` on shrine `i`. */
function onShrine(sim: MatchSimulation, id: string, i: number): void {
  const shrine = SHRINES[i];
  if (shrine === undefined) {
    throw new Error(`no shrine ${String(i)}`);
  }
  get(sim, id).position = shrine;
}

function points(sim: MatchSimulation): [number, number] {
  return [sim.score.byTeam.get(0) ?? 0, sim.score.byTeam.get(1) ?? 0];
}

/** Run the match `seconds` on. */
function run(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.step(DT);
  }
}

/** `id` dies this tick, where they stand. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "nobody", NO_RANKS);
  combatant.health = 0.2;
}

describe("Capture Points on Forgotten Shrines (#1378)", () => {
  it("scores each shrine a team owns every 30 s: two for a minute is 4", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, CAPTURE_SECONDS);
    expect(sim.capturePoints.map((point) => point.owner)).toEqual([0, 0, null, null, null]);
    expect(points(sim)).toEqual([0, 0]);
    run(sim, 2 * POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([4, 0]);
    expect(sim.phase).toBe("active");
  });

  it("scores a shrine taken on the scoring tick: the capture comes first", () => {
    const sim = capturePoints();
    run(sim, POINT_TICK_SECONDS - CAPTURE_SECONDS);
    onShrine(sim, "x", 4);
    run(sim, CAPTURE_SECONDS);
    expect(sim.elapsedSeconds).toBeCloseTo(POINT_TICK_SECONDS, 6);
    expect(sim.capturePoints[4]?.owner).toBe(1);
    expect(points(sim)).toEqual([0, 1]);
  });

  it("is won at time by the team with more points", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 2);
    run(sim, CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds);
    expect(sim.elapsedSeconds).toBeCloseTo(CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds, 3);
    expect(points(sim)[0]).toBeGreaterThan(0);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "time" });
  });

  it("is ended at once by a wipe, whatever the points, and a kill scores none", () => {
    const sim = capturePoints();
    onShrine(sim, "x", 4);
    run(sim, POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([0, 1]);
    kill(sim, "x");
    sim.step(DT);
    expect(get(sim, "x").combatant.dead).toBe(true);
    expect(points(sim)).toEqual([0, 1]);
    kill(sim, "y");
    sim.step(DT);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });

  it("counts no dead player on a shrine", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 2);
    kill(sim, "a");
    run(sim, CAPTURE_SECONDS);
    expect(sim.capturePoints[2]).toMatchObject({ owner: null, progress: 0 });
  });
});
