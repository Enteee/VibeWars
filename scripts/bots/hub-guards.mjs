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
 * The workflow run that judged a commit, or why none can.
 *
 * Check runs and commit statuses are not evidence: any `GITHUB_TOKEN` with
 * `checks: write` can create one for any commit under any name (#123). A job
 * of a workflow run exists only because the workflow ran, and no API creates
 * one. So the merge gate reads jobs, and this picks the run they belong to.
 *
 * A run counts when it ran for exactly this commit, on a pull request, from
 * this repository, out of the named workflow file. Of several the highest
 * `run_number` decides: a re-run is the same run, a newer push is a new one.
 *
 * @param {Record<string, unknown>[]} runs `workflow_runs` rows, as GitHub sends them
 * @param {{ sha: string, repo: string, file: string }} target
 * @returns {{ ok: true, id: number } | { ok: false, reason: string }}
 */
export function judgingRun(runs, target) {
  const path = `.github/workflows/${target.file}`;
  const mine = runs.filter((run) => {
    const repository = /** @type {{ full_name?: unknown } | null} */ (run.repository);
    return (
      run.head_sha === target.sha &&
      run.event === "pull_request" &&
      typeof run.path === "string" &&
      (run.path === path || run.path.startsWith(`${path}@`)) &&
      repository?.full_name === target.repo &&
      typeof run.id === "number" &&
      typeof run.run_number === "number"
    );
  });
  if (mine.length === 0) {
    return { ok: false, reason: `${target.file} has not run on this commit yet` };
  }
  const run = mine.reduce((best, next) =>
    Number(next.run_number) > Number(best.run_number) ? next : best,
  );
  if (run.status !== "completed") {
    return { ok: false, reason: `${target.file} is still running on this commit` };
  }
  return { ok: true, id: Number(run.id) };
}

/**
 * Were the jobs we expect run, and did they pass?
 *
 * Asking "did everything pass" is not enough, and this is the whole reason
 * the function takes an expected set. The CI/CD engineer can edit
 * `.github/workflows/`, so a job deleted to turn a pull request green leaves
 * a run with no failures. The expected set is named in `.bots/company.json`
 * and a missing job is treated exactly like a failing one. A name that two
 * jobs carry is refused too: one passing must never shadow the other.
 *
 * @param {{ name: string, status: string, conclusion: string | null }[]} jobs
 *   The jobs of the judging runs, latest attempt.
 * @param {string[]} expected Job names that must be present and successful.
 * @returns {{ ok: boolean, missing: string[], failing: string[], pending: string[], ambiguous: string[] }}
 */
export function jobsSatisfied(jobs, expected) {
  const missing = [];
  const failing = [];
  const pending = [];
  const ambiguous = [];
  for (const name of expected) {
    const named = jobs.filter((job) => job.name === name);
    const [job] = named;
    if (job === undefined) {
      missing.push(name);
    } else if (named.length > 1) {
      ambiguous.push(name);
    } else if (job.status !== "completed") {
      pending.push(name);
    } else if (job.conclusion !== "success") {
      failing.push(`${name} (${String(job.conclusion)})`);
    }
  }
  return {
    ok:
      missing.length === 0 &&
      failing.length === 0 &&
      pending.length === 0 &&
      ambiguous.length === 0,
    missing,
    failing,
    pending,
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
    parts.push(`carried by more than one job: ${result.ambiguous.join(", ")}`);
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

const BLOCKED = "Blocked";

/** Columns a card may be Blocked from. */
const BLOCKABLE = new Set(["Backlog", "Ready", "In Progress", "In Review", "QA"]);

/**
 * Blocked (#639) sits outside the flow and is the manager's alone. A card goes
 * in from any working column, and comes out to where it came from, to Backlog
 * or to Done: never to Ready (the architect's sign-off) by way of Blocked.
 *
 * @param {{ role: string, from: string, to: string, blockedFrom: string | null }} move
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function blockedMoveAllowed({ role, from, to, blockedFrom }) {
  if (role !== "manager") {
    return {
      ok: false,
      reason: "only the manager moves a card to or from Blocked. Ask the manager.",
    };
  }
  if (to === BLOCKED) {
    return BLOCKABLE.has(from)
      ? { ok: true }
      : { ok: false, reason: `a card in ${from === "" ? "no column" : from} cannot be Blocked` };
  }
  if (to === "Backlog" || to === "Done" || to === blockedFrom) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `a Blocked card goes back to ${blockedFrom === null ? "" : `${blockedFrom}, to `}Backlog or to Done, not to ${to === "" ? "no column" : to}`,
  };
}

/**
 * May this role move a card between these columns (#349)? The column is the
 * architect's sign-off: a card leaves the Backlog for Ready only by the
 * architect's hand, and the architect makes no other move. Everything else
 * stays with the roles `hub-policy.mjs` lets edit an item.
 *
 * @param {{ role: string, from: string, to: string, blockedFrom?: string | null }} move
 *   column names; `""` is no column. `blockedFrom` is the column a Blocked card
 *   came from, or null when hubd has no record of it (#639)
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function boardMoveAllowed({ role, from, to, blockedFrom = null }) {
  if (from === to) {
    return { ok: true };
  }
  if (from === BLOCKED || to === BLOCKED) {
    return blockedMoveAllowed({ role, from, to, blockedFrom });
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
  if (to === BLOCKED) {
    return { ok: false, reason: "a card is Blocked from a column it is already in" };
  }
  if (role !== "manager") {
    return { ok: false, reason: "only the manager puts a pull request on the board" };
  }
  return to === "Ready"
    ? { ok: false, reason: "a pull request is never in Ready: its issue is the one signed off" }
    : { ok: true };
}
