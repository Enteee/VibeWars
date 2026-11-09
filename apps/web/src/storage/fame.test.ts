import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DAILY_FAME_CAP,
  awardFame,
  fameDay,
  fameForWin,
  heroRankOf,
  loadFame,
  recordAscentWin,
} from "./fame.js";

const before = Date.UTC(2026, 10, 9, 14, 59, 59);
const after = Date.UTC(2026, 10, 9, 15, 0, 0);

describe("fame (#2702)", () => {
  it.each([
    [1, 1],
    [4, 4],
    [5, 6],
    [13, 36],
    [14, 40],
    [30, 40],
  ])("win %d of a run earns %d", (streak, fame) => {
    expect(fameForWin(streak)).toBe(fame);
  });

  it.each([
    [0, 0],
    [24, 0],
    [25, 1],
    [74, 1],
    [75, 2],
    [99999, 14],
    [100000, 15],
    [500000, 15],
  ])("%d fame is rank %d", (total, rank) => {
    expect(heroRankOf(total)).toBe(rank);
  });

  it("holds a day to the cap, keeping the total of what was earned", () => {
    const fame = { total: 1000, today: DAILY_FAME_CAP - 10, day: fameDay(before) };
    expect(awardFame(fame, 20, before)).toEqual({
      total: 1010,
      today: DAILY_FAME_CAP,
      day: fameDay(before),
    });
  });

  it("starts a new day at 15:00 UTC", () => {
    const capped = { total: 300, today: DAILY_FAME_CAP, day: fameDay(before) };
    expect(awardFame(capped, 1, before)).toEqual(capped);
    expect(awardFame(capped, 1, after)).toEqual({ total: 301, today: 1, day: fameDay(after) });
  });
});

describe("stored fame (#2702)", () => {
  const stored = new Map<string, string>();

  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds up wins", () => {
    recordAscentWin(1, after);
    recordAscentWin(2, after);
    expect(loadFame()).toEqual({ total: 3, today: 3, day: fameDay(after) });
  });

  it("counts a malformed record as none", () => {
    recordAscentWin(1, after);
    for (const key of stored.keys()) {
      stored.set(key, JSON.stringify({ total: -1 }));
    }
    expect(loadFame().total).toBe(0);
  });
});
