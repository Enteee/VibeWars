import type { RankedStart } from "@vibewars/ranking";
import { describe, expect, it } from "vitest";

import { claimHolds, claimsHold, type LeaderboardCopy } from "./ranked-claims.js";

const NOW = 1_795_000_000;
const AS_OF = NOW - 4 * 3_600;
const ALICE = "a".repeat(64);

/** A board as of `asOf` that rates ALICE `alice` and lists nobody else. */
const board = (asOf: number, alice = 1234): LeaderboardCopy => ({
  asOf,
  claimOf: (pubkey) => (pubkey === ALICE ? alice : 800),
});

describe("claimHolds", () => {
  it("holds a claim only to the value on the very board it names", () => {
    expect(claimHolds({ pubkey: ALICE, rating: 1234, asOf: AS_OF }, board(AS_OF))).toBe(true);
    expect(claimHolds({ pubkey: ALICE, rating: 1500, asOf: AS_OF }, board(AS_OF))).toBe(false);
    // A key the board does not list claims 800, like anyone unrated.
    expect(claimHolds({ pubkey: "b".repeat(64), rating: 800, asOf: AS_OF }, board(AS_OF))).toBe(
      true,
    );
    // Another board, or none published at that asOf: refused, whatever it says.
    expect(claimHolds({ pubkey: ALICE, rating: 1234, asOf: AS_OF }, board(AS_OF + 1))).toBe(false);
    expect(claimHolds({ pubkey: ALICE, rating: 1234, asOf: AS_OF }, undefined)).toBe(false);
  });

  it("takes a claim from no board, asOf 0, only as an unlisted key's 800", () => {
    const unlisted = { pubkey: "b".repeat(64), rating: 800, asOf: 0 };
    expect(claimHolds(unlisted, board(AS_OF))).toBe(true);
    expect(claimHolds(unlisted, undefined)).toBe(true);
    expect(claimHolds({ ...unlisted, rating: 1500 }, board(AS_OF))).toBe(false);
    // ALICE is listed: hiding her 1234 behind no board is refused.
    expect(claimHolds({ pubkey: ALICE, rating: 800, asOf: 0 }, board(AS_OF))).toBe(false);
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
  /** A source holding `held`, that publishes `boards`, counting each board's fetches. */
  const source = (held: LeaderboardCopy | undefined, boards: readonly LeaderboardCopy[]) => {
    const fetched: number[] = [];
    return {
      fetched,
      copy: () => held,
      board: (asOf: number) => {
        fetched.push(asOf);
        return Promise.resolve(boards.find((each) => each.asOf === asOf));
      },
    };
  };

  it("holds a claim at a past asOf with the true rating there, and not another", async () => {
    const past = AS_OF - 3_600;
    const published = source(board(AS_OF, 1300), [board(past), board(AS_OF, 1300)]);
    expect(await claimsHold(start(past, 1234), published)).toBe(true);
    expect(await claimsHold(start(past, 1300), published)).toBe(false);
  });

  it("refuses a claim naming a board that is not published", async () => {
    const published = source(board(AS_OF), [board(AS_OF)]);
    expect(await claimsHold(start(AS_OF + 60, 1234), published)).toBe(false);
  });

  it("fetches each board named once: a party on two consecutive boards", async () => {
    const past = AS_OF - 3_600;
    const published = source(board(AS_OF), [board(past, 1100), board(AS_OF)]);
    expect(await claimsHold(start(AS_OF, 1234, past), published)).toBe(true);
    expect([...published.fetched].sort()).toEqual([past, AS_OF]);
  });

  it("holds unlisted claims from no board without a fetch", async () => {
    const none = source(undefined, []);
    expect(await claimsHold(start(0, 800), none)).toBe(true);
    expect(none.fetched).toEqual([]);
  });
});
