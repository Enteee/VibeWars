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
   * `"annihilation"` by wiping the other team, `"priest-annihilation"` by
   * wiping it and killing its priest (#1186), or by morale at time;
   * `"guild-battle"` by killing the foe's Guild Lord (#1222); `"relic-run"`
   * by relic points at time, or by wiping the other team (#1374);
   * `"capture-points"` the same, by shrine points (#1378).
   */
  readonly victory:
    | "kill-count"
    | "annihilation"
    | "priest-annihilation"
    | "guild-battle"
    | "relic-run"
    | "capture-points";
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
 * GW1's Kill Count (The Crag): the most kills in 3 minutes, or the first
 * to 15, with respawn and no death penalty.
 */
export const KILL_COUNT_MATCH_RULES: MatchRules = Object.freeze({
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 180,
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

/**
 * GW1's Priest Annihilation (#1186): annihilation with a priest at each
 * team's shrine, who raises the team's dead every 2 minutes. A team is
 * beaten once every player and its priest are dead; 12 minutes.
 */
export const PRIEST_ANNIHILATION_MATCH_RULES: MatchRules = Object.freeze({
  ...ANNIHILATION_MATCH_RULES,
  victory: "priest-annihilation",
  timeLimitSeconds: 720,
});

/**
 * GW1's Guild versus Guild (#1222): kill the enemy Guild Lord. The dead
 * stay down and pay the death penalty; each base's shrine raises them
 * every 2 minutes, priest or none. A team all dead at the morale floor
 * loses; at 28 minutes (the operator's, Q138) the most aggression wins.
 */
export const GUILD_BATTLE_MATCH_RULES: MatchRules = Object.freeze({
  ...ANNIHILATION_MATCH_RULES,
  victory: "guild-battle",
  timeLimitSeconds: 1680,
});

/**
 * Heroes' Ascent's Relic Run (#1374): carry your relic onto the altar for
 * a point. The dead stay down and pay the death penalty, a wipe loses at
 * once, as in annihilation; at 8 minutes the most points win.
 */
export const RELIC_RUN_MATCH_RULES: MatchRules = Object.freeze({
  ...ANNIHILATION_MATCH_RULES,
  victory: "relic-run",
  timeLimitSeconds: 480,
});

/**
 * Heroes' Ascent's Capture Points (#1378): stand on a shrine to take it,
 * and every `POINT_TICK_SECONDS` each one a team owns scores it a point.
 * Otherwise a Relic Run's: a wipe loses at once, the most points at
 * 8 minutes win.
 */
export const CAPTURE_POINTS_MATCH_RULES: MatchRules = Object.freeze({
  ...ANNIHILATION_MATCH_RULES,
  victory: "capture-points",
  timeLimitSeconds: 480,
});

/** Heroes' Ascent scores held ground at every multiple of this, match clock (#1378, GW1). */
export const POINT_TICK_SECONDS = 30;

/** A living priest raises its team's dead at every multiple of this, match clock (#1186, GW1). */
export const PRIEST_WAVE_SECONDS = 120;

/** Seconds a player a shrine raised takes no damage, health loss, hex or condition (#1208, GW1). */
export const SHRINE_INVULNERABLE_SECONDS = 5;

/** The modes a map can name (#476): which one a match plays follows from its map alone. */
export type MatchMode =
  | "annihilation"
  | "kill-count"
  | "priest-annihilation"
  | "guild-battle"
  | "relic-run"
  | "capture-points";

/** Each mode's rules, by the name a map gives it. */
export const MATCH_MODES: Readonly<Record<MatchMode, MatchRules>> = Object.freeze({
  annihilation: ANNIHILATION_MATCH_RULES,
  "kill-count": KILL_COUNT_MATCH_RULES,
  "priest-annihilation": PRIEST_ANNIHILATION_MATCH_RULES,
  "guild-battle": GUILD_BATTLE_MATCH_RULES,
  "relic-run": RELIC_RUN_MATCH_RULES,
  "capture-points": CAPTURE_POINTS_MATCH_RULES,
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
  /** Kills by team index; a Relic Run's relic points (#1374) or Capture Points' shrine points (#1378) instead. */
  readonly byTeam: ReadonlyMap<number, number>;
}

/** Every team that had members, as it stands, even with all of them gone (#846). */
export interface MatchStanding {
  readonly byTeam: ReadonlyMap<number, TeamStanding>;
}

export interface TeamStanding {
  /** Members alive. */
  readonly living: number;
  /** The sum of every member's morale, dead or alive, in percent. */
  readonly morale: number;
  /** Whether its priest lives (#1186); `false` for a team that never had one. */
  readonly priestLives: boolean;
  /** Whether its Guild Lord lives (#1222); `false` for a team that never had one. */
  readonly guildLordLives: boolean;
  /**
   * Whether it has members and every one is dead at `MORALE_FLOOR` (#1222):
   * no shrine raises them, so the team has no way back.
   */
  readonly beyondRaising: boolean;
  /**
   * Damage its members and their creatures dealt to a foe's Guild Lord
   * (#1222), after armor; degeneration and life stealing are not counted.
   */
  readonly aggression: number;
}

/**
 * Why a match ended: kill-count's `"score"` and `"time"`, annihilation's
 * `"annihilation"` (a team wiped) and `"morale"` (time ran out, or in a
 * Guild Battle a team all dead at the floor), the Guild Battle's
 * `"guild-lord"` (a lord slain) and `"aggression"` (time ran out, #1222).
 */
export type MatchEndReason =
  "score" | "time" | "annihilation" | "morale" | "guild-lord" | "aggression";

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
    case "priest-annihilation":
      return evaluateAnnihilation(standing, elapsedSeconds, rules);
    case "guild-battle":
      return evaluateGuildBattle(standing, elapsedSeconds, rules);
    case "relic-run":
    case "capture-points":
      return evaluateRelicRun(score, standing, elapsedSeconds, rules);
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

  return evaluateScoreAtTime(score, elapsedSeconds, rules);
}

/** At time, the most points win, kill-count's and a Relic Run's (#1374). */
function evaluateScoreAtTime(
  score: MatchScore,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
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
 * Annihilation (GW1): once a team is beaten and at most one team is not,
 * that one wins; with none left, every team loses. Beaten is every member
 * dead and, in Priest Annihilation (#1186), its priest too: a wiped team
 * whose priest lives waits for the wave. A team that never had members is
 * not in `standing`, so it is never beaten. At time the highest total
 * morale wins; of the teams tied on it, the one whose priest lives, if it
 * is the only one; otherwise all lose: GW1's arenas have no draw.
 */
function evaluateAnnihilation(
  standing: MatchStanding,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  const standingTeams = [...standing.byTeam].filter(
    ([, team]) => team.living > 0 || team.priestLives,
  );
  if (standingTeams.length < standing.byTeam.size && standingTeams.length <= 1) {
    return { phase: "finished", winningTeam: standingTeams[0]?.[0], reason: "annihilation" };
  }

  if (elapsedSeconds >= rules.timeLimitSeconds) {
    const best = Math.max(...[...standing.byTeam.values()].map((team) => team.morale));
    const leaders = [...standing.byTeam].filter(([, team]) => team.morale === best);
    const withPriest = leaders.filter(([, team]) => team.priestLives);
    const winner =
      leaders.length === 1 ? leaders[0] : withPriest.length === 1 ? withPriest[0] : undefined;
    return { phase: "finished", winningTeam: winner?.[0], reason: "morale" };
  }

  return MATCH_IN_PROGRESS;
}

/**
 * Guild versus Guild (#1222, GW1), in this order: a team whose Guild Lord
 * died loses; then a team all dead at the morale floor; at time, the most
 * aggression wins. Whichever rule decides, the one team it leaves wins,
 * and none left, or a tie at time, every team loses: GW1's arenas have no
 * draw. A wipe alone decides nothing: the shrine raises the team.
 */
function evaluateGuildBattle(
  standing: MatchStanding,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  const teams = [...standing.byTeam];
  const withLord = teams.filter(([, team]) => team.guildLordLives);
  if (withLord.length < teams.length) {
    return { phase: "finished", winningTeam: lone(withLord), reason: "guild-lord" };
  }
  const raisable = teams.filter(([, team]) => !team.beyondRaising);
  if (raisable.length < teams.length) {
    return { phase: "finished", winningTeam: lone(raisable), reason: "morale" };
  }
  if (elapsedSeconds >= rules.timeLimitSeconds) {
    const best = Math.max(...teams.map(([, team]) => team.aggression));
    const leaders = teams.filter(([, team]) => team.aggression === best);
    return { phase: "finished", winningTeam: lone(leaders), reason: "aggression" };
  }
  return MATCH_IN_PROGRESS;
}

/**
 * Relic Run (#1374, GW1), and Capture Points (#1378) alike: a wiped team
 * loses at once, as in annihilation; at time the most points win, and a
 * tie is a draw, as kill-count's.
 * No number of points wins early: `scoreToWin` is kill-count's.
 */
function evaluateRelicRun(
  score: MatchScore,
  standing: MatchStanding,
  elapsedSeconds: number,
  rules: MatchRules,
): MatchOutcome {
  const living = [...standing.byTeam].filter(([, team]) => team.living > 0);
  if (living.length < standing.byTeam.size && living.length <= 1) {
    return { phase: "finished", winningTeam: living[0]?.[0], reason: "annihilation" };
  }
  return evaluateScoreAtTime(score, elapsedSeconds, rules);
}

/** The team of the one entry, or `undefined` for none or several. */
function lone(teams: readonly (readonly [number, TeamStanding])[]): number | undefined {
  return teams.length === 1 ? teams[0]?.[0] : undefined;
}

/** Add a point for `team`, a kill or a relic home (#1374): a new score, the input untouched. */
export function addPoint(score: MatchScore, team: number): MatchScore {
  const byTeam = new Map(score.byTeam);
  byTeam.set(team, (byTeam.get(team) ?? 0) + 1);
  return { byTeam };
}

export function emptyScore(teams: readonly number[]): MatchScore {
  return { byTeam: new Map(teams.map((team) => [team, 0])) };
}
