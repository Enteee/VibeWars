/**
 * What a key has earned (ADR-0056): a pure function of its entry in
 * `leaderboard.json`, which anyone can recompute from the signed receipts.
 * There are no tokens: the leaderboard is the proof.
 */

import type { LeaderboardEntry } from "../net/leaderboard.js";

import type { CosmeticEntry } from "./catalog.js";

/** Verified ranked wins per tier (ADR-0056 §1). Tuned here. */
export const TIERS = { 1: 5, 2: 25, 3: 75, 4: 200, 5: 500 } as const;

/** The Top tier: a current rank at most this. Lost with the rank. */
export const TOP_RANK = 100;

/** The win streak the flame burns from (ADR-0056 §5). */
export const FLAME_STREAK = 3;

/** As much of a leaderboard entry as an unlock reads. */
export type UnlockFacts = Pick<LeaderboardEntry, "wins" | "streak" | "rank">;

/** Whether `facts`, a key's leaderboard entry, earns `entry`; nothing earns anything off the board. */
export function isUnlocked(entry: CosmeticEntry, facts: UnlockFacts | undefined): boolean {
  if (facts === undefined) {
    return false;
  }
  const { requires } = entry;
  if ("wins" in requires) {
    return facts.wins >= requires.wins;
  }
  if ("rankAtMost" in requires) {
    return facts.rank !== null && facts.rank <= requires.rankAtMost;
  }
  return facts.streak >= requires.streakAtLeast;
}
