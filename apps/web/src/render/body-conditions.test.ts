import { describe, expect, it } from "vitest";

import {
  BUBBLE_PERIOD,
  DROP_PERIOD,
  FLAME_PERIOD,
  conditionCues,
  conditionMarks,
  cuePhase,
  type ConditionCue,
  type CueMark,
} from "./body-conditions.js";

const CUES: readonly ConditionCue[] = ["burning", "bleeding", "poisoned"];

function flameTips(marks: readonly CueMark[]): number[] {
  return marks.map((mark) => (mark.kind === "flame" ? mark.points[2].y : Number.NaN));
}

function circle(mark: CueMark | undefined): Extract<CueMark, { kind: "drop" | "bubble" }> {
  if (mark === undefined || mark.kind === "flame") {
    throw new Error("not a drop or bubble");
  }
  return mark;
}

describe("conditionCues (#1138)", () => {
  it("maps burning, bleeding, poison and disease, by priority, two at most", () => {
    expect(conditionCues([])).toEqual([]);
    expect(conditionCues(["burning"])).toEqual(["burning"]);
    expect(conditionCues(["bleeding"])).toEqual(["bleeding"]);
    expect(conditionCues(["poison"])).toEqual(["poisoned"]);
    expect(conditionCues(["disease"])).toEqual(["poisoned"]);
    expect(conditionCues(["poison", "disease"])).toEqual(["poisoned"]);
    expect(conditionCues(["poison", "bleeding", "burning"])).toEqual(["burning", "bleeding"]);
    expect(conditionCues(["poison", "bleeding"])).toEqual(["bleeding", "poisoned"]);
  });

  it("ignores conditions with no cue, hexes and unknown ids", () => {
    expect(conditionCues(["crippled"])).toEqual([]);
    expect(conditionCues(["empathy"])).toEqual([]);
    expect(conditionCues(["no-such-status"])).toEqual([]);
  });
});

describe("cuePhase", () => {
  it("is stable per id, in [0, 1), and differs between ids", () => {
    expect(cuePhase("alice")).toBe(cuePhase("alice"));
    expect(cuePhase("alice")).not.toBe(cuePhase("bob"));
    for (const id of ["", "a", "alice", "dummy-3", "x".repeat(64)]) {
      expect(cuePhase(id)).toBeGreaterThanOrEqual(0);
      expect(cuePhase(id)).toBeLessThan(1);
    }
  });
});

describe("conditionMarks", () => {
  it("flickers three flames, and freezes them under reduced motion", () => {
    const now = flameTips(conditionMarks("burning", 14, 0, 0, false));
    const later = flameTips(conditionMarks("burning", 14, FLAME_PERIOD / 2, 0, false));
    expect(now).toHaveLength(3);
    expect(later).not.toEqual(now);
    const frozen = conditionMarks("burning", 14, 0, 0, true);
    expect(conditionMarks("burning", 14, 7.3, 0.6, true)).toEqual(frozen);
    // Tips at 4.5, 6 and 4.5 past the edge, the middle straight up.
    expect(flameTips(frozen)[1]).toBeCloseTo(-20);
  });

  it("drops one at a time, falling, then the next on the other side", () => {
    const [start] = conditionMarks("bleeding", 14, 0, 0, false);
    const [falling] = conditionMarks("bleeding", 14, DROP_PERIOD / 2, 0, false);
    const [next] = conditionMarks("bleeding", 14, DROP_PERIOD * 1.01, 0, false);
    expect(circle(falling).y).toBeGreaterThan(circle(start).y);
    expect(circle(falling).alpha).toBeLessThan(circle(start).alpha);
    expect(circle(next).y).toBeLessThan(circle(falling).y);
    expect(circle(next).x).toBe(-circle(start).x);
    expect(conditionMarks("bleeding", 14, 3.1, 0.2, true)).toEqual(
      conditionMarks("bleeding", 14, 0, 0, true),
    );
  });

  it("raises two bubbles, growing as they rise", () => {
    const now = conditionMarks("poisoned", 14, 0, 0, false);
    const later = conditionMarks("poisoned", 14, BUBBLE_PERIOD / 4, 0, false);
    expect(now).toHaveLength(2);
    expect(circle(later[0]).y).toBeLessThan(circle(now[0]).y);
    expect(circle(later[0]).radius).toBeGreaterThan(circle(now[0]).radius);
    expect(conditionMarks("poisoned", 14, 5, 0.9, true)).toEqual(
      conditionMarks("poisoned", 14, 0, 0, true),
    );
  });

  it("stays inside r + 6, moving or frozen", () => {
    for (const radius of [14, 10]) {
      const cap = radius + 6 + 1e-9;
      for (const cue of CUES) {
        for (const reducedMotion of [false, true]) {
          for (let t = 0; t < 2.4; t += 0.01) {
            for (const mark of conditionMarks(cue, radius, t, 0.37, reducedMotion)) {
              if (mark.kind === "flame") {
                for (const point of mark.points) {
                  expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(cap);
                }
              } else if (mark.kind === "bubble") {
                expect(Math.hypot(mark.x, mark.y) + mark.radius).toBeLessThanOrEqual(cap);
              } else {
                // A drop stops at the status row's top edge, r + 6 below the centre.
                expect(mark.y + mark.radius).toBeLessThanOrEqual(cap);
              }
            }
          }
        }
      }
    }
  });
});
