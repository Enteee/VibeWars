/**
 * Which remote branches are safe to lose (#3533). Pure: hubd reads the
 * branches and their pull requests, this decides, and hubd deletes. Agents
 * never delete a branch (`--delete-branch` stays refused), so work is lost
 * only by these rules and only from the remote.
 */

/** A bot branch with no open PR and no commit for this many days goes. */
export const BRANCH_IDLE_DAYS = 14;

const DAY_MS = 24 * 60 * 60_000;

/**
 * @typedef {object} BranchPr
 * @property {number} number
 * @property {"OPEN" | "MERGED" | "CLOSED"} state
 * @property {number | null} closedAt ms since the epoch
 * @property {"head" | "base"} role which end of the PR this branch is
 */

/**
 * @typedef {object} BranchRow
 * @property {string} name
 * @property {string} sha
 * @property {number} committedAt ms since the epoch
 * @property {boolean} inMain the tip is behind or identical to main
 * @property {BranchPr[]} prs
 */

/**
 * @typedef {object} Prune
 * @property {string} name
 * @property {string} sha
 * @property {string} rule `merged #N`, `closed #N 15d`, `in main` or `idle 21d`
 */

/**
 * @param {readonly BranchRow[]} branches
 * @param {number} now ms since the epoch
 * @returns {Prune[]}
 */
export function branchesToPrune(branches, now) {
  return branches.flatMap((branch) => {
    const rule = ruleFor(branch, now);
    return rule === null ? [] : [{ name: branch.name, sha: branch.sha, rule }];
  });
}

/**
 * @param {BranchRow} branch
 * @param {number} now
 * @returns {string | null} the rule that deletes it, or null to keep it
 */
function ruleFor(branch, now) {
  if (branch.name === "main" || branch.prs.some((pr) => pr.state === "OPEN")) {
    return null;
  }
  const merged = branch.prs.find((pr) => pr.state === "MERGED" && pr.role === "head");
  if (merged !== undefined) {
    return `merged #${String(merged.number)}`;
  }
  if (branch.name.startsWith("release/")) {
    return null;
  }
  const closed = branch.prs.find(
    (pr) =>
      pr.state === "CLOSED" &&
      pr.role === "head" &&
      pr.closedAt !== null &&
      now - pr.closedAt > BRANCH_IDLE_DAYS * DAY_MS,
  );
  if (closed !== undefined && closed.closedAt !== null) {
    return `closed #${String(closed.number)} ${String(days(now - closed.closedAt))}d`;
  }
  if (!branch.name.startsWith("bot/")) {
    return null;
  }
  if (branch.prs.length === 0 && branch.inMain) {
    return "in main";
  }
  if (now - branch.committedAt > BRANCH_IDLE_DAYS * DAY_MS) {
    return `idle ${String(days(now - branch.committedAt))}d`;
  }
  return null;
}

/** @param {number} ms */
function days(ms) {
  return Math.floor(ms / DAY_MS);
}

/**
 * The dry-run's lines, then the count.
 *
 * @param {readonly Prune[]} rows
 * @returns {string}
 */
export function formatPrune(rows) {
  const lines = rows.map((row) => `${row.name}  ${row.rule}`);
  return [...lines, `${String(rows.length)} branches would be pruned`].join("\n");
}

/**
 * hubd's one-line summary of a sweep.
 *
 * @param {{ deleted: readonly Prune[], kept: number }} sweep
 * @returns {string}
 */
export function formatSummary({ deleted, kept }) {
  const merged = deleted.filter((row) => row.rule.startsWith("merged")).length;
  return `pruned ${String(deleted.length)} branches (${String(merged)} merged, ${String(deleted.length - merged)} idle); kept ${String(kept)}`;
}

/**
 * A branch name as a URL path: each segment encoded, the slashes kept.
 *
 * @param {string} name
 * @returns {string}
 */
export function refPath(name) {
  return name.split("/").map(encodeURIComponent).join("/");
}

/**
 * Delete the chosen branches, one at a time. Just before each delete the ref
 * is read again: a tip that moved since the sweep read it is kept, and only a
 * confirmed "not found" counts as already gone. Anything else GitHub says
 * (rate limit, 5xx, network) stops the sweep: never delete on a guess.
 *
 * @param {readonly Prune[]} chosen
 * @param {{
 *   readRef: (name: string) => Promise<{ sha: string } | "gone" | "error">,
 *   remove: (name: string) => Promise<"deleted" | "gone" | "error">,
 * }} github
 * @returns {Promise<{ deleted: Prune[], skipped: number, stoppedAt: string | null }>}
 */
export async function deleteBranches(chosen, github) {
  /** @type {Prune[]} */
  const deleted = [];
  let skipped = 0;
  for (const row of chosen) {
    const now = await github.readRef(row.name);
    if (now === "error") {
      return { deleted, skipped, stoppedAt: row.name };
    }
    if (now === "gone") {
      deleted.push(row);
      continue;
    }
    if (now.sha !== row.sha) {
      skipped += 1;
      continue;
    }
    const result = await github.remove(row.name);
    if (result === "error") {
      return { deleted, skipped, stoppedAt: row.name };
    }
    deleted.push(row);
  }
  return { deleted, skipped, stoppedAt: null };
}
