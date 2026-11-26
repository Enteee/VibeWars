/**
 * What the supervisor does about who is employed (#383, part 4 of #62):
 * `staff.json` says who should be running, the tmux panes say who is, and
 * this decides what to start and what to stop. A pure function, so the
 * hire and fire rules are tested without a tmux session or a clock.
 */

/** How long a fired employee gets to wrap up before its pane is killed. */
export const FIRE_DEADLINE_MS = 10 * 60_000;

/** How long after starting an employee the supervisor waits before starting it again. */
export const RESTART_HOLDOFF_MS = 60_000;

/** Restarts of the manager within this window count towards the backoff. */
export const MANAGER_WINDOW_MS = 10 * 60_000;

/** The restarts within the window after which they are at least this far apart. */
export const MANAGER_BACKOFF_AFTER = 3;

/** The least time between manager restarts once they are backing off. */
export const MANAGER_BACKOFF_MS = 5 * 60_000;

/** The id of the one manager, whom `reconcile` leaves to `managerAction`. */
const MANAGER = "manager";

/**
 * @typedef {{ pane: string, employee: string }} Pane
 *   `employee` is the id the pane was started for, `""` while it is being set up
 *
 * @typedef {{ start: string[], kill: Pane[], forget: string[] }} Plan
 */

/**
 * What to do now so the panes match `staff`.
 *
 * - A working employee with no pane is started, unless it was started
 *   within `holdoffMs` (`RESTART_HOLDOFF_MS` for the CLI). Not the manager: `managerAction` does.
 * - A firing employee is left alone until it has run `company ready`, is
 *   between turns, or `FIRE_DEADLINE_MS` passed since the fire; then its
 *   pane is killed and it is forgotten. One with no pane is forgotten.
 * - A pane for nobody in `staff` is killed, and so is every pane after the
 *   first of a working employee: two agents must not share a worktree.
 * - Nothing at all while a company reboot is pending or running: the reboot
 *   restarts everyone.
 *
 * @param {import("./staff.mjs").Staff} staff
 * @param {readonly Pane[]} panes
 * @param {{
 *   now: number,
 *   between: readonly string[],
 *   rebooting: boolean,
 *   started: ReadonlyMap<string, number>,
 *   holdoffMs: number,
 * }} context `between` are the employees between turns, `started` when the
 *   supervisor last started each
 * @returns {Plan}
 */
export function reconcile(staff, panes, { now, between, rebooting, started, holdoffMs }) {
  /** @type {Plan} */
  const plan = { start: [], kill: [], forget: [] };
  if (rebooting) {
    return plan;
  }
  const running = new Set(panes.map((pane) => pane.employee));

  for (const [id, employee] of Object.entries(staff.employees)) {
    if (employee.state === "working") {
      const last = started.get(id);
      if (id !== MANAGER && !running.has(id) && (last === undefined || now - last >= holdoffMs)) {
        plan.start.push(id);
      }
      continue;
    }
    if (!running.has(id)) {
      plan.forget.push(id);
      continue;
    }
    const firedAt = staff.recent.findLast((change) => change.id === id && change.change === "fire");
    const out =
      employee.readyAt !== null ||
      between.includes(id) ||
      firedAt === undefined ||
      now >= firedAt.at + FIRE_DEADLINE_MS;
    if (out) {
      plan.kill.push(...panes.filter((pane) => pane.employee === id));
      plan.forget.push(id);
    }
  }

  const kept = new Set();
  for (const pane of panes) {
    const employee = staff.employees[pane.employee];
    if (pane.employee === "") {
      continue;
    }
    if (employee === undefined) {
      plan.kill.push(pane);
    } else if (employee.state === "working") {
      if (kept.has(pane.employee)) {
        plan.kill.push(pane);
      }
      kept.add(pane.employee);
    }
  }
  return plan;
}

/**
 * What to do about the manager (#384): a company without one cannot be
 * steered, so outside a reboot and a `claude-llc stop` one always runs. A
 * dead pane is started again at once, three times within ten minutes; the
 * fourth and later restarts wait at least five minutes after the last (until
 * then: `none`), and the first of those is `start-backoff`, which says so.
 *
 * @param {{
 *   reboot: boolean,
 *   stopping: boolean,
 *   paneAlive: boolean,
 *   recentRestarts: readonly number[],
 *   now: number,
 * }} state `recentRestarts` are the times of the restarts within
 *   `MANAGER_WINDOW_MS` of `now`
 * @returns {"none" | "start" | "start-backoff"}
 *   `start-backoff` is the restart that tells the company it is backing off
 */
export function managerAction({ reboot, stopping, paneAlive, recentRestarts, now }) {
  if (reboot || stopping || paneAlive) {
    return "none";
  }
  if (recentRestarts.length < MANAGER_BACKOFF_AFTER) {
    return "start";
  }
  const last = Math.max(...recentRestarts);
  if (now - last < MANAGER_BACKOFF_MS) {
    return "none";
  }
  return recentRestarts.length === MANAGER_BACKOFF_AFTER ? "start-backoff" : "start";
}

/**
 * The processes below `root` in a `ps -e -o pid=,ppid=` listing, `root`
 * itself included: what a pane's agent left running (its jail, claude).
 * Nothing for a `root` that is not a pid above 1.
 *
 * @param {string} listing
 * @param {number} root
 * @returns {number[]}
 */
export function descendants(listing, root) {
  // Process 0 and 1 are the root of everything: never a pane's agent.
  if (!Number.isInteger(root) || root <= 1) {
    return [];
  }
  /** @type {Map<number, number[]>} */
  const children = new Map();
  for (const line of listing.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid === undefined || ppid === undefined || Number.isNaN(pid) || Number.isNaN(ppid)) {
      continue;
    }
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const found = [root];
  for (const pid of found) {
    found.push(...(children.get(pid) ?? []));
  }
  return found;
}
