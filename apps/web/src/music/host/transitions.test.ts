import { describe, expect, it } from "vitest";

import {
  fadeGain,
  fadingIn,
  fadingOut,
  FULL,
  layerGain,
  levelAt,
  nextCycle,
  planSwitch,
  scheduleLevel,
  switchLanding,
  type LevelChange,
} from "./transitions.js";

describe("nextCycle", () => {
  it("is the next whole cycle", () => {
    expect(nextCycle(3.2)).toBe(4);
    expect(nextCycle(4)).toBe(5);
  });
});

describe("switchLanding (#3983)", () => {
  it("lands on the first bar with room for the whole fade-out after the position", () => {
    expect(switchLanding("cycle", 3.2, 0, 8, 1)).toBe(5);
    expect(switchLanding("cycle", 3, 0, 8, 1)).toBe(4);
    // Bars count from the track's origin.
    expect(switchLanding("cycle", 10.5, 6.25, 4, 1)).toBe(12.25);
  });

  it("waits for a phrase boundary at most two cycles past that bar", () => {
    expect(switchLanding("phrase", 5.5, 0, 8, 1)).toBe(8);
    expect(switchLanding("phrase", 4.5, 0, 8, 1)).toBe(8);
    expect(switchLanding("phrase", 3.5, 0, 8, 1)).toBe(5);
  });

  it("never waits for the phrase when a match starts (#2530)", () => {
    expect(switchLanding("cycle", 5.5, 0, 8, 1)).toBe(7);
  });
});

