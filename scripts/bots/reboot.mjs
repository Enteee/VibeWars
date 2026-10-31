/**
 * The company reboot (#21): the manager proposes it, hubd checks it, the
 * operator approves it in Telegram (#960), hubd records it, the supervisor
 * drains the company, and a restarter detached from tmux brings it back up
 * on the commit the operator approved.
 *
 * Every decision in that chain is here, as a pure function, so it can be
 * tested without a tmux session, a daemon or a clock. What is left in
 * hubd.mjs, supervisor.mjs and restart.mjs is the part that touches files,
 * processes and git.
 */

import fs from "node:fs";
import path from "node:path";

import { named } from "./fingerprint.mjs";

/**
 * Paths whose change is what a reboot exists to load. A reboot is not a
 * general "unstick" button: with no new company code there is nothing for
 * it to load, and the drain costs every agent its context.
 */
export const COMPANY_PATHS = ["scripts/bots/", "nix/claude-", ".claude/bots/", "devenv.nix"];

/** The reason a `company reboot --workday` records. */
export const WORKDAY = "workday";

/** How long after the workday nudge the manager may still reboot with it. */
export const WORKDAY_WINDOW_MS = 2 * 60 * 60_000;

/** The workday nudge's interval: the length of a workday. */
export const WORKDAY_MS = 720 * 60_000;

/** The shortest gap between two boots of the company. */
export const COOLDOWN_MS = 30 * 60_000;

/** How long agents get to commit and run `company ready` before the company stops. */
export const DRAIN_MS = 10 * 60_000;

/** How long a stop waits for a `hub` request still being served. */
export const INFLIGHT_GRACE_MS = 60_000;

/** How often hubd looks for the operator's decision on a proposal (#960). */
export const PROPOSAL_POLL_MS = 2_000;

/**
 * @typedef {{
 *   requestedAt: number, reason: string, by: string, deadline: number, bootSha: string,
 *   targetSha: string, proposalId: string, ready: string[],
 * }} Reboot
 *
 * `ready` lists the employees that ran `company ready` (#62): two
 * employees of one role are two agents to wait for. `targetSha` is the
 * commit the operator approved in proposal `proposalId` (#960): the one
 * that boots, whatever `main` is by then.
 */

/**
 * A reboot the manager proposed and the operator has not decided (#960),
 * `.bots/reboot-proposal.json`. Only hubd writes it; the sidecar reads it
 * to show the operator. It never lapses: it is open until approved,
 * rejected or withdrawn.
 *
 * @typedef {{
 *   id: string,
 *   proposedAt: number,
 *   by: string,
 *   kind: "request" | "workday",
 *   reason: string,
 *   bootSha: string,
 *   targetSha: string,
 *   commits: { subject: string }[],
 *   allCommits: number,
 *   stat: {
 *     files: number, insertions: number, deletions: number,
 *     top: { path: string, insertions: number, deletions: number }[],
 *   },
 * }} RebootProposal
 *
 * `id` is 128 random bits in hex: unguessable from a jail, so a button
 * cannot be forged for it. `by` is the manager employee, `reason`
 * WORKDAY for `--workday`. `commits` are the company-code subjects on
 * `bootSha..targetSha`, of `allCommits` commits there in all; `stat` is
 * that range's company-code diffstat, its biggest files in `top`.
 */

/**
 * The operator's tap on a proposal, `.bots/link/reboot-decision.json`.
 * Only the sidecar writes it, from a tap it has checked; hubd reads it once
 * and deletes it.
 *
 * @typedef {{ id: string, decision: "approve" | "reject", at: number }} RebootDecision
 */

/**
 * @param {string} file a path relative to the repository root
 * @returns {boolean}
 */
export function isCompanyPath(file) {
  return COMPANY_PATHS.some((prefix) => file.startsWith(prefix));
}

/**
 * @param {number} ms epoch milliseconds
 * @returns {string} `HH:MM`, local time
 */
export function clock(ms) {
  return new Date(ms).toTimeString().slice(0, 5);
}

