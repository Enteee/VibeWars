import type { RankedStart } from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import {
  FUTURE_CLAIM_SECONDS,
  STALE_CLAIM_SECONDS,
  claimVerdict,
  claimsHold,
  type LeaderboardCopy,
} from "./ranked-claims.js";

const NOW = 1_795_000_000;
const AS_OF = NOW - 4 * 3_600;
const ALICE = "a".repeat(64);

/** A board as of `asOf` that rates ALICE 1234 and lists nobody else. */
const board = (asOf: number): LeaderboardCopy => ({
  asOf,
  claimOf: (pubkey) => (pubkey === ALICE ? 1234 : 800),
});

describe("claimVerdict", () => {
  it("holds a claim from the same board only to that board's value", () => {
    expect(
      claimVerdict({ pubkey: ALICE, rating: 1234, asOf: AS_OF }, board(AS_OF), NOW, false),
    ).toBe("accept");
    expect(
      claimVerdict({ pubkey: ALICE, rating: 1500, asOf: AS_OF }, board(AS_OF), NOW, false),
    ).toBe("refuse");
    // A key the board does not list claims 800, like anyone unrated.
    expect(
      claimVerdict({ pubkey: "b".repeat(64), rating: 800, asOf: AS_OF }, board(AS_OF), NOW, false),
    ).toBe("accept");
  });

  it("takes a claim from no board, asOf 0, only as an unlisted key's 800 (#3575)", () => {
    const unlisted = { pubkey: "b".repeat(64), rating: 800, asOf: 0 };
    expect(claimVerdict(unlisted, board(AS_OF), NOW, false)).toBe("accept");
    expect(claimVerdict({ ...unlisted, rating: 1500 }, board(AS_OF), NOW, false)).toBe("refuse");
    // ALICE is listed: hiding her 1234 behind no board is refused.
    expect(claimVerdict({ pubkey: ALICE, rating: 800, asOf: 0 }, board(AS_OF), NOW, false)).toBe(
      "refuse",
    );
  });

  it("trusts a claim from a board an hour older, and refuses one more than two hours older", () => {
    const copy = board(AS_OF);
    expect(
      claimVerdict({ pubkey: ALICE, rating: 1500, asOf: AS_OF - 3_600 }, copy, NOW, false),
    ).toBe("accept");
    expect(
      claimVerdict(
        { pubkey: ALICE, rating: 1500, asOf: AS_OF - STALE_CLAIM_SECONDS },
        copy,
        NOW,
        false,
      ),
    ).toBe("accept");
    expect(
      claimVerdict({ pubkey: ALICE, rating: 1500, asOf: AS_OF - 3 * 3_600 }, copy, NOW, false),
    ).toBe("refuse");
  });

  it("refetches for a claim from a newer board, then trusts it unless it is from the future", () => {
    const claim = { pubkey: ALICE, rating: 1500, asOf: AS_OF + 3_600 };
    expect(claimVerdict(claim, board(AS_OF), NOW, false)).toBe("refetch");
    expect(claimVerdict(claim, undefined, NOW, false)).toBe("refetch");
    expect(claimVerdict(claim, board(AS_OF), NOW, true)).toBe("accept");
    const ahead = { ...claim, asOf: NOW + FUTURE_CLAIM_SECONDS + 1 };
    expect(claimVerdict(ahead, board(AS_OF), NOW, true)).toBe("refuse");
  });
});

describe("claimsHold", () => {
  const BOB = "b".repeat(64);
  const seat = (pubkey: string, claimedRating: number, leaderboardAsOf: number) => ({
    pubkey,
    characterId: "c",
    name: "n",
    claimedRating,
    leaderboardAsOf,
    prev: "0".repeat(64),
  });
  /** ALICE claiming `aliceClaims` from the board at `asOf`, BOB unlisted on the one at `bobAsOf`. */
  const start = (asOf: number, aliceClaims: number, bobAsOf = asOf): RankedStart => ({
    matchId: "c".repeat(64),
    buildHash: "b",
    seed: 1,
    mode: "random-arena-1v1",
    map: "other-arena",
    startedAt: NOW,
    teams: [[seat(ALICE, aliceClaims, asOf)], [seat(BOB, 800, bobAsOf)]],
  });
  /** A source holding `held`, that fetches `fresh`, counting its fetches. */
  const source = (held: LeaderboardCopy | undefined, fresh: LeaderboardCopy | undefined) => {
    const fetched = { count: 0 };
    return {
      fetched,
      copy: () => held,
      refetch: () => {
        fetched.count += 1;
        return Promise.resolve(fresh);
      },
    };
  };

  it("holds honest claims from the same board without a fetch, and not a false one", async () => {
    const same = source(board(AS_OF), board(AS_OF));
    expect(await claimsHold(start(AS_OF, 1234), same, NOW)).toBe(true);
    expect(await claimsHold(start(AS_OF, 1600), same, NOW)).toBe(false);
    expect(same.fetched.count).toBe(0);
  });

  it("fetches the board once for claims from a newer one, and checks them against it", async () => {
    const newer = AS_OF + 3_600;
    const caughtUp = source(board(AS_OF), board(newer));
    expect(await claimsHold(start(newer, 1600), caughtUp, NOW)).toBe(false);
    expect(caughtUp.fetched.count).toBe(1);
    const stillBehind = source(board(AS_OF), board(AS_OF));
    expect(await claimsHold(start(newer, 1600), stillBehind, NOW)).toBe(true);
    expect(stillBehind.fetched.count).toBe(1);
  });

  it("holds each seat against its own board: a party on two consecutive boards", async () => {
    const consecutive = source(board(AS_OF), board(AS_OF));
    expect(await claimsHold(start(AS_OF, 1234, AS_OF - 3_600), consecutive, NOW)).toBe(true);
    expect(consecutive.fetched.count).toBe(0);
  });

  it("refuses a claim from a board more than STALE_CLAIM_SECONDS older than the one held", async () => {
    const held = source(board(AS_OF), board(AS_OF));
    const old = AS_OF - STALE_CLAIM_SECONDS - 1;
    expect(await claimsHold(start(AS_OF, 1234, old), held, NOW)).toBe(false);
  });

  it("holds a claim from a board that failed to fetch, read as unlisted", async () => {
    const none = source(undefined, undefined);
    expect(await claimsHold(start(0, 800), none, NOW)).toBe(true);
    expect(none.fetched.count).toBe(1);
  });
});
