/**
 * The merge gate's dynamic half.
 *
 * Both functions under test have a failure mode that looks like success,
 * which is why they are pure and why these tests exist: a pull request with
 * no checks reports no failures, and an approval cast before the author
 * pushed three more commits still reads as an approval.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  approvalsSatisfied,
  boardMoveAllowed,
  everyJobSucceeded,
  jobsSatisfied,
  judgingRuns,
  explainGuard,
  landingAllowed,
  pathsOutside,
  pathsWithin,
  workflowAuthorAllowed,
} from "./hub-guards.mjs";
import { RESTRICTED_PATHS } from "./hub-policy.mjs";

const HEAD = "abc1234def";
const REPO = "Enteee/VibeWars";

/** @param {Record<string, unknown>} over */
const run = (over = {}) => ({
  id: 10,
  head_sha: HEAD,
  event: "pull_request",
  path: ".github/workflows/ci.yml",
  repository: { full_name: REPO },
  run_number: 5,
  status: "completed",
  conclusion: "success",
  ...over,
});

/** @param {Record<string, unknown>[]} runs */
const judged = (runs) => judgingRuns(runs, { sha: HEAD, repo: REPO, file: "ci.yml" });

describe("judgingRuns", () => {
  it("takes the completed pull_request run of this workflow on this commit", () => {
    expect(judged([run()])).toEqual({ ok: true, ids: [10] });
  });

  it("blocks when CI has not run yet, which is what a forged check run looks like", () => {
    expect(judged([])).toEqual({
      ok: false,
      reason: "ci.yml has not run on this commit yet",
    });
  });

  it("an optional workflow with no run is satisfied; one that ran is still judged (#1884)", () => {
    /** @param {Record<string, unknown>[]} runs */
    const optional = (runs) =>
      judgingRuns(runs, { sha: HEAD, repo: REPO, file: "ci.yml", optional: true });
    expect(optional([])).toEqual({ ok: true, ids: [] });
    expect(optional([run()])).toEqual({ ok: true, ids: [10] });
    expect(optional([run({ status: "in_progress" })]).ok).toBe(false);
    expect(optional([run({ conclusion: "failure" })]).ok).toBe(false);
  });

  it("ignores a push run, another path, another sha and another repository", () => {
    for (const over of [
      { event: "push" },
      { path: ".github/workflows/forged.yml" },
      { head_sha: "fffffff" },
      { repository: { full_name: "evil/fork" } },
    ]) {
      expect(judged([run(over)])).toMatchObject({ ok: false });
    }
  });

  it("blocks a run that was cancelled or failed, even with jobs missing", () => {
    for (const conclusion of ["cancelled", "failure", null]) {
      const verdict = judged([run({ id: 1, conclusion }), run({ id: 2 })]);

      expect(verdict).toMatchObject({ ok: false });
      expect(verdict).toHaveProperty("reason", expect.stringMatching(/^ci\.yml run 1 ended /));
    }
  });

  it("accepts the path GitHub gives with a ref suffix", () => {
    expect(judged([run({ path: ".github/workflows/ci.yml@refs/pull/9/merge" })])).toMatchObject({
      ok: true,
    });
  });

  it("blocks while the run is still going", () => {
    expect(judged([run({ status: "in_progress", conclusion: null })])).toEqual({
      ok: false,
      reason: "ci.yml is still running on this commit",
    });
  });

  it("returns every run for the commit, so a second pull request's run cannot stand in", () => {
    expect(judged([run({ id: 1 }), run({ id: 2, run_number: 6 })])).toEqual({
      ok: true,
      ids: [1, 2],
    });
    expect(judged([run({ id: 1 }), run({ id: 2, status: "queued" })])).toMatchObject({
      ok: false,
    });
  });
});

