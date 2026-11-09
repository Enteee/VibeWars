import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import {
  HALLS_MATCH_RULES,
  MATCH_IN_PROGRESS,
  evaluateMatch,
  withLatestTeam,
  type HallsMode,
  type MatchStanding,
} from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { ghostId } from "./ghost.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/** The Hall of Heroes' rules (#2700): waves on the minute, no death penalty, nobody beaten. */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ALTAR = vec2(1600, 1100);
const SPAWN_A = vec2(360, 1040);
const SPAWN_X = vec2(2840, 1160);

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

function hall(): MatchSimulation {
  return new MatchSimulation({
    seed: "halls",
    matchRules: HALLS_MATCH_RULES["king-of-the-hill"],
    walls: [],
    bounds: { width: 3200, height: 2200 },
    ghostField: {
      level: 28,
      altar: ALTAR,
      spawns: [
        { team: 0, position: vec2(120, 1100) },
        { team: 1, position: vec2(3080, 1100) },
      ],
    },
    participants: [fighter("a", 0, SPAWN_A), fighter("x", 1, SPAWN_X)],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** Step to `seconds` on the match clock. */
function stepTo(sim: MatchSimulation, seconds: number): void {
  while (sim.phase === "active" && sim.elapsedSeconds + DT / 2 < seconds) {
    sim.step(DT);
  }
}

/** `id` dies this tick, where it stands. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "nobody", NO_RANKS);
  combatant.health = 0.2;
  stepTo(sim, sim.elapsedSeconds + 3 * DT);
  expect(combatant.dead).toBe(true);
}

/** Team 0's ghost, set down on the altar, claims it. */
function claimAltar(sim: MatchSimulation): void {
  get(sim, ghostId(0)).position = ALTAR;
  const deadline = sim.elapsedSeconds + 10;
  while (sim.altarState.holder !== 0 && sim.elapsedSeconds < deadline) {
    sim.step(DT);
  }
  expect(sim.altarState.holder).toBe(0);
}

describe("the Hall of Heroes' rules (#2700)", () => {
  it.each(["king-of-the-hill", "relic-run", "capture-points"] satisfies HallsMode[])(
    "plays %s 11 minutes, respawning on the minute, with no death penalty",
    (mode) => {
      expect(HALLS_MATCH_RULES[mode]).toMatchObject({
        victory: mode,
        timeLimitSeconds: 660,
        deathRule: "respawn",
        respawnSeconds: 60,
        respawnOnWave: true,
        deathPenalty: false,
      });
    },
  );

  it("is won by the last team in play when every member of the other has left (#2890)", () => {
    const sim = hall();
    stepTo(sim, 1);
    sim.remove("x");
    sim.step(DT);
    expect(sim.outcome).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });

  it("keeps a team that is dead but present in the match (#2890)", () => {
    const sim = hall();
    stepTo(sim, 1);
    kill(sim, "x");
    expect(sim.outcome).toEqual(MATCH_IN_PROGRESS);
  });

  it.each([5, 59])("returns one who died at %i s at the 60 s wave", (at) => {
    const sim = hall();
    stepTo(sim, at);
    kill(sim, "a");
    stepTo(sim, 59.9);
    expect(get(sim, "a").combatant.dead).toBe(true);
    stepTo(sim, 60.1);
    expect(get(sim, "a").combatant.dead).toBe(false);
    expect(get(sim, "a").position).toEqual(SPAWN_A);
  });

  it("costs no morale to die", () => {
    const sim = hall();
    kill(sim, "a");
    expect(get(sim, "a").combatant.morale).toBe(0);
  });

  it("does not beat a wiped team", () => {
    const sim = hall();
    kill(sim, "a");
    stepTo(sim, 30);
    expect(sim.phase).toBe("active");
    stepTo(sim, 61);
    expect(get(sim, "a").combatant.dead).toBe(false);
    expect(sim.phase).toBe("active");
  });

  it("keeps the holder scoring with its ghost dead, and returns its dead on the altar", () => {
    const sim = hall();
    claimAltar(sim);
    kill(sim, ghostId(0));
    expect(sim.altarState.holder).toBe(0);
    kill(sim, "a");
    stepTo(sim, 60.1);
    expect(sim.score.byTeam.get(0)).toBeGreaterThan(0);
    expect(get(sim, "a").position).toEqual(ALTAR);
  });

  it("returns the dead of a team not holding the altar at their spawn", () => {
    const sim = hall();
    claimAltar(sim);
    kill(sim, "x");
    stepTo(sim, 60.1);
    expect(get(sim, "x").position).toEqual(SPAWN_X);
  });

  it("plays to time", () => {
    const sim = hall();
    stepTo(sim, 659.5);
    expect(sim.phase).toBe("active");
    stepTo(sim, 660.5);
    expect(sim.phase).toBe("finished");
    expect(sim.outcome.reason).toBe("time");
  });
});

describe("the Hall of Heroes at time (#2700)", () => {
  const team = {
    members: 1,
    living: 0,
    morale: 0,
    priestLives: false,
    guildLordLives: false,
    beyondRaising: false,
    aggression: 0,
    ledAtSeconds: undefined,
    pointsHeld: 0,
    eliminated: false,
  };
  const standing = (
    recentKillTeams: readonly number[] = [],
    recentScoringTeams: readonly number[] = [],
  ): MatchStanding => ({
    byTeam: new Map([
      [0, team],
      [1, team],
      [2, team],
    ]),
    recentKillTeams,
    recentScoringTeams,
  });
  const score = (...points: number[]) => ({
    byTeam: new Map(points.map((value, each) => [each, value])),
  });
  const king = HALLS_MATCH_RULES["king-of-the-hill"];
  const relic = HALLS_MATCH_RULES["relic-run"];
  const capture = HALLS_MATCH_RULES["capture-points"];

  it("leaves out a team whose members have all left, however many points it holds (#2890)", () => {
    const threeTeams = (one: typeof team): MatchStanding => ({
      ...standing(),
      byTeam: new Map([
        [0, team],
        [1, one],
        [2, team],
      ]),
    });
    expect(evaluateMatch(score(1, 3, 2), threeTeams({ ...team, members: 0 }), 659, king)).toBe(
      MATCH_IN_PROGRESS,
    );
    expect(
      evaluateMatch(score(1, 3, 2), threeTeams({ ...team, members: 0 }), 720, relic).winningTeam,
    ).toBe(2);
    expect(
      evaluateMatch(score(1, 3, 2), threeTeams({ ...team, members: 0 }), 720, capture).winningTeam,
    ).toBe(2);
  });

  it("is still on before time, whoever is dead", () => {
    expect(evaluateMatch(score(1, 0, 0), standing(), 659.9, king)).toBe(MATCH_IN_PROGRESS);
  });

  it("goes to the most points", () => {
    expect(evaluateMatch(score(1, 3, 2), standing([0], [0]), 720, relic).winningTeam).toBe(1);
  });

  it("breaks a King of the Hill or Relic Run tie for the team that scored last", () => {
    expect(evaluateMatch(score(3, 3, 0), standing([0], [1, 0]), 720, king).winningTeam).toBe(1);
    expect(evaluateMatch(score(3, 3, 0), standing([1], [0, 1]), 720, relic).winningTeam).toBe(0);
  });

  it("breaks a Capture Points tie for the team with the last kill", () => {
    expect(evaluateMatch(score(4, 4, 0), standing([1, 0], [0]), 720, capture).winningTeam).toBe(1);
  });

  it("breaks a tie for the latest tied team, even after a trailing team's point or kill", () => {
    expect(evaluateMatch(score(3, 3, 0), standing([], [2, 1, 0]), 720, king).winningTeam).toBe(1);
    expect(evaluateMatch(score(4, 4, 0), standing([2, 0, 1]), 720, capture).winningTeam).toBe(0);
  });

  it("moves a team to the front of the recent teams, once", () => {
    expect(withLatestTeam([2, 1, 0], 0)).toEqual([0, 2, 1]);
    expect(withLatestTeam([], 1)).toEqual([1]);
  });

  it("draws when no tied team has scored or killed", () => {
    expect(
      evaluateMatch(score(4, 4, 0), standing([2], [2]), 720, capture).winningTeam,
    ).toBeUndefined();
    expect(evaluateMatch(score(4, 4, 0), standing(), 720, king).winningTeam).toBeUndefined();
  });

  it("still ends a Capture Points match on a lead of 20", () => {
    expect(evaluateMatch(score(25, 5, 0), standing(), 300, capture)).toMatchObject({
      winningTeam: 0,
      reason: "score",
    });
  });
});
