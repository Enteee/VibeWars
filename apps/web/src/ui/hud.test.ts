import { describe, expect, it } from "vitest";

import { describeOutcome, formatClock } from "./hud.js";

describe("formatClock", () => {
  it("formats seconds as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("floors fractional seconds rather than showing a jittery decimal", () => {
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("describeOutcome", () => {
  it("reads as victory for the winning team's own players", () => {
    expect(describeOutcome(0, "score", 0)).toBe("Victory");
  });

  it("reads as defeat for the losing team's players", () => {
    expect(describeOutcome(0, "score", 1)).toBe("Defeat");
  });

  it("calls out a draw", () => {
    expect(describeOutcome(undefined, "time", 0)).toBe("Draw (time)");
  });

  it("notes when a match ended on the clock rather than on score", () => {
    expect(describeOutcome(1, "time", 1)).toBe("Victory (time)");
    expect(describeOutcome(1, "score", 1)).toBe("Victory");
  });

  it("falls back to naming the team for a spectator with no team of their own", () => {
    expect(describeOutcome(1, "score", undefined)).toBe("Team 2 wins");
  });
});
