import { describe, expect, it } from "vitest";

import {
  beatGrid,
  captionBox,
  cutSeconds,
  fightCuts,
  musicOffset,
  musicSettled,
  wrap,
} from "./plan.mjs";

/**
 * @param {number} t
 * @param {string} kind
 */
const event = (t, kind) => ({ t, kind, skillId: "" });

describe("fightCuts (#3811)", () => {
  it("slows the interrupt and follows with the events after it", () => {
    const plan = fightCuts([event(9, "interrupted"), event(12, "resurrected")], 30);
    expect(plan?.cuts.map((cut) => cut.speed)).toEqual([1, 0.5, 1]);
    expect(plan?.cuts[plan.hit]?.from).toBeCloseTo(8.6);
  });

  it("fails without an interrupt, so the capture is retried", () => {
    expect(fightCuts([event(5, "resurrected")], 30)).toBeUndefined();
  });

  it("ignores an interrupt in the raise, before the fight", () => {
    expect(fightCuts([event(1, "interrupted")], 30)).toBeUndefined();
  });

  it("drops an event too close to the end of the video", () => {
    const plan = fightCuts([event(5, "interrupted"), event(29.5, "resurrected")], 30);
    expect(plan?.cuts).toHaveLength(2);
  });

  it("counts a slow cut at its slowed length", () => {
    expect(cutSeconds({ scene: "fight", from: 0, to: 1, speed: 0.5 })).toBe(2);
  });
});

describe("beats (#3811)", () => {
  const onsets = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7];

  it("finds a half-second beat", () => {
    expect(beatGrid(onsets)).toEqual({ period: 0.5, phase: 0.2 });
  });

  it("folds a half-time pulse into the beat", () => {
    expect(beatGrid([0, 1.2, 2.4, 3.6, 4.8])?.period).toBeCloseTo(0.6);
  });

  it("needs a few onsets", () => {
    expect(beatGrid([0, 1])).toBeUndefined();
  });

  it("puts a beat on the frame the music must hit", () => {
    const grid = { period: 0.5, phase: 0.2 };
    const offset = musicOffset(grid, 14.1, 0);
    expect(offset).toBeGreaterThanOrEqual(0);
    // The beat at music time `offset + 14.1` is on the grid.
    expect(((offset + 14.1 - grid.phase) / grid.period) % 1).toBeCloseTo(0, 5);
  });
});

describe("the music slice (#3983)", () => {
  it("contains no switch: it starts after the last one has faded in, still on the beat", () => {
    const takeStartedAt = 1_000_000;
    // The menu's track, then the match's, 20 s into the take at 72 BPM.
    const switches = [
      { heardAtEpochMs: takeStartedAt + 300, cps: 0.5 },
      { heardAtEpochMs: takeStartedAt + 20_000, cps: 0.3 },
    ];
    const settled = musicSettled(switches, takeStartedAt);
    const grid = { period: 0.8333, phase: 20.1 };
    const offset = musicOffset(grid, 14.1, settled);
    for (const { heardAtEpochMs, cps } of switches) {
      // A switch sounds from its fade-out, a cycle before it lands, to a cycle after.
      const heard = (heardAtEpochMs - takeStartedAt) / 1000;
      expect(heard + 1 / cps).toBeLessThanOrEqual(offset);
    }
    expect(offset - settled).toBeLessThan(grid.period);
    expect(((offset + 14.1 - grid.phase) / grid.period) % 1).toBeCloseTo(0, 5);
  });
});

describe("captions (#3811)", () => {
  it("sits lower and wider on 16:9 than on 9:16", () => {
    const wide = captionBox(1920, 1080);
    const tall = captionBox(1080, 1920);
    expect(wide.y / 1080).toBeGreaterThan(tall.y / 1920);
    expect(wide.maxChars).toBeGreaterThan(tall.maxChars);
  });

  it("wraps at the limit and never splits a word", () => {
    expect(wrap("Earn the look. Never the advantage.", 22)).toEqual([
      "Earn the look. Never",
      "the advantage.",
    ]);
  });
});
