/**
 * What a release branch may hold (#2707), checked by hubd before it pushes
 * a `release/0.N.0` branch for the release manager.
 *
 * A release is frozen from main and then takes fixes from main only: the
 * branch starts at a commit on main, no earlier than the last release's
 * start, and every commit after that is a `git cherry-pick -x` of one of
 * main's commits, with the same change, each picked once. So nothing reaches
 * a release that was not reviewed and merged on main first.
 *
 * "The same change" is the same file before and after, blob for blob, at
 * every path the commit touches. A patch-id would not do: it ignores where a
 * hunk lands, so a guard line deleted from one of two identical stretches of
 * a file matches a deletion from the other. So a fix whose files moved on
 * main since the freeze is refused, and waits for the next release. Merge
 * commits are refused: a merge can carry anything past a per-commit check.
 * Every sha handled here is a full one hubd resolved itself, never a name an
 * agent chose.
 */

/** @typedef {{ code: number, stdout: string, stderr: string }} Ran */
/**
 * @typedef {object} Git git in hubd's mirror
 * @property {(args: string[]) => Promise<Ran>} git
 */

/** The line `git cherry-pick -x` adds. */
const PICKED = /^\(cherry picked from commit ([^)]*)\)$/gm;

/**
 * @param {Git} repo
 * @param {string} ancestor
 * @param {string} descendant
 * @returns {Promise<boolean>}
 */
async function isAncestor(repo, ancestor, descendant) {
  return (await repo.git(["merge-base", "--is-ancestor", ancestor, descendant])).code === 0;
}

/**
 * @param {Git} repo
 * @param {string} sha
 * @returns {Promise<number | null>} how many parents it has, or null if it is no commit
 */
async function parentCount(repo, sha) {
  const listed = await repo.git(["rev-list", "--parents", "-n", "1", sha]);
  return listed.code === 0 ? listed.stdout.trim().split(" ").length - 1 : null;
}

/**
 * A single-parent commit's change, exactly: each path it touches, with its
 * mode and blob before and after. `""` for an empty change, null if it
 * cannot be read. Raw output runs no diff driver, which a `.gitattributes`
 * on the branch could name.
 *
 * @param {Git} repo
 * @param {string} sha
 * @returns {Promise<string | null>}
 */
export async function exactChange(repo, sha) {
  const diff = await repo.git([
    "diff-tree",
    "-r",
    "-z",
    "--raw",
    "--no-abbrev",
    "--no-renames",
    `${sha}^`,
    sha,
  ]);
  return diff.code === 0 ? diff.stdout : null;
}

/**
 * The commits a cherry-pick message names, in order.
 *
 * @param {string} message
 * @returns {string[]}
 */
function pickedFrom(message) {
  return [...message.matchAll(PICKED)].map((match) => match[1] ?? "");
}

/** `release/0.N.0` and `v0.N.0`, whole, as `git ls-remote` names them. */
const RELEASE_REF = /^refs\/(?:heads\/release\/|tags\/v)0\.([1-9][0-9]*)\.0$/;

/**
 * Where a new release branch stands among the earlier ones (#2707): its
 * version must be the next after the newest release branch or tag, so none
 * is skipped or reused; and the newest one's commit, whose start the new
 * branch must not start before (refuseReleaseRange).
 *
 * @param {number} minor the new branch's N in 0.N.0
 * @param {string} listed `git ls-remote <repo> refs/heads/release/* refs/tags/v*`
 * @returns {{ refused: string } | { previous: string | null }}
 */
export function releaseFloor(minor, listed) {
  let newest = 0;
  /** @type {string | null} */
  let previous = null;
  for (const line of listed.split("\n")) {
    const [sha = "", ref = ""] = line.split("\t");
    const match = RELEASE_REF.exec(ref);
    const at = Number(match?.[1]);
    // A tag and its release branch share N: the tag is the published commit.
    if (match !== null && (at > newest || (at === newest && ref.startsWith("refs/tags/")))) {
      newest = at;
      previous = sha;
    }
  }
  return minor === newest + 1
    ? { previous }
    : {
        refused: `the next release is 0.${String(newest + 1)}.0, after the newest release branch or tag`,
      };
}

/**
 * Why a release branch must not move from `old` to `head`, or null if it may.
 *
 * @param {Git} repo the mirror, with `main` and both commits fetched into it
 * @param {{ head: string, old: string | null, main: string, previous: string | null }} push
 *   `head` the commit to push, `old` the branch's head on GitHub now (null:
 *   it does not exist yet), `main` the freshly fetched main's ref,
 *   `previous` the newest earlier release's commit, fetched (releaseFloor)
 * @returns {Promise<string | null>}
 */
export async function refuseReleaseRange(repo, { head, old, main, previous }) {
  if (old === null) {
    if (!(await isAncestor(repo, head, main))) {
      return `a release branch starts at a commit on main, and ${head.slice(0, 8)} is not one`;
    }
    if (previous === null) {
      return null;
    }
    const base = await repo.git(["merge-base", previous, main]);
    if (base.code !== 0) {
      return "could not find where the last release started; try again";
    }
    return (await isAncestor(repo, base.stdout.trim(), head))
      ? null
      : `a release branch starts no earlier than the last release did, at ${base.stdout.trim().slice(0, 8)}`;
  }
  if (!(await isAncestor(repo, old, head))) {
    return `release branches only fast-forward: ${head.slice(0, 8)} does not build on ${old.slice(0, 8)}, the branch's head now; fetch it and cherry-pick onto it`;
  }
  const listed = await repo.git(["rev-list", "--reverse", `${old}..${head}`]);
  // What the branch picked already: its message is all a pick is known by.
  const earlier = await repo.git(["log", "--format=%B", `${main}..${old}`]);
  if (listed.code !== 0 || earlier.code !== 0) {
    return "could not list the branch's commits, so they cannot be checked; try again";
  }
  const picked = new Set(pickedFrom(earlier.stdout));
  for (const sha of listed.stdout.split("\n").filter((line) => line !== "")) {
    const refused = await refusePick(repo, sha, { main, old, picked });
    if (refused !== null) {
      return `${sha.slice(0, 8)}: ${refused}`;
    }
  }
  return null;
}

