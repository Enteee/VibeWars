import { describe, expect, it } from "vitest";

import { StuckMeter, topStuckCells, type StuckSample } from "./stuck-meter.js";

const HZ = 20;

const sample = (over: Partial<StuckSample> = {}): StuckSample => ({
  id: "a",
  x: 100,
  y: 100,
  layer: 0,
  counts: true,
  active: false,
  nearestFoeLayer: 0,
  ...over,
});

/** Feeds `seconds` of ticks, `at(second)` giving the sample. */
const run = (meter: StuckMeter, seconds: number, at: (t: number) => StuckSample): void => {
  for (let tick = 0; tick < seconds * HZ; tick += 1) meter.feed([at(tick / HZ)]);
};

describe("the stuck meter (#3354)", () => {
  it("counts about 1 s for a bot still for 6 s with a foe alive", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 6, () => sample());
    const { stuckSeconds, livingSeconds } = meter.totals();
    expect(stuckSeconds).toBeCloseTo(1, 0);
    expect(livingSeconds).toBeCloseTo(6, 5);
  });

  it("counts a bot whose nearest foe is on another layer as apart", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 6, () => sample({ nearestFoeLayer: 1 }));
    const { stuckSeconds, apartSeconds } = meter.totals();
    expect(apartSeconds).toBeCloseTo(stuckSeconds, 5);
    expect(apartSeconds).toBeGreaterThan(0);
  });

  it("is cleared by a damage or heal in the window", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 6, (t) => sample({ active: t === 3 }));
    // The activity at 3 s keeps the window busy until 8 s: nothing in 6 s.
    expect(meter.totals().stuckSeconds).toBe(0);
  });

  it("counts nothing for a dead bot, or one with no foe alive", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 8, () => sample({ counts: false }));
    expect(meter.totals()).toMatchObject({ livingSeconds: 0, stuckSeconds: 0 });
  });

  it("counts nothing for a bot that moves 100 units in 5 s", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 10, (t) => sample({ x: 100 + 20 * t }));
    expect(meter.totals().stuckSeconds).toBe(0);
  });

  it("starts a fresh window at respawn", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 4, () => sample());
    run(meter, 1, () => sample({ counts: false }));
    run(meter, 4, () => sample());
    expect(meter.totals().stuckSeconds).toBe(0);
  });

  it("lists the cells with the most stuck seconds first", () => {
    const meter = new StuckMeter(HZ);
    run(meter, 8, () => sample({ x: 130, y: 70, layer: 2 }));
    expect(topStuckCells([meter.totals().cells], 5)).toEqual([
      { x: 128, y: 64, layer: 2, seconds: expect.closeTo(3, 0) },
    ]);
    expect(topStuckCells([], 5)).toEqual([]);
  });
});
