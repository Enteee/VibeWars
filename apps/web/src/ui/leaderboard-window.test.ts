import { describe, expect, it } from "vitest";

import { LEADERBOARD_TOP, type Leaderboard, type LeaderboardEntry } from "../net/leaderboard.js";
import { rankLine, ratingLine, standingOf, topRows } from "./leaderboard-window.js";

function entry(pubkey: string, rank: number | null, overrides: Partial<LeaderboardEntry> = {}) {
  return {
    pubkey,
    rank,
    name: pubkey,
    rating: 1600,
    conservative: 1500,
    matches: 12,
    provisional: rank === null,
    ...overrides,
  };
}

const BOARD: Leaderboard = {
  asOf: 1_700_000_000,
  entries: [
    entry("aa", 1, { rating: 1712.4 }),
    entry("bb", 2),
    entry("cc", null, { matches: 4 }),
    entry("dd", null, { provisional: false, rating: 1488.6 }),
  ],
};

describe("standingOf (#3575)", () => {
  it("is a rank and a rating, a rating with no rank, provisional, or unknown", () => {
    expect(standingOf(BOARD, "aa")).toEqual({ kind: "ranked", rank: 1, rating: 1712 });
    expect(standingOf(BOARD, "dd")).toEqual({ kind: "rated", rating: 1489 });
    expect(standingOf(BOARD, "cc")).toEqual({ kind: "provisional", matches: 4 });
    // Not listed: no rated match yet.
    expect(standingOf(BOARD, "zz")).toEqual({ kind: "provisional", matches: 0 });
    expect(standingOf(undefined, "aa")).toEqual({ kind: "unknown" });
  });
});

describe("the lines (#3575)", () => {
  it("rates a ranked player, and only ranks them on the menu", () => {
    expect(ratingLine(standingOf(BOARD, "aa"))).toBe("Your rating: 1712");
    expect(rankLine(standingOf(BOARD, "aa"))).toBe("Rank #1 · Rating 1712");
    expect(ratingLine(standingOf(BOARD, "zz"))).toBe("Provisional (0/10 matches)");
    expect(rankLine(standingOf(BOARD, "zz"))).toBeUndefined();
    expect(rankLine(standingOf(BOARD, "dd"))).toBeUndefined();
    expect(rankLine({ kind: "unknown" })).toBeUndefined();
  });
});

describe("topRows (#3575)", () => {
  it("lists the ranked best first, and stops at the top 100", () => {
    expect(topRows(BOARD).map(({ pubkey }) => pubkey)).toEqual(["aa", "bb"]);
    const many: Leaderboard = {
      asOf: 1,
      entries: Array.from({ length: LEADERBOARD_TOP + 5 }, (_, index) =>
        entry(`k${String(index)}`, index + 1),
      ).reverse(),
    };
    const rows = topRows(many);
    expect(rows).toHaveLength(LEADERBOARD_TOP);
    expect(rows[0]?.rank).toBe(1);
    expect(rows.at(-1)?.rank).toBe(LEADERBOARD_TOP);
  });
});
