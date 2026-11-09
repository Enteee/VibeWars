import { STORAGE_NAMESPACE } from "./namespace.js";

/**
 * Fame and hero rank (#2702), GW1's Hero title: each Heroes' Ascent win
 * earns fame by the run's streak, at most `DAILY_FAME_CAP` a day, and the
 * total gives the rank. Kept on this device and self-reported.
 */
export interface Fame {
  readonly total: number;
  /** Earned on `day`, the count the daily cap holds. */
  readonly today: number;
  readonly day: number;
}

const FAME_KEY = `${STORAGE_NAMESPACE}.fame`;
const NO_FAME: Fame = { total: 0, today: 0, day: 0 };

/** The fame of a run's 1st, 2nd, … win; every later one earns `LATER_WIN_FAME`. */
const STREAK_FAME = [1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 28, 32, 36] as const;
const LATER_WIN_FAME = 40;
export const DAILY_FAME_CAP = 300;

/** The fame total each rank from 1 needs. */
const RANK_FAME = [
  25, 75, 180, 360, 600, 1000, 1680, 2800, 4665, 7750, 12960, 21600, 36000, 60000, 100000,
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** The fame day turns over at 15:00 UTC. */
const DAY_START_MS = 15 * 60 * 60 * 1000;

/** The fame of the run's `streak`th win, from 1. */
export function fameForWin(streak: number): number {
  return STREAK_FAME[streak - 1] ?? LATER_WIN_FAME;
}

/** The hero rank `total` fame gives, 0 below the first. */
export function heroRankOf(total: number): number {
  return RANK_FAME.filter((needed) => total >= needed).length;
}

/** Which fame day the epoch time `now` is in. */
export function fameDay(now: number): number {
  return Math.floor((now - DAY_START_MS) / DAY_MS);
}

/** `fame` after the run's `streak`th win at `now`, held to the daily cap. */
export function awardFame(fame: Fame, streak: number, now: number): Fame {
  const day = fameDay(now);
  const today = fame.day === day ? fame.today : 0;
  const earned = Math.min(fameForWin(streak), DAILY_FAME_CAP - today);
  return { total: fame.total + earned, today: today + earned, day };
}

function isFame(value: unknown): value is Fame {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { total, today, day } = value as Record<string, unknown>;
  return [total, today, day].every((field) => Number.isSafeInteger(field) && Number(field) >= 0);
}

/** The stored fame; what is not a fame record counts as none. */
export function loadFame(): Fame {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FAME_KEY) ?? "null");
    return isFame(parsed) ? parsed : NO_FAME;
  } catch {
    return NO_FAME;
  }
}

/** Count the run's `streak`th Heroes' Ascent win. */
export function recordAscentWin(streak: number, now: number = Date.now()): void {
  try {
    localStorage.setItem(FAME_KEY, JSON.stringify(awardFame(loadFame(), streak, now)));
  } catch {
    // Storage full or denied: this win earns nothing, and the match is unaffected.
  }
}
