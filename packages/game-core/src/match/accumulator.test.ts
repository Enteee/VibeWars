import { describe, expect, it } from "vitest";

import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { MAX_CATCHUP_SECONDS, drainAccumulator } from "./accumulator.js";

const TICK_SECONDS = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;

describe("drainAccumulator", () => {
  it("runs whole ticks and carries the rest", () => {
    expect(drainAccumulator(0, TICK_SECONDS * 2.5, TICK_SECONDS).ticks).toBe(2);
    const { remainder } = drainAccumulator(0, TICK_SECONDS * 2.5, TICK_SECONDS);
    expect(remainder).toBeCloseTo(TICK_SECONDS * 0.5);
    expect(drainAccumulator(remainder, TICK_SECONDS * 0.5, TICK_SECONDS).ticks).toBe(1);
  });

  it("a frame shorter than a tick runs none, and keeps it", () => {
    const { ticks, remainder } = drainAccumulator(0, TICK_SECONDS / 3, TICK_SECONDS);
    expect(ticks).toBe(0);
    expect(remainder).toBeCloseTo(TICK_SECONDS / 3);
  });

  it("clamps a 10 s delta, as a backgrounded tab sends, to at most 6 ticks", () => {
    const { ticks, remainder } = drainAccumulator(0, 10, TICK_SECONDS);
    expect(ticks).toBeLessThanOrEqual(6);
    expect(ticks).toBeGreaterThan(0);
    expect(remainder).toBeLessThan(TICK_SECONDS);
    expect(MAX_CATCHUP_SECONDS).toBe(0.25);
  });

  it("ignores a negative delta", () => {
    expect(drainAccumulator(0, -1, TICK_SECONDS)).toEqual({ ticks: 0, remainder: 0 });
  });
});
