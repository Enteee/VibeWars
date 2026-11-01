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
 * The runs of one workflow file for exactly this commit, on a pull request,
 * from this repository (#96): every one of them, finished or not. `judgingRuns`
 * judges them; `hub watch` (#736) waits for them.
 *
 * @param {Record<string, unknown>[]} runs `workflow_runs` rows, as GitHub sends them
 * @param {{ sha: string, repo: string, file: string }} target
 * @returns {Record<string, unknown>[]}
 */
export function commitRuns(runs, target) {
  const path = `.github/workflows/${target.file}`;
  return runs.filter((run) => {
    const repository = /** @type {{ full_name?: unknown } | null} */ (run.repository);
    return (
      run.head_sha === target.sha &&
      run.event === "pull_request" &&
      typeof run.path === "string" &&
      (run.path === path || run.path.startsWith(`${path}@`)) &&
      repository?.full_name === target.repo &&
      typeof run.id === "number"
    );
  });
}

/**
 * The workflow runs that judged a commit, or why none can.
 *
 * Check runs and commit statuses are not evidence: any `GITHUB_TOKEN` with
 * `checks: write` can create one for any commit under any name (#123). A job
 * of a workflow run exists only because the workflow ran, and no API creates
 * one. So the merge gate reads jobs, and this picks the runs they belong to.
 *
 * A run counts when it ran for exactly this commit, on a pull request, from
 * this repository, out of the named workflow file. It returns **every** such
 * run, not the newest: a second pull request with the same head and a base
 * of its choosing gets its own green run for the same commit, and must not
 * stand in for the real one. With both runs read, the expected job names
 * appear twice and `jobsSatisfied` refuses them. A re-run is one run, so a
 * legitimate retry is unaffected.
 *
 * @param {Record<string, unknown>[]} runs `workflow_runs` rows, as GitHub sends them
 * A target marked `optional` is a workflow that starts only when a path filter
 * matches (e2e-repeat.yml, #1884): with no run at all there was nothing to
 * judge, so none is satisfied. Any run that exists is judged as before. The
 * caller reads it only after ci.yml has finished on the commit, long after
 * GitHub would have created a triggered run.
 *
 * @param {{ sha: string, repo: string, file: string, optional?: boolean }} target
 * @returns {{ ok: true, ids: number[] } | { ok: false, reason: string }}
 */
export function judgingRuns(runs, target) {
  const mine = commitRuns(runs, target);
  if (mine.length === 0 && target.optional === true) {
    return { ok: true, ids: [] };
  }
  if (mine.length === 0) {
    return { ok: false, reason: `${target.file} has not run on this commit yet` };
  }
  if (mine.some((run) => run.status !== "completed")) {
    return { ok: false, reason: `${target.file} is still running on this commit` };
  }
  // A run cancelled while queued has no jobs at all, and a second pull
  // request's green run would then carry every expected name by itself.
  // Every run must have ended well; a superseded one is re-run, or the
  // branch gets a new commit.
  const bad = mine.find((run) => run.conclusion !== "success");
  if (bad !== undefined) {
    return {
      ok: false,
      reason: `${target.file} run ${String(bad.id)} ended ${String(bad.conclusion)}; re-run it or push a new commit`,
    };
  }
  return { ok: true, ids: mine.map((run) => Number(run.id)) };
}

/**
 * Were the jobs we expect run, and did they pass?
 *
 * Asking "did everything pass" is not enough, and this is the whole reason
 * the function takes an expected set. The CI/CD engineer can edit
 * `.github/workflows/`, so a job deleted to turn a pull request green leaves
 * a run with no failures. The expected set is named in `.bots/company.json`
 * and a name no run carries is treated exactly like a failing job.
 *
 * Within one run a name must be carried by exactly one job. Across the runs
 * of a commit, every job that carries an expected name must have succeeded:
 * a second pull request's green run for the same commit (#123) cannot
 * stand in for a red real one, and a close and reopen, which makes a second
 * green run, still merges.
 *
 * @param {{ name: string, status: string, conclusion: string | null }[][]} runs
 *   The jobs of each judging run, latest attempt.
 * @param {string[]} expected Job names that must be present and successful.
 * @returns {{ ok: boolean, missing: string[], failing: string[], pending: string[], ambiguous: string[] }}
 */
export function jobsSatisfied(runs, expected) {
  const missing = [];
  const failing = [];
  const pending = [];
  const ambiguous = [];
  for (const name of expected) {
    const carried = runs.map((jobs) => jobs.filter((job) => job.name === name));
    if (carried.every((jobs) => jobs.length === 0)) {
      missing.push(name);
    }
    if (carried.some((jobs) => jobs.length > 1)) {
      ambiguous.push(name);
    }
    for (const job of carried.flat()) {
      if (job.status !== "completed") {
        pending.push(name);
      } else if (job.conclusion === "cancelled") {
        // A run a reopen superseded: its latest attempt must be re-run.
        failing.push(`${name} (cancelled; re-run that run or push a new commit)`);
      } else if (job.conclusion !== "success") {
        failing.push(`${name} (${String(job.conclusion)})`);
      }
    }
  }
  return {
    ok:
      missing.length === 0 &&
      failing.length === 0 &&
      pending.length === 0 &&
      ambiguous.length === 0,
    missing,
    failing: [...new Set(failing)],
    pending: [...new Set(pending)],
    ambiguous,
  };
}

/**
 * Did every job of these runs succeed?
 *
 * For the workflows the gate does not name job by job (the repeated e2e
 * specs, CodeQL): they used to block a merge while failing or pending, and
 * still do. A run with no jobs at all is no evidence, so it is missing.
 *
 * @param {{ name: string, status: string, conclusion: string | null }[][]} runs
 * @returns {{ ok: boolean, missing: string[], failing: string[], pending: string[] }}
 */
export function everyJobSucceeded(runs) {
  const jobs = runs.flat();
  const pending = jobs.filter((job) => job.status !== "completed").map((job) => job.name);
  const failing = jobs
    .filter((job) => job.status === "completed" && job.conclusion !== "success")
    .map((job) => `${job.name} (${String(job.conclusion)})`);
  const missing = runs.map((run, index) =>
    run.length === 0 ? `a run with no jobs (#${String(index + 1)})` : "",
  );
  const none = missing.filter((entry) => entry !== "");
  return {
    ok: pending.length === 0 && failing.length === 0 && none.length === 0,
    missing: none,
    failing,
    pending,
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
 * May qa-tester merge this pull request, as far as workflows go (#1897)?
 *
 * The company's token holds the `workflow` scope, so GitHub no longer
 * stops a merge that changes `.github/workflows/` or `.github/actions/`.
 * This does: such a pull request merges only when it was pushed, from this
 * repository, on a `bot/<employee>/` branch whose employee's role owns
 * every restricted prefix it touches, and is one of `authors`. Pushes are
 * already restricted the same way; this is the second lock, for a stale
 * merge base or a branch someone else pushed. Anything else is the
 * operator's to merge.
 *
 * @param {{
 *   pr: number,
 *   paths: readonly string[],
 *   headRefName: string,
 *   crossRepository: boolean,
 *   authors: readonly string[],
 *   restricted: Readonly<Record<string, readonly string[]>>,
 *   roleOf: (employee: string) => string | undefined,
 * }} pull `paths` is every path the pull request changes against main, both
 *   sides of a rename; `restricted` is `RESTRICTED_PATHS`; `roleOf` maps an
 *   employee to their role, from `staff.json`
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function workflowAuthorAllowed({
  pr,
  paths,
  headRefName,
  crossRepository,
  authors,
  restricted,
  roleOf,
}) {
  const prefixes = Object.keys(restricted);
  const touched = paths.filter((path) => prefixes.some((prefix) => path.startsWith(prefix)));
  if (touched.length === 0) {
    return { ok: true };
  }
  const hit = prefixes.filter((prefix) => touched.some((path) => path.startsWith(prefix)));
  const owners = [...new Set(hit.flatMap((prefix) => restricted[prefix] ?? []))];
  const employee = /^bot\/([^/]+)\//.exec(headRefName)?.[1];
  const role = employee === undefined ? undefined : roleOf(employee);
  const owns =
    role !== undefined &&
    authors.includes(role) &&
    hit.every((prefix) => restricted[prefix]?.includes(role) === true);
  if (!crossRepository && owns) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `#${String(pr)} changes ${touched.join(", ")}, pushed from ${crossRepository ? "another repository" : headRefName}; only the operator merges workflow changes not pushed by ${owners.join(", ")}`,
  };
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
