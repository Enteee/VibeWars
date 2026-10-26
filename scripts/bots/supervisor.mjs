#!/usr/bin/env node
/**
 * `supervisor` — starts and stops employees (#383), and drains the company
 * for a reboot (#21).
 *
 * It used to keep the agents working, too. Each pane ran the interactive
 * Claude TUI, which ends a turn and then waits at its prompt for input
 * nobody sends, so this sampled every pane and typed a nudge into one that
 * had sat unchanged at a prompt. That was screen-scraping, and it failed
 * silently once, looking for ">" where Claude Code draws "❯". Now every
 * agent runs one turn per process (#146, ADR-0027): a turn that ends exits,
 * and claude-llc-agent starts the next. There is nothing left to nudge.
 *
 * It reconciles `staff.json` with the tmux panes every sample: a hired
 * employee gets a pane in its role's window, a fired one is stopped once it
 * has wrapped up (reconcile.mjs decides, this does it). The other job is the reboot: wait for each running agent to run `company
 * ready` or be between turns, then for any `hub` request in flight, and
 * then start the restarter, detached, because nothing inside the tmux
 * session survives the session being killed. Everything it needs is in
 * `.bots/reboot.json`, the agents' `between-turns` markers and hubd's
 * heartbeat; the announcements are the manager's `company` broadcasts.
 *
 * `supervise` is the loop, with everything it touches passed in, so the test
 * (supervisor.test.mjs, #722) runs it against a tmux server of its own; the
 * CLI at the bottom passes the company's.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { parseAlive } from "./hub-health.mjs";
import { releaseLock, takeLock } from "./instance-lock.mjs";
import { tellCompany } from "./agent-loop.mjs";
import { startEmployee } from "./start-employee.mjs";
import {
  MANAGER_WINDOW_MS,
  RESTART_HOLDOFF_MS,
  descendants,
  managerAction,
  reconcile,
} from "./reconcile.mjs";
import { ROLES } from "./hub-policy.mjs";
import { betweenTurns, drainStep, parseReboot } from "./reboot.mjs";
import { parseStaff, withoutEmployees, withStaffLock } from "./staff.mjs";

/**
 * @typedef {{
 *   root: string, session: string, tmux: string, cwd: string,
 *   sampleMs: number, killGraceMs: number, holdoffMs: number,
 *   restarter: string | undefined,
 * }} Config
 *   `root` is the company's state directory, `tmux` the binary, `cwd`
 *   where a started pane begins, `restarter` `claude-llc-restart`
 */

/** @param {Config} cfg @returns {Record<"hub" | "lock" | "staff" | "reboot" | "rebooting" | "stopping" | "managerRestarts", string>} */
function paths({ root }) {
  const hub = path.join(root, "hub");
  return {
    hub,
    lock: path.join(hub, "supervisor.lock"),
    staff: path.join(root, "staff.json"),
    // A reboot hubd accepted (see hubd.mjs and reboot.mjs), and the same record once handed to the restarter.
    reboot: path.join(root, "reboot.json"),
    rebooting: path.join(root, "rebooting.json"),
    // Written by `claude-llc stop` before it kills the session, removed by `up`.
    stopping: path.join(root, "stopping"),
    // When the manager was restarted, for the backoff and the dashboard.
    managerRestarts: path.join(root, "manager-restarts.json"),
  };
}

/** How long after starting the supervisor leaves a missing manager to the boot. */
const BOOT_GRACE_MS = 30_000;

/** How long the restarts are kept, for the dashboard. */
const RESTARTS_KEPT_MS = 24 * 60 * 60_000;

/** How often to look at the reboot record and the agents. */
const SAMPLE_MS = 5_000;

/** How long a stopped pane's processes get to exit before they are killed. */
const KILL_GRACE_MS = 15_000;

/**
 * @param {Config} cfg
 * @param {string[]} args
 * @returns {string}
 */
