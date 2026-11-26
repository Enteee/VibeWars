import { describe, expect, it } from "vitest";

import { POINT_TICK_SECONDS } from "../match-rules.js";
import { UNCLAIMED_ALTAR, claimant, mayClaim, stepAltar, type AltarState } from "./altar.js";

/**
 * King of the Hill's altar (#1377): a point for every 30 s held without
 * a break; a claim takes it and starts the clock again.
 */

const DT = 0.05;

/** `seconds` of ticks with no claim, and the points scored, in order. */
function hold(state: AltarState, seconds: number): { state: AltarState; scored: number[] } {
  let next = state;
  const scored: number[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    const step = stepAltar(next, DT, null);
    next = step.state;
    if (step.scored !== null) {
      scored.push(step.scored);
    }
  }
  return { state: next, scored };
}

describe("stepAltar (#1377)", () => {
  it("gives the holder a point for 30 s held, and starts again", () => {
    const claimed = stepAltar(UNCLAIMED_ALTAR, DT, 0).state;
    expect(claimed).toEqual({ holder: 0, heldSeconds: 0 });
    const almost = hold(claimed, POINT_TICK_SECONDS - DT);
    expect(almost.scored).toEqual([]);
    const held = hold(almost.state, DT);
    expect(held.scored).toEqual([0]);
    expect(held.state).toEqual({ holder: 0, heldSeconds: 0 });
    expect(hold(claimed, 3 * POINT_TICK_SECONDS).scored).toEqual([0, 0, 0]);
  });

  it("scores nobody while nobody holds it", () => {
    expect(hold(UNCLAIMED_ALTAR, 2 * POINT_TICK_SECONDS)).toEqual({
      state: UNCLAIMED_ALTAR,
      scored: [],
    });
  });

  it("resets the clock on a capture by another team", () => {
    const held = hold({ holder: 0, heldSeconds: 0 }, 20).state;
    const taken = stepAltar(held, DT, 1);
    expect(taken).toEqual({ state: { holder: 1, heldSeconds: 0 }, scored: null });
    expect(hold(taken.state, 20).scored).toEqual([]);
    expect(hold(taken.state, POINT_TICK_SECONDS).scored).toEqual([1]);
  });

  it("keeps scoring for a holder whose ghost is dead: only a claim takes it", () => {
    // The ghost's life is no input: the holder keeps it until a claim.
    expect(hold({ holder: 1, heldSeconds: 0 }, 2 * POINT_TICK_SECONDS).scored).toEqual([1, 1]);
  });
});

describe("mayClaim (#1377)", () => {
  it("lets anyone claim an altar nobody holds", () => {
    expect(mayClaim(UNCLAIMED_ALTAR, 0, false)).toBe(true);
  });

  it("lets a foe claim only while the holder's ghost is dead, and never the holder", () => {
    const held = { holder: 0, heldSeconds: 5 };
    expect(mayClaim(held, 1, true)).toBe(false);
    expect(mayClaim(held, 1, false)).toBe(true);
    expect(mayClaim(held, 0, false)).toBe(false);
  });
});

describe("claimant (#1377)", () => {
  it("is the one team that finished a claim, and nobody for two at once", () => {
    expect(claimant([])).toBeNull();
    expect(claimant([1])).toBe(1);
    expect(claimant([0, 1])).toBeNull();
  });
});
