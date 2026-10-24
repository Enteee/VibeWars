/**
 * The merge gate's dynamic half.
 *
 * Both functions under test have a failure mode that looks like success,
 * which is why they are pure and why these tests exist: a pull request with
 * no checks reports no failures, and an approval cast before the author
 * pushed three more commits still reads as an approval.
 */
import { describe, expect, it } from "vitest";

import { approvalsSatisfied, checksSatisfied, explainGuard } from "./hub-guards.mjs";

const EXPECTED = ["format + lint + typecheck + test + build"];

/**
 * @param {string} name
 * @param {string} conclusion
 */
const check = (name, conclusion) => ({ name, conclusion });

describe("checksSatisfied", () => {
  it("passes when every expected check ran and passed", () => {
    expect(checksSatisfied([check(EXPECTED[0], "pass")], EXPECTED)).toMatchObject({ ok: true });
  });

  it("fails an empty check list, which is what deleting a job produces", () => {
    // The whole reason this function takes an expected set. "Nothing failed"
    // must not be the same answer as "everything passed".
    const verdict = checksSatisfied([], EXPECTED);

    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toStrictEqual(EXPECTED);
  });

  it("fails when an expected check is missing but others pass", () => {
    const verdict = checksSatisfied([check("some new job", "pass")], EXPECTED);

    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toStrictEqual(EXPECTED);
  });

  it("fails on a failing check", () => {
    const verdict = checksSatisfied([check(EXPECTED[0], "fail")], EXPECTED);

    expect(verdict).toMatchObject({ ok: false, failing: EXPECTED });
  });

  it("fails while a check is still running, rather than merging early", () => {
    const verdict = checksSatisfied([check(EXPECTED[0], "pending")], EXPECTED);

    expect(verdict).toMatchObject({ ok: false, pending: EXPECTED });
  });

  it("fails on an unexpected extra failing check", () => {
    const verdict = checksSatisfied([check(EXPECTED[0], "pass"), check("e2e", "fail")], EXPECTED);

    expect(verdict).toMatchObject({ ok: false, failing: ["e2e"] });
  });

  it("tolerates a skipped check", () => {
    expect(
      checksSatisfied([check(EXPECTED[0], "pass"), check("deploy", "skipping")], EXPECTED),
    ).toMatchObject({ ok: true });
  });

  it("passes with no expectations only when nothing is failing", () => {
    expect(checksSatisfied([], [])).toMatchObject({ ok: true });
    expect(checksSatisfied([check("x", "fail")], [])).toMatchObject({ ok: false });
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
