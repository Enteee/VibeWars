import { describe, expect, it } from "vitest";

import {
  ZERO,
  add,
  clampLength,
  distance,
  distanceSquared,
  dot,
  equals,
  length,
  lengthSquared,
  normalize,
  scale,
  sub,
  vec2,
} from "./vec2.js";

describe("vec2 arithmetic", () => {
  it("adds and subtracts componentwise", () => {
    expect(add(vec2(1, 2), vec2(3, 4))).toEqual(vec2(4, 6));
    expect(sub(vec2(1, 2), vec2(3, 4))).toEqual(vec2(-2, -2));
  });

  it("scales componentwise", () => {
    expect(scale(vec2(2, -3), 2)).toEqual(vec2(4, -6));
    expect(scale(vec2(2, -3), 0)).toEqual(vec2(0, -0));
  });

  it("computes the dot product", () => {
    expect(dot(vec2(1, 0), vec2(0, 1))).toBe(0);
    expect(dot(vec2(2, 3), vec2(4, 5))).toBe(23);
  });

  it("does not mutate its inputs", () => {
    const a = vec2(1, 2);
    const b = vec2(3, 4);
    add(a, b);
    scale(a, 10);
    expect(a).toEqual(vec2(1, 2));
    expect(b).toEqual(vec2(3, 4));
  });
});

describe("vec2 magnitude", () => {
  it("computes length and squared length", () => {
    expect(lengthSquared(vec2(3, 4))).toBe(25);
    expect(length(vec2(3, 4))).toBe(5);
    expect(length(ZERO)).toBe(0);
  });

  it("computes distance between points", () => {
    expect(distanceSquared(vec2(1, 1), vec2(4, 5))).toBe(25);
    expect(distance(vec2(1, 1), vec2(4, 5))).toBe(5);
  });
});

describe("normalize", () => {
  it("returns a unit vector", () => {
    const n = normalize(vec2(3, 4));
    expect(n.x).toBeCloseTo(0.6, 12);
    expect(n.y).toBeCloseTo(0.8, 12);
    expect(length(n)).toBeCloseTo(1, 12);
  });

  it("returns ZERO for a zero-length vector rather than NaN", () => {
    expect(normalize(ZERO)).toEqual(ZERO);
    expect(normalize(vec2(0, 0))).toEqual(ZERO);
  });

  it("returns ZERO for a vector below the epsilon threshold", () => {
    expect(normalize(vec2(1e-12, 1e-12))).toEqual(ZERO);
  });
});

describe("clampLength", () => {
  it("leaves short vectors untouched", () => {
    const a = vec2(1, 0);
    expect(clampLength(a, 5)).toBe(a);
  });

  it("shortens long vectors to exactly maxLength", () => {
    const clamped = clampLength(vec2(30, 40), 5);
    expect(length(clamped)).toBeCloseTo(5, 12);
    expect(clamped.x).toBeCloseTo(3, 12);
    expect(clamped.y).toBeCloseTo(4, 12);
  });

  it("clamps to zero when maxLength is zero", () => {
    expect(clampLength(vec2(3, 4), 0)).toEqual(ZERO);
  });

  it("rejects a negative maxLength", () => {
    expect(() => clampLength(vec2(1, 1), -1)).toThrow(RangeError);
  });
});

describe("equals", () => {
  it("compares within an epsilon", () => {
    expect(equals(vec2(1, 1), vec2(1, 1))).toBe(true);
    expect(equals(vec2(1, 1), vec2(1 + 1e-12, 1))).toBe(true);
    expect(equals(vec2(1, 1), vec2(1.1, 1))).toBe(false);
  });

  it("honours a custom epsilon", () => {
    expect(equals(vec2(0, 0), vec2(0.05, 0), 0.1)).toBe(true);
    expect(equals(vec2(0, 0), vec2(0.5, 0), 0.1)).toBe(false);
  });
});
