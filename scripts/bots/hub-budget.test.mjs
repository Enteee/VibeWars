/**
 * How hubd spends the shared GraphQL budget (issue #17).
 *
 * The expensive mistakes here are quiet ones: a REST command classed as
 * GraphQL stops working the moment the budget runs out, even though GitHub
 * would have served it; a board read the snapshot misses goes back to costing
 * a query per agent per loop.
 */
import { describe, expect, it } from "vitest";

import {
  isBoardRead,
  limitedMessage,
  parseBoardIds,
  parseRateLimit,
  usesGraphql,
} from "./hub-budget.mjs";

describe("usesGraphql", () => {
  it("counts the commands every agent uses all day", () => {
    for (const argv of [
      ["issue", "view", "1"],
      ["issue", "list"],
      ["pr", "create", "--title", "x"],
      ["pr", "view", "25", "--json", "body"],
      ["project", "item-list", "2", "--format", "json"],
      ["project", "item-edit", "--id", "X"],
    ]) {
      expect(usesGraphql("gh", argv), argv.join(" ")).toBe(true);
    }
  });

  it("counts a review, which is mirrored to the PR as a comment", () => {
    expect(usesGraphql("review", ["approve", "25"])).toBe(true);
  });

  it("leaves out what keeps working while GraphQL is exhausted", () => {
    // These go to REST or to git, which have their own budgets. Blocking
    // them would stop the only commands that still work.
    expect(usesGraphql("push", ["bot/developer-1/issue-17"])).toBe(false);
    expect(usesGraphql("gh", ["run", "list", "--limit", "5"])).toBe(false);
    expect(usesGraphql("gh", ["workflow", "view", "ci.yml"])).toBe(false);
    expect(usesGraphql("gh", ["api", "repos/o/r/collaborators"])).toBe(false);
  });

  it("does not count a board read, which hubd answers from its copy", () => {
    expect(usesGraphql("board", ["ls", "Ready"])).toBe(false);
  });

  it("counts an explicit GraphQL query through gh api", () => {
    expect(usesGraphql("gh", ["api", "graphql", "-f", "query=..."])).toBe(true);
  });
});

describe("parseRateLimit", () => {
  /** @param {unknown} graphql */
  const answer = (graphql) => JSON.stringify({ resources: { core: {}, graphql } });

  it("reads the GraphQL bucket, with the reset in milliseconds", () => {
    expect(parseRateLimit(answer({ limit: 5000, remaining: 12, reset: 1_800_000_000 }))).toEqual({
      limit: 5000,
      remaining: 12,
      resetAt: 1_800_000_000_000,
    });
  });

  it("refuses anything that is not a rate_limit answer", () => {
    for (const text of ["", "not json", "{}", answer(null), answer({ limit: "5000" })]) {
      expect(parseRateLimit(text), text).toBeNull();
    }
  });
});

describe("limitedMessage", () => {
  it("tells the agent when to come back, and to stop retrying until then", () => {
    const message = limitedMessage(new Date(2026, 9, 24, 14, 31).getTime());
    expect(message).toContain("rate-limited until 14:31");
    expect(message).toMatch(/retry after/);
  });
});

describe("isBoardRead", () => {
  it("serves the JSON item list of the company's project from the snapshot", () => {
    expect(
      isBoardRead(["project", "item-list", "2", "--format", "json", "--limit", "200"], 2),
    ).toBe(true);
  });

  it("passes through what the snapshot cannot answer", () => {
    expect(isBoardRead(["project", "item-list", "2"], 2)).toBe(false); // table format
    expect(isBoardRead(["project", "item-list", "3", "--format", "json"], 2)).toBe(false);
    expect(isBoardRead(["project", "field-list", "2", "--format", "json"], 2)).toBe(false);
    expect(isBoardRead(["issue", "list", "--format", "json"], 2)).toBe(false);
  });

  it("passes through a list with a --jq or --template filter, which the snapshot would drop", () => {
    const list = ["project", "item-list", "2", "--format", "json"];
    for (const filter of [
      ["--jq", ".items[].id"],
      ["-q", ".items[].id"],
      ["--jq=.items[].id"],
      ["--template", "{{.}}"],
      ["-t", "{{.}}"],
      ["--template={{.}}"],
      ["-q.items"], // glued, found in review
      ["-t{{.}}"],
    ]) {
      expect(isBoardRead([...list, ...filter], 2), filter.join(" ")).toBe(false);
    }
  });
});

describe("parseBoardIds", () => {
  const recorded = JSON.stringify({
    projectId: "PVT_1",
    statusField: { id: "PVTSSF_1", options: { Ready: "aaa", Done: "bbb" } },
  });

  it("reads what claude-llc-init recorded", () => {
    const ids = parseBoardIds(recorded);
    expect(ids?.projectId).toBe("PVT_1");
    expect(ids?.fieldId).toBe("PVTSSF_1");
    expect(ids?.options.get("Ready")).toBe("aaa");
    expect(ids?.options.get("Done")).toBe("bbb");
  });

  it("is null rather than half-usable when anything is missing", () => {
    // jq turns a company.json without the ids into this.
    expect(parseBoardIds(JSON.stringify({ projectId: null, statusField: null }))).toBeNull();
    expect(parseBoardIds(JSON.stringify({ projectId: "PVT_1" }))).toBeNull();
    expect(
      parseBoardIds(JSON.stringify({ projectId: "PVT_1", statusField: { id: "F", options: {} } })),
    ).toBeNull();
    expect(parseBoardIds(undefined)).toBeNull();
    expect(parseBoardIds("")).toBeNull();
    expect(parseBoardIds("{")).toBeNull();
  });
});
