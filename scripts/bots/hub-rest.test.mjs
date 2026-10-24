/**
 * Translating gh's issue and PR reads to REST (issue #17, item 7).
 *
 * The dangerous direction is a request translated wrongly, not one left to
 * gh: gh's answer is always right, only more expensive. So most of these
 * check that anything not understood exactly falls back.
 */
import { describe, expect, it } from "vitest";

import {
  ghIssue,
  ghPull,
  listPath,
  listRows,
  planList,
  planView,
  renderView,
} from "./hub-rest.mjs";

describe("planView", () => {
  it("plans the reads agents make all day", () => {
    expect(planView(["issue", "view", "17"], false)).toEqual({
      group: "issue",
      number: 17,
      fields: null,
      comments: false,
      jq: null,
    });
    expect(planView(["issue", "view", "17", "--comments"], false)?.comments).toBe(true);
    expect(
      planView(["pr", "view", "25", "--json", "body,mergeStateStatus"], false)?.fields,
    ).toEqual(["body", "mergeStateStatus"]);
    expect(planView(["issue", "view", "1", "--json=comments"], false)?.comments).toBe(true);
  });

  it("takes --jq only when hubd has a jq to run it with", () => {
    const argv = ["issue", "view", "1", "--json", "body", "--jq", ".body"];
    expect(planView(argv, true)?.jq).toBe(".body");
    expect(planView(argv, false)).toBeNull();
  });

  it("leaves to gh what it cannot answer exactly", () => {
    for (const argv of [
      ["pr", "view", "25", "--json", "reviewDecision"], // no REST equivalent
      ["pr", "view", "25", "--json", "statusCheckRollup"],
      ["pr", "view", "bot/developer-1/issue-1"], // a branch, not a number
      ["issue", "view", "https://github.com/o/r/issues/1"],
      ["issue", "view", "1", "--web"],
      ["issue", "view", "1", "--template", "{{.title}}"],
      ["issue", "view"],
      ["issue", "view", "1", "2"],
      ["issue", "view", "1", "--jq", ".x"], // gh needs --json with --jq
      ["issue", "edit", "1"],
    ]) {
      expect(planView(argv, true), argv.join(" ")).toBeNull();
    }
  });
});

describe("planList", () => {
  it("plans the common lists", () => {
    expect(planList(["issue", "list", "--json", "number,title,author,url"])).toEqual({
      group: "issue",
      state: "open",
      mergedOnly: false,
      limit: 30,
      labels: [],
    });
    expect(
      planList([
        "issue",
        "list",
        "--state",
        "all",
        "-L",
        "5",
        "--label",
        "bug",
        "--json",
        "number",
      ]),
    ).toMatchObject({ state: "all", limit: 5, labels: ["bug"] });
  });

  it("leaves to gh what it cannot answer exactly", () => {
    for (const argv of [
      ["issue", "list", "--search", "rate limit", "--json", "number"],
      ["issue", "list", "--author", "x", "--json", "number"],
      ["issue", "list", "--json", "number,comments"], // a count in REST, a list in gh
      ["pr", "list", "--json", "number,reviewDecision"],
      ["pr", "list", "--label", "bug", "--json", "number"], // pulls cannot filter labels
      ["pr", "list", "--state", "merged", "--json", "number"],
      ["issue", "list", "--limit", "500", "--json", "number"],
      ["issue", "list", "--state", "sideways", "--json", "number"],
    ]) {
      expect(planList(argv), argv.join(" ")).toBeNull();
    }
  });
});

describe("REST answers in gh's shape", () => {
  const pull = {
    number: 9,
    title: "t",
    state: "closed",
    merged_at: "2026-10-24T14:00:00Z",
    html_url: "https://github.com/o/r/pull/9",
    user: { login: "Enteee" },
    head: { ref: "bot/x", sha: "abc" },
    base: { ref: "main" },
    additions: 1,
    deletions: 2,
    changed_files: 3,
    mergeable: null,
    mergeable_state: "unknown",
  };

  it("calls a merged pull request MERGED, as gh does, not closed", () => {
    expect(ghPull(pull).state).toBe("MERGED");
    expect(ghPull({ ...pull, merged_at: null }).state).toBe("CLOSED");
  });

  it("maps REST's nullable boolean mergeable to gh's enum", () => {
    expect(ghPull(pull).mergeable).toBe("UNKNOWN");
    expect(ghPull({ ...pull, mergeable: true }).mergeable).toBe("MERGEABLE");
    expect(ghPull({ ...pull, mergeable: false }).mergeable).toBe("CONFLICTING");
    expect(ghPull({ ...pull, mergeable_state: "dirty" }).mergeStateStatus).toBe("DIRTY");
  });

  it("upper-cases issue state", () => {
    expect(ghIssue({ number: 1, state: "open" }).state).toBe("OPEN");
  });

  it("drops pull requests from an issue list, as gh's issue list does", () => {
    const plan = planList(["issue", "list", "--json", "number"]);
    expect(plan).not.toBeNull();
    if (plan === null) {
      return;
    }
    const rows = listRows(plan, [{ number: 1 }, { number: 2, pull_request: {} }, { number: 3 }]);
    expect(rows.map((row) => row.number)).toEqual([1, 3]);
    expect(listPath(plan)).toBe("issues?state=open&per_page=100");
  });

  it("prints a plain view as metadata, a separator, then the body", () => {
    const text = renderView(
      "issue",
      ghIssue({ number: 1, title: "T", state: "open", body: "B" }),
      false,
    );
    expect(text).toMatch(/^title:\tT\nstate:\tOPEN\n/);
    expect(text.endsWith("--\nB\n")).toBe(true);
  });
});
