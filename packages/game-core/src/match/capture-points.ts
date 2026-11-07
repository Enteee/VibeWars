import { distance, type Vec2 } from "../vec2.js";
import { FLAG_REACH_UNITS } from "./flags.js";

/**
 * Heroes' Ascent's Capture Points (#1378, #2690, GW1's wiki "Capture
 * Points"): every player of a team within reach of a shrine is a pip, its
 * Ghostly Hero four, and a team has at most `MAX_PIPS`. The strongest
 * team's pips less the next strongest's move the shrine toward it; a tie
 * at the top holds it still. A shrine a foe owns, or a foe's progress on
 * it, is drained to neutral before it fills again.
 *
 * Pure: the simulation says how many pips each team has on each shrine;
 * this decides who owns it, and how far toward whom.
 */

/** How near a player stands to a shrine to count on it: as near as a flag is reached. */
export const CAPTURE_REACH_UNITS = FLAG_REACH_UNITS;

/** Seconds `MAX_PIPS` net take to fill a neutral shrine; fewer take proportionally longer. */
export const CAPTURE_SECONDS = 8;

/** The most pips a team counts on one shrine, however many stand on it. */
export const MAX_PIPS = 4;

/** A team's Ghostly Hero on a shrine is this many pips. */
export const GHOST_PIPS = 4;

/** Below this, progress is 0 or 1: a fill summed tick by tick lands just short. */
const PROGRESS_EPSILON = 1e-9;

/** One shrine as it stands. */
export interface CapturePointState {
  /** The team that owns it, and scores for it; `null` while neutral. */
  readonly owner: number | null;
  /** The team `progress` is toward; `null` at 0 with nobody's progress on it. */
  readonly capturer: number | null;
  /** From 0 to 1; an owned shrine is its owner's at 1 until a foe drains it. */
  readonly progress: number;
}

/** A shrine on the map, and how it stands. */
export interface CapturePoint extends CapturePointState {
  readonly position: Vec2;
}

/** A shrine at each of `positions`, neutral, nobody's progress on it. */
export function initialCapturePoints(positions: readonly Vec2[]): CapturePoint[] {
  return positions.map((position) => ({ position, owner: null, capturer: null, progress: 0 }));
}

/** Whether `position` is on the shrine at `point`. */
export function onCapturePoint(point: Vec2, position: Vec2): boolean {
  return distance(point, position) <= CAPTURE_REACH_UNITS;
}

/**
 * The team that moves a shrine, and by how many pips: each team's
 * `pips`, capped at `MAX_PIPS`, the strongest's less the next strongest's,
 * for any number of teams. `undefined` with nobody on it, or a tie at the top.
 */
export function netPips(
  pips: ReadonlyMap<number, number>,
): { readonly team: number; readonly net: number } | undefined {
  const ranked = [...pips]
    .map(([team, count]) => [team, Math.min(count, MAX_PIPS)] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first === undefined || first[1] === second?.[1]) {
    return undefined;
  }
  return { team: first[0], net: first[1] - (second?.[1] ?? 0) };
}

/**
 * Each shrine `dt` seconds on. `presence[i]` holds each team's pips on
 * shrine `i`. A shrine nobody moves keeps its progress.
 */
export function stepCapturePoints<T extends CapturePointState>(
  state: readonly T[],
  dt: number,
  presence: readonly ReadonlyMap<number, number>[],
): { readonly state: readonly T[] } {
  return {
    state: state.map((point, i) => {
      const moving = netPips(presence[i] ?? new Map<number, number>());
      if (moving === undefined) {
        return point;
      }
      return capture(point, moving.team, (moving.net / MAX_PIPS / CAPTURE_SECONDS) * dt);
    }),
  };
}

/** `point` after `team` moved it by `amount` of a whole fill. */
function capture<T extends CapturePointState>(point: T, team: number, amount: number): T {
  if (point.capturer !== team && point.progress > 0) {
    const left = point.progress - amount;
    if (left > PROGRESS_EPSILON) {
      return { ...point, progress: left };
    }
    // Drained: the shrine is no one's, and what is left of the step fills
    // it. A drain that lands within the epsilon leaves nothing to fill.
    const neutral = { ...point, owner: null, capturer: null, progress: 0 };
    return -left > PROGRESS_EPSILON ? capture(neutral, team, -left) : neutral;
  }
  const progress = point.progress + amount;
  return progress < 1 - PROGRESS_EPSILON
    ? { ...point, capturer: team, progress }
    : { ...point, owner: team, capturer: team, progress: 1 };
}
