import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import {
  CAPTURE_LEAD_TO_WIN,
  CAPTURE_POINTS_MATCH_RULES,
  POINT_TICK_SECONDS,
  type MatchRules,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { CAPTURE_SECONDS, MAX_PIPS } from "./capture-points.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Capture Points in the simulation (#1378, #2690), on Scarred Earth's five
 * shrines: a team's pips on one take it, every 30 s each one owned scores,
 * 20 points ahead or a wipe ends it, else at 8 minutes the most points win.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

/** Scarred Earth's shrines (packages/game-maps/maps/scarred-earth). */
const SHRINES = [
  vec2(520, 1000),
  vec2(1600, 300),
  vec2(1600, 1000),
  vec2(1600, 1700),
  vec2(2680, 1000),
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

/** Seconds one player alone, one pip, takes to fill a shrine (#2690). */
const ALONE_SECONDS = CAPTURE_SECONDS * MAX_PIPS;

/** Shrine `i`'s position. */
function shrine(i: number): Vec2 {
  const at = SHRINES[i];
  if (at === undefined) {
    throw new Error(`no shrine ${String(i)}`);
  }
  return at;
}

/** A standing minion `id` of `ownerId`'s, on `team`, at `spawn`. */
function minion(id: string, ownerId: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...fighter(id, team, spawn),
    creature: {
      ownerId,
      kind: "minion",
      look: "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      pulse: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  };
}

/** Two a team at their spawns, on no shrine, and any `more`. */
function capturePoints(
  matchRules: MatchRules = CAPTURE_POINTS_MATCH_RULES,
  more: ParticipantSpec[] = [],
): MatchSimulation {
  return new MatchSimulation({
    seed: "capture-points",
    matchRules,
    walls: [],
    bounds: { width: 3200, height: 2000 },
    capturePoints: SHRINES,
    teamCount: more.some(({ team }) => team === 2) ? 3 : 2,
    participants: [
      fighter("a", 0, vec2(280, 620)),
      fighter("b", 0, vec2(280, 760)),
      fighter("x", 1, vec2(2920, 1240)),
      fighter("y", 1, vec2(2920, 1380)),
      ...more,
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
  get(sim, id).position = shrine(i);
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

describe("Capture Points on Scarred Earth (#1378, #2551, #2690)", () => {
  it("scores each shrine a team owns every 30 s: two for a minute is 4", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, ALONE_SECONDS);
    expect(sim.capturePoints.map((point) => point.owner)).toEqual([0, 0, null, null, null]);
    expect(points(sim)).toEqual([0, 0]);
    run(sim, 2 * POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([4, 0]);
    expect(sim.phase).toBe("active");
  });

  it("scores a shrine taken on the scoring tick: the capture comes first", () => {
    const sim = capturePoints();
    run(sim, 2 * POINT_TICK_SECONDS - ALONE_SECONDS);
    onShrine(sim, "x", 4);
    run(sim, ALONE_SECONDS);
    expect(sim.elapsedSeconds).toBeCloseTo(2 * POINT_TICK_SECONDS, 6);
    expect(sim.capturePoints[4]?.owner).toBe(1);
    expect(points(sim)).toEqual([0, 1]);
  });

  it("is taken by two players together twice as fast as by one", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 2);
    onShrine(sim, "b", 2);
    run(sim, ALONE_SECONDS / 2);
    expect(sim.capturePoints[2]?.owner).toBe(0);
  });

  it("is won at time by the team with more points", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 2);
    run(sim, CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds);
    expect(sim.elapsedSeconds).toBeCloseTo(CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds, 3);
    expect(points(sim)[0]).toBeGreaterThan(0);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "time" });
  });

  it("is won at once by a team 20 points ahead", () => {
    const sim = capturePoints();
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, CAPTURE_POINTS_MATCH_RULES.timeLimitSeconds - 1);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "score" });
    const [ours, theirs] = points(sim);
    expect(ours - theirs).toBeGreaterThanOrEqual(CAPTURE_LEAD_TO_WIN);
  });

  it("goes at time, on equal points, to the team holding the most shrines", () => {
    // A minute: two of team 1 take shrine 4 in 16 s and lead alone at 30 s;
    // team 0, one on each of two shrines, ties them at 60 s, at time, and
    // holds two shrines to their one.
    const sim = capturePoints({ ...CAPTURE_POINTS_MATCH_RULES, timeLimitSeconds: 60 });
    onShrine(sim, "x", 4);
    onShrine(sim, "y", 4);
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, POINT_TICK_SECONDS + DT);
    expect(points(sim)).toEqual([0, 1]);
    run(sim, POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([2, 2]);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "time" });
  });

  it("goes at time, on equal points and shrines, to the team that led last", () => {
    // As above, but team 1 then takes shrine 3 as well: at 90 s both have
    // 4 points and two shrines, and only team 1 ever led alone, at 30 s.
    const sim = capturePoints({ ...CAPTURE_POINTS_MATCH_RULES, timeLimitSeconds: 90 });
    onShrine(sim, "x", 4);
    onShrine(sim, "y", 4);
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, 2 * POINT_TICK_SECONDS + DT);
    expect(points(sim)).toEqual([2, 2]);
    onShrine(sim, "x", 3);
    onShrine(sim, "y", 3);
    run(sim, POINT_TICK_SECONDS);
    expect(points(sim)).toEqual([4, 4]);
    expect(sim.capturePoints.map((point) => point.owner)).toEqual([0, 0, null, 1, 1]);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 1, reason: "time" });
  });

  it("goes on a tie to the team in play that led last, an eliminated team's points aside", () => {
    // Team 2 takes shrine 2 in 16 s and is wiped, out but still scoring
    // with it: at 30 s team 1 leads alone among the teams in play. Team 1
    // takes a second shrine after 60 s, to hold as many as team 0 at 90 s.
    const sim = capturePoints({ ...CAPTURE_POINTS_MATCH_RULES, timeLimitSeconds: 90 }, [
      fighter("p", 2, shrine(2)),
      fighter("q", 2, shrine(2)),
    ]);
    onShrine(sim, "x", 4);
    onShrine(sim, "y", 4);
    onShrine(sim, "a", 0);
    onShrine(sim, "b", 1);
    run(sim, 20);
    kill(sim, "p");
    kill(sim, "q");
    run(sim, POINT_TICK_SECONDS - 20 + DT);
    expect([...points(sim), sim.score.byTeam.get(2)]).toEqual([0, 1, 1]);
    run(sim, POINT_TICK_SECONDS);
    expect([...points(sim), sim.score.byTeam.get(2)]).toEqual([2, 2, 2]);
    onShrine(sim, "x", 3);
    onShrine(sim, "y", 3);
    run(sim, POINT_TICK_SECONDS);
    expect([...points(sim), sim.score.byTeam.get(2)]).toEqual([4, 4, 3]);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 1, reason: "time" });
  });

  it("counts a team's Ghostly Hero four pips, and a minion none", () => {
    const sim = new MatchSimulation({
      seed: "capture-points-ghost",
      matchRules: CAPTURE_POINTS_MATCH_RULES,
      walls: [],
      bounds: { width: 3200, height: 2000 },
      capturePoints: SHRINES,
      ghostField: {
        level: 24,
        altar: undefined,
        spawns: [
          { team: 0, position: shrine(2) },
          { team: 1, position: vec2(2920, 1800) },
        ],
      },
      participants: [
        fighter("a", 0, vec2(280, 620)),
        fighter("x", 1, vec2(2920, 1240)),
        minion("m", "x", 1, shrine(0)),
      ],
    });
    run(sim, CAPTURE_SECONDS);
    expect(sim.capturePoints[2]?.owner).toBe(0);
    expect(sim.capturePoints[0]).toMatchObject({ owner: null, progress: 0 });
  });

  it("is ended at once by a wipe, whatever the points, and a kill scores none", () => {
    const sim = capturePoints();
    onShrine(sim, "x", 4);
    onShrine(sim, "y", 4);
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
    run(sim, ALONE_SECONDS);
    expect(sim.capturePoints[2]).toMatchObject({ owner: null, progress: 0 });
  });
});
