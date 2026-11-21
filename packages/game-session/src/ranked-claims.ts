/**
 * Checking a ranked start's claims (ADR-0055, #3575): every player holds
 * its own copy of the leaderboard, and copies differ by up to an hour, so
 * each claim is checked against the copy it was read from where this
 * player holds that one, and trusted a little where it cannot be.
 */

import type { RankedStart } from "@vibewars/ranking";

import type { FormedGroup } from "./queue-formation.js";

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

/** Where a client's leaderboard comes from: the copy it holds, and a fresh one. */
export interface LeaderboardSource {
  /** The copy held now, `undefined` while it has none. */
  readonly copy: () => LeaderboardCopy | undefined;
  /** A fresh copy, past any cache; `undefined` when the fetch fails. */
  readonly refetch: () => Promise<LeaderboardCopy | undefined>;
}

/**
 * How much older than this player's copy a claim's may be and still be
 * trusted: an honest client fetches the board as it queues, and it is
 * rebuilt every hour.
 */
export const STALE_CLAIM_SECONDS = 2 * 60 * 60;

/** How far past this player's clock a claim's `asOf` may be: clocks differ. */
export const FUTURE_CLAIM_SECONDS = 10 * 60;

/** One seat's claim: whose, how much, and read from which leaderboard. */
export interface SeatClaim {
  readonly pubkey: string;
  readonly rating: number;
  readonly asOf: number;
}

/**
 * What this player makes of `claim` with `copy`, at `nowSeconds`:
 * - read from the same board: it holds only if it is that board's;
 * - from an older one by at most `STALE_CLAIM_SECONDS`: trusted, since
 *   an old board cannot be rebuilt;
 * - from an older one by more: refused, an honest client refetches;
 * - from a newer one, or with no copy held: `"refetch"`, once; after
 *   that, trusted unless its `asOf` is in the future.
 */
export function claimVerdict(
  claim: SeatClaim,
  copy: LeaderboardCopy | undefined,
  nowSeconds: number,
  refetched: boolean,
): "accept" | "refuse" | "refetch" {
  if (claim.asOf === copy?.asOf) {
    return claim.rating === copy.claimOf(claim.pubkey) ? "accept" : "refuse";
  }
  if (copy !== undefined && claim.asOf < copy.asOf) {
    return copy.asOf - claim.asOf <= STALE_CLAIM_SECONDS ? "accept" : "refuse";
  }
  if (!refetched) {
    return "refetch";
  }
  return claim.asOf > nowSeconds + FUTURE_CLAIM_SECONDS ? "refuse" : "accept";
}

/** Every seat's claim in `start`, read from the ticket that seated it in `group`. */
function seatClaims(start: RankedStart, group: FormedGroup): SeatClaim[] {
  return group.teams.flatMap((team, t) =>
    team.flatMap((seatKey, i) => {
      const seat = start.teams[t]?.[i];
      const asOf = group.claimsAsOf[seatKey];
      return seat === undefined || asOf === undefined
        ? []
        : [{ pubkey: seat.pubkey, rating: seat.claimedRating, asOf }];
    }),
  );
}

/**
 * Whether every claim in `start`, a start already checked to seat
 * `group` as formed, holds against `source` at `nowSeconds`: the
 * leaderboard is fetched again at most once.
 */
export async function claimsHold(
  start: RankedStart,
  group: FormedGroup,
  source: LeaderboardSource,
  nowSeconds: number,
): Promise<boolean> {
  const claims = seatClaims(start, group);
  const verdicts = (copy: LeaderboardCopy | undefined, refetched: boolean) =>
    claims.map((claim) => claimVerdict(claim, copy, nowSeconds, refetched));
  let verdict = verdicts(source.copy(), false);
  if (verdict.includes("refetch") && !verdict.includes("refuse")) {
    verdict = verdicts(await source.refetch(), true);
  }
  return verdict.every((each) => each === "accept");
}
