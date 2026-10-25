import { describe, expect, it } from "vitest";

import { fadeGain, levelAt, nextBoundary, nextCycle, scheduleLevel } from "./transitions.js";

describe("nextBoundary", () => {
  it("is the next multiple of the phrase after what was queried, counted from the track's start", () => {
    expect(nextBoundary(0.2, 0, 8)).toBe(8);
    expect(nextBoundary(7.9, 0, 8)).toBe(8);
    expect(nextBoundary(9, 0, 4)).toBe(12);
    expect(nextBoundary(10.5, 6, 4)).toBe(14);
  });

  it("never lands on the position itself, which may already be queried", () => {
    expect(nextBoundary(8, 0, 8)).toBe(16);
  });

  it("lands on a planned track's own start when it has not begun yet", () => {
    expect(nextBoundary(10, 12, 4)).toBe(12);
  });
});

describe("nextCycle", () => {
  it("is the next whole cycle", () => {
    expect(nextCycle(3.2)).toBe(4);
    expect(nextCycle(4)).toBe(5);
  });
});

describe("fadeGain", () => {
  it("fades linearly across the crossfade, and holds outside it", () => {
    expect(fadeGain(7, 8, 2, "in")).toBe(0);
    expect(fadeGain(9, 8, 2, "in")).toBe(0.5);
    expect(fadeGain(11, 8, 2, "in")).toBe(1);
    expect(fadeGain(7, 8, 2, "out")).toBe(1);
    expect(fadeGain(9, 8, 2, "out")).toBe(0.5);
    expect(fadeGain(10, 8, 2, "out")).toBe(0);
  });

  it("switches at once with no fade", () => {
    expect(fadeGain(8, 8, 0, "in")).toBe(1);
    expect(fadeGain(8, 8, 0, "out")).toBe(0);
  });
});

describe("the intensity schedule", () => {
  it("is 0 until the first change, then each level from its cycle", () => {
    const changes = scheduleLevel(scheduleLevel([], 2, 4), 3, 6);
    expect([3, 4, 5, 6, 9].map((cycle) => levelAt(changes, cycle))).toEqual([0, 2, 2, 3, 3]);
  });

  it("lets a later call for the same cycle win", () => {
    const changes = scheduleLevel(scheduleLevel([], 3, 4), 1, 4);
    expect(levelAt(changes, 4)).toBe(1);
  });

  it("keeps only what can still apply", () => {
    let changes = scheduleLevel([], 1, 1);
    for (let cycle = 2; cycle < 50; cycle += 1) {
      changes = scheduleLevel(changes, cycle % 2 === 0 ? 2 : 1, cycle);
    }
    expect(changes).toHaveLength(2);
    expect(levelAt(changes, 48)).toBe(2);
    expect(levelAt(changes, 49)).toBe(1);
  });
});
