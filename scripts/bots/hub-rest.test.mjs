/**
 * Translating gh's issue and PR reads to REST (issue #17, item 7).
 *
 * The dangerous direction is a request translated wrongly, not one left to
 * gh: gh's answer is always right, only more expensive. So most of these
 * check that anything not understood exactly falls back.
 */
import fs from "node:fs";

import { describe, expect, it } from "vitest";

import {
  checksFromRest,
  ghIssue,
  ghPull,
  listPath,
  listRows,
  planList,
  pickJson,
  planView,
  renderView,
} from "./hub-rest.mjs";

describe("planView", () => {
  it("plans the reads agents make all day", () => {
    expect(planView(["issue", "view", "17"])).toEqual({
      group: "issue",
      number: 17,
      fields: null,
      comments: false,
    });
    expect(planView(["issue", "view", "17", "--comments"])?.comments).toBe(true);
    expect(planView(["pr", "view", "25", "--json", "body,mergeStateStatus"])?.fields).toEqual([
      "body",
      "mergeStateStatus",
    ]);
  });

  it("leaves fields gh shapes differently from REST to gh", () => {
    // gh's author has id, is_bot and name; its comments carry reactions and
    // flags REST lacks. Approximating them would break a script that parses
    // them, so those requests stay on GraphQL.
    for (const fields of ["author", "assignees", "comments", "title,author"]) {
      expect(planView(["issue", "view", "1", "--json", fields]), fields).toBeNull();
    }
  });

  it("never plans a request that carries an output filter", () => {
    // hub applies filters in the jail; one that reaches hubd is refused.
    expect(planView(["issue", "view", "1", "--json", "body", "--jq", ".body"])).toBeNull();
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
      ["issue", "view", "1", "--jq", ".x"],
      ["issue", "edit", "1"],
    ]) {
      expect(planView(argv), argv.join(" ")).toBeNull();
    }
  });
});

describe("planList", () => {
  it("plans the common lists", () => {
    // author and url are what hub adds for visibility; only title was asked.
    expect(planList(["issue", "list", "--json", "number,title,author,url"], ["title"])).toEqual({
      group: "issue",
      state: "open",
      mergedOnly: false,
      limit: 30,
      labels: [],
    });
    expect(
      planList(
        ["issue", "list", "--state", "all", "-L", "5", "--label", "bug", "--json", "number"],
        ["number"],
      ),
    ).toMatchObject({ state: "all", limit: 5, labels: ["bug"] });
  });

  it("leaves to gh what it cannot answer exactly", () => {
    for (const argv of [
      ["issue", "list", "--search", "rate limit", "--json", "number"],
      ["issue", "list", "--author", "x", "--json", "number"],
      ["issue", "list", "--json", "number,comments"], // a count in REST, a list in gh
      ["issue", "list", "--json", "number,author"], // gh's author has more in it
      ["pr", "list", "--json", "number,reviewDecision"],
      ["pr", "list", "--label", "bug", "--json", "number"], // pulls cannot filter labels
      ["pr", "list", "--state", "merged", "--json", "number"],
      ["issue", "list", "--limit", "500", "--json", "number"],
      ["issue", "list", "--state", "sideways", "--json", "number"],
    ]) {
      const at = argv.indexOf("--json");
      const requested = (argv[at + 1] ?? "").split(",");
      expect(planList(argv, requested), argv.join(" ")).toBeNull();
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
    const plan = planList(["issue", "list", "--json", "number"], ["number"]);
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

describe("golden: real REST answers against what gh said for the same items", () => {
  /**
   * GitHub's own REST answers for issue #1 and pull request #25, captured
   * from api.github.com (bodies trimmed). The expected values are what gh
   * itself reported for these items on 2026-10-24: `gh issue view 1 --json
   * state` said CLOSED, and hubd's approval of #25 was recorded against the
   * head gh gave, b02a5cc7. The rest follows gh's documented shapes.
   * Replace with a straight `gh … --json` capture when someone can run gh.
   *
   * @param {string} name
   * @returns {unknown}
   */
  const fixture = (name) =>
    JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

  it("maps issue #1 to gh's fields and values", () => {
    expect(
      JSON.parse(
        pickJson(ghIssue(fixture("rest-issue-1")), ["number", "title", "state", "url", "closedAt"]),
      ),
    ).toEqual({
      number: 1,
      title: "Remove all backwards compatibility, and instruct the agents never to add it",
      state: "CLOSED",
      url: "https://github.com/Enteee/VibeWars/issues/1",
      closedAt: "2026-10-24T14:47:27Z",
    });
  });

  it("maps pull request #25 to gh's fields and values, merged as MERGED", () => {
    expect(
      JSON.parse(
        pickJson(ghPull(fixture("rest-pull-25")), [
          "state",
          "headRefOid",
          "headRefName",
          "baseRefName",
          "isDraft",
          "mergedAt",
        ]),
      ),
    ).toEqual({
      state: "MERGED",
      headRefOid: "b02a5cc7c46c2eef027087626112d130e0e48e20",
      headRefName: "bot/developer-1/issue-1",
      baseRefName: "main",
      isDraft: false,
      mergedAt: "2026-10-24T14:47:26Z",
    });
  });
});

describe("checksFromRest", () => {
  /** @param {Record<string, unknown>[]} statuses */
  const status = (statuses = []) => ({ state: "pending", statuses });
  /** @param {Record<string, unknown>[]} list */
  const runs = (list) => ({ total_count: list.length, check_runs: list });

  it("puts check runs and legacy statuses into gh's buckets", () => {
    expect(
      checksFromRest(
        runs([
          { id: 1, name: "ci", status: "completed", conclusion: "success" },
          { id: 2, name: "lint", status: "queued", conclusion: null },
          { id: 3, name: "docs", status: "completed", conclusion: "skipped" },
          { id: 4, name: "e2e", status: "completed", conclusion: "cancelled" },
          { id: 5, name: "nix", status: "completed", conclusion: "timed_out" },
        ]),
        status([
          { context: "legacy", state: "success" },
          { context: "slow", state: "pending" },
          { context: "broken", state: "error" },
        ]),
      ),
    ).toEqual({
      checks: [
        { name: "ci", conclusion: "pass" },
        { name: "lint", conclusion: "pending" },
        { name: "docs", conclusion: "skipping" },
        { name: "e2e", conclusion: "cancel" },
        { name: "nix", conclusion: "fail" },
        { name: "legacy", conclusion: "pass" },
        { name: "slow", conclusion: "pending" },
        { name: "broken", conclusion: "fail" },
      ],
    });
  });

  it("counts only the newest run of a re-run check", () => {
    expect(
      checksFromRest(
        runs([
          { id: 9, name: "ci", status: "completed", conclusion: "success" },
          { id: 4, name: "ci", status: "completed", conclusion: "failure" },
        ]),
        status(),
      ),
    ).toEqual({ checks: [{ name: "ci", conclusion: "pass" }] });
  });

  it("refuses a first page that does not hold every run", () => {
    const one = [{ id: 1, name: "ci", status: "completed", conclusion: "success" }];
    expect(checksFromRest({ total_count: 101, check_runs: one }, status())).toEqual({
      error: "101 check runs, more than one page",
    });
  });

  it("never reads an answer of the wrong shape as no checks", () => {
    expect(checksFromRest({ message: "Not Found" }, status())).toHaveProperty("error");
    expect(checksFromRest(runs([]), { message: "Not Found" })).toHaveProperty("error");
    expect(checksFromRest(null, null)).toHaveProperty("error");
  });
});
