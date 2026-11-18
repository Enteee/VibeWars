import { describe, expect, it } from "vitest";

import {
  fadeGain,
  levelAt,
  nextBoundary,
  nextCycle,
  planSwitch,
  scheduleLevel,
  switchLanding,
} from "./transitions.js";

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

describe("switchLanding (#2530)", () => {
  it("lands a match start on the next cycle, not the phrase", () => {
    expect(switchLanding("cycle", 3.2, 0, 8)).toBe(4);
    expect(switchLanding("phrase", 3.2, 0, 8)).toBe(8);
  });

  it("lands on the phrase boundary from the phrase's last cycle either way", () => {
    expect(switchLanding("cycle", 7.5, 0, 8)).toBe(8);
    expect(switchLanding("phrase", 7.5, 0, 8)).toBe(8);
  });

  it("lands a match start on the next cycle when a planned switch has not begun", () => {
    expect(switchLanding("cycle", 10, 12, 4)).toBe(11);
  });
});

describe("fadeGain", () => {
  it("fades across the crossfade, and holds outside it", () => {
    expect(fadeGain(7, 8, 2, "in")).toBe(0);
    expect(fadeGain(9, 8, 2, "in")).toBeCloseTo(Math.SQRT1_2);
    expect(fadeGain(11, 8, 2, "in")).toBe(1);
    expect(fadeGain(7, 8, 2, "out")).toBe(1);
    expect(fadeGain(9, 8, 2, "out")).toBeCloseTo(Math.SQRT1_2);
    expect(fadeGain(10, 8, 2, "out")).toBeCloseTo(0);
  });

  it("is equal power: no dip in the middle (#3530)", () => {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const cycle = 8 + progress * 2;
      const power = fadeGain(cycle, 8, 2, "in") ** 2 + fadeGain(cycle, 8, 2, "out") ** 2;
      expect(power).toBeCloseTo(1);
    }
  });

  it("switches at once with no fade", () => {
    expect(fadeGain(8, 8, 0, "in")).toBe(1);
    expect(fadeGain(8, 8, 0, "out")).toBeCloseTo(0);
  });
});

describe("planSwitch", () => {
  const planned = { playing: "a", switching: { next: "b", from: 8 } };

  it("starts a crossfade when nothing is planned, and keeps the track already playing", () => {
    expect(planSwitch({ playing: "a" }, "b", 3)).toBe("start");
    expect(planSwitch({ playing: "a" }, "a", 3)).toBe("keep");
  });

  it("replaces a switch that has not started, so the replaced track never sounds", () => {
    expect(planSwitch(planned, "c", 7.5)).toBe("replace");
    expect(planSwitch(planned, "b", 7.5)).toBe("replace");
  });

  it("cancels a switch that has not started when the playing track is asked for again", () => {
    expect(planSwitch(planned, "a", 7.5)).toBe("cancel");
  });

  it("holds a change during the fade, the latest winning, until the switch lands", () => {
    expect(planSwitch(planned, "c", 8)).toBe("hold");
    expect(planSwitch(planned, "d", 9.5)).toBe("hold");
    expect(planSwitch(planned, "a", 9.5)).toBe("hold");
    // Back to the fading switch's target: nothing held any more.
    expect(planSwitch(planned, "b", 9.5)).toBe("keep");
  });

  it("starts the held change from the landed track", () => {
    expect(planSwitch({ playing: "b" }, "e", 10)).toBe("start");
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
