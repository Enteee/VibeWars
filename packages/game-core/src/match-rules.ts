/**
 * Match rules: scoring, time limit and victory conditions (brief §22).
 *
 * Pure functions over a plain snapshot so the whole ruleset is testable
 * headlessly and a future ruleset variant is a different config object
 * rather than a different code path.
 */

export interface MatchRules {
  /**
   * How a match is won (GW1 modes, #474/#476): `"kill-count"` by kills,
   * `"annihilation"` by wiping the other team, or by morale at time.
   */
  readonly victory: "kill-count" | "annihilation";
  /** Kills one team needs to win; only for `"kill-count"`. */
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

/**
 * GW1's Kill Count (The Crag): first to 15 kills, respawn, and no death
 * penalty. Nothing selects it yet (#476 picks a mode per map).
 */
export const KILL_COUNT_MATCH_RULES: MatchRules = Object.freeze({
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 8,
  deathPenalty: false,
});

/**
 * GW1's Annihilation: wipe the other team. The dead stay down until
 * resurrected and pay the death penalty; at 8 minutes the highest total
 * morale wins (GW1 update 2007-09-27).
 */
export const ANNIHILATION_MATCH_RULES: MatchRules = Object.freeze({
  victory: "annihilation",
  scoreToWin: KILL_COUNT_MATCH_RULES.scoreToWin,
  timeLimitSeconds: 480,
  deathRule: "resurrection-only",
  respawnSeconds: KILL_COUNT_MATCH_RULES.respawnSeconds,
  deathPenalty: true,
});

export const DEFAULT_MATCH_RULES: MatchRules = ANNIHILATION_MATCH_RULES;

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

/** Every team with members, as it stands (#846). */
export interface MatchStanding {
  readonly byTeam: ReadonlyMap<number, TeamStanding>;
}

export interface TeamStanding {
  /** Members alive. */
  readonly living: number;
  /** The sum of every member's morale, dead or alive, in percent. */
  readonly morale: number;
}

/**
 * Why a match ended: kill-count's `"score"` and `"time"`, annihilation's
 * `"annihilation"` (a team wiped) and `"morale"` (time ran out).
 */
export type MatchEndReason = "score" | "time" | "annihilation" | "morale";

export interface MatchOutcome {
  readonly phase: MatchPhase;
  /**
   * The winning team, or `undefined` for an unfinished match, a
   * kill-count draw, or an annihilation match every team lost.
   */
  readonly winningTeam: number | undefined;
  readonly reason: MatchEndReason | undefined;
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
 * which reads wrong to players who just scored the winning kill. A wipe
 * is checked before time for the same reason.
 */
export function evaluateMatch(
  score: MatchScore,
  standing: MatchStanding,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  switch (rules.victory) {
    case "kill-count":
      return evaluateKillCount(score, elapsedSeconds, rules);
    case "annihilation":
      return evaluateAnnihilation(standing, elapsedSeconds, rules);
  }
}

function evaluateKillCount(
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

/**
 * Annihilation (GW1): once a team is wiped and at most one team still
 * has anyone alive, that one wins; with nobody left, every team loses.
 * A team with no members is not in `standing`, so it is never wiped. At
 * time the highest total morale wins, and a tie is lost by all: GW1's
 * arenas have no draw.
 */
function evaluateAnnihilation(
  standing: MatchStanding,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  const alive = [...standing.byTeam].filter(([, team]) => team.living > 0);
  if (alive.length < standing.byTeam.size && alive.length <= 1) {
    return { phase: "finished", winningTeam: alive[0]?.[0], reason: "annihilation" };
  }

  if (elapsedSeconds >= rules.timeLimitSeconds) {
    let best = -Infinity;
    let bestTeam: number | undefined;
    let tied = false;
    for (const [team, { morale }] of standing.byTeam) {
      if (morale > best) {
        best = morale;
        bestTeam = team;
        tied = false;
      } else if (morale === best) {
        tied = true;
      }
    }
    return { phase: "finished", winningTeam: tied ? undefined : bestTeam, reason: "morale" };
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
