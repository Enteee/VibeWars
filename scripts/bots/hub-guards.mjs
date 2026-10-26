/**
 * The dynamic half of the merge gate.
 *
 * `hub-policy.mjs` decides whether a role may *attempt* something. These
 * functions decide whether the world is in a state where the attempt should
 * succeed — are the checks green, do the required sign-offs exist. They need
 * data from GitHub, so the daemon fetches it and passes it in; the decisions
 * themselves stay pure and tested, because both of them have a failure mode
 * that is invisible until it matters.
 *
 * See docs/adr/0015-agent-company.md.
 */

/**
 * @typedef {object} Approval
 * @property {number} pr
 * @property {string} role
 * @property {"approve" | "request-changes"} verdict
 * @property {string} sha   Head commit the verdict was cast against.
 * @property {number} ts
 */

/**
 * Were the checks we expect to exist actually run, and did they pass?
 *
 * Asking "did everything pass" is not enough, and this is the whole reason
 * the function exists. The CI/CD engineer can edit `.github/workflows/`, so an
 * agent under pressure to turn a red pull request green can do it by deleting
 * the check instead of fixing the code — and a pull request with no checks at
 * all reports no failures. So the expected set is named in
 * `.bots/company.json` and a missing check is treated exactly like a failing
 * one.
 *
 * A name more than one source reports is refused as ambiguous rather
 * than letting one entry win: a passing run some other workflow posted,
 * or a commit status, must never shadow a failing real one (#96).
 *
 * @param {{ name: string, conclusion: string }[]} checks One entry per
 *   source, as `checksFromRest` reads them, in gh's buckets.
 * @param {string[]} expected Check names that must be present and passing.
 * @returns {{ ok: boolean, missing: string[], failing: string[], pending: string[], ambiguous: string[] }}
 */
export function checksSatisfied(checks, expected) {
  const seen = new Map(checks.map((check) => [check.name, check.conclusion]));
  const ambiguous = [...seen.keys()]
    .filter((name) => checks.filter((check) => check.name === name).length > 1)
    .sort();
  for (const name of ambiguous) {
    seen.delete(name);
  }

  const missing = expected.filter((name) => !seen.has(name) && !ambiguous.includes(name));
  const failing = [];
  const pending = [];

  for (const [name, conclusion] of seen) {
    if (conclusion === "pass" || conclusion === "skipping") {
      continue;
    }
    if (conclusion === "pending") {
      pending.push(name);
    } else {
      failing.push(name);
    }
  }

  return {
    ok:
      missing.length === 0 &&
      failing.length === 0 &&
      pending.length === 0 &&
      ambiguous.length === 0,
    missing,
    failing: failing.sort(),
    pending: pending.sort(),
    ambiguous,
  };
}

/**
 * Does this pull request carry a current sign-off from every required role?
 *
 * "Current" is the subtle part. An approval is cast against a specific commit;
 * if the author then pushes more commits, that approval no longer describes
 * the code being merged. GitHub's own review system has a setting for this
 * ("dismiss stale reviews") precisely because the naive behaviour is a way to
 * merge unreviewed code: get approved, then push whatever you like. Our
 * ledger records the head SHA so the same trick does not work here.
 *
 * A `request-changes` verdict overrides an earlier `approve` from the same
 * role, so a reviewer can withdraw a sign-off it has already given.
 *
 * @param {Approval[]} ledger Every verdict ever recorded, any order.
 * @param {{ pr: number, sha: string, required: string[] }} target
 * @returns {{ ok: boolean, missing: string[], stale: string[], changesRequested: string[] }}
 */
export function approvalsSatisfied(ledger, target) {
  /** @type {Map<string, Approval>} */
  const latest = new Map();
  for (const entry of ledger) {
    if (entry.pr !== target.pr) {
      continue;
    }
    const previous = latest.get(entry.role);
    if (previous === undefined || entry.ts >= previous.ts) {
      latest.set(entry.role, entry);
    }
  }

  const missing = [];
  const stale = [];
  const changesRequested = [];

  for (const role of target.required) {
    const verdict = latest.get(role);
    if (verdict === undefined) {
      missing.push(role);
    } else if (verdict.verdict === "request-changes") {
      changesRequested.push(role);
    } else if (verdict.sha !== target.sha) {
      stale.push(role);
    }
  }

  return {
    ok: missing.length === 0 && stale.length === 0 && changesRequested.length === 0,
    missing,
    stale,
    changesRequested,
  };
}

/**
 * Does a push change only paths under `prefix`?
 *
 * The guard on a role that may push only one kind of file: the manager, who
 * ships skills and nothing else (#27). `paths` must list both sides of a
 * rename (hubd diffs with --no-renames), so moving a file out of `prefix`
 * shows up as a change outside it. A deletion inside is a change inside.
 *
 * @param {string} prefix a directory, ending in "/"
 * @param {readonly string[]} paths every path the push changes, relative to main
 * @returns {{ ok: boolean, outside: string[] }}
 */
export function pathsWithin(prefix, paths) {
  const outside = paths.filter((path) => !path.startsWith(prefix) || path.includes("/../"));
  return { ok: outside.length === 0, outside };
}

