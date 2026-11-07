import { describe, expect, it } from "vitest";

import { vec2 } from "../vec2.js";
import {
  CAPTURE_REACH_UNITS,
  CAPTURE_SECONDS,
  GHOST_PIPS,
  MAX_PIPS,
  initialCapturePoints,
  netPips,
  onCapturePoint,
  stepCapturePoints,
  type CapturePointState,
} from "./capture-points.js";

/**
 * Capture Points' shrines (#1378, #2690), pure: how pips net, who takes
 * one, how fast, and what a contest, a foe and an empty shrine do to it.
 */

const TICK = 1 / 20;

/** Each team's pips, as `[team, pips]` pairs. */
function pips(...teams: (readonly [number, number])[]): ReadonlyMap<number, number> {
  return new Map(teams);
}

const NOBODY = pips();

/** `point` after `seconds` of `on`'s pips on it, a tick at a time. */
function hold(
  point: CapturePointState,
  on: ReadonlyMap<number, number>,
  seconds: number,
): CapturePointState {
  let state: readonly CapturePointState[] = [point];
  for (let i = 0; i < Math.round(seconds / TICK); i += 1) {
    state = stepCapturePoints(state, TICK, [on]).state;
  }
  const [after] = state;
  if (after === undefined) {
    throw new Error("no shrine");
  }
  return after;
}

const NEUTRAL: CapturePointState = { owner: null, capturer: null, progress: 0 };
const OURS: CapturePointState = { owner: 0, capturer: 0, progress: 1 };

describe("netPips (#2690)", () => {
  it("nets the strongest against every other, capping the net, not a team, at four", () => {
    expect(MAX_PIPS).toBe(4);
    expect(netPips(pips([0, 7]))).toEqual({ team: 0, net: 4 });
    expect(netPips(pips([0, 3], [1, 2]))).toEqual({ team: 0, net: 1 });
    expect(netPips(pips([0, 8], [1, 6]))).toEqual({ team: 0, net: 2 });
    expect(netPips(pips([0, 8], [1, 2]))).toEqual({ team: 0, net: 4 });
    expect(netPips(pips([0, 5], [1, 4]))).toEqual({ team: 0, net: 1 });
    expect(netPips(pips([0, 1], [1, 6], [2, 2]))).toEqual({ team: 1, net: 3 });
  });

  it("goes negative when the others together outnumber the strongest of three", () => {
    expect(netPips(pips([0, 5], [1, 3], [2, 3]))).toEqual({ team: 0, net: -1 });
    expect(netPips(pips([0, 4], [1, 3], [2, 3], [3, 3]))).toEqual({ team: 0, net: -4 });
  });

  it("moves nothing with nobody on it, a tie at the top of three, or a net of 0", () => {
    expect(netPips(NOBODY)).toBeUndefined();
    expect(netPips(pips([0, 0], [1, 0]))).toBeUndefined();
    expect(netPips(pips([0, 2], [1, 2], [2, 1]))).toBeUndefined();
    expect(netPips(pips([0, 4], [1, 2], [2, 2]))).toBeUndefined();
  });
});

describe("a capture point (#1378, #2690)", () => {
  it("is taken by four pips in 8 s, two in 16 s, and the ghost alone in 8 s", () => {
    expect(CAPTURE_SECONDS).toBe(8);
    expect(hold(NEUTRAL, pips([0, 4]), 7.95).owner).toBeNull();
    expect(hold(NEUTRAL, pips([0, 4]), 8)).toEqual(OURS);
    expect(hold(NEUTRAL, pips([0, 2]), 15.95)).toMatchObject({ owner: null, capturer: 0 });
    expect(hold(NEUTRAL, pips([0, 2]), 16)).toEqual(OURS);
    expect(hold(NEUTRAL, pips([0, GHOST_PIPS]), 8)).toEqual(OURS);
  });

  it("is taken at the net of three against two, one pip, in 32 s", () => {
    expect(hold(NEUTRAL, pips([0, 3], [1, 2]), 31.95).owner).toBeNull();
    expect(hold(NEUTRAL, pips([0, 3], [1, 2]), 32)).toEqual(OURS);
  });

  it("does not move while the strongest teams on it tie", () => {
    const half = hold(NEUTRAL, pips([1, 1]), 16);
    expect(hold(half, pips([0, 1], [1, 1]), 30)).toEqual(half);
    expect(hold(OURS, pips([0, 2], [1, 2], [2, 1]), 30)).toEqual(OURS);
    expect(hold(NEUTRAL, pips([1, 1], [0, 1]), 30)).toEqual(NEUTRAL);
  });

  it("is neutralised before it fills for a foe: an owned one takes four pips 16 s", () => {
    const drained = hold(OURS, pips([1, 4]), 4);
    expect(drained).toMatchObject({ owner: 0, capturer: 0 });
    expect(drained.progress).toBeCloseTo(0.5);
    expect(hold(OURS, pips([1, 4]), 8)).toMatchObject({ owner: null });
    expect(hold(OURS, pips([1, 4]), 15.95).owner).toBeNull();
    expect(hold(OURS, pips([1, 4]), 16)).toEqual({ owner: 1, capturer: 1, progress: 1 });
    // The owner back on it fills it again.
    expect(hold(hold(OURS, pips([1, 4]), 4), pips([0, 4]), 4)).toEqual(OURS);
  });

  it("is neutral, never below 0, when a drain lands just short of the progress", () => {
    // 0.1 is 3.2 s of one foe's pip; the float residue a tick-summed fill leaves.
    const drained = stepCapturePoints(
      [{ owner: null, capturer: 1, progress: 0.1 + 1e-12 }],
      0.1 * CAPTURE_SECONDS * MAX_PIPS,
      [pips([0, 1])],
    ).state[0];
    expect(drained).toEqual(NEUTRAL);
    const filledAndDrained = hold(hold(NEUTRAL, pips([1, 1]), 3), pips([0, 1]), 3);
    expect(filledAndDrained.progress).toBeGreaterThanOrEqual(0);
  });

  it("is only neutralised, at the negative net, when the others outnumber the strongest", () => {
    // Blue 5 against Red 3 and Yellow 3 on Blue's shrine: -1, 32 s to drain.
    const outnumbered = pips([0, 5], [1, 3], [2, 3]);
    expect(hold(OURS, outnumbered, 31.95).owner).toBe(0);
    expect(hold(OURS, outnumbered, 32)).toEqual(NEUTRAL);
    expect(hold(OURS, outnumbered, 60)).toEqual(NEUTRAL);
    expect(hold(NEUTRAL, outnumbered, 60)).toEqual(NEUTRAL);
  });

  it("keeps its progress while nobody is on it, and its owner for good", () => {
    const partial = hold(NEUTRAL, pips([1, 2]), 4);
    expect(hold(partial, NOBODY, 60)).toEqual(partial);
    expect(hold(OURS, NOBODY, 60)).toEqual(OURS);
  });

  it("counts a player within reach, and each shrine apart", () => {
    const point = vec2(500, 500);
    expect(onCapturePoint(point, vec2(500 + CAPTURE_REACH_UNITS, 500))).toBe(true);
    expect(onCapturePoint(point, vec2(501 + CAPTURE_REACH_UNITS, 500))).toBe(false);
    const { state } = stepCapturePoints(
      initialCapturePoints([point, vec2(900, 500)]),
      CAPTURE_SECONDS,
      [pips([0, 4]), NOBODY],
    );
    expect(state).toEqual([
      { ...OURS, position: point },
      { ...NEUTRAL, position: vec2(900, 500) },
    ]);
  });
});