/**
 * Why one new commit on a release branch is not a faithful pick of main.
 *
 * @param {Git} repo
 * @param {string} sha
 * @param {{ main: string, old: string, picked: Set<string> }} branch
 *   `picked` the commits the branch took already; this one's is added
 * @returns {Promise<string | null>}
 */
async function refusePick(repo, sha, { main, old, picked: taken }) {
  if ((await parentCount(repo, sha)) !== 1) {
    return "a merge commit; a release branch takes single cherry-picks only";
  }
  const message = await repo.git(["log", "-1", "--format=%B", sha]);
  if (message.code !== 0) {
    return "could not read its message";
  }
  const picked = pickedFrom(message.stdout);
  const [source = ""] = picked;
  if (picked.length !== 1 || !/^[0-9a-f]{40}$/.test(source)) {
    return "needs exactly one (cherry picked from commit <full sha>) line: use git cherry-pick -x";
  }
  if (!(await isAncestor(repo, source, main))) {
    return `it names ${source.slice(0, 8)}, which is not a commit on main`;
  }
  if ((await parentCount(repo, source)) !== 1) {
    return `it names ${source.slice(0, 8)}, a merge; pick the single commit main took`;
  }
  if (taken.has(source) || (await isAncestor(repo, source, old))) {
    return `the branch has ${source.slice(0, 8)} already`;
  }
  taken.add(source);
  const mine = await exactChange(repo, sha);
  if (mine === "") {
    return "an empty commit";
  }
  const theirs = await exactChange(repo, source);
  if (mine === null || theirs === null) {
    return "could not compare it with the commit it names; try again";
  }
  return mine === theirs
    ? null
    : `its change differs from ${source.slice(0, 8)} on main: every file it touches must be the same before and after, byte for byte; a fix whose files moved on main since the freeze waits for the next release, or ask lead-dev`;
}

/* ---- the release manager's nudges ---------------------------------------- */

/** A release's tracking issue: its title, whole. */
const TRACKING_TITLE = /^Release (0\.[1-9][0-9]*\.0)$/;

/** At most this much of a tracking issue's body is read: agents edit it. */
export const MAX_TRACKING_BODY = 64 * 1024;

/**
 * @typedef {object} Tracking an open release's tracking issue (#2707)
 * @property {number} number
 * @property {string} version
 * @property {number[]} features
 * @property {number[]} fixes the "Fixes to cherry-pick" list
 */

/**
 * A release's tracking issue, or null for any other issue. Only one titled
 * `Release 0.N.0` and written by the company's own account counts: the
 * repository is public, and a stranger's issue of that title must not steer
 * the release manager. Only `#N` is read, from checklist lines under the
 * `Features` and `Fixes to cherry-pick` headings.
 *
 * @param {{ number: number, title: string, author: string, body: string }} issue
 * @param {string} login the company's GitHub account
 * @returns {Tracking | null}
 */
export function parseTracking(issue, login) {
  const title = TRACKING_TITLE.exec(issue.title);
  if (title === null || login === "" || issue.author !== login) {
    return null;
  }
  /** @type {{ features: number[], fixes: number[] }} */
  const lists = { features: [], fixes: [] };
  /** @type {number[] | null} */
  let list = null;
  for (const line of issue.body.slice(0, MAX_TRACKING_BODY).split("\n")) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading !== null) {
      const name = (heading[1] ?? "").toLowerCase();
      list =
        name === "features" ? lists.features : name === "fixes to cherry-pick" ? lists.fixes : null;
      continue;
    }
    const item = /^\s*[-*]\s+\[[ xX]\]\s+(.*)$/.exec(line);
    if (list !== null && item !== null) {
      for (const match of (item[1] ?? "").matchAll(/#([0-9]{1,7})\b/g)) {
        list.push(Number(match[1]));
      }
    }
  }
  return { number: issue.number, version: title[1] ?? "", ...lists };
}

/**
 * The issues a pull request's body closes: `Closes #N` and GitHub's other
 * closing keywords.
 *
 * @param {string} body
 * @returns {number[]}
 */
export function closedIssues(body) {
  return [
    ...body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#([0-9]{1,7})\b/gi),
  ].map((match) => Number(match[1]));
}

/**
 * How CI on a release branch's head ended, from its push runs: null while
 * any is still running or none has started.
 *
 * @param {Record<string, unknown>[]} runs `actions/runs?head_sha=` for the head
 * @returns {{ pass: boolean, failed: string[] } | null}
 */
export function releaseCiVerdict(runs) {
  if (runs.length === 0 || runs.some((run) => run.status !== "completed")) {
    return null;
  }
  const failed = runs
    .filter((run) => run.conclusion !== "success" && run.conclusion !== "skipped")
    .map((run) => (typeof run.name === "string" ? run.name : "a workflow"));
  return { pass: failed.length === 0, failed };
}