describe("jobsSatisfied", () => {
  /** @param {string} name @param {string | null} conclusion @param {string} status */
  const job = (name, conclusion = "success", status = "completed") => ({
    name,
    status,
    conclusion,
  });
  const REQUIRED = [
    "format + lint + typecheck + test + build",
    "git hooks",
    "dependency review",
    "e2e",
  ];
  const all = REQUIRED.map((name) => job(name));

  it("passes when every expected job succeeded", () => {
    expect(jobsSatisfied([all], REQUIRED)).toMatchObject({ ok: true });
  });

  it("fails an empty run, which is what deleting every job produces", () => {
    expect(jobsSatisfied([[]], REQUIRED)).toMatchObject({ ok: false, missing: REQUIRED });
  });

  it("fails when an expected job is missing but others pass", () => {
    const verdict = jobsSatisfied([all.filter((j) => j.name !== "e2e")], REQUIRED);

    expect(verdict).toMatchObject({ ok: false, missing: ["e2e"] });
  });

  it("names the conclusion of a failed or skipped job", () => {
    for (const conclusion of ["failure", "skipped"]) {
      const verdict = jobsSatisfied(
        [[...all.slice(1), job(REQUIRED[0] ?? "", conclusion)]],
        REQUIRED,
      );

      expect(verdict).toMatchObject({
        ok: false,
        failing: [`${REQUIRED[0] ?? ""} (${conclusion})`],
      });
    }
  });

  it("fails while a job is still running", () => {
    const verdict = jobsSatisfied(
      [[...all.slice(1), job(REQUIRED[0] ?? "", null, "in_progress")]],
      REQUIRED,
    );

    expect(verdict).toMatchObject({ ok: false, pending: [REQUIRED[0]] });
  });

  it("refuses a name two jobs carry, so a passing one cannot shadow a failing one", () => {
    const verdict = jobsSatisfied([[...all, job("e2e", "failure")]], REQUIRED);

    expect(verdict).toMatchObject({ ok: false, ambiguous: ["e2e"] });
  });

  it("refuses a second run's failing job beside a green real one, and the reverse", () => {
    const red = all.map((j) => (j.name === "e2e" ? job("e2e", "failure") : j));

    expect(jobsSatisfied([all, red], REQUIRED)).toMatchObject({
      ok: false,
      failing: ["e2e (failure)"],
    });
    expect(jobsSatisfied([red, all], REQUIRED)).toMatchObject({
      ok: false,
      failing: ["e2e (failure)"],
    });
  });

  it("passes two green runs of one commit, which is what a close and reopen makes", () => {
    expect(jobsSatisfied([all, all], REQUIRED)).toMatchObject({ ok: true });
  });

  it("blocks a cancelled superseded run, and says how to clear it", () => {
    const cancelled = all.map((j) => (j.name === "e2e" ? job("e2e", "cancelled") : j));
    const verdict = jobsSatisfied([cancelled, all], REQUIRED);

    expect(verdict).toMatchObject({ ok: false });
    expect(verdict.failing[0]).toMatch(/^e2e \(cancelled; re-run that run or push a new commit\)$/);
  });

  it("takes an expected name from whichever run carries it", () => {
    const ci = all.slice(0, 2);
    const rest = all.slice(2);

    expect(jobsSatisfied([ci, rest], REQUIRED)).toMatchObject({ ok: true });
  });

  it("passes with no expectations", () => {
    expect(jobsSatisfied([[]], [])).toMatchObject({ ok: true });
  });
});

describe("everyJobSucceeded", () => {
  /** @param {string} name @param {string | null} conclusion @param {string} status */
  const job = (name, conclusion = "success", status = "completed") => ({
    name,
    status,
    conclusion,
  });

  it("passes when every job of every run succeeded", () => {
    expect(everyJobSucceeded([[job("a"), job("b")], [job("c")]])).toMatchObject({ ok: true });
  });

  it("fails a failed, skipped or cancelled job, and one still running, naming it", () => {
    expect(everyJobSucceeded([[job("a"), job("b", "failure")]])).toMatchObject({
      ok: false,
      failing: ["b (failure)"],
    });
    expect(everyJobSucceeded([[job("a", "skipped")]])).toMatchObject({ ok: false });
    expect(everyJobSucceeded([[job("a", null, "in_progress")]])).toMatchObject({
      ok: false,
      pending: ["a"],
    });
  });

  it("does not take a run with no jobs for a pass", () => {
    expect(everyJobSucceeded([[]])).toMatchObject({ ok: false });
  });
});

