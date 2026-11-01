import { describe, expect, it } from "vitest";

import { dropLate } from "./late-notes.js";
import { createMeter, type AudioReadings } from "./stats.js";

const audio: AudioReadings = {
  baseLatencyMs: 0,
  outputLatencyMs: 0,
  glitches: null,
  glitchMs: null,
  underruns: null,
  underrunMs: null,
};

const MARGIN = 0.01;

/** `dropLate` over a recording output, at audio time `currentTime`. */
function setup(currentTime: number) {
  const played: number[] = [];
  const meter = createMeter();
  const output = dropLate(
    (_hap: string, _deadline, _duration, _cps, t) => {
      played.push(t);
      return "node";
    },
    () => currentTime,
    MARGIN,
    () => meter,
  );
  return { output, played, meter };
}

describe("dropLate (#1991)", () => {
  it("leaves out a note behind the audio clock and counts it dropped", () => {
    const { output, played, meter } = setup(10);
    expect(output("x", -0.1, 0.2, 1, 9.9)).toBeUndefined();
    expect(played).toEqual([]);
    expect(meter.take(audio)).toMatchObject({ events: 0, droppedEvents: 1 });
  });

  it("leaves out a note due inside the margin", () => {
    const { output, played } = setup(10);
    output("x", 0.005, 0.2, 1, 10.005);
    expect(played).toEqual([]);
  });

  it("plays a note ahead of the audio clock, counted as an event", () => {
    const { output, played, meter } = setup(10);
    expect(output("x", 0.5, 0.2, 1, 10.5)).toBe("node");
    expect(played).toEqual([10.5]);
    expect(meter.take(audio)).toMatchObject({ events: 1, droppedEvents: 0 });
  });

  it("counts nothing without a meter", () => {
    const played: number[] = [];
    const output = dropLate(
      (_hap: string, _deadline, _duration, _cps, t) => {
        played.push(t);
      },
      () => 10,
      MARGIN,
      () => undefined,
    );
    output("x", 0.5, 0.2, 1, 10.5);
    output("x", -1, 0.2, 1, 9);
    expect(played).toEqual([10.5]);
  });
});
