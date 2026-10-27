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
  /**
   * How the dead come back (#843): `"respawn"` after `respawnSeconds`, or
   * `"resurrection-only"`, a corpse until a resurrection or the end of
   * the match.
   */
  readonly deathRule: "respawn" | "resurrection-only";
  /** Seconds a dead player waits before respawning; only for `"respawn"`. */
  readonly respawnSeconds: number;
  /** Whether a death costs morale, and a foe's death wins some back (#843, GW1). */
  readonly deathPenalty: boolean;
}

export const DEFAULT_MATCH_RULES: MatchRules = Object.freeze({
  // Tuned for a LAN session: long enough to swing, short enough that
  // nobody waits ages for the next match.
  scoreToWin: 15,
  timeLimitSeconds: 600,
  // GW1's Kill Count (The Crag): respawn, and no death penalty.
  deathRule: "respawn",
  respawnSeconds: 8,
  deathPenalty: false,
});

/** Morale a death costs, in percent, with `deathPenalty` (GW1). */
export const DEATH_PENALTY_PERCENT = 15;
/** The lowest morale goes, in percent. */
export const MORALE_FLOOR = -60;
/** The highest morale goes, in percent: a boost stops here. */
export const MORALE_CEILING = 10;
/** Morale a foe's death gives back to the living, up to 0, in percent. */
export const KILL_MORALE_PERCENT = 2;
/** A death this soon after a resurrection costs no morale, in seconds. */
export const DP_GRACE_AFTER_RES_SECONDS = 5;

/**
 * A maximum at `morale` percent (GW1): the share applies to the base,
 * before upgrades, so what equipment adds (`resolved − base`) is
 * untouched. Floored: −15% of 480 is 408.
 */
export function moraleMaximum(base: number, resolved: number, morale: number): number {
  return Math.floor((base * (100 + morale)) / 100) + (resolved - base);
}

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
