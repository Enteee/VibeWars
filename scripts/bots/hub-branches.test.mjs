import { describe, expect, it } from "vitest";

import { branchesToPrune, formatPrune, formatSummary } from "./hub-branches.mjs";

const DAY = 24 * 60 * 60_000;
const NOW = Date.UTC(2026, 10, 17);

/**
 * @param {Partial<import("./hub-branches.mjs").BranchRow>} over
 * @returns {import("./hub-branches.mjs").BranchRow}
 */
function row(over) {
  return {
    name: "bot/dev/x",
    sha: "a".repeat(40),
    committedAt: NOW - DAY,
    inMain: false,
    prs: [],
    ...over,
  };
}

/** @param {Partial<import("./hub-branches.mjs").BranchPr>} over */
function pr(over) {
  return {
    number: 7,
    state: /** @type {const} */ ("OPEN"),
    closedAt: null,
    role: /** @type {const} */ ("head"),
    ...over,
  };
}

/** @param {Partial<import("./hub-branches.mjs").BranchRow>} over */
const rules = (over) => branchesToPrune([row(over)], NOW).map((p) => p.rule);

describe("branchesToPrune", () => {
  it("deletes the head of a merged PR", () => {
    expect(rules({ prs: [pr({ state: "MERGED", closedAt: NOW })] })).toEqual(["merged #7"]);
  });

  it("keeps a PR closed unmerged 13 days ago, deletes it at 15", () => {
    expect(rules({ prs: [pr({ state: "CLOSED", closedAt: NOW - 13 * DAY })] })).toEqual([]);
    expect(rules({ prs: [pr({ state: "CLOSED", closedAt: NOW - 15 * DAY })] })).toEqual([
      "closed #7 15d",
    ]);
  });

  it("deletes a bot branch with no PR whose tip is in main", () => {
    expect(rules({ inMain: true })).toEqual(["in main"]);
  });

  it("keeps a bot branch idle 13 days, deletes it at 15", () => {
    expect(rules({ committedAt: NOW - 13 * DAY })).toEqual([]);
    expect(rules({ committedAt: NOW - 15 * DAY })).toEqual(["idle 15d"]);
  });

  it("keeps a non-bot branch with no PR, however old", () => {
    expect(rules({ name: "operator/x", committedAt: NOW - 90 * DAY, inMain: true })).toEqual([]);
  });

  it("keeps main, and release branches unless their PR merged", () => {
    expect(rules({ name: "main", inMain: true, committedAt: 0 })).toEqual([]);
    expect(rules({ name: "release/0.1.0", inMain: true, committedAt: 0 })).toEqual([]);
    expect(rules({ name: "release/0.1.0", prs: [pr({ state: "MERGED", closedAt: NOW })] })).toEqual(
      ["merged #7"],
    );
  });

  it("keeps the head and the base of an open PR", () => {
    expect(rules({ committedAt: 0, prs: [pr({})] })).toEqual([]);
    expect(rules({ name: "bot/dev/base", committedAt: 0, prs: [pr({ role: "base" })] })).toEqual(
      [],
    );
  });

  it("keeps a branch with an open and a merged PR", () => {
    expect(
      rules({ prs: [pr({ state: "MERGED", number: 5, closedAt: NOW }), pr({ number: 9 })] }),
    ).toEqual([]);
  });

  it("does not delete a branch because it was the base of a merged PR", () => {
    expect(rules({ prs: [pr({ state: "MERGED", role: "base", closedAt: NOW })] })).toEqual([]);
  });
});

describe("formatting", () => {
  const rows = [
    { name: "bot/a/b", sha: "1", rule: "merged #3" },
    { name: "bot/c/d", sha: "2", rule: "idle 20d" },
  ];

  it("prints a line per branch, then the count", () => {
    expect(formatPrune(rows)).toBe(
      "bot/a/b  merged #3\nbot/c/d  idle 20d\n2 branches would be pruned",
    );
  });

  it("summarises a sweep", () => {
    expect(formatSummary({ deleted: rows, kept: 4 })).toBe(
      "pruned 2 branches (1 merged, 1 idle); kept 4",
    );
  });
});