describe("the expected checks are the jobs the workflows define", () => {
  const dir = path.join(import.meta.dirname, "..", "..", ".github", "workflows");
  /** @param {string} file */
  const jobNames = (file) =>
    [...fs.readFileSync(path.join(dir, file), "utf8").matchAll(/^ {4}name: (.+)$/gm)].map(
      (m) => m[1] ?? "",
    );
  const source = fs.readFileSync(path.join(import.meta.dirname, "company-init.mjs"), "utf8");
  const listed = /const EXPECTED_CHECKS = \[([^\]]*)\]/.exec(source)?.[1] ?? "";
  const expected = [...listed.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");

  it("renaming a job cannot silently block or bypass merges", () => {
    const defined = [...jobNames("ci.yml"), ...jobNames("dependency-review.yml")];

    expect(expected.length).toBeGreaterThan(0);
    expect([...expected].sort()).toEqual([...defined].sort());
  });
});

describe("approvalsSatisfied", () => {
  const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const OLDER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const required = ["lead-dev", "perf-sec-qa"];

  /**
   * @param {string} role
   * @param {"approve" | "request-changes"} verdict
   * @param {string} sha
   * @param {number} ts
   */
  const entry = (role, verdict, sha, ts) => ({ pr: 22, role, verdict, sha, ts });

  it("passes when both reviewers approved the current commit", () => {
    const ledger = [entry("lead-dev", "approve", SHA, 1), entry("perf-sec-qa", "approve", SHA, 2)];

    expect(approvalsSatisfied(ledger, { pr: 22, sha: SHA, required })).toMatchObject({ ok: true });
  });

  it("fails when one reviewer has not looked", () => {
    const verdict = approvalsSatisfied([entry("lead-dev", "approve", SHA, 1)], {
      pr: 22,
      sha: SHA,
      required,
    });

    expect(verdict).toMatchObject({ ok: false, missing: ["perf-sec-qa"] });
  });

  it("fails an approval cast against an older commit", () => {
    // Without this, "get approved, then push whatever you like" merges
    // unreviewed code. GitHub has a setting for the same hazard.
    const verdict = approvalsSatisfied(
      [entry("lead-dev", "approve", OLDER, 1), entry("perf-sec-qa", "approve", SHA, 2)],
      { pr: 22, sha: SHA, required },
    );

    expect(verdict).toMatchObject({ ok: false, stale: ["lead-dev"] });
  });

  it("fails while changes are requested, even alongside an approval", () => {
    const verdict = approvalsSatisfied(
      [entry("lead-dev", "approve", SHA, 1), entry("perf-sec-qa", "request-changes", SHA, 2)],
      { pr: 22, sha: SHA, required },
    );

    expect(verdict).toMatchObject({ ok: false, changesRequested: ["perf-sec-qa"] });
  });

  it("lets a reviewer withdraw an approval it already gave", () => {
    const verdict = approvalsSatisfied(
      [
        entry("lead-dev", "approve", SHA, 1),
        entry("perf-sec-qa", "approve", SHA, 2),
        entry("perf-sec-qa", "request-changes", SHA, 3),
      ],
      { pr: 22, sha: SHA, required },
    );

    expect(verdict).toMatchObject({ ok: false, changesRequested: ["perf-sec-qa"] });
  });

  it("lets a reviewer approve after having requested changes", () => {
    const verdict = approvalsSatisfied(
      [
        entry("lead-dev", "approve", SHA, 1),
        entry("perf-sec-qa", "request-changes", SHA, 2),
        entry("perf-sec-qa", "approve", SHA, 3),
      ],
      { pr: 22, sha: SHA, required },
    );

    expect(verdict).toMatchObject({ ok: true });
  });

  it("ignores verdicts belonging to a different pull request", () => {
    const ledger = [
      { pr: 99, role: "lead-dev", verdict: "approve", sha: SHA, ts: 1 },
      { pr: 99, role: "perf-sec-qa", verdict: "approve", sha: SHA, ts: 2 },
    ];

    expect(
      approvalsSatisfied(/** @type {never} */ (ledger), { pr: 22, sha: SHA, required }),
    ).toMatchObject({ ok: false, missing: required });
  });

  it("takes the latest verdict regardless of ledger order", () => {
    const verdict = approvalsSatisfied(
      [
        entry("lead-dev", "approve", SHA, 5),
        entry("perf-sec-qa", "approve", SHA, 9),
        entry("perf-sec-qa", "request-changes", SHA, 2),
      ],
      { pr: 22, sha: SHA, required },
    );

    expect(verdict).toMatchObject({ ok: true });
  });

  it("fails an empty ledger", () => {
    expect(approvalsSatisfied([], { pr: 22, sha: SHA, required })).toMatchObject({
      ok: false,
      missing: required,
    });
  });
});

