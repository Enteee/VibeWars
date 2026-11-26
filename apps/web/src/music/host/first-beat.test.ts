import { describe, expect, it } from "vitest";

import { firstBeatDelay } from "./first-beat.js";

const timing = { nowEpochMs: 10_000, leadSeconds: 0.75, marginSeconds: 1.35 };

describe("firstBeatDelay (#2936)", () => {
  it("honours a start far enough ahead", () => {
    expect(firstBeatDelay({ ...timing, startAtEpochMs: 13_000 })).toBe(3);
  });

  it.each([12_000, 10_000, 5_000])("clamps a start at %i to lead + margin", (startAtEpochMs) => {
    expect(firstBeatDelay({ ...timing, startAtEpochMs })).toBeCloseTo(2.1);
  });
});
