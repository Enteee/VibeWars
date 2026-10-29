import { describe, expect, it } from "vitest";

import {
  ANNIHILATION_MATCH_RULES,
  GUILD_BATTLE_MATCH_RULES,
  KILL_COUNT_MATCH_RULES,
  MATCH_IN_PROGRESS,
  MATCH_MODES,
  PRIEST_ANNIHILATION_MATCH_RULES,
  RELIC_RUN_MATCH_RULES,
  addPoint,
  emptyScore,
  evaluateMatch,
  type MatchRules,
  type MatchStanding,
  type TeamStanding,
} from "./match-rules.js";

const RULES: MatchRules = {
  victory: "kill-count",
  scoreToWin: 3,
  timeLimitSeconds: 60,
  deathRule: "respawn",
  respawnSeconds: 5,
  deathPenalty: false,
};

/** `[team, living, total morale, priest lives?]` for each team with members. */
function standing(...teams: [number, number, number, boolean?][]): MatchStanding {
  return {
    byTeam: new Map(
      teams.map(([team, living, morale, priestLives = false]) => [
        team,
        { living, morale, priestLives, guildLordLives: false, beyondRaising: false, aggression: 0 },
      ]),
    ),
  };
}

const BOTH_ALIVE = standing([0, 4, 0], [1, 4, 0]);
const NO_KILLS = emptyScore([0, 1]);

describe("emptyScore / addPoint", () => {
  it("starts every team at zero", () => {
    const score = emptyScore([0, 1]);
    expect(score.byTeam.get(0)).toBe(0);
    expect(score.byTeam.get(1)).toBe(0);
  });

  it("adds a kill without mutating the previous score", () => {
    const first = emptyScore([0, 1]);
    const second = addPoint(first, 0);
    expect(second.byTeam.get(0)).toBe(1);
    expect(first.byTeam.get(0)).toBe(0);
  });

  it("accumulates kills", () => {
    let score = emptyScore([0, 1]);
    score = addPoint(score, 1);
    score = addPoint(score, 1);
    expect(score.byTeam.get(1)).toBe(2);
  });
});

