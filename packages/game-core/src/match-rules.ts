/**
 * Match rules: scoring, time limit and victory conditions (brief §22).
 *
 * Pure functions over a plain snapshot so the whole ruleset is testable
 * headlessly and a future ruleset variant is a different config object
 * rather than a different code path.
 */

export interface MatchRules {
  /** Kills one team needs to win. */
  readonly scoreToWin: number;
  /** Match length in seconds; at zero time the lead wins. */
  readonly timeLimitSeconds: number;
  /** Seconds a dead player waits before respawning. */
  readonly respawnSeconds: number;
}

export const DEFAULT_MATCH_RULES: MatchRules = Object.freeze({
  // Tuned for a LAN session: long enough to swing, short enough that
  // nobody waits ages for the next match.
  scoreToWin: 15,
  timeLimitSeconds: 600,
  respawnSeconds: 8,
});

export type MatchPhase = "active" | "finished";

export interface MatchScore {
  /** Kills by team index. */
  readonly byTeam: ReadonlyMap<number, number>;
}

export interface MatchOutcome {
  readonly phase: MatchPhase;
  /** The winning team, or `undefined` for a draw or an unfinished match. */
  readonly winningTeam: number | undefined;
  readonly reason: "score" | "time" | undefined;
}

export const MATCH_IN_PROGRESS: MatchOutcome = Object.freeze({
  phase: "active",
  winningTeam: undefined,
  reason: undefined,
});

function leader(score: MatchScore): { team: number | undefined; tied: boolean } {
  let best = -1;
  let bestTeam: number | undefined;
  let tied = false;

  for (const [team, points] of score.byTeam) {
    if (points > best) {
      best = points;
      bestTeam = team;
      tied = false;
    } else if (points === best) {
      tied = true;
    }
  }
  return { team: bestTeam, tied };
}

/**
 * Decide whether the match is over.
 *
 * Score is checked before time so that reaching the target on the very
 * last tick is a score win rather than being reported as a timeout —
 * which reads wrong to players who just scored the winning kill.
 */
export function evaluateMatch(
  score: MatchScore,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  for (const [team, points] of score.byTeam) {
    if (points >= rules.scoreToWin) {
      return { phase: "finished", winningTeam: team, reason: "score" };
    }
  }

  if (elapsedSeconds >= rules.timeLimitSeconds) {
    const { team, tied } = leader(score);
    return {
      phase: "finished",
      // A tie at time is a draw, not an arbitrary winner.
      winningTeam: tied ? undefined : team,
      reason: "time",
    };
  }

  return MATCH_IN_PROGRESS;
}

/** Add a kill for `team`, returning a new score (the input is untouched). */
export function addKill(score: MatchScore, team: number): MatchScore {
  const byTeam = new Map(score.byTeam);
  byTeam.set(team, (byTeam.get(team) ?? 0) + 1);
  return { byTeam };
}

export function emptyScore(teams: readonly number[]): MatchScore {
  return { byTeam: new Map(teams.map((team) => [team, 0])) };
}
