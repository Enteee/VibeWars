import { describe, expect, it } from "vitest";

import type { GainParam } from "./bus-gate.js";
import { DUCK_ATTACK_SECONDS, DUCK_GAIN, duck, duckGain } from "./duck.js";

/** An `AudioParam`'s timeline, enough of it to read the level at a time. */
function timeline(): GainParam & { at(time: number): number } {
  let events: { kind: "set" | "ramp"; value: number; time: number }[] = [];
  return {
    value: 1,
    cancelScheduledValues(time) {
      events = events.filter((event) => event.time < time);
    },
    setValueAtTime(value, time) {
      events.push({ kind: "set", value, time });
    },
    linearRampToValueAtTime(value, time) {
      events.push({ kind: "ramp", value, time });
    },
    at(time) {
      let level = 1;
      let since = -Infinity;
      for (const event of events) {
        if (event.time <= time) {
          level = event.value;
          since = event.time;
          continue;
        }
        if (event.kind === "ramp" && since !== -Infinity) {
          return level + ((event.value - level) * (time - since)) / (event.time - since);
        }
        break;
      }
      return level;
    },
  };
}

const dB = (gain: number): number => 20 * Math.log10(gain);

describe("sting duck (#3983)", () => {
  it("holds the track 6 dB down while the sting sounds and back to 0 dB a beat after", () => {
    const param = timeline();
    const ducking = duck(() => [param]);
    const beat = 0.5;
    ducking.note(10, 1, beat);
    ducking.note(11, 1, beat);
    expect(param.at(9.99)).toBe(1);
    expect(dB(param.at(10 + DUCK_ATTACK_SECONDS))).toBeCloseTo(-6, 1);
    expect(dB(param.at(11.5))).toBeCloseTo(-6, 1);
    expect(dB(param.at(12))).toBeCloseTo(-6, 1);
    expect(param.at(12 + beat / 2)).toBeGreaterThan(DUCK_GAIN);
    expect(param.at(12 + beat)).toBe(1);
  });

  it("never ducks deeper for overlapping notes", () => {
    const param = timeline();
    const ducking = duck(() => [param]);
    for (const time of [5, 5.01, 5.02, 5.2]) {
      ducking.note(time, 0.5, 0.25);
    }
    for (let time = 5; time < 6.2; time += 0.005) {
      expect(param.at(time)).toBeGreaterThanOrEqual(DUCK_GAIN - 1e-9);
    }
  });

  it("starts a duck during a release from where the release got to", () => {
    const param = timeline();
    const ducking = duck(() => [param]);
    ducking.note(1, 0.1, 1);
    const mid = 1.1 + 0.5;
    const level = param.at(mid);
    ducking.note(mid, 0.1, 1);
    expect(param.at(mid)).toBeCloseTo(level);
    expect(duckGain(undefined, 3)).toBe(1);
  });

  it("moves without a step: never more than 0.01 between samples", () => {
    const param = timeline();
    const ducking = duck(() => [param]);
    ducking.note(1, 0.3, 0.25);
    ducking.note(1.2, 0.3, 0.25);
    ducking.note(1.85, 0.1, 0.25);
    const step = 1 / 48_000;
    let previous = param.at(0.9);
    let largest = 0;
    for (let time = 0.9; time < 3; time += step) {
      const level = param.at(time);
      largest = Math.max(largest, Math.abs(level - previous));
      previous = level;
    }
    expect(largest).toBeLessThan(0.01);
  });

  it("does not step up when a note lands in the middle of a release", () => {
    const param = timeline();
    const ducking = duck(() => [param]);
    ducking.note(1, 0.1, 1);
    ducking.note(1.6, 0.1, 1);
    const step = 1 / 48_000;
    let previous = param.at(0.9);
    let largest = 0;
    for (let time = 0.9; time < 3; time += step) {
      const level = param.at(time);
      largest = Math.max(largest, Math.abs(level - previous));
      previous = level;
    }
    expect(largest).toBeLessThan(0.01);
  });
});