function tmux(cfg, args) {
  const result = spawnSync(cfg.tmux, args, { encoding: "utf8" });
  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * The panes of the employees' windows (a window is named for the role, a
 * pane carries its employee in the `@employee` option).
 *
 * @param {Config} cfg
 * @returns {{ pane: string, employee: string, pid: number }[]}
 */
function employeePanes(cfg) {
  const listing = tmux(cfg, [
    "list-panes",
    ...["-s", "-t", `=${cfg.session}`],
    ...["-F", "#{window_name} #{pane_id} #{pane_pid} #{@employee}"],
  ]);
  return listing.split("\n").flatMap((line) => {
    const [window, pane, pid, employee = ""] = line.split(" ");
    return window !== undefined && pane !== undefined && ROLES.includes(window)
      ? [{ pane, pid: Number(pid), employee }]
      : [];
  });
}

/**
 * @param {Config} cfg
 * @returns {string[]} the employees with a pane, by id (#62)
 */
function runningEmployees(cfg) {
  return employeePanes(cfg).flatMap(({ employee }) => (employee === "" ? [] : [employee]));
}

/**
 * Stop a pane and everything its agent started, the jail included: the
 * processes get `killGraceMs` to exit before they are killed.
 *
 * @param {Config} cfg
 * @param {{ pane: string, pid: number }} stopped
 * @returns {Promise<void>}
 */
async function stopPane(cfg, { pane, pid }) {
  if (!Number.isInteger(pid) || pid <= 1) {
    console.error(`supervisor: pane ${pane} has no usable pid (${String(pid)}); not signalling`);
    tmux(cfg, ["kill-pane", "-t", pane]);
    return;
  }
  const ps = spawnSync("ps", ["-e", "-o", "pid=,ppid="], { encoding: "utf8" });
  const processes = descendants(ps.stdout, pid).filter((p) => p !== process.pid);
  tmux(cfg, ["kill-pane", "-t", pane]);
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    for (const p of processes) {
      try {
        process.kill(p, signal);
      } catch {
        // Gone already.
      }
    }
    if (signal === "SIGTERM") {
      await sleep(cfg.killGraceMs);
    }
  }
}

/**
 * Take a stopped employee's runtime directories away. Its worktree and
 * branch stay: they are the work.
 *
 * @param {Config} cfg
 * @param {string} employee
 */
function clearEmployee(cfg, employee) {
  for (const dir of [
    path.join(paths(cfg).hub, employee),
    path.join(cfg.root, "bus", employee),
    path.join(cfg.root, "agents", employee),
  ]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`supervisor: could not remove ${dir}: ${String(error)}`);
    }
  }
}

/**
 * Make the panes match `staff.json`. A stop waits out the kill grace, so
 * the sample loop does not run another reconcile meanwhile.
 *
 * @param {Config} cfg
 * @param {Map<string, number>} started when each employee was last started
 * @returns {Promise<void>}
 */