describe("fadeGain", () => {
  it("fades across the fade, and holds outside it", () => {
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

describe("envelopes (#3983)", () => {
  it("fades a track out from full, and the next one in after it", () => {
    const out = fadingOut(FULL, 7, 1);
    const incoming = fadingIn(8, 1);
    expect([6, 7, 7.5, 8].map(out)).toEqual([
      1,
      1,
      expect.closeTo(Math.SQRT1_2),
      expect.closeTo(0),
    ]);
    expect([7.5, 8, 8.5, 9].map(incoming)).toEqual([0, 0, expect.closeTo(Math.SQRT1_2), 1]);
  });

  it("fades a track still fading in back out from where it got to, never up first", () => {
    const fadingBack = fadingOut(fadingIn(8, 1), 8.5, 1);
    const reached = fadingIn(8, 1)(8.5);
    let previous = fadingBack(8.5);
    expect(previous).toBeCloseTo(reached);
    for (let cycle = 8.5; cycle <= 9.5; cycle += 0.01) {
      const level = fadingBack(cycle);
      expect(level).toBeLessThanOrEqual(previous + 1e-12);
      previous = level;
    }
    expect(fadingBack(9.5)).toBeCloseTo(0);
  });

  it("switches from 66 to 150 BPM without a click: no step above 0.01 a sample", () => {
    // At 66 BPM a cycle of four beats is 3.64 s; at 150 BPM, 1.6 s.
    const before = 66 / 60 / 4;
    const after = 150 / 60 / 4;
    const lands = 8;
    const out = fadingOut(FULL, lands - 1, 1);
    const incoming = fadingIn(lands, 1);
    const sampleRate = 48_000;
    let largest = 0;
    for (const [envelope, from, until, cps] of [
      [out, lands - 1, lands, before],
      [incoming, lands, lands + 1, after],
    ] as const) {
      let previous = envelope(from);
      for (let cycle = from; cycle <= until; cycle += cps / sampleRate) {
        const level = envelope(cycle);
        largest = Math.max(largest, Math.abs(level - previous));
        previous = level;
      }
    }
    expect(largest).toBeLessThan(0.01);
    // Silent at the landing, where the tempo changes; nothing new before it.
    expect(out(lands)).toBeCloseTo(0);
    expect(incoming(lands)).toBe(0);
  });
});

describe("planSwitch (#3983)", () => {
  const planned = { playing: "a", switching: { next: "b", fadesFrom: 7, lands: 8 } };

  it("starts a switch when nothing is planned, and keeps the track already playing", () => {
    expect(planSwitch({ playing: "a" }, "b", 3)).toBe("start");
    expect(planSwitch({ playing: "a" }, "a", 3)).toBe("keep");
  });

  it("replaces a switch whose fade has not started, so the replaced track never sounds", () => {
    expect(planSwitch(planned, "c", 6.5)).toBe("replace");
  });

  it("cancels a switch whose fade has not started when the playing track is asked for again", () => {
    expect(planSwitch(planned, "a", 6.5)).toBe("cancel");
  });

  it("retargets a switch while the playing track fades out, the playing track included", () => {
    expect(planSwitch(planned, "c", 7)).toBe("retarget");
    expect(planSwitch(planned, "a", 7.5)).toBe("retarget");
  });

  it("restarts from the track fading in once it has landed", () => {
    expect(planSwitch(planned, "c", 8)).toBe("restart");
    expect(planSwitch(planned, "a", 8.5)).toBe("restart");
  });

  it("keeps the switch's own target whenever it is asked for again", () => {
    for (const position of [6.5, 7.5, 8.5]) {
      expect(planSwitch(planned, "b", position)).toBe("keep");
    }
  });
});

describe("the intensity schedule (#3983)", () => {
  const start: LevelChange[] = [{ from: 0, level: 0 }];

  it("rises one level a cycle: a level-3 trigger from 0 is 1, 2, 3 on three cycles", () => {
    const changes = scheduleLevel(start, 3, 4);
    expect([3, 4, 5, 6, 9].map((cycle) => levelAt(changes, cycle))).toEqual([0, 1, 2, 3, 3]);
  });

  it("falls at once", () => {
    const changes = scheduleLevel(scheduleLevel(start, 3, 4), 0, 10);
    expect(levelAt(changes, 9)).toBe(3);
    expect(levelAt(changes, 10)).toBe(0);
  });

  it("lets a later call for the same cycle win, and drops the rest of a climb", () => {
    const changes = scheduleLevel(scheduleLevel(start, 3, 4), 1, 5);
    expect([4, 5, 6, 7].map((cycle) => levelAt(changes, cycle))).toEqual([1, 1, 1, 1]);
  });

  it("keeps only what can still apply", () => {
    let changes = scheduleLevel(start, 1, 1);
    for (let cycle = 2; cycle < 50; cycle += 1) {
      changes = scheduleLevel(changes, cycle % 2 === 0 ? 2 : 1, cycle);
    }
    expect(changes.length).toBeLessThanOrEqual(4);
    expect(levelAt(changes, 48)).toBe(2);
    expect(levelAt(changes, 49)).toBe(1);
    // What was dropped had settled: the layer still fades from where it was.
    expect(layerGain(changes, 2, 48.5)).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("layerGain (#3983)", () => {
  it("is 0, ~0.7 and 1 at 0, ½ and 1 cycle after a layer enters, and back the other way", () => {
    const changes: LevelChange[] = [
      { from: 0, level: 0 },
      { from: 4, level: 2 },
      { from: 10, level: 1 },
    ];
    expect([4, 4.5, 5].map((cycle) => layerGain(changes, 2, cycle))).toEqual([
      0,
      expect.closeTo(Math.SQRT1_2),
      1,
    ]);
    expect([10, 10.5, 11].map((cycle) => layerGain(changes, 2, cycle))).toEqual([
      1,
      expect.closeTo(Math.SQRT1_2),
      0,
    ]);
    // Layer 1 stays in throughout its fall from 2 to 1.
    expect(layerGain(changes, 1, 10.5)).toBe(1);
  });

  it("starts settled: the first change is no fade", () => {
    expect(layerGain([{ from: 0, level: 3 }], 3, 0)).toBe(1);
    expect(layerGain([{ from: 0, level: 0 }], 0, 0)).toBe(1);
  });

  it("fades back from where it got to when the level turns mid-fade", () => {
    const changes: LevelChange[] = [
      { from: 0, level: 0 },
      { from: 4, level: 1 },
      { from: 4.5, level: 0 },
    ];
    expect(layerGain(changes, 1, 4.5)).toBeCloseTo(Math.SQRT1_2);
    expect(layerGain(changes, 1, 5)).toBeCloseTo(Math.SQRT1_2 * Math.SQRT1_2);
  });
});
