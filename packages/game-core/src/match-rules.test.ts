import { describe, expect, it } from "vitest";

import {
  DEFAULT_MATCH_RULES,
  addKill,
  emptyScore,
  evaluateMatch,
  type MatchRules,
} from "./match-rules.js";

const RULES: MatchRules = { scoreToWin: 3, timeLimitSeconds: 60, respawnSeconds: 5 };

describe("emptyScore / addKill", () => {
  it("starts every team at zero", () => {
    const score = emptyScore([0, 1]);
    expect(score.byTeam.get(0)).toBe(0);
    expect(score.byTeam.get(1)).toBe(0);
  });

  it("adds a kill without mutating the previous score", () => {
    const first = emptyScore([0, 1]);
    const second = addKill(first, 0);
    expect(second.byTeam.get(0)).toBe(1);
    expect(first.byTeam.get(0)).toBe(0);
  });

  it("accumulates kills", () => {
    let score = emptyScore([0, 1]);
    score = addKill(score, 1);
    score = addKill(score, 1);
    expect(score.byTeam.get(1)).toBe(2);
  });
});

describe("evaluateMatch", () => {
  it("reports an active match before anything decisive happens", () => {
    expect(evaluateMatch(emptyScore([0, 1]), 0, RULES).phase).toBe("active");
  });

  it("ends when a team reaches the score target", () => {
    let score = emptyScore([0, 1]);
    for (let i = 0; i < 3; i += 1) {
      score = addKill(score, 1);
    }
    const outcome = evaluateMatch(score, 10, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBe(1);
    expect(outcome.reason).toBe("score");
  });

  it("does not end one kill short of the target", () => {
    let score = emptyScore([0, 1]);
    score = addKill(score, 1);
    score = addKill(score, 1);
    expect(evaluateMatch(score, 10, RULES).phase).toBe("active");
  });

  it("ends on the time limit with the leader winning", () => {
    let score = emptyScore([0, 1]);
    score = addKill(score, 0);
    const outcome = evaluateMatch(score, 60, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBe(0);
    expect(outcome.reason).toBe("time");
  });

  it("calls a tie at time a draw rather than picking an arbitrary winner", () => {
    let score = emptyScore([0, 1]);
    score = addKill(score, 0);
    score = addKill(score, 1);
    const outcome = evaluateMatch(score, 60, RULES);
    expect(outcome.phase).toBe("finished");
    expect(outcome.winningTeam).toBeUndefined();
    expect(outcome.reason).toBe("time");
  });

  it("treats a scoreless match at the time limit as a draw", () => {
    const outcome = evaluateMatch(emptyScore([0, 1]), 60, RULES);
    expect(outcome.winningTeam).toBeUndefined();
  });

  it("prefers a score win over a timeout when both land on the same tick", () => {
    // Scoring the winning kill as the clock expires should read as a
    // score win to the player who just made it.
    let score = emptyScore([0, 1]);
    for (let i = 0; i < 3; i += 1) {
      score = addKill(score, 0);
    }
    expect(evaluateMatch(score, 60, RULES).reason).toBe("score");
  });

  it("ships defaults that are self-consistent", () => {
    expect(DEFAULT_MATCH_RULES.scoreToWin).toBeGreaterThan(0);
    expect(DEFAULT_MATCH_RULES.timeLimitSeconds).toBeGreaterThan(0);
    expect(DEFAULT_MATCH_RULES.respawnSeconds).toBeGreaterThan(0);
  });
});
