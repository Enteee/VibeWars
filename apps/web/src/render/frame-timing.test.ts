import { describe, expect, it } from "vitest";

import { measuringFrames, snapshotCadence, type FrameTiming } from "./frame-timing.js";

describe("measuringFrames (#3240)", () => {
  it("measures only when the page asks", () => {
    expect(measuringFrames("?frametiming")).toBe(true);
    expect(measuringFrames("?splash&frametiming=1")).toBe(true);
    expect(measuringFrames("")).toBe(false);
    expect(measuringFrames("?musicstats")).toBe(false);
  });
});

describe("snapshotCadence (#3240)", () => {
  it("records the time between frames that drew a new snapshot, not between frames", () => {
    const stats: FrameTiming = { update: [], render: [], snapshots: [] };
    let now = 0;
    const drawn = snapshotCadence(stats, () => now);
    // Frames every 16 ms; the clock moves at 0, 48 and 112 ms.
    for (const [at, clock] of [
      [0, 1],
      [16, 1],
      [32, 1],
      [48, 1.05],
      [64, 1.05],
      [80, 1.05],
      [96, 1.05],
      [112, 1.1],
    ] as const) {
      now = at;
      drawn(clock);
    }
    expect(stats.snapshots).toEqual([48, 64]);
  });
});