describe("evaluateMatch", () => {
  it("reports an active match before anything decisive happens", () => {
    expect(evaluateMatch(emptyScore([0, 1]), BOTH_ALIVE, 0, RULES).phase).toBe("active");
  });

  it("ends when a team reaches the score target", () => {
    let score = emptyScore([0, 1]);
    for (let i = 0; i < 3; i += 1) {
      score = addPoint(score, 1);
    }
    const outcome = evaluateMatch(score, BOTH_ALIVE, 10, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBe(1);
    expect(outcome.reason).toBe("score");
  });

  it("does not end one kill short of the target", () => {
    let score = emptyScore([0, 1]);
    score = addPoint(score, 1);
    score = addPoint(score, 1);
    expect(evaluateMatch(score, BOTH_ALIVE, 10, RULES).phase).toBe("active");
  });

  it("ends on the time limit with the leader winning", () => {
    let score = emptyScore([0, 1]);
    score = addPoint(score, 0);
    const outcome = evaluateMatch(score, BOTH_ALIVE, 60, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBe(0);
    expect(outcome.reason).toBe("time");
  });

  it("calls a tie at time a draw rather than picking an arbitrary winner", () => {
    let score = emptyScore([0, 1]);
    score = addPoint(score, 0);
    score = addPoint(score, 1);
    const outcome = evaluateMatch(score, BOTH_ALIVE, 60, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBeUndefined();
    expect(outcome.reason).toBe("time");
  });

  it("treats a scoreless match at the time limit as a draw", () => {
    const outcome = evaluateMatch(emptyScore([0, 1]), BOTH_ALIVE, 60, RULES);
    expect(outcome.winningTeam).toBeUndefined();
  });

  it("prefers a score win over a timeout when both land on the same tick", () => {
    // Scoring the winning kill as the clock expires should read as a
    // score win to the player who just made it.
    let score = emptyScore([0, 1]);
    for (let i = 0; i < 3; i += 1) {
      score = addPoint(score, 0);
    }
    expect(evaluateMatch(score, BOTH_ALIVE, 60, RULES).reason).toBe("score");
  });

  it("keeps the kill-count rules as a preset", () => {
    expect(KILL_COUNT_MATCH_RULES).toEqual({
      victory: "kill-count",
      scoreToWin: 15,
      timeLimitSeconds: 180,
      deathRule: "respawn",
      respawnSeconds: 8,
      deathPenalty: false,
    });
  });
});

describe("MATCH_MODES (#476)", () => {
  const rules = MATCH_MODES["kill-count"];
  const score = (team0: number, team1: number) =>
    new Map([
      [0, team0],
      [1, team1],
    ]);

  it("names each mode's rules", () => {
    expect(MATCH_MODES.annihilation).toBe(ANNIHILATION_MATCH_RULES);
    expect(MATCH_MODES["priest-annihilation"]).toBe(PRIEST_ANNIHILATION_MATCH_RULES);
    expect(MATCH_MODES["guild-battle"]).toBe(GUILD_BATTLE_MATCH_RULES);
    expect(rules).toBe(KILL_COUNT_MATCH_RULES);
  });

  it("kill count: the most kills at 3 minutes wins, and not a moment before", () => {
    expect(evaluateMatch({ byTeam: score(4, 2) }, BOTH_ALIVE, 179.9, rules)).toBe(
      MATCH_IN_PROGRESS,
    );
    expect(evaluateMatch({ byTeam: score(4, 2) }, BOTH_ALIVE, 180, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "time",
    });
  });

  it("kill count: equal kills at 3 minutes is a draw", () => {
    expect(evaluateMatch({ byTeam: score(5, 5) }, BOTH_ALIVE, 180, rules)).toEqual({
      phase: "finished",
      winningTeam: undefined,
      reason: "time",
    });
  });

  it("kill count: 15 kills ends it early", () => {
    expect(evaluateMatch({ byTeam: score(3, 15) }, BOTH_ALIVE, 42, rules)).toEqual({
      phase: "finished",
      winningTeam: 1,
      reason: "score",
    });
  });
});

describe("evaluateMatch: annihilation (#846)", () => {
  const rules = ANNIHILATION_MATCH_RULES;

  it("is resurrection only, the death penalty, 8 minutes", () => {
    expect(rules.victory).toBe("annihilation");
    expect(rules.deathRule).toBe("resurrection-only");
    expect(rules.deathPenalty).toBe(true);
    expect(rules.timeLimitSeconds).toBe(480);
  });

  it("plays on while every team has someone alive, whatever the kills", () => {
    let score = NO_KILLS;
    for (let i = 0; i < 20; i += 1) {
      score = addPoint(score, 0);
    }
    expect(evaluateMatch(score, standing([0, 1, 0], [1, 1, -60]), 100, rules).phase).toBe("active");
  });

  it("is won the moment the other team is wiped", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 1, -30], [1, 0, -45]), 100, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "annihilation",
    });
  });

  it("is lost by both when both are wiped in the same tick", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 0, 0], [1, 0, 0]), 100, rules)).toEqual({
      phase: "finished",
      winningTeam: undefined,
      reason: "annihilation",
    });
  });

  it("never wipes a team with no members", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 2, 0]), 100, rules).phase).toBe("active");
  });

  it("plays on with three teams until only one has anyone alive", () => {
    expect(
      evaluateMatch(NO_KILLS, standing([0, 1, 0], [1, 0, 0], [2, 1, 0]), 100, rules).phase,
    ).toBe("active");
    expect(
      evaluateMatch(NO_KILLS, standing([0, 0, 0], [1, 0, 0], [2, 1, 0]), 100, rules).winningTeam,
    ).toBe(2);
  });

  it("goes at time to the highest total morale, dead or alive", () => {
    // 0, −15, −30 beats −15, −15, −30.
    expect(evaluateMatch(NO_KILLS, standing([0, 1, -45], [1, 3, -60]), 480, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "morale",
    });
  });

  it("is lost by both at time on equal morale (GW1 has no draw)", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 2, -15], [1, 1, -15]), 480, rules)).toEqual({
      phase: "finished",
      winningTeam: undefined,
      reason: "morale",
    });
  });

  it("prefers a wipe over time when both land on the same tick", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 1, -60], [1, 0, 0]), 480, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "annihilation",
    });
  });
});

