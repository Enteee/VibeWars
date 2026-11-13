import { describe, expect, it } from "vitest";

import {
  GOAL_MARK_FADE_SECONDS,
  GOAL_MARK_PULSE_SECONDS,
  goalMarkCommands,
  goalMarkFade,
  goalMarkPulse,
} from "./goal-mark.js";

const AT = { x: 400, y: 300 };

describe("goal mark (#3221)", () => {
  it("pulses over time", () => {
    const quarter = GOAL_MARK_PULSE_SECONDS / 4;
    const pulses = [0, quarter, 2 * quarter, 3 * quarter].map((s) => goalMarkPulse(s, false));
    expect(new Set(pulses).size).toBeGreaterThan(2);
    expect(Math.min(...pulses)).toBeCloseTo(0);
    expect(Math.max(...pulses)).toBeCloseTo(1);
    expect(goalMarkCommands(AT, 0, false, 1)).not.toEqual(
      goalMarkCommands(AT, 2 * quarter, false, 1),
    );
  });

  it("holds still under reduced motion", () => {
    const at = (s: number): unknown => goalMarkCommands(AT, s, true, 1);
    expect(at(0)).toEqual(at(0.4));
    expect(at(0)).toEqual(at(GOAL_MARK_PULSE_SECONDS / 2));
  });

  it("fades to nothing over 0.3 s once reached", () => {
    expect(GOAL_MARK_FADE_SECONDS).toBe(0.3);
    expect(goalMarkFade(undefined)).toBe(1);
    expect(goalMarkFade(0)).toBe(1);
    expect(goalMarkFade(0.15)).toBeCloseTo(0.5);
    expect(goalMarkFade(0.3)).toBe(0);
    expect(goalMarkFade(1)).toBe(0);
    expect(goalMarkCommands(AT, 0, false, goalMarkFade(0.3))).toEqual([]);
  });

  it("draws a ring around the spot and a column rising from it", () => {
    const commands = goalMarkCommands(AT, 0, false, 1);
    const ring = commands.find((command) => command.kind === "ring");
    expect(ring?.at).toEqual(AT);
    const bands = commands.filter((command) => command.kind === "band");
    expect(bands.length).toBeGreaterThan(1);
    expect(Math.min(...bands.map((band) => band.at.y))).toBeLessThan(AT.y);
  });
});