describe("explainGuard", () => {
  it("tells the agent what to chase, not merely that it was refused", () => {
    // An agent told only "refused" retries. One told which reviewer is
    // missing goes and asks for a review.
    expect(explainGuard("approval from perf-sec-qa", { ok: false, missing: ["perf-sec-qa"] })).toBe(
      "approval from perf-sec-qa — missing: perf-sec-qa",
    );

    expect(explainGuard("checks", { ok: false, failing: ["lint"], pending: ["e2e"] })).toBe(
      "checks — failing: lint; still running: e2e",
    );

    expect(explainGuard("approval from lead-dev", { ok: false, stale: ["lead-dev"] })).toBe(
      "approval from lead-dev — stale, cast against an older commit: lead-dev",
    );
  });

  it("falls back to the bare guard name when there is nothing to add", () => {
    expect(explainGuard("checks-green", { ok: true })).toBe("checks-green");
  });
});

describe("pathsOutside", () => {
  const CI = [".github/workflows/", ".github/actions/"];

  it("allows a push that leaves every prefix alone", () => {
    expect(pathsOutside(CI, ["README.md", ".github/CODEOWNERS", ".githubx/workflows/a"])).toEqual({
      ok: true,
      offending: [],
    });
  });

  it("refuses any change under any prefix, a deletion included", () => {
    expect(
      pathsOutside(CI, [
        "src/a.ts",
        ".github/workflows/ci.yml",
        ".github/actions/devenv/action.yml",
      ]),
    ).toEqual({
      ok: false,
      offending: [".github/workflows/ci.yml", ".github/actions/devenv/action.yml"],
    });
  });
});

describe("pathsWithin", () => {
  const SKILLS = ".claude/bots/skills/";

  it("allows changes, additions and deletions inside the directory", () => {
    expect(
      pathsWithin(SKILLS, [
        ".claude/bots/skills/fresh-branch/SKILL.md",
        ".claude/bots/skills/new-one/SKILL.md",
      ]),
    ).toEqual({ ok: true, outside: [] });
  });

  it("refuses a file outside it", () => {
    expect(
      pathsWithin(SKILLS, [".claude/bots/skills/a/SKILL.md", "scripts/bots/hubd.mjs"]),
    ).toEqual({ ok: false, outside: ["scripts/bots/hubd.mjs"] });
  });

  it("refuses a rename out of the directory, seen as a delete and an add", () => {
    // hubd diffs with --no-renames, so a move lists both of its sides.
    expect(
      pathsWithin(SKILLS, [".claude/bots/skills/a/SKILL.md", ".claude/bots/manager.md"]).outside,
    ).toEqual([".claude/bots/manager.md"]);
  });

  it("is not fooled by a sibling whose name starts the same", () => {
    expect(pathsWithin(SKILLS, [".claude/bots/skills-evil/x"]).ok).toBe(false);
    expect(pathsWithin(SKILLS, [".claude/bots/skills/../manager.md"]).ok).toBe(false);
  });

  it("allows a push that changes nothing", () => {
    expect(pathsWithin(SKILLS, [])).toEqual({ ok: true, outside: [] });
  });
});