/**
 * Does a push leave every path under `prefixes` alone?
 *
 * The guard on every role but the one that owns those paths: workflows
 * and actions belong to cicd-engineer (#116). As with `pathsWithin`,
 * `paths` lists both sides of a rename, so moving a file out of a
 * prefix is a change to it.
 *
 * @param {readonly string[]} prefixes directories, each ending in "/"
 * @param {readonly string[]} paths every path the push changes, relative to main
 * @returns {{ ok: boolean, offending: string[] }}
 */
export function pathsOutside(prefixes, paths) {
  const offending = paths.filter((path) => prefixes.some((prefix) => path.startsWith(prefix)));
  return { ok: offending.length === 0, offending };
}

/**
 * Turn a guard name from the policy into a human sentence, for the refusal
 * the agent actually reads.
 *
 * An agent told only "refused" will retry; one told "perf-sec-qa has not
 * signed off" will go and ask for a review, which is the behaviour we want.
 *
 * @param {string} guard
 * @param {{ ok: boolean, missing?: string[], failing?: string[], pending?: string[], ambiguous?: string[], stale?: string[], changesRequested?: string[] }} result
 * @returns {string}
 */
export function explainGuard(guard, result) {
  const parts = [];
  if (result.missing !== undefined && result.missing.length > 0) {
    parts.push(`missing: ${result.missing.join(", ")}`);
  }
  if (result.failing !== undefined && result.failing.length > 0) {
    parts.push(`failing: ${result.failing.join(", ")}`);
  }
  if (result.pending !== undefined && result.pending.length > 0) {
    parts.push(`still running: ${result.pending.join(", ")}`);
  }
  if (result.ambiguous !== undefined && result.ambiguous.length > 0) {
    parts.push(`reported by more than one source: ${result.ambiguous.join(", ")}`);
  }
  if (result.stale !== undefined && result.stale.length > 0) {
    parts.push(`stale, cast against an older commit: ${result.stale.join(", ")}`);
  }
  if (result.changesRequested !== undefined && result.changesRequested.length > 0) {
    parts.push(`changes requested by: ${result.changesRequested.join(", ")}`);
  }
  return parts.length === 0 ? guard : `${guard} — ${parts.join("; ")}`;
}

/** Columns a card cannot reach from the Backlog without the architect's sign-off. */
const SIGNED_OFF = new Set(["In Progress", "In Review", "QA"]);

/**
 * May this role move a card between these columns (#349)? The column is the
 * architect's sign-off: a card leaves the Backlog for Ready only by the
 * architect's hand, and the architect makes no other move. Everything else
 * stays with the roles `hub-policy.mjs` lets edit an item.
 *
 * @param {{ role: string, from: string, to: string }} move column names; `""`
 *   is no column
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function boardMoveAllowed({ role, from, to }) {
  if (from === to) {
    return { ok: true };
  }
  const label = (/** @type {string} */ column) => (column === "" ? "no column" : column);
  const unsigned = from === "Backlog" || from === "";
  if (role === "architect") {
    return (unsigned && to === "Ready") ||
      (from === "Ready" && to === "Backlog") ||
      (from === "" && to === "Backlog")
      ? { ok: true }
      : {
          ok: false,
          reason: `the architect only signs off (Backlog -> Ready) or withdraws a sign-off (Ready -> Backlog), not ${label(from)} -> ${label(to)}`,
        };
  }
  if (unsigned && to === "Ready") {
    return {
      ok: false,
      reason:
        "only the architect moves a card from Backlog to Ready: that move is the sign-off. Ask the architect.",
    };
  }
  if ((from === "Ready" && to === "Backlog") || (from === "" && to === "Backlog")) {
    return role === "manager"
      ? { ok: true }
      : { ok: false, reason: `only the architect or the manager moves a card to the Backlog` };
  }
  if (unsigned && to === "Done") {
    return role === "manager"
      ? { ok: true }
      : {
          ok: false,
          reason: "only the manager closes a card that was never worked on. Ask the manager.",
        };
  }
  if (unsigned && SIGNED_OFF.has(to)) {
    return {
      ok: false,
      reason: `a card must be signed off into Ready by the architect before it can go to ${to}`,
    };
  }
  if ((to === "Backlog" || to === "") && !unsigned) {
    return role === "manager"
      ? { ok: true }
      : {
          ok: false,
          reason: `only the manager moves a card back to ${label(to)}. Ask the manager.`,
        };
  }
  return { ok: true };
}

/**
 * May `role` land a card, new to the board, in `to` (#517)? An issue is
 * judged as a move out of no column. A pull request is not signed off (its
 * issue is), so the manager may put it anywhere but Ready.
 *
 * @param {{ role: string, to: string, pull: boolean }} landing
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function landingAllowed({ role, to, pull }) {
  if (!pull) {
    return boardMoveAllowed({ role, from: "", to });
  }
  if (role !== "manager") {
    return { ok: false, reason: "only the manager puts a pull request on the board" };
  }
  return to === "Ready"
    ? { ok: false, reason: "a pull request is never in Ready: its issue is the one signed off" }
    : { ok: true };
}
