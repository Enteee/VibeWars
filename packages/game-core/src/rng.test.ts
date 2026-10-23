import { describe, expect, it } from "vitest";

import { createRng, seedFromString } from "./rng.js";

describe("seedFromString", () => {
  it("is stable for a given input", () => {
    expect(seedFromString("A7KQ")).toBe(seedFromString("A7KQ"));
  });

  it("produces an unsigned 32-bit integer", () => {
    for (const input of ["", "a", "A7KQ", "match:1234:alpha"]) {
      const seed = seedFromString(input);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("separates similar inputs", () => {
    expect(seedFromString("A7KQ")).not.toBe(seedFromString("A7KR"));
  });
});

describe("createRng", () => {
  it("is reproducible from the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const drawsA = Array.from({ length: 64 }, () => a.nextUint32());
    const drawsB = Array.from({ length: 64 }, () => b.nextUint32());
    expect(drawsA).toEqual(drawsB);
  });

  it("diverges for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const drawsA = Array.from({ length: 32 }, () => a.nextUint32());
    const drawsB = Array.from({ length: 32 }, () => b.nextUint32());
    expect(drawsA).not.toEqual(drawsB);
  });

  it("produces floats within [0, 1)", () => {
    const rng = createRng(seedFromString("floats"));
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces uint32 values in range", () => {
    const rng = createRng(seedFromString("uints"));
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("keeps nextInt within the requested half-open range", () => {
    const rng = createRng(seedFromString("ints"));
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.nextInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    // With 10k draws over 4 buckets every bucket should appear.
    expect([...seen].sort((l, r) => l - r)).toEqual([3, 4, 5, 6]);
  });

  it("rejects an empty or inverted nextInt range", () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(5, 5)).toThrow(RangeError);
    expect(() => rng.nextInt(5, 4)).toThrow(RangeError);
  });

  it("rejects non-integer nextInt bounds", () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0.5, 4)).toThrow(RangeError);
  });

  it("round-trips its state for replay", () => {
    const rng = createRng(seedFromString("replay"));
    // Advance a bit so we are not snapshotting the initial state.
    for (let i = 0; i < 10; i += 1) {
      rng.nextUint32();
    }

    const snapshot = rng.getState();
    const expected = Array.from({ length: 16 }, () => rng.nextUint32());

    rng.setState(snapshot);
    const replayed = Array.from({ length: 16 }, () => rng.nextUint32());

    expect(replayed).toEqual(expected);
  });

  it("is roughly uniform across buckets", () => {
    const rng = createRng(seedFromString("uniformity"));
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i += 1) {
      const bucket = Math.floor(rng.nextFloat() * buckets.length);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    const expectedPerBucket = draws / buckets.length;
    for (const count of buckets) {
      // Generous bound: we are checking for gross bias, not testing the
      // literature on Mulberry32.
      expect(Math.abs(count - expectedPerBucket)).toBeLessThan(expectedPerBucket * 0.1);
    }
  });
});