describe("boardMoveAllowed (#349)", () => {
  /**
   * @param {string} role
   * @param {string} from
   * @param {string} to
   */
  const ok = (role, from, to) => boardMoveAllowed({ role, from, to }).ok;

  it("lets only the architect sign a card off into Ready", () => {
    expect(ok("architect", "Backlog", "Ready")).toBe(true);
    expect(ok("architect", "", "Ready")).toBe(true);
    for (const role of ["manager", "developer", "lead-dev", "qa-tester"]) {
      expect(ok(role, "Backlog", "Ready"), role).toBe(false);
      expect(ok(role, "", "Ready"), role).toBe(false);
    }
    expect(boardMoveAllowed({ role: "manager", from: "Backlog", to: "Ready" })).toEqual({
      ok: false,
      reason:
        "only the architect moves a card from Backlog to Ready: that move is the sign-off. Ask the architect.",
    });
  });

  it("lets the architect and the manager withdraw a sign-off or file a card", () => {
    for (const role of ["architect", "manager"]) {
      expect(ok(role, "Ready", "Backlog"), role).toBe(true);
      expect(ok(role, "", "Backlog"), role).toBe(true);
    }
    expect(ok("developer", "Ready", "Backlog")).toBe(false);
    expect(ok("developer", "", "Backlog")).toBe(false);
  });

  it("lets only the manager close a card nobody worked on", () => {
    expect(ok("manager", "Backlog", "Done")).toBe(true);
    expect(ok("developer", "Backlog", "Done")).toBe(false);
  });

  it("lets nobody skip Ready", () => {
    for (const role of ["manager", "architect", "developer", "lead-dev"]) {
      for (const to of ["In Progress", "In Review", "QA"]) {
        expect(ok(role, "Backlog", to), `${role} ${to}`).toBe(false);
        expect(ok(role, "", to), `${role} ${to}`).toBe(false);
      }
    }
  });

  it("lets only the manager send a started card back to the Backlog", () => {
    expect(ok("manager", "In Progress", "Backlog")).toBe(true);
    expect(ok("developer", "In Progress", "Backlog")).toBe(false);
    expect(ok("developer", "Done", "")).toBe(false);
  });

  it("holds the architect to the two architect moves", () => {
    for (const [from, to] of [
      ["Ready", "In Progress"],
      ["Ready", "Done"],
      ["Backlog", "Done"],
      ["In Review", "Ready"],
      ["QA", "Done"],
    ]) {
      expect(ok("architect", from ?? "", to ?? ""), `${String(from)} -> ${String(to)}`).toBe(false);
    }
  });

  it("leaves every other move to the roles that may edit an item", () => {
    expect(ok("developer", "Ready", "In Progress")).toBe(true);
    expect(ok("qa-tester", "QA", "Done")).toBe(true);
    expect(ok("developer", "In Progress", "Ready")).toBe(true);
  });

  it("is a no-op for the same column", () => {
    expect(ok("developer", "Backlog", "Backlog")).toBe(true);
    expect(ok("architect", "Done", "Done")).toBe(true);
  });
});

describe("boardMoveAllowed: Blocked (#639)", () => {
  /**
   * @param {string} role
   * @param {string} from
   * @param {string} to
   * @param {string | null} [blockedFrom]
   */
  const ok = (role, from, to, blockedFrom = null) =>
    boardMoveAllowed({ role, from, to, blockedFrom }).ok;
  const working = ["Backlog", "Ready", "In Progress", "In Review", "QA"];

  it("refuses every role but the manager, in and out", () => {
    for (const role of ["architect", "developer", "lead-dev", "qa-tester", "cicd-engineer"]) {
      for (const from of working) {
        expect(ok(role, from, "Blocked"), `${role} ${from}`).toBe(false);
      }
      for (const to of ["Backlog", "Done", "QA"]) {
        expect(ok(role, "Blocked", to, "QA"), `${role} ${to}`).toBe(false);
      }
    }
    expect(boardMoveAllowed({ role: "developer", from: "QA", to: "Blocked" })).toEqual({
      ok: false,
      reason: "only the manager moves a card to or from Blocked. Ask the manager.",
    });
  });

  it("lets the manager block a card from each working column, not from Done or nowhere", () => {
    for (const from of working) {
      expect(ok("manager", from, "Blocked"), from).toBe(true);
    }
    expect(ok("manager", "Done", "Blocked")).toBe(false);
    expect(ok("manager", "", "Blocked")).toBe(false);
  });

  it("lets a Blocked card out to its origin, the Backlog or Done only", () => {
    expect(ok("manager", "Blocked", "In Review", "In Review")).toBe(true);
    expect(ok("manager", "Blocked", "Backlog", "QA")).toBe(true);
    expect(ok("manager", "Blocked", "Done", "QA")).toBe(true);
    expect(ok("manager", "Blocked", "Ready", "QA")).toBe(false);
    expect(ok("manager", "Blocked", "In Progress", "QA")).toBe(false);
    expect(ok("manager", "Blocked", "", "QA")).toBe(false);
  });

  it("lets a card with no record out to the Backlog or Done only", () => {
    expect(ok("manager", "Blocked", "Backlog")).toBe(true);
    expect(ok("manager", "Blocked", "Done")).toBe(true);
    expect(ok("manager", "Blocked", "QA")).toBe(false);
    expect(ok("manager", "Blocked", "Ready")).toBe(false);
  });

  it("does not let Blocked bypass the sign-off: Backlog -> Blocked -> Ready", () => {
    expect(ok("manager", "Backlog", "Blocked")).toBe(true);
    expect(ok("manager", "Blocked", "Ready", "Backlog")).toBe(false);
  });
});

