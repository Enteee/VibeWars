import { describe, expect, it } from "vitest";

import { UNLISTED_CLAIM } from "@vibewars/game-protocol";

import {
  claimFrom,
  createLeaderboardStore,
  LEADERBOARD_CACHE_MS,
  parseLeaderboard,
  type Leaderboard,
} from "./leaderboard.js";

const BOARD: Leaderboard = {
  asOf: 1_700_000_000,
  entries: [
    {
      pubkey: "aa",
      rank: 1,
      name: "Ana",
      rating: 1712.4,
      conservative: 1601.6,
      matches: 24,
      provisional: false,
    },
    {
      pubkey: "bb",
      rank: null,
      name: "Bo",
      rating: 1530,
      conservative: 900,
      matches: 3,
      provisional: true,
    },
  ],
};

/** A store over `answers`, served in turn; a `Error` answer is a failed fetch. */
function storeOver(answers: unknown[], clock = { now: 0 }) {
  const urls: string[] = [];
  const store = createLeaderboardStore({
    fetchJson: (url) => {
      urls.push(url);
      const answer = answers.shift();
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
    now: () => clock.now,
    baseUrl: "/vibewars/",
  });
  return { store, urls, clock };
}

describe("parseLeaderboard (#3575)", () => {
  it("reads what the ranking job writes, and nothing else", () => {
    expect(parseLeaderboard({ ...BOARD, engine: "glicko2", count: 2 })).toEqual(BOARD);
    expect(parseLeaderboard({ asOf: 0, entries: [] })).toBeUndefined();
    expect(parseLeaderboard({ asOf: 1, entries: [{ pubkey: "aa" }] })).toBeUndefined();
    expect(parseLeaderboard("<html>")).toBeUndefined();
  });
});

describe("claimFrom (#3575)", () => {
  it("is the conservative value rounded, or 800 for a key it does not list", () => {
    expect(claimFrom(BOARD, "aa")).toEqual({ rating: 1602, asOf: BOARD.asOf });
    expect(claimFrom(BOARD, "zz")).toEqual({ rating: UNLISTED_CLAIM, asOf: BOARD.asOf });
    expect(claimFrom(undefined, "aa")).toEqual({ rating: UNLISTED_CLAIM, asOf: 0 });
  });
});

describe("createLeaderboardStore (#3575)", () => {
  it("fetches ranking/leaderboard.json from the site root", async () => {
    const { store, urls } = storeOver([BOARD]);
    expect(await store.load()).toEqual(BOARD);
    expect(urls).toEqual(["/vibewars/ranking/leaderboard.json"]);
    expect(store.copy()?.claimOf("aa")).toBe(1602);
  });

  it("keeps a copy ten minutes, but a queue entry fetches past it", async () => {
    const newer = { ...BOARD, asOf: BOARD.asOf + 3600 };
    const { store, urls, clock } = storeOver([BOARD, newer, newer]);
    await store.load();
    clock.now = LEADERBOARD_CACHE_MS - 1;
    expect(await store.load()).toEqual(BOARD);
    expect(urls).toHaveLength(1);
    expect((await store.refetch())?.asOf).toBe(newer.asOf);
    clock.now = 2 * LEADERBOARD_CACHE_MS;
    await store.load();
    expect(urls).toHaveLength(3);
  });

  it("a failed fetch is rating unknown, and the player still claims 800", async () => {
    const { store } = storeOver([new Error("offline"), "not json"]);
    expect(await store.load()).toBeUndefined();
    expect(await store.refetch()).toBeUndefined();
    expect(store.current()).toBeUndefined();
    expect(store.claim("aa")).toEqual({ rating: UNLISTED_CLAIM, asOf: 0 });
  });

  it("a failed fetch keeps the copy it had, and tells nobody", async () => {
    const { store, clock } = storeOver([BOARD, new Error("offline")]);
    const heard: Leaderboard[] = [];
    store.onChange((board) => heard.push(board));
    await store.load();
    clock.now = 2 * LEADERBOARD_CACHE_MS;
    expect(await store.load()).toEqual(BOARD);
    expect(heard).toEqual([BOARD]);
  });
});
