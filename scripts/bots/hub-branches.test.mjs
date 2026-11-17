import { describe, expect, it } from "vitest";

import {
  branchesToPrune,
  deleteBranches,
  formatPrune,
  formatSummary,
  refPath,
} from "./hub-branches.mjs";

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

describe("deleteBranches", () => {
  const chosen = [
    { name: "bot/a/one", sha: "1", rule: "merged #1" },
    { name: "bot/a/two", sha: "2", rule: "idle 20d" },
  ];

  /**
   * @param {Record<string, { sha: string } | "gone" | "error">} refs
   * @param {Record<string, "deleted" | "gone" | "error">} removes
   */
  function github(refs, removes = {}) {
    /** @type {string[]} */
    const removed = [];
    return {
      removed,
      readRef: (/** @type {string} */ name) => Promise.resolve(refs[name] ?? "error"),
      remove: (/** @type {string} */ name) => {
        removed.push(name);
        return Promise.resolve(removes[name] ?? "deleted");
      },
    };
  }

  it("deletes a branch whose tip is where the sweep saw it", async () => {
    const gh = github({ "bot/a/one": { sha: "1" }, "bot/a/two": { sha: "2" } });
    const out = await deleteBranches(chosen, gh);
    expect(gh.removed).toEqual(["bot/a/one", "bot/a/two"]);
    expect(out.deleted).toHaveLength(2);
  });

  it("keeps a branch pushed to since", async () => {
    const gh = github({ "bot/a/one": { sha: "9" }, "bot/a/two": { sha: "2" } });
    const out = await deleteBranches(chosen, gh);
    expect(gh.removed).toEqual(["bot/a/two"]);
    expect(out.skipped).toBe(1);
  });

  it("counts a ref that is already gone without deleting it", async () => {
    const gh = github({ "bot/a/one": "gone", "bot/a/two": { sha: "2" } });
    const out = await deleteBranches(chosen, gh);
    expect(gh.removed).toEqual(["bot/a/two"]);
    expect(out.deleted).toHaveLength(2);
  });

  it("stops without deleting when the re-read fails", async () => {
    const gh = github({ "bot/a/one": "error", "bot/a/two": { sha: "2" } });
    const out = await deleteBranches(chosen, gh);
    expect(gh.removed).toEqual([]);
    expect(out.stoppedAt).toBe("bot/a/one");
  });

  it("stops when a delete fails", async () => {
    const gh = github(
      { "bot/a/one": { sha: "1" }, "bot/a/two": { sha: "2" } },
      { "bot/a/one": "error" },
    );
    const out = await deleteBranches(chosen, gh);
    expect(gh.removed).toEqual(["bot/a/one"]);
    expect(out.deleted).toEqual([]);
    expect(out.stoppedAt).toBe("bot/a/one");
  });
});

describe("refPath", () => {
  it("encodes each segment and keeps the slashes", () => {
    expect(refPath("bot/a/x#1%")).toBe("bot/a/x%231%25");
  });
});