describe("landingAllowed (#517)", () => {
  const ok = (/** @type {string} */ role, /** @type {string} */ to, /** @type {boolean} */ pull) =>
    landingAllowed({ role, to, pull }).ok;

  it("judges an issue as a move out of no column", () => {
    expect(ok("manager", "Backlog", false)).toBe(true);
    expect(ok("manager", "Ready", false)).toBe(false);
    expect(ok("manager", "In Review", false)).toBe(false);
  });

  it("lets the manager put a pull request anywhere but Ready", () => {
    expect(ok("manager", "In Review", true)).toBe(true);
    expect(ok("manager", "Ready", true)).toBe(false);
    expect(ok("developer", "In Review", true)).toBe(false);
  });
});

describe("workflowAuthorAllowed", () => {
  const STAFF = new Map([
    ["cicd-engineer", "cicd-engineer"],
    ["cicd-engineer@2", "cicd-engineer"],
    ["developer", "developer"],
  ]);
  /** @param {{ paths: string[], headRefName: string, crossRepository?: boolean }} pull */
  const judge = ({ paths, headRefName, crossRepository = false }) =>
    workflowAuthorAllowed({
      pr: 7,
      paths,
      headRefName,
      crossRepository,
      authors: ["cicd-engineer"],
      restricted: RESTRICTED_PATHS,
      roleOf: (employee) => STAFF.get(employee),
    });

  it("passes a pull request that changes no restricted path, from any branch", () => {
    expect(
      judge({ paths: ["apps/web/src/main.ts"], headRefName: "bot/developer/issue-1" }),
    ).toEqual({ ok: true });
  });

  it("passes a workflow change from a cicd-engineer branch", () => {
    expect(
      judge({ paths: [".github/workflows/ci.yml"], headRefName: "bot/cicd-engineer/issue-1" }),
    ).toEqual({ ok: true });
  });

  it("passes a workflow change from a second cicd-engineer's branch", () => {
    expect(
      judge({ paths: [".github/workflows/ci.yml"], headRefName: "bot/cicd-engineer@2/issue-1" }),
    ).toEqual({ ok: true });
  });

  it("refuses a workflow change from a developer's branch", () => {
    expect(
      judge({
        paths: ["apps/web/src/main.ts", ".github/workflows/ci.yml"],
        headRefName: "bot/developer/issue-1",
      }),
    ).toEqual({
      ok: false,
      reason:
        "#7 changes .github/workflows/ci.yml, pushed from bot/developer/issue-1; only the operator merges workflow changes not pushed by cicd-engineer",
    });
  });

  it("refuses a cicd-engineer branch from another repository", () => {
    expect(
      judge({
        paths: [".github/workflows/ci.yml"],
        headRefName: "bot/cicd-engineer/issue-1",
        crossRepository: true,
      }),
    ).toEqual({
      ok: false,
      reason:
        "#7 changes .github/workflows/ci.yml, pushed from another repository; only the operator merges workflow changes not pushed by cicd-engineer",
    });
  });

  it("treats a change to .github/actions/ alone the same way", () => {
    const paths = [".github/actions/setup/action.yml"];

    expect(judge({ paths, headRefName: "bot/cicd-engineer/issue-1" })).toEqual({ ok: true });
    expect(judge({ paths, headRefName: "bot/developer/issue-1" })).toMatchObject({ ok: false });
  });

  it("refuses a branch named for nobody on the staff, or for no employee", () => {
    const paths = [".github/workflows/ci.yml"];

    expect(judge({ paths, headRefName: "bot/cicd-engineer@9/issue-1" })).toMatchObject({
      ok: false,
    });
    expect(judge({ paths, headRefName: "cicd-engineer/issue-1" })).toMatchObject({ ok: false });
  });

  it("counts the old side of a rename out of .github/workflows/", () => {
    expect(
      judge({
        paths: [".github/workflows/ci.yml", "docs/ci.yml"],
        headRefName: "bot/developer/issue-1",
      }),
    ).toMatchObject({ ok: false });
  });
});
