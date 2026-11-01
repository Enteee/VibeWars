import { describe, expect, it } from "vitest";

import { STATS_INTERVAL_MS, createMeasurement, createMeter, type AudioReadings } from "./stats.js";

const audio: AudioReadings = {
  baseLatencyMs: 10,
  outputLatencyMs: 32,
  glitches: null,
  glitchMs: null,
  underruns: null,
  underrunMs: null,
};

describe("createMeter", () => {
  it("counts a second's ticks, late ticks, skipped music, events and dropped ones", () => {
    const meter = createMeter();
    for (const at of [0, 100, 200, 390, 490]) {
      meter.tick(at, 100);
    }
    meter.worked(4);
    meter.worked(12);
    meter.skipped(50);
    meter.skipped(100);
    meter.event();
    meter.dropped();
    meter.event();
    expect(meter.take(audio)).toEqual({
      ticks: 5,
      lateTicks: 1,
      maxTickGapMs: 190,
      maxTickWorkMs: 12,
      skippedMs: 150,
      events: 2,
      droppedEvents: 1,
      maxReductionDb: 0,
      ...audio,
    });
  });

  it("keeps the deepest limiter reduction of the second, and starts the next from 0", () => {
    const meter = createMeter();
    meter.reduced(-0.5);
    meter.reduced(-6.25);
    meter.reduced(-2);
    expect(meter.take(audio).maxReductionDb).toBe(-6.25);
    expect(meter.take(audio).maxReductionDb).toBe(0);
  });

  it("starts each second from nothing, but times the first tick from the last", () => {
    const meter = createMeter();
    meter.tick(0, 100);
    meter.dropped();
    meter.take(audio);
    meter.tick(400, 100);
    expect(meter.take(audio)).toMatchObject({
      ticks: 1,
      lateTicks: 1,
      maxTickGapMs: 400,
      events: 0,
      droppedEvents: 0,
    });
  });
});

describe("createMeasurement", () => {
  /** A measurement whose timer the test fires by hand. */
  function setup() {
    const reports: unknown[] = [];
    const timers: { callback: () => void; ms: number }[] = [];
    const measurement = createMeasurement(
      (stats) => reports.push(stats),
      () => audio,
      (callback, ms) => {
        timers.push({ callback, ms });
      },
    );
    return { measurement, reports, timers };
  }

  it("counts nothing and sends nothing until it is started", () => {
    const { measurement, reports, timers } = setup();
    expect(measurement.meter).toBeUndefined();
    expect(timers).toEqual([]);
    expect(reports).toEqual([]);
  });

  it("once started, reports every second, from one timer however often it is started", () => {
    const { measurement, reports, timers } = setup();
    measurement.start();
    measurement.start();
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(STATS_INTERVAL_MS);

    measurement.meter?.event();
    measurement.meter?.dropped();
    timers[0]?.callback();
    timers[0]?.callback();
    expect(reports).toEqual([
      expect.objectContaining({ events: 1, droppedEvents: 1 }),
      expect.objectContaining({ events: 0, droppedEvents: 0 }),
    ]);
  });
});
