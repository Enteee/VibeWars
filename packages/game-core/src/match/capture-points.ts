import { distance, type Vec2 } from "../vec2.js";
import { FLAG_REACH_UNITS } from "./flags.js";

/**
 * Heroes' Ascent's Capture Points (#1378, GW1's Forgotten Shrines): a
 * team takes a shrine by standing on it, one pip per member on it. A
 * shrine a foe owns, or a foe's progress on it, is drained to neutral
 * before it fills again. Two teams on it contest it: nothing moves.
 *
 * Pure: the simulation says which living players are on each shrine;
 * this decides who owns it, and how far toward whom.
 */

/** How near a player stands to a shrine to count on it: as near as a flag is reached. */
export const CAPTURE_REACH_UNITS = FLAG_REACH_UNITS;

/** Seconds one player alone takes to fill a neutral shrine; each more on it is a pip more. */
export const CAPTURE_SECONDS = 20;

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
 * Each shrine `dt` seconds on. `presence[i]` holds the team of every
 * living player on shrine `i`, one entry each: a team's entries are its
 * pips. A shrine with nobody on it keeps its progress.
 */
export function stepCapturePoints<T extends CapturePointState>(
  state: readonly T[],
  dt: number,
  presence: readonly (readonly number[])[],
): { readonly state: readonly T[] } {
  return {
    state: state.map((point, i) => {
      const on = presence[i] ?? [];
      const team = on[0];
      if (team === undefined || on.some((other) => other !== team)) {
        return point;
      }
      return capture(point, team, (on.length / CAPTURE_SECONDS) * dt);
    }),
  };
}

/** `point` after `team` alone stood on it for `amount` of a whole fill. */
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
