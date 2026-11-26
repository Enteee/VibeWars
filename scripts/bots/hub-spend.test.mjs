/**
 * Where the GraphQL budget goes (#97): the ledger, and the board query's
 * answer turned back into gh's item-list shape.
 */
import { describe, expect, it } from "vitest";

import {
  SPEND_WINDOW_MS,
  costBetween,
  parseBoardPage,
  readSpend,
  recordSpend,
  summarizeSpend,
} from "./hub-spend.mjs";
import { boardNumbers } from "./hub-visibility.mjs";

const NOW = 1_800_000_000_000;

/**
 * @param {string} cmd
 * @param {number | null} cost
 * @param {number} [ago]
 * @returns {import("./hub-spend.mjs").Spend}
 */
const spend = (cmd, cost, ago = 0) => ({ at: NOW - ago, role: "lead-dev", cmd, ms: 300, cost });

describe("recordSpend", () => {
  it("keeps the last hour and drops anything older", () => {
    const old = spend("pr view", 1, SPEND_WINDOW_MS + 1);
    const recent = spend("pr view", 1, 60_000);
    expect(recordSpend([old, recent], spend("pr checks", 2), NOW)).toEqual([
      recent,
      spend("pr checks", 2),
    ]);
  });
});

describe("costBetween", () => {
  /**
   * @param {number} remaining
   * @param {number} [resetAt]
   */
  const at = (remaining, resetAt = 5) => ({ remaining, resetAt });

  it("is the drop in the budget across a call", () => {
    expect(costBetween(at(4000), at(3987))).toBe(13);
    expect(costBetween(at(4000), at(4000))).toBe(0);
  });

  it("cannot tell across a reset, or without both readings", () => {
    expect(costBetween(at(10, 5), at(4990, 6))).toBeNull();
    expect(costBetween(at(10), at(20))).toBeNull();
    expect(costBetween(null, at(10))).toBeNull();
    expect(costBetween(at(10), null)).toBeNull();
  });
});

describe("summarizeSpend", () => {
  const window = [
    spend("board snapshot", 1),
    spend("board snapshot", 1),
    spend("pr checks", 5),
    spend("pr view", 1),
    spend("pr view", null),
    spend("issue edit", 1),
  ];

  it("ranks commands by cost, then by count", () => {
    const { spent, calls, unknown, top } = summarizeSpend(window);
    expect({ spent, calls, unknown }).toEqual({ spent: 9, calls: 6, unknown: 1 });
    expect(top.map((row) => row.cmd)).toEqual([
      "pr checks",
      "board snapshot",
      "pr view",
      "issue edit",
    ]);
  });

  it("sums the counted points per role, largest first (#963)", () => {
    /**
     * @param {string} role
     * @param {number | null} cost
     */
    const by = (role, cost) => ({ ...spend("pr view", cost), role });
    const { spent, byRole } = summarizeSpend([
      by("hubd", 2),
      by("developer", 3),
      by("hubd", 2),
      by("manager", null),
      by("qa-tester", 0),
    ]);
    expect(spent).toBe(7);
    expect(byRole).toEqual([
      { role: "hubd", points: 4 },
      { role: "developer", points: 3 },
    ]);
    expect(summarizeSpend([]).byRole).toEqual([]);
  });

  it("reads back what hubd wrote, skipping anything malformed", () => {
    expect(readSpend(JSON.parse(JSON.stringify(window)))).toEqual(window);
    expect(readSpend([{ at: 1 }, "x", null])).toEqual([]);
    expect(readSpend(undefined)).toEqual([]);
  });
});

describe("parseBoardPage", () => {
  const page = {
    data: {
      rateLimit: { cost: 1, remaining: 4321, resetAt: "2027-01-15T08:00:00Z" },
      node: {
        items: {
          totalCount: 3,
          pageInfo: { hasNextPage: true, endCursor: "Y3Vyc29y" },
          nodes: [
            {
              id: "PVTI_a",
              status: { name: "In Review" },
              content: {
                __typename: "Issue",
                number: 27,
                title: "Shared skills",
                url: "https://github.com/Enteee/VibeWars/issues/27",
                repository: { nameWithOwner: "Enteee/VibeWars" },
              },
            },
            {
              id: "PVTI_b",
              status: null,
              content: {
                __typename: "PullRequest",
                number: 73,
                title: "Skills in the repo",
                url: "https://github.com/Enteee/VibeWars/pull/73",
                repository: { nameWithOwner: "Enteee/VibeWars" },
              },
            },
            {
              id: "PVTI_c",
              status: { name: "Backlog" },
              content: { __typename: "DraftIssue", title: "an idea" },
            },
          ],
        },
      },
    },
  };
  const parsed = parseBoardPage(JSON.stringify(page));

  it("reads the items, the next cursor, and the exact cost", () => {
    expect(parsed?.next).toBe("Y3Vyc29y");
    expect(parsed?.totalCount).toBe(3);
    expect(parsed?.cost).toBe(1);
    expect(parsed?.budget).toEqual({
      remaining: 4321,
      resetAt: Date.parse("2027-01-15T08:00:00Z"),
    });
  });

  it("gives every field board, the visibility filter and the dashboard read, as gh does", () => {
    // `gh project item-list --format json` for the same issue, as gh 2.x
    // prints it; everything else it adds is read by nothing here.
    const fromGh = {
      content: {
        body: "…",
        number: 27,
        repository: "Enteee/VibeWars",
        title: "Shared skills",
        type: "Issue",
        url: "https://github.com/Enteee/VibeWars/issues/27",
      },
      id: "PVTI_a",
      labels: ["meta"],
      repository: "https://github.com/Enteee/VibeWars",
      status: "In Review",
      title: "Shared skills",
    };
    const [ours] = parsed?.items ?? [];
    expect(ours).toEqual({
      id: fromGh.id,
      title: fromGh.title,
      status: fromGh.status,
      content: {
        type: fromGh.content.type,
        number: fromGh.content.number,
        title: fromGh.content.title,
        url: fromGh.content.url,
        repository: fromGh.content.repository,
      },
    });
  });

  it("leaves out a status no column holds, and a draft's number and repository", () => {
    expect(parsed?.items[1]).not.toHaveProperty("status");
    expect(parsed?.items[2]).toEqual({
      id: "PVTI_c",
      title: "an idea",
      status: "Backlog",
      content: { type: "DraftIssue", title: "an idea" },
    });
  });

  it("is what the visibility filter reads board membership from", () => {
    const numbers = boardNumbers({ items: parsed?.items ?? [] }, "enteee/vibewars");
    expect([...numbers].sort((a, b) => a - b)).toEqual([27, 73]);
  });

  it("is null for anything that is not a page", () => {
    expect(parseBoardPage("{")).toBeNull();
    expect(parseBoardPage(JSON.stringify({ errors: [{ message: "x" }] }))).toBeNull();
  });
});