/**
 * May a reboot be scheduled now?
 *
 * `workday` is non-null for `company reboot --workday` (#640): it replaces
 * the need for company code changes with the rule that the `workday` nudge
 * was sent within the last two hours and the company has not booted since.
 * The cooldown and a pending reboot still apply.
 *
 * @param {{
 *   bootSha: string | null,
 *   changedPaths: string[] | null,
 *   lastRebootAt: number | null,
 *   now: number,
 *   pending: Reboot | null,
 *   workday: { sentAt: number | null } | null,
 * }} input `changedPaths` is what `main` changed since `bootSha`, `null` if
 *   that could not be worked out
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function rebootAllowed({ bootSha, changedPaths, lastRebootAt, now, pending, workday }) {
  if (pending !== null) {
    return { ok: false, reason: `a reboot is already scheduled for ${clock(pending.deadline)}` };
  }
  if (bootSha === null || lastRebootAt === null) {
    return {
      ok: false,
      reason: "the company's boot was not recorded, so there is nothing to compare main with",
    };
  }
  if (now - lastRebootAt < COOLDOWN_MS) {
    return {
      ok: false,
      reason: `the company booted at ${clock(lastRebootAt)}; the next reboot is possible at ${clock(lastRebootAt + COOLDOWN_MS)}`,
    };
  }
  if (workday !== null) {
    return workdayAllowed({ lastRebootAt, now, sentAt: workday.sentAt });
  }
  if (changedPaths === null) {
    return {
      ok: false,
      reason: `could not tell what main changed since ${bootSha.slice(0, 8)}`,
    };
  }
  if (!changedPaths.some(isCompanyPath)) {
    return {
      ok: false,
      reason:
        `main has no company code changes since ${bootSha.slice(0, 8)}. A reboot loads new ` +
        "company code; it is not a way to unstick agents.",
    };
  }
  return { ok: true };
}

/**
 * @param {{ lastRebootAt: number, now: number, sentAt: number | null }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function workdayAllowed({ lastRebootAt, now, sentAt }) {
  if (sentAt === null) {
    return { ok: false, reason: "the end-of-workday message has not been sent yet" };
  }
  const next = `; the next workday ends at ${clock(sentAt + WORKDAY_MS)}`;
  if (lastRebootAt >= sentAt) {
    return { ok: false, reason: `the company has booted since the workday ended${next}` };
  }
  if (now - sentAt > WORKDAY_WINDOW_MS) {
    return {
      ok: false,
      reason: `the workday ended at ${clock(sentAt)}, more than 2 hours ago${next}`,
    };
  }
  return { ok: true };
}

/**
 * One step of the drain: stop the company now, or keep waiting?
 *
 * The company is drained once every running employee has run `company ready`
 * or is between turns, or once the deadline passes. Its restart loop starts
 * no new turn while a reboot is pending, so an agent between turns stays
 * there. Then it stops as
 * soon as no `hub` request is in flight, or after a grace period, so a merge
 * or a push is not cut off halfway.
 *
 * @param {{
 *   now: number,
 *   reboot: Reboot,
 *   running: string[],
 *   between: string[],
 *   inflight: number,
 *   drainedAt: number | null,
 * }} state
 * @returns {{ stop: boolean, drainedAt: number | null }}
 */
export function drainStep({ now, reboot, running, between, inflight, drainedAt }) {
  const everyone = running.every((id) => reboot.ready.includes(id) || between.includes(id));
  const drained = drainedAt ?? (everyone || now >= reboot.deadline ? now : null);
  if (drained === null) {
    return { stop: false, drainedAt: null };
  }
  return { stop: inflight === 0 || now >= drained + INFLIGHT_GRACE_MS, drainedAt: drained };
}

/**
 * What hubd broadcasts to everyone, operator included, once the operator
 * approved the manager's reboot.
 *
 * @param {Reboot} reboot
 * @param {string[]} subjects the company commits on main since the boot
 * @returns {string}
 */
export function announcement(reboot, subjects) {
  const why = reboot.reason === WORKDAY ? "End of the workday. Company reboot" : "Company reboot";
  const loads = subjects.length === 0 ? "no new company code" : subjects.join("; ");
  return (
    `${why} by ${clock(reboot.deadline)}, approved by the operator` +
    `${reboot.reason === WORKDAY ? "" : `: ${reboot.reason}`}. It loads ${reboot.targetSha.slice(0, 8)}: ` +
    `${loads}. Commit or WIP-commit your work, push it, then run ` +
    "`company ready`. Abort: `company reboot --abort` (manager), " +
    "`claude-llc reboot --abort` (operator)."
  );
}

/**
 * The employees whose restart loop is between turns: it has created
 * `.bots/agents/<employee>/between-turns` and not yet started the next turn.
 *
 * @param {string} root the company's state directory
 * @param {readonly string[]} employees
 * @returns {string[]}
 */
export function betweenTurns(root, employees) {
  return employees.filter((id) => fs.existsSync(path.join(root, "agents", id, "between-turns")));
}

/** `COMPANY_PATHS` as git pathspecs, for `git log -- ...`. */
export const COMPANY_PATHSPECS = COMPANY_PATHS.map((p) => (p.endsWith("/") ? p : `${p}*`));

/**
 * `.bots/reboot.json`, or `null` if it is not a reboot record.
 *
 * @param {unknown} value
 * @returns {Reboot | null}
 */
export function parseReboot(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const { requestedAt, reason, by, deadline, bootSha, targetSha, proposalId, ready } = raw;
  if (
    typeof requestedAt !== "number" ||
    typeof reason !== "string" ||
    typeof by !== "string" ||
    typeof deadline !== "number" ||
    typeof bootSha !== "string" ||
    !isSha(targetSha) ||
    !isProposalId(proposalId) ||
    !Array.isArray(ready) ||
    !ready.every((role) => typeof role === "string")
  ) {
    return null;
  }
  return {
    requestedAt,
    reason,
    by,
    deadline,
    bootSha,
    targetSha,
    proposalId,
    ready: ready.map(String),
  };
}

/**
 * @param {unknown} value
 * @returns {value is string} a full commit sha
 */
function isSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is string} a proposal id: 32 hex characters
 */
export function isProposalId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>} its fields, none if it is not an object
 */
function fields(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {string} id a proposal's
 * @returns {string} how people name it: `R` and its first six hex digits
 */
export function proposalName(id) {
  return `R${id.slice(0, 6)}`;
}

/**
 * `.bots/reboot-proposal.json`, or `null` if it is not a proposal.
 *
 * @param {unknown} value
 * @returns {RebootProposal | null}
 */
export function parseProposal(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const { id, proposedAt, by, kind, reason, bootSha, targetSha, commits, allCommits, stat } = raw;
  if (
    !isProposalId(id) ||
    typeof proposedAt !== "number" ||
    typeof by !== "string" ||
    (kind !== "request" && kind !== "workday") ||
    typeof reason !== "string" ||
    !isSha(bootSha) ||
    !isSha(targetSha) ||
    !Array.isArray(commits) ||
    !isCount(allCommits) ||
    typeof stat !== "object" ||
    stat === null
  ) {
    return null;
  }
  /** @type {{ subject: string }[]} */
  const subjects = [];
  for (const entry of commits) {
    const { subject } = fields(entry);
    if (typeof subject !== "string") {
      return null;
    }
    subjects.push({ subject });
  }
  const { files, insertions, deletions, top } = fields(stat);
  if (!isCount(files) || !isCount(insertions) || !isCount(deletions) || !Array.isArray(top)) {
    return null;
  }
  /** @type {RebootProposal["stat"]["top"]} */
  const tops = [];
  for (const entry of top) {
    const file = fields(entry);
    if (typeof file.path !== "string" || !isCount(file.insertions) || !isCount(file.deletions)) {
      return null;
    }
    tops.push({ path: file.path, insertions: file.insertions, deletions: file.deletions });
  }
  return {
    id,
    proposedAt,
    by,
    kind,
    reason,
    bootSha,
    targetSha,
    commits: subjects,
    allCommits,
    stat: { files, insertions, deletions, top: tops },
  };
}

/**
 * `.bots/link/reboot-decision.json`, or `null` if it is not a decision.
 *
 * @param {unknown} value
 * @returns {RebootDecision | null}
 */
export function parseDecision(value) {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { id, decision, at } = /** @type {Record<string, unknown>} */ (value);
  if (
    !isProposalId(id) ||
    (decision !== "approve" && decision !== "reject") ||
    typeof at !== "number"
  ) {
    return null;
  }
  return { id, decision, at };
}

/**
 * What hubd does with the operator's decision on the open proposal (#960).
 *
 * A decision for another proposal is ignored: it is a tap on a message
 * whose proposal is gone. An approval schedules the reboot only if the
 * company still runs the commit the proposal was made on and no reboot is
 * pending; otherwise it no longer applies, and is dropped as `void`.
 *
 * @param {{
 *   proposal: RebootProposal,
 *   decision: RebootDecision,
 *   bootSha: string | null,
 *   pending: Reboot | null,
 * }} input `bootSha` is `boot.json`'s, `null` if it could not be read
 * @returns {{ action: "schedule" }
 *   | { action: "drop", outcome: "rejected" | "void", note: string }
 *   | { action: "ignore" }}
 */
export function decideProposal({ proposal, decision, bootSha, pending }) {
  if (decision.id !== proposal.id) {
    return { action: "ignore" };
  }
  if (decision.decision === "reject") {
    return { action: "drop", outcome: "rejected", note: "rejected by the operator" };
  }
  if (bootSha !== proposal.bootSha) {
    return { action: "drop", outcome: "void", note: "the company booted since" };
  }
  if (pending !== null) {
    return { action: "drop", outcome: "void", note: "a reboot is already pending" };
  }
  return { action: "schedule" };
}

/**
 * The boot note, corrected for a build that is not the checkout's.
 *
 * With no drift the note is left as it is. With drift it says, first and
 * plainly, that the company runs older code than the checkout, and a
 * restarter's "Rebooted onto <sha>" is withdrawn: that commit's company code
 * is exactly what did not load.
 *
 * @param {{ note: string | null, sha: string, drift: string[], running: string }} boot
 *   `sha` is the checkout's HEAD, `drift` the paths `fingerprint.mjs` `diff`
 *   found, `running` the store path of the build running
 * @returns {string | null}
 */
export function bootNote({ note, sha, drift, running }) {
  if (drift.length === 0) {
    return note;
  }
  const differ = drift.length === 1 ? "differs" : "differ";
  const warning =
    `WARNING: the company is NOT running the checkout's scripts (${sha.slice(0, 8)}): ` +
    `${named(drift)} ${differ} from the checkout in ${running}. devenv served a stale ` +
    "evaluation; the operator must restart the company: `claude-llc stop`, then " +
    "`devenv shell --refresh-eval-cache -- claude-llc`.";
  if (note === null) {
    return warning;
  }
  if (note.startsWith("Rebooted onto ")) {
    return `Rebooted, but its company code did NOT load. ${warning}`;
  }
  return `${note} ${warning}`;
}
