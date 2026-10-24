/**
 * The company reboot (#21): the manager asks, hubd checks and records it,
 * the supervisor drains the company, and a restarter detached from tmux
 * brings it back up on the new `main`.
 *
 * Every decision in that chain is here, as a pure function, so it can be
 * tested without a tmux session, a daemon or a clock. What is left in
 * hubd.mjs, supervisor.mjs and restart.mjs is the part that touches files,
 * processes and git.
 */

/**
 * Paths whose change is what a reboot exists to load. A reboot is not a
 * general "unstick" button: with no new company code there is nothing for
 * it to load, and the drain costs every agent its context.
 */
export const COMPANY_PATHS = ["scripts/bots/", "nix/claude-", ".claude/bots/", "devenv.nix"];

/** The shortest gap between two boots of the company. */
export const COOLDOWN_MS = 30 * 60_000;

/** How long agents get to commit and say `ready` before the company stops anyway. */
export const DRAIN_MS = 10 * 60_000;

/** How long a stop waits for a `hub` request still being served. */
export const INFLIGHT_GRACE_MS = 60_000;

/** Unchanged samples at a prompt after which an agent counts as ready. */
export const IDLE_SAMPLES_READY = 2;

/**
 * @typedef {{ requestedAt: number, reason: string, by: string, deadline: number, bootSha: string }} Reboot
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
 * @param {{
 *   bootSha: string | null,
 *   changedPaths: string[] | null,
 *   lastRebootAt: number | null,
 *   now: number,
 *   pending: Reboot | null,
 * }} input `changedPaths` is what `main` changed since `bootSha`, `null` if
 *   that could not be worked out
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function rebootAllowed({ bootSha, changedPaths, lastRebootAt, now, pending }) {
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
 * The roles that replied `ready` to the manager since the reboot was asked
 * for, from the manager's inbox.
 *
 * @param {unknown[]} lines the manager's inbox, one parsed line each
 * @param {number} since
 * @returns {Set<string>}
 */
export function readyReplies(lines, since) {
  /** @type {Set<string>} */
  const ready = new Set();
  for (const raw of lines) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const line = /** @type {Record<string, unknown>} */ (raw);
    if (
      line.kind === "peer" &&
      typeof line.from === "string" &&
      typeof line.ts === "number" &&
      line.ts >= since &&
      typeof line.text === "string" &&
      /^\s*ready\b/i.test(line.text)
    ) {
      ready.add(line.from);
    }
  }
  return ready;
}

/**
 * One step of the drain: stop the company now, or keep waiting?
 *
 * The company is drained once every running agent has said `ready` or sat
 * idle at its prompt, or once the deadline passes. Then it stops as soon as
 * no `hub` request is in flight, or after a grace period, so a merge or a
 * push is not cut off halfway.
 *
 * @param {{
 *   now: number,
 *   reboot: Reboot,
 *   running: string[],
 *   ready: Set<string>,
 *   idle: Record<string, number | undefined>,
 *   inflight: number,
 *   drainedAt: number | null,
 * }} state
 * @returns {{ stop: boolean, drainedAt: number | null }}
 */
export function drainStep({ now, reboot, running, ready, idle, inflight, drainedAt }) {
  const everyone = running.every(
    (role) => ready.has(role) || (idle[role] ?? 0) >= IDLE_SAMPLES_READY,
  );
  const drained = drainedAt ?? (everyone || now >= reboot.deadline ? now : null);
  if (drained === null) {
    return { stop: false, drainedAt: null };
  }
  return { stop: inflight === 0 || now >= drained + INFLIGHT_GRACE_MS, drainedAt: drained };
}

/**
 * Whether the operator's checkout may be moved to the new `main`.
 *
 * Only a fast-forward of a clean `main`. Anything else, and the company
 * restarts on the code it has, and the operator is told why: their checkout
 * is never stashed, reset or switched.
 *
 * @param {{ branch: string | null, dirty: boolean, fastForward: boolean }} checkout
 *   `branch` is `null` when detached
 * @returns {{ update: true } | { update: false, reason: string }}
 */
export function fastForwardDecision({ branch, dirty, fastForward }) {
  if (branch !== "main") {
    return {
      update: false,
      reason: `checkout is on ${branch === null ? "a detached HEAD" : `branch ${branch}`}`,
    };
  }
  if (dirty) {
    return { update: false, reason: "checkout has local changes" };
  }
  if (!fastForward) {
    return { update: false, reason: "checkout's main has commits GitHub's main does not" };
  }
  return { update: true };
}

/**
 * @param {Reboot} reboot
 * @returns {string} what every agent and the operator are told when the drain starts
 */
export function announcement(reboot) {
  return (
    `Company reboot by ${clock(reboot.deadline)} (${reboot.reason}). Commit or WIP-commit ` +
    "your work, push if it is ready, then reply `tg send manager ready`. " +
    "Operator: abort with `claude-llc reboot-abort`; manager: `company reboot --abort`."
  );
}
