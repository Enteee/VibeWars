import type { Vec2 } from "../vec2.js";
import { FLAG_REACH_UNITS } from "./flags.js";
import { atObjective, type BodyOnFloors } from "./layer-rules.js";

/**
 * Heroes' Ascent's Capture Points (#1378, #2690, GW1's wiki "Capture
 * Points"): every player of a team within reach of a shrine is a pip, its
 * Ghostly Hero four. The team with the most pips, less every other team's,
 * moves the shrine toward it, at most `MAX_PIPS`; a tie at the top holds
 * it still, and the others outnumbering it drain the shrine to neutral. A
 * shrine a foe owns, or a foe's progress on it, is drained to neutral
 * before it fills again.
 *
 * Pure: the simulation says how many pips each team has on each shrine;
 * this decides who owns it, and how far toward whom.
 */

/** How near a player stands to a shrine to count on it: as near as a flag is reached. */
export const CAPTURE_REACH_UNITS = FLAG_REACH_UNITS;

/** Seconds `MAX_PIPS` net take to fill a neutral shrine; fewer take proportionally longer. */
export const CAPTURE_SECONDS = 8;

/** The most net pips that move a shrine, however many stand on it (GW1 wiki Pip). */
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
  /** The layer it stands on (ADR-0051). */
  readonly layer: number;
}

/** Where a map puts a shrine. Omitted `layer`: the ground. */
export type CapturePointSite = Vec2 & { readonly layer?: number };

/** A shrine at each of `sites`, neutral, nobody's progress on it. */
export function initialCapturePoints(sites: readonly CapturePointSite[]): CapturePoint[] {
  return sites.map(({ x, y, layer }) => ({
    position: { x, y },
    layer: layer ?? 0,
    owner: null,
    capturer: null,
    progress: 0,
  }));
}

/** Whether `body` is on the shrine `point`: in reach, and on its layer or a ramp to it. */
export function onCapturePoint(
  point: Pick<CapturePoint, "position" | "layer">,
  body: BodyOnFloors,
): boolean {
  return atObjective(point.position, point.layer, body, CAPTURE_REACH_UNITS);
}

/**
 * How `pips` move a shrine, for any number of teams (GW1 wiki Capture
 * Points): the team with the most less the sum of every other's, at most
 * `MAX_PIPS` either way. Positive, it captures for `team`; negative, the
 * others outnumber it and only drain the shrine to neutral. `undefined`
 * with nobody on it, a tie at the top, or a net of 0: nothing moves.
 */
export function netPips(
  pips: ReadonlyMap<number, number>,
): { readonly team: number; readonly net: number } | undefined {
  const ranked = [...pips].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (first === undefined || first[1] === second?.[1]) {
    return undefined;
  }
  const others = ranked.slice(1).reduce((sum, [, count]) => sum + count, 0);
  const net = Math.max(-MAX_PIPS, Math.min(MAX_PIPS, first[1] - others));
  return net === 0 ? undefined : { team: first[0], net };
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
      const amount = (Math.abs(moving.net) / MAX_PIPS / CAPTURE_SECONDS) * dt;
      return moving.net > 0 ? capture(point, moving.team, amount) : neutralise(point, amount);
    }),
  };
}

/** `point` drained toward neutral by `amount` of a whole fill, and what of `amount` is left over. */
function drain<T extends CapturePointState>(point: T, amount: number): { point: T; left: number } {
  const left = point.progress - amount;
  if (left > PROGRESS_EPSILON) {
    return { point: { ...point, progress: left }, left: 0 };
  }
  // A drain that lands within the epsilon leaves nothing over.
  return {
    point: { ...point, owner: null, capturer: null, progress: 0 },
    left: -left > PROGRESS_EPSILON ? -left : 0,
  };
}

/** `point` drained by `amount` of a whole fill, and left neutral once it is (#2690). */
function neutralise<T extends CapturePointState>(point: T, amount: number): T {
  return drain(point, amount).point;
}

/** `point` after `team` moved it by `amount` of a whole fill. */
function capture<T extends CapturePointState>(point: T, team: number, amount: number): T {
  if (point.capturer !== team && point.progress > 0) {
    // Drained, the shrine is no one's, and what is left of the step fills it.
    const drained = drain(point, amount);
    return drained.left > 0 ? capture(drained.point, team, drained.left) : drained.point;
  }
  const progress = point.progress + amount;
  return progress < 1 - PROGRESS_EPSILON
    ? { ...point, capturer: team, progress }
    : { ...point, owner: team, capturer: team, progress: 1 };
}