async function reconcilePanes(cfg, started) {
  const p = paths(cfg);
  let staff;
  try {
    staff = parseStaff(fs.readFileSync(p.staff, "utf8"));
  } catch (error) {
    console.error(
      `supervisor: staff.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const panes = employeePanes(cfg);
  const running = panes.flatMap(({ employee }) => (employee === "" ? [] : [employee]));
  const plan = reconcile(staff, panes, {
    now: Date.now(),
    between: betweenTurns(cfg.root, running),
    rebooting: fs.existsSync(p.reboot) || fs.existsSync(p.rebooting),
    started,
    holdoffMs: cfg.holdoffMs,
  });

  for (const employee of plan.start) {
    started.set(employee, Date.now());
    try {
      startPane(cfg, employee);
      console.error(`supervisor: started ${employee}`);
    } catch (error) {
      console.error(`supervisor: could not start ${employee}: ${String(error)}`);
    }
  }
  await Promise.all(
    plan.kill.map(async ({ pane, employee }) => {
      const found = panes.find((candidate) => candidate.pane === pane);
      console.error(`supervisor: stopping ${employee}`);
      if (found === undefined) {
        return;
      }
      await stopPane(cfg, found);
    }),
  );
  if (plan.forget.length > 0) {
    // Read again, under the lock hubd takes: it may have recorded a change
    // while the panes stopped.
    withStaffLock(p.staff, () => {
      const current = parseStaff(fs.readFileSync(p.staff, "utf8"));
      const next = withoutEmployees(current, plan.forget);
      fs.writeFileSync(`${p.staff}.part`, `${JSON.stringify(next, null, 2)}\n`);
      fs.renameSync(`${p.staff}.part`, p.staff);
    });
    for (const employee of plan.forget) {
      clearEmployee(cfg, employee);
      started.delete(employee);
    }
  }
}

/**
 * @param {Config} cfg
 * @param {string} employee
 * @returns {void}
 */
function startPane(cfg, employee) {
  startEmployee(employee, {
    tmux: cfg.tmux,
    session: cfg.session,
    root: cfg.root,
    cwd: cfg.cwd,
  });
}

/**
 * Keep one manager running (#384): start it again when its pane is gone, and
 * tell the company. The restarts of the last day are in
 * `manager-restarts.json`, `{ "restarts": [time, ...] }`, which only the
 * supervisor writes; an unreadable file counts as no restarts.
 *
 * @param {Config} cfg
 * @param {number} since when this supervisor started
 * @returns {void}
 */
function keepManager(cfg, since) {
  const p = paths(cfg);
  const now = Date.now();
  if (now - since < BOOT_GRACE_MS) {
    return;
  }
  try {
    // Only a company that employs a manager keeps one.
    if (parseStaff(fs.readFileSync(p.staff, "utf8")).employees.manager?.state !== "working") {
      return;
    }
  } catch {
    return;
  }
  const record = readJson(p.managerRestarts);
  const kept =
    typeof record === "object" && record !== null && "restarts" in record
      ? /** @type {unknown} */ (record.restarts)
      : [];
  /** @type {number[]} */
  const restarts = Array.isArray(kept)
    ? /** @type {unknown[]} */ (kept).flatMap((at) =>
        typeof at === "number" && now - at < RESTARTS_KEPT_MS ? [at] : [],
      )
    : [];
  const action = managerAction({
    reboot: fs.existsSync(p.reboot) || fs.existsSync(p.rebooting),
    stopping: fs.existsSync(p.stopping),
    paneAlive: employeePanes(cfg).some(({ employee }) => employee === "manager"),
    recentRestarts: restarts.filter((at) => now - at < MANAGER_WINDOW_MS),
    now,
  });
  if (action === "none") {
    return;
  }
  try {
    startPane(cfg, "manager");
  } catch (error) {
    console.error(`supervisor: could not start the manager: ${String(error)}`);
    return;
  }
  fs.writeFileSync(
    `${p.managerRestarts}.part`,
    `${JSON.stringify({ restarts: [...restarts, now] })}\n`,
  );
  fs.renameSync(`${p.managerRestarts}.part`, p.managerRestarts);
  console.error("supervisor: the manager was not running; started it");
  tellCompany(cfg.root, "manager-restarted", "⚠️ System: manager was not running; restarted");
  if (action === "start-backoff") {
    tellCompany(
      cfg.root,
      "manager-backoff",
      "⚠️ System: manager keeps stopping; restarting it at most every 5 minutes",
    );
  }
}

/**
 * @param {string} file
 * @returns {unknown}
 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * @param {Config} cfg
 * @returns {number} `hub` requests queued or being served, from hubd's heartbeat
 */
function inFlight(cfg) {
  try {
    return (
      parseAlive(fs.readFileSync(path.join(paths(cfg).hub, "hubd.alive"), "utf8"))?.inflight ?? 0
    );
  } catch {
    return 0;
  }
}

/**
 * Hand over to the restarter: the session it watches is about to go. The
 * record moves to `rebooting.json` first, so the supervisor of the restarted
 * company cannot mistake it for a new request.
 *
 * @param {Config} cfg
 * @returns {boolean} whether the restarter was started, and so this supervisor is done
 */
function restart(cfg) {
  const p = paths(cfg);
  try {
    fs.renameSync(p.reboot, p.rebooting);
  } catch {
    console.error("supervisor: the reboot was aborted just before it started");
    return false;
  }
  // A plain claude-llc waits for a reboot at most 15 minutes from this
  // record's mtime (reboot-wait.mjs), which the rename kept from the
  // request: the reboot starts now.
  const now = new Date();
  fs.utimesSync(p.rebooting, now, now);
  if (cfg.restarter === undefined) {
    console.error("supervisor: no restarter configured; restart claude-llc by hand");
    return false;
  }
  // setsid: its own session, so killing the tmux session and everything in
  // it leaves the restarter running.
  spawn("setsid", ["-f", cfg.restarter], { detached: true, stdio: "ignore" }).unref();
  console.error("supervisor: handed over to the restarter");
  return true;
}

/**
 * The supervisor's loop: sample the panes and the reboot record until
 * `signal` aborts or the company is handed to the restarter.
 *
 * @param {Config & { signal?: AbortSignal }} cfg
 * @returns {Promise<void>}
 */
export async function supervise(cfg) {
  const p = paths(cfg);
  /** @type {{ requestedAt: number, drainedAt: number | null } | null} */
  let drain = null;
  /** @type {Map<string, number>} */
  const started = new Map();
  const since = Date.now();

  while (cfg.signal?.aborted !== true) {
    try {
      await reconcilePanes(cfg, started);
      keepManager(cfg, since);
    } catch (error) {
      console.error(`supervisor: reconciling the panes failed: ${String(error)}`);
    }

    // Vanishing mid-drain is an abort; a new record is a new drain.
    const reboot = parseReboot(readJson(p.reboot));
    if (reboot === null) {
      drain = null;
    } else if (drain?.requestedAt !== reboot.requestedAt) {
      drain = { requestedAt: reboot.requestedAt, drainedAt: null };
    }

    if (drain !== null && reboot !== null) {
      const running = runningEmployees(cfg);
      const step = drainStep({
        now: Date.now(),
        reboot,
        running,
        between: betweenTurns(cfg.root, running),
        inflight: inFlight(cfg),
        drainedAt: drain.drainedAt,
      });
      drain.drainedAt = step.drainedAt;
      if (step.stop) {
        if (restart(cfg)) {
          return;
        }
        drain = null;
      }
    }

    await sleep(cfg.sampleMs, undefined, { signal: cfg.signal }).catch(() => undefined);
  }
}

/**
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; claude-llc starts this`);
  }
  return value;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const cfg = {
    root: required("VIBEWARS_BOT_ROOT"),
    session: process.env.VIBEWARS_LLC_SESSION ?? "vibewars-llc",
    tmux: required("VIBEWARS_TMUX"),
    cwd: required("DEVENV_ROOT"),
    sampleMs: SAMPLE_MS,
    killGraceMs: KILL_GRACE_MS,
    holdoffMs: RESTART_HOLDOFF_MS,
    restarter: process.env.VIBEWARS_LLC_RESTART,
  };
  const { lock } = paths(cfg);
  // One supervisor: two would hand a reboot to the restarter twice (#23).
  if (!takeLock(lock)) {
    console.error(`supervisor: another supervisor holds ${lock}; not starting a second`);
    process.exit(1);
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      releaseLock(lock);
      process.exit(0);
    });
  }
  console.error(`supervisor: waiting for a reboot of ${cfg.session}`);
  await supervise(cfg);
  releaseLock(lock);
  process.exit(0);
}

// Only run when invoked directly.
if (process.argv[1]?.endsWith("supervisor.mjs") === true) {
  await main();
}
