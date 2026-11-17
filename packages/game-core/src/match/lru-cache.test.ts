import { describe, expect, it } from "vitest";

import { LruCache } from "./lru-cache.js";

function cacheOf(limit: number, ...keys: readonly number[]): LruCache<number, { key: number }> {
  const cache = new LruCache<number, { key: number }>(limit);
  keys.forEach((key) => cache.set(key, { key }));
  return cache;
}

describe("LruCache (#3467)", () => {
  it("never holds more than its limit", () => {
    const cache = cacheOf(3, 1, 2, 3, 4, 5, 6);
    expect(cache.size).toBe(3);
    expect([4, 5, 6].map((key) => cache.get(key)?.key)).toEqual([4, 5, 6]);
  });

  it("evicts the least recently used entry", () => {
    const cache = cacheOf(2, 1, 2, 3);
    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)?.key).toBe(2);
    expect(cache.get(3)?.key).toBe(3);
  });

  it("protects a hit from the next eviction", () => {
    const cache = cacheOf(2, 1, 2);
    expect(cache.get(1)?.key).toBe(1);
    cache.set(3, { key: 3 });
    expect(cache.get(1)?.key).toBe(1);
    expect(cache.get(2)).toBeUndefined();
  });

  it("replaces a key set again without growing, and makes it the most recent", () => {
    const cache = cacheOf(2, 1, 2);
    const again = { key: 10 };
    cache.set(1, again);
    expect(cache.size).toBe(2);
    expect(cache.get(1)).toBe(again);
    cache.set(3, { key: 3 });
    expect(cache.get(2)).toBeUndefined();
    expect(cache.get(1)).toBe(again);
  });

  it("refuses a limit below one", () => {
    expect(() => new LruCache(0)).toThrow();
    expect(() => new LruCache(-1)).toThrow();
  });
});
