import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { segment, type Segment } from "../geometry.js";
import { RELIC_RUN_MATCH_RULES } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { applyIntent } from "./apply-intent.js";
import { FLAG_CARRIER_SPEED_MULTIPLIER } from "./flags.js";
import { relicId, type RelicField } from "./relics.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * A Relic Run in the simulation (#1374), on Relic Temples: runners take
 * up their relic, carry it round a divider onto the altar and score; at
 * 8 minutes the most points win, and a wipe ends it before.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPEED = RULES.movement.maxSpeedUnitsPerSecond;

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** Relic Temples' walls (packages/game-maps/maps/relic-temples). */
const WALLS = [
  ...rect(480, 620, 420, 160),
  ...rect(560, 0, 240, 260),
  ...rect(560, 1140, 240, 260),
  ...rect(980, 520, 60, 60),
  ...rect(980, 820, 60, 60),
  ...rect(1160, 520, 60, 60),
  ...rect(1160, 820, 60, 60),
  ...rect(1300, 620, 420, 160),
  ...rect(1400, 0, 240, 260),
  ...rect(1400, 1140, 240, 260),
];
const BOUNDS = { width: 2200, height: 1400 };
const FIELD: RelicField = {
  altar: vec2(1100, 700),
  spawns: [
    { team: 0, position: vec2(110, 700) },
    { team: 1, position: vec2(2090, 700) },
  ],
};

function runner(id: string, team: number, spawn: Vec2): ParticipantSpec {
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

/** Two runners a team at the map's spawns. */
function relicRun(): MatchSimulation {
  return new MatchSimulation({
    seed: "relic-run",
    matchRules: RELIC_RUN_MATCH_RULES,
    walls: WALLS,
    bounds: BOUNDS,
    relicField: FIELD,
    participants: [
      runner("a", 0, vec2(220, 560)),
      runner("b", 0, vec2(220, 840)),
      runner("x", 1, vec2(1980, 840)),
      runner("y", 1, vec2(1980, 560)),
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

function points(sim: MatchSimulation): [number, number] {
  return [sim.score.byTeam.get(0) ?? 0, sim.score.byTeam.get(1) ?? 0];
}

/** Step until `done`, or fail after `seconds`. */
function stepUntil(sim: MatchSimulation, done: () => boolean, seconds: number): void {
  for (let tick = 0; tick < seconds / DT && !done(); tick += 1) {
    sim.step(DT);
  }
  expect(done()).toBe(true);
}

/** Space on `id`'s own relic, the walk to it, then the walk onto the altar until it scores. */
function run(sim: MatchSimulation, id: string): void {
  const team = get(sim, id).combatant.team;
  expect(applyIntent(sim, id, { kind: "target", targetSessionId: relicId(team) })).toBeNull();
  expect(applyIntent(sim, id, { kind: "attack", targetId: relicId(team) })).toBeNull();
  stepUntil(sim, () => sim.carriesBundle(id), 20);
  const before = sim.score.byTeam.get(team) ?? 0;
  applyIntent(sim, id, { kind: "walk-to", x: FIELD.altar.x, y: FIELD.altar.y });
  stepUntil(sim, () => (sim.score.byTeam.get(team) ?? 0) > before, 30);
  expect(sim.carriesBundle(id)).toBe(false);
  expect(sim.relics[team]).toEqual({ team, place: { kind: "spawn" } });
}

/** `id` dies this tick, where they stand. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "nobody", NO_RANKS);
  combatant.health = 0.2;
}

describe("a Relic Run on Relic Temples", () => {
  it("is won at time by the team with more relic points, 2 to 1", () => {
    const sim = relicRun();
    run(sim, "a");
    run(sim, "x");
    run(sim, "b");
    expect(points(sim)).toEqual([2, 1]);
    expect(sim.phase).toBe("active");
    stepUntil(sim, () => sim.phase === "finished", RELIC_RUN_MATCH_RULES.timeLimitSeconds);
    expect(sim.elapsedSeconds).toBeCloseTo(RELIC_RUN_MATCH_RULES.timeLimitSeconds, 3);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "time" });
  });

  it("is ended at once by a wipe, whatever the points", () => {
    const sim = relicRun();
    run(sim, "x");
    kill(sim, "x");
    kill(sim, "y");
    sim.step(DT);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
    expect(points(sim)).toEqual([0, 1]);
  });

  it("scores no kills: the score is relic points", () => {
    const sim = relicRun();
    kill(sim, "y");
    sim.step(DT);
    expect(get(sim, "y").combatant.dead).toBe(true);
    expect(points(sim)).toEqual([0, 0]);
  });
});

describe("a relic carrier", () => {
  /** `a` carrying its relic, just short of the altar. */
  function carrying(): MatchSimulation {
    const sim = relicRun();
    applyIntent(sim, "a", { kind: "attack", targetId: relicId(0) });
    stepUntil(sim, () => sim.carriesBundle("a"), 20);
    get(sim, "a").position = vec2(900, 560);
    return sim;
  }

  it("walks slower, and its hands are full", () => {
    const sim = carrying();
    const before = get(sim, "a").position;
    applyIntent(sim, "a", { kind: "move", dirX: 0, dirY: -1 });
    for (let tick = 0; tick < RULES.tickRateHz; tick += 1) {
      sim.step(DT);
    }
    expect(before.y - get(sim, "a").position.y).toBeCloseTo(
      SPEED / FLAG_CARRIER_SPEED_MULTIPLIER,
      3,
    );
    get(sim, "x").position = vec2(900, 300);
    expect(applyIntent(sim, "a", { kind: "attack", targetId: "x" })).toEqual({
      kind: "attack",
      reason: "hands-full",
    });
  });

  it("keeps it knocked down", () => {
    const sim = carrying();
    get(sim, "a").combatant.knockdownRemaining = 2;
    sim.step(DT);
    expect(sim.carriesBundle("a")).toBe(true);
  });

  it("drops it where they die, and a foe who reaches it sends it home", () => {
    const sim = carrying();
    const where = get(sim, "a").position;
    kill(sim, "a");
    sim.step(DT);
    expect(sim.relics[0]).toEqual({ team: 0, place: { kind: "ground", position: where } });
    get(sim, "x").position = vec2(1000, 400);
    expect(applyIntent(sim, "x", { kind: "attack", targetId: relicId(0) })).toBeNull();
    stepUntil(sim, () => sim.relics[0]?.place.kind === "spawn", 10);
    expect(sim.carriesBundle("x")).toBe(false);
  });

  it("refuses a foe's relic at its spawn", () => {
    const sim = relicRun();
    expect(applyIntent(sim, "x", { kind: "attack", targetId: relicId(0) })).toEqual({
      kind: "attack",
      reason: "not-your-relic",
    });
  });

  it("scores on the altar in the tick they die there: scores come before death drops", () => {
    const sim = carrying();
    get(sim, "a").position = vec2(FIELD.altar.x - 40, FIELD.altar.y);
    kill(sim, "a");
    sim.step(DT);
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(points(sim)).toEqual([1, 0]);
    expect(sim.relics[0]).toEqual({ team: 0, place: { kind: "spawn" } });
  });
});
