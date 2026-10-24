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

/** How long agents get to commit and run `company ready` before the company stops. */
export const DRAIN_MS = 10 * 60_000;

/** How long a stop waits for a `hub` request still being served. */
export const INFLIGHT_GRACE_MS = 60_000;

/** Unchanged samples at a prompt after which an agent counts as ready. */
export const IDLE_SAMPLES_READY = 2;

/**
 * @typedef {{
 *   requestedAt: number, reason: string, by: string, deadline: number, bootSha: string,
 *   ready: string[],
 * }} Reboot
 *
 * `ready` lists the roles that ran `company ready`.
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
 * One step of the drain: stop the company now, or keep waiting?
 *
 * The company is drained once every running agent has run `company ready`
 * or sat idle at its prompt, or once the deadline passes. Then it stops as
 * soon as no `hub` request is in flight, or after a grace period, so a merge
 * or a push is not cut off halfway.
 *
 * @param {{
 *   now: number,
 *   reboot: Reboot,
 *   running: string[],
 *   idle: Record<string, number | undefined>,
 *   inflight: number,
 *   drainedAt: number | null,
 * }} state
 * @returns {{ stop: boolean, drainedAt: number | null }}
 */
export function drainStep({ now, reboot, running, idle, inflight, drainedAt }) {
  const everyone = running.every(
    (role) => reboot.ready.includes(role) || (idle[role] ?? 0) >= IDLE_SAMPLES_READY,
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
 * What the manager's `company reboot` broadcasts to everyone, operator
 * included, when hubd accepts it.
 *
 * @param {Reboot} reboot
 * @param {string[]} subjects the company commits on main since the boot
 * @returns {string}
 */
export function announcement(reboot, subjects) {
  return (
    `Company reboot by ${clock(reboot.deadline)}: ${reboot.reason}. It loads: ` +
    `${subjects.join("; ")}. Commit or WIP-commit your work, push it, then run ` +
    "`company ready`. Abort: `company reboot --abort` (manager), " +
    "`claude-llc reboot --abort` (operator)."
  );
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
  const { requestedAt, reason, by, deadline, bootSha, ready } = raw;
  if (
    typeof requestedAt !== "number" ||
    typeof reason !== "string" ||
    typeof by !== "string" ||
    typeof deadline !== "number" ||
    typeof bootSha !== "string" ||
    !Array.isArray(ready) ||
    !ready.every((role) => typeof role === "string")
  ) {
    return null;
  }
  return { requestedAt, reason, by, deadline, bootSha, ready: ready.map(String) };
}

/**
 * Is this file in `scripts/bots` one nix stages into the company's store
 * copy, and so one the company runs? The same rule as the `case` in
 * nix/claude-llc.nix and nix/claude-bot.nix.
 *
 * @param {string} name a file name, no directory
 * @returns {boolean}
 */
export function isStagedScript(name) {
  return name.endsWith(".mjs") && !name.endsWith(".test.mjs");
}

/**
 * The staged scripts that differ between the checkout and the copy the
 * company is running: changed, added or removed.
 *
 * devenv's evaluation cache does not track `scripts/bots` (ADR-0014), so a
 * shell can hand claude-llc the store copy of an older checkout. A reboot
 * that loaded nothing would otherwise report the new commit as loaded.
 *
 * @param {Record<string, string>} checkout file name to contents, from `scripts/bots`
 * @param {Record<string, string>} running file name to contents, from the store copy
 * @returns {string[]} file names, sorted
 */
export function scriptDrift(checkout, running) {
  const names = new Set([...Object.keys(checkout), ...Object.keys(running)]);
  return [...names]
    .filter(isStagedScript)
    .filter((name) => checkout[name] !== running[name])
    .sort();
}

/** How many differing scripts a boot note names before it says "and N more". */
const DRIFT_NAMED = 5;

/**
 * The boot note, corrected for scripts that did not load.
 *
 * With no drift the note is left as it is. With drift it says, first and
 * plainly, that the company runs older code than the checkout, and a
 * restarter's "Rebooted onto <sha>" is withdrawn: that commit's company code
 * is exactly what did not load.
 *
 * @param {{ note: string | null, sha: string, drift: string[], running: string }} boot
 *   `sha` is the checkout's HEAD, `running` the store path of the copy running
 * @returns {string | null}
 */
export function bootNote({ note, sha, drift, running }) {
  if (drift.length === 0) {
    return note;
  }
  const named = drift.slice(0, DRIFT_NAMED).join(", ");
  const more = drift.length > DRIFT_NAMED ? ` and ${String(drift.length - DRIFT_NAMED)} more` : "";
  const differ = drift.length === 1 ? "differs" : "differ";
  const warning =
    `WARNING: the company is NOT running the checkout's scripts (${sha.slice(0, 8)}): ` +
    `${named}${more} ${differ} from scripts/bots in ${running}. devenv served a stale ` +
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