describe("evaluateMatch: priest annihilation (#1186)", () => {
  const rules = PRIEST_ANNIHILATION_MATCH_RULES;

  it("is annihilation's resurrection only and death penalty, over 12 minutes", () => {
    expect(rules.victory).toBe("priest-annihilation");
    expect(rules.deathRule).toBe("resurrection-only");
    expect(rules.deathPenalty).toBe(true);
    expect(rules.timeLimitSeconds).toBe(720);
  });

  it("does not beat a wiped team whose priest lives: it waits for the wave", () => {
    expect(evaluateMatch(NO_KILLS, standing([0, 2, 0, true], [1, 0, -45, true]), 100, rules)).toBe(
      MATCH_IN_PROGRESS,
    );
  });

  it("beats a team once every player and its priest are dead", () => {
    expect(
      evaluateMatch(NO_KILLS, standing([0, 1, 0, false], [1, 0, -45, false]), 100, rules),
    ).toEqual({ phase: "finished", winningTeam: 0, reason: "annihilation" });
  });

  it("is lost by both when both teams and both priests fall in the same tick", () => {
    expect(
      evaluateMatch(NO_KILLS, standing([0, 0, 0, false], [1, 0, 0, false]), 100, rules),
    ).toEqual({ phase: "finished", winningTeam: undefined, reason: "annihilation" });
  });

  it("goes at 12 minutes to morale, then to the team whose priest lives, else all lose", () => {
    expect(
      evaluateMatch(NO_KILLS, standing([0, 2, -15, true], [1, 2, -15, true]), 719.9, rules),
    ).toBe(MATCH_IN_PROGRESS);
    expect(
      evaluateMatch(NO_KILLS, standing([0, 2, -30, true], [1, 2, -15, false]), 720, rules),
    ).toEqual({ phase: "finished", winningTeam: 1, reason: "morale" });
    expect(
      evaluateMatch(NO_KILLS, standing([0, 2, -15, false], [1, 2, -15, true]), 720, rules),
    ).toEqual({ phase: "finished", winningTeam: 1, reason: "morale" });
    expect(
      evaluateMatch(NO_KILLS, standing([0, 2, -15, true], [1, 2, -15, true]), 720, rules),
    ).toEqual({ phase: "finished", winningTeam: undefined, reason: "morale" });
  });
});

