import { pure } from "@strudel/core";
import { describe, expect, it } from "vitest";

import { makeLayer, placedAt, type TrackClock } from "./layer.js";
import type { LevelChange } from "./transitions.js";

describe("placedAt (#2936)", () => {
  it("is silent before a future origin, and plays its cycle 0 on it", () => {
    const placed = placedAt(pure("crash"), 2.5);
    expect(placed.queryArc(0, 2.5)).toHaveLength(0);
    const first = placed.queryArc(2.5, 3);
    expect(first).toHaveLength(1);
    expect(first[0]?.wholeOrPart().begin.valueOf()).toBe(2.5);
  });
});

describe("layer", () => {
  it("reads the intensity on the scheduler's clock for a track placed after cycle 0", () => {
    // The fight starts on cycle 20; the track came in on cycle 19.
    const levels: LevelChange[] = [{ from: 20, level: 3 }];
    const clock: TrackClock = { origin: 0 };
    const layer = makeLayer(
      () => levels,
      () => clock,
    );
    const track = layer(3, pure("drums"));
    clock.origin = 19;
    const placed = track.late(clock.origin);
    expect(placed.queryArc(19, 20)).toHaveLength(0);
    expect(placed.queryArc(20, 21)).toHaveLength(1);
  });

  it("keeps each track's own clock, so both sides of a crossfade hear the same level", () => {
    const levels: LevelChange[] = [{ from: 8, level: 2 }];
    let compiling: TrackClock = { origin: 0 };
    const layer = makeLayer(
      () => levels,
      () => compiling,
    );
    const old = layer(2, pure("old"));
    compiling = { origin: 8 };
    const next = layer(2, pure("new")).late(8);
    expect(old.queryArc(8, 9)).toHaveLength(1);
    expect(next.queryArc(8, 9)).toHaveLength(1);
    expect(old.queryArc(7, 8)).toHaveLength(0);
  });
});

describe("layer gain (#3983)", () => {
  /** The velocity of each note in `[from, until)`, in order. */
  const velocities = (
    levels: LevelChange[],
    from: number,
    until: number,
    perCycle = 2,
  ): number[] => {
    const layer = makeLayer(
      () => levels,
      () => ({ origin: 0 }),
    );
    return layer(1, pure({ s: "pad" }).fast(perCycle))
      .queryArc(from, until)
      .map((hap) => (hap.value as { velocity: number }).velocity);
  };

  it("fades a layer in over a cycle, equal power, from the change that reaches it", () => {
    const levels: LevelChange[] = [
      { from: 0, level: 0 },
      { from: 20, level: 1 },
    ];
    // Each note at its midpoint: a quarter and three quarters into the fade.
    const [first, second, full] = velocities(levels, 20, 21.5);
    expect(first).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(second).toBeCloseTo(Math.sin((3 * Math.PI) / 8));
    expect(full).toBe(1);
    expect(velocities(levels, 19, 20)).toEqual([]);
  });

  it("keeps the downbeat a layer enters on, and fades a cycle-long pad in from it", () => {
    const levels: LevelChange[] = [
      { from: 0, level: 0 },
      { from: 20, level: 1 },
    ];
    const [pad, next] = velocities(levels, 20, 22, 1);
    expect(pad).toBeCloseTo(Math.SQRT1_2);
    expect(next).toBe(1);
    const [eighth] = velocities(levels, 20, 20.125, 8);
    expect(eighth).toBeGreaterThan(0);
  });

  it("leaves out a note that starts before its layer comes in", () => {
    const levels: LevelChange[] = [
      { from: 0, level: 0 },
      { from: 20.5, level: 1 },
    ];
    expect(velocities(levels, 20, 20.5, 1)).toEqual([]);
  });

  it("fades a layer out over a cycle the other way", () => {
    const levels: LevelChange[] = [
      { from: 0, level: 1 },
      { from: 30, level: 0 },
    ];
    const [start, half, ...after] = velocities(levels, 30, 32);
    expect(start).toBe(1);
    expect(half).toBeCloseTo(Math.SQRT1_2);
    expect(after).toEqual([]);
  });
});
