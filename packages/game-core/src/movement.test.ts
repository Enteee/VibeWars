import { describe, expect, it } from "vitest";

import { clampInputDirection, integrateMovement } from "./movement.js";
import { ZERO, length, vec2 } from "./vec2.js";

describe("integrateMovement", () => {
  it("moves along a cardinal direction by speed * dt", () => {
    const next = integrateMovement(ZERO, vec2(1, 0), 100, 0.5);
    expect(next.x).toBeCloseTo(50, 10);
    expect(next.y).toBeCloseTo(0, 10);
  });

  it("does not move for a zero input direction", () => {
    const start = vec2(10, 10);
    expect(integrateMovement(start, ZERO, 100, 1)).toBe(start);
  });

  it("does not move for a near-zero input direction", () => {
    const start = vec2(10, 10);
    expect(integrateMovement(start, vec2(1e-12, 1e-12), 100, 1)).toBe(start);
  });

  it("normalizes a diagonal input so it is not faster than a cardinal one", () => {
    const cardinal = integrateMovement(ZERO, vec2(1, 0), 100, 1);
    const diagonal = integrateMovement(ZERO, vec2(1, 1), 100, 1);
    expect(length(cardinal)).toBeCloseTo(100, 10);
    expect(length(diagonal)).toBeCloseTo(100, 10);
  });

  it("ignores the magnitude of a non-unit input direction and uses only its heading", () => {
    const small = integrateMovement(ZERO, vec2(0.01, 0), 100, 1);
    const large = integrateMovement(ZERO, vec2(1000, 0), 100, 1);
    expect(small).toEqual(large);
    expect(length(small)).toBeCloseTo(100, 10);
  });

  it("accumulates additively across successive ticks", () => {
    let position = ZERO;
    for (let i = 0; i < 10; i += 1) {
      position = integrateMovement(position, vec2(1, 0), 100, 0.1);
    }
    expect(position.x).toBeCloseTo(100, 8);
  });
});

describe("clampInputDirection", () => {
  it("leaves a unit-length-or-shorter direction untouched", () => {
    expect(clampInputDirection(vec2(0.5, 0))).toEqual(vec2(0.5, 0));
  });

  it("clamps an oversized direction to the unit disc, preserving heading", () => {
    const clamped = clampInputDirection(vec2(1e9, 0));
    expect(clamped.x).toBeCloseTo(1, 10);
    expect(clamped.y).toBeCloseTo(0, 10);
  });

  it("is the defense a malicious client's inflated direction actually needs", () => {
    // Without this clamp, feeding {dirX: 1e9, dirY: 0} straight into
    // integrateMovement's speed*dt scaling would move at an arbitrary
    // multiple of the ruleset's speed cap (brief §32) instead of the
    // ruleset's actual top speed.
    const clamped = clampInputDirection(vec2(1e9, 0));
    const next = integrateMovement(ZERO, clamped, 180, 1 / 20);
    expect(length(next)).toBeCloseTo(180 / 20, 10);
  });
});