describe("evaluateMatch: guild battle (#1222)", () => {
  const rules = GUILD_BATTLE_MATCH_RULES;
  const NO_SCORE = emptyScore([0, 1]);
  const team = (overrides: Partial<TeamStanding> = {}): TeamStanding => ({
    living: 8,
    morale: 0,
    priestLives: false,
    guildLordLives: true,
    beyondRaising: false,
    aggression: 0,
    ...overrides,
  });
  const guild = (zero: Partial<TeamStanding>, one: Partial<TeamStanding>): MatchStanding => ({
    byTeam: new Map([
      [0, team(zero)],
      [1, team(one)],
    ]),
  });

  it("plays 28 minutes, the dead down until the shrine raises them, with the death penalty", () => {
    expect(rules.timeLimitSeconds).toBe(1680);
    expect(rules.deathRule).toBe("resurrection-only");
    expect(rules.deathPenalty).toBe(true);
  });

  it("goes on while both lords live, whoever is dead", () => {
    expect(evaluateMatch(NO_SCORE, guild({ living: 0 }, {}), 100, rules)).toBe(MATCH_IN_PROGRESS);
  });

  it("is lost by the team whose Guild Lord dies", () => {
    expect(evaluateMatch(NO_SCORE, guild({}, { guildLordLives: false }), 100, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "guild-lord",
    });
  });

  it("is lost by both teams when both lords die together", () => {
    const both = guild({ guildLordLives: false }, { guildLordLives: false });
    expect(evaluateMatch(NO_SCORE, both, 100, rules)).toEqual({
      phase: "finished",
      winningTeam: undefined,
      reason: "guild-lord",
    });
  });

  it("is lost by a team all dead at the morale floor", () => {
    expect(evaluateMatch(NO_SCORE, guild({ beyondRaising: true }, {}), 100, rules)).toEqual({
      phase: "finished",
      winningTeam: 1,
      reason: "morale",
    });
  });

  it("at time, is won by the most aggression, and lost by both on a tie", () => {
    expect(
      evaluateMatch(NO_SCORE, guild({ aggression: 300 }, { aggression: 500 }), 1679.9, rules),
    ).toBe(MATCH_IN_PROGRESS);
    expect(
      evaluateMatch(NO_SCORE, guild({ aggression: 300 }, { aggression: 500 }), 1680, rules),
    ).toEqual({ phase: "finished", winningTeam: 1, reason: "aggression" });
    expect(
      evaluateMatch(NO_SCORE, guild({ aggression: 300 }, { aggression: 300 }), 1680, rules),
    ).toEqual({ phase: "finished", winningTeam: undefined, reason: "aggression" });
  });

  it("checks the lord before morale, and both before time", () => {
    const all = guild({ guildLordLives: false, aggression: 900 }, { beyondRaising: true });
    expect(evaluateMatch(NO_SCORE, all, 1680, rules)).toEqual({
      phase: "finished",
      winningTeam: 1,
      reason: "guild-lord",
    });
    const morale = guild({ aggression: 900 }, { beyondRaising: true });
    expect(evaluateMatch(NO_SCORE, morale, 1680, rules)).toEqual({
      phase: "finished",
      winningTeam: 0,
      reason: "morale",
    });
  });
});

describe("evaluateMatch: relic run (#1374)", () => {
  const rules = RELIC_RUN_MATCH_RULES;
  const points = (team0: number, team1: number) => ({
    byTeam: new Map([
      [0, team0],
      [1, team1],
    ]),
  });

  it("is annihilation's dead and death penalty, 8 minutes", () => {
    expect(MATCH_MODES["relic-run"]).toBe(rules);
    expect(rules.deathRule).toBe("resurrection-only");
    expect(rules.deathPenalty).toBe(true);
    expect(rules.timeLimitSeconds).toBe(480);
  });

  it("goes at time to the most relic points, and no number of them ends it early", () => {
    expect(evaluateMatch(points(20, 1), BOTH_ALIVE, 479.9, rules)).toBe(MATCH_IN_PROGRESS);
    expect(evaluateMatch(points(1, 2), BOTH_ALIVE, 480, rules)).toEqual({
      phase: "finished",
      winningTeam: 1,
      reason: "time",
    });
  });

  it("is a draw at time on equal points, whatever the morale", () => {
    expect(evaluateMatch(points(2, 2), standing([0, 4, 0], [1, 4, -60]), 480, rules)).toEqual({
      phase: "finished",
      winningTeam: undefined,
      reason: "time",
    });
  });

  it("is lost at once by a wiped team, whatever the points", () => {
    expect(evaluateMatch(points(3, 0), standing([0, 0, -15], [1, 1, 0]), 100, rules)).toEqual({
      phase: "finished",
      winningTeam: 1,
      reason: "annihilation",
    });
  });
});
