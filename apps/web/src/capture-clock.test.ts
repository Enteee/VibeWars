import { describe, expect, it } from "vitest";

import { createCaptureClock, steppedCapture } from "./capture-clock.js";

const noWait = { settle: () => Promise.resolve(), presented: () => Promise.resolve() };

describe("steppedCapture", () => {
  it("is only ?capture=step", () => {
    expect(steppedCapture("?capture=step")).toBe(true);
    expect(steppedCapture("?capture")).toBe(false);
    expect(steppedCapture("")).toBe(false);
  });
});

describe("createCaptureClock", () => {
  it("reads the real clock unless stepping", () => {
    let real = 100;
    const clock = createCaptureClock("?capture", () => real, noWait);
    real = 250;
    expect(clock.now()).toBe(250);
  });

  it("moves now() by exactly frames x 1000/20 and ignores the real clock", async () => {
    const clock = createCaptureClock("?capture=step", () => 1000, noWait);
    await clock.step(3);
    expect(clock.now()).toBeCloseTo(1150, 9);
  });

  it("ticks the host 1/20 s per frame, then draws the frame", async () => {
    const clock = createCaptureClock("?capture=step", () => 0, noWait);
    const seen: string[] = [];
    clock.onHostTick((seconds) => seen.push(`tick ${seconds.toFixed(5)}`));
    clock.onFrame((time, delta) => seen.push(`frame ${time.toFixed(2)} ${delta.toFixed(2)}`));
    await clock.step(2);
    expect(seen).toEqual([
      "tick 0.05000",
      "frame 50.00 50.00",
      "tick 0.05000",
      "frame 100.00 50.00",
    ]);
  });

  it("stops what was stopped", async () => {
    const clock = createCaptureClock("?capture=step", () => 0, noWait);
    let ticks = 0;
    const stop = clock.onHostTick(() => (ticks += 1));
    await clock.step(1);
    stop();
    await clock.step(1);
    expect(ticks).toBe(1);
  });
});
