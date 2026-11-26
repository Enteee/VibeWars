/**
 * Checking a ranked start's claims (ADR-0055, #3575): every player holds
 * its own copy of the leaderboard, and copies differ by up to an hour, so
 * each claim names the board it was read from and is checked against that
 * very board, which the ranking job keeps published for three hours.
 */

import { UNLISTED_CLAIM } from "@vibewars/game-protocol";
import type { RankedStart } from "@vibewars/ranking";

/** A copy of the leaderboard as this player holds it. */
export interface LeaderboardCopy {
  /** Its `asOf`, unix seconds. */
  readonly asOf: number;
  /**
   * The claim `pubkey` makes from it: the conservative value, rounded, or
   * `UNLISTED_CLAIM` for a key it does not list.
   */
  readonly claimOf: (pubkey: string) => number;
}

/** Where a client's leaderboards come from. */
export interface LeaderboardSource {
  /** The copy held now, `undefined` while it has none. */
  readonly copy: () => LeaderboardCopy | undefined;
  /**
   * The board published as of `asOf`, exactly: `undefined` when none
   * is, or the fetch fails.
   */
  readonly board: (asOf: number) => Promise<LeaderboardCopy | undefined>;
}

/** One seat's claim: whose, how much, and read from which leaderboard. */
export interface SeatClaim {
  readonly pubkey: string;
  readonly rating: number;
  readonly asOf: number;
}

/**
 * Whether `claim` holds against `board`: for a claim from no board,
 * `asOf` 0, this player's current copy; for any other, the very board it
 * names. A claim from no board holds only as 800 from a key the copy does
 * not list, or when this player holds none either: otherwise a strong
 * player fakes a failed fetch to pair low. Any other holds only as its
 * board's own value, and not at all when that board is not published.
 */
export function claimHolds(claim: SeatClaim, board: LeaderboardCopy | undefined): boolean {
  if (claim.asOf === 0) {
    return (
      claim.rating === UNLISTED_CLAIM &&
      (board === undefined || board.claimOf(claim.pubkey) === UNLISTED_CLAIM)
    );
  }
  return board?.asOf === claim.asOf && board.claimOf(claim.pubkey) === claim.rating;
}

/**
 * Whether every claim in `start`, a start already checked to carry each
 * seat's ticket claim, holds against `source`: each board named is
 * fetched once.
 */
export async function claimsHold(start: RankedStart, source: LeaderboardSource): Promise<boolean> {
  const claims = start.teams.flat().map((seat): SeatClaim => ({
    pubkey: seat.pubkey,
    rating: seat.claimedRating,
    asOf: seat.leaderboardAsOf,
  }));
  const named = [...new Set(claims.map(({ asOf }) => asOf).filter((asOf) => asOf !== 0))];
  const boards = new Map(
    await Promise.all(named.map(async (asOf) => [asOf, await source.board(asOf)] as const)),
  );
  return claims.every((claim) =>
    claimHolds(claim, claim.asOf === 0 ? source.copy() : boards.get(claim.asOf)),
  );
}
