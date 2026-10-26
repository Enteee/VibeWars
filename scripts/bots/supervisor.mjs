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
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { parseAlive } from "./hub-health.mjs";
import { releaseLock, takeLock } from "./instance-lock.mjs";
import { descendants, reconcile } from "./reconcile.mjs";
import { ROLES } from "./hub-policy.mjs";
import { betweenTurns, drainStep, parseReboot } from "./reboot.mjs";
import { parseStaff, withoutEmployees, withStaffLock } from "./staff.mjs";

const SESSION = process.env.VIBEWARS_LLC_SESSION ?? "vibewars-llc";

/** The company's state directory; the test imports this module without one. */
const ROOT = process.env.VIBEWARS_BOT_ROOT ?? "";
const HUB = path.join(ROOT, "hub");
const LOCK = path.join(HUB, "supervisor.lock");
const STAFF = path.join(ROOT, "staff.json");
/** A reboot hubd accepted (see hubd.mjs and reboot.mjs). */
const REBOOT = path.join(ROOT, "reboot.json");
/** The same record, once handed to the restarter. */
const REBOOTING = path.join(ROOT, "rebooting.json");
/** `claude-llc-restart`, which claude-llc passes in. */
const RESTARTER = process.env.VIBEWARS_LLC_RESTART;

/** How often to look at the reboot record and the agents. */
const SAMPLE_MS = 5_000;

/** How long a stopped pane's processes get to exit before they are killed. */
const KILL_GRACE_MS = 15_000;

/**
 * @param {string[]} args
 * @returns {string}
 */
function tmux(args) {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * The panes of the employees' windows (a window is named for the role, a
 * pane carries its employee in the `@employee` option).
 *
 * @returns {{ pane: string, employee: string, pid: number }[]}
 */
function employeePanes() {
  const listing = tmux([
    "list-panes",
    ...["-s", "-t", `=${SESSION}`],
    ...["-F", "#{window_name} #{pane_id} #{pane_pid} #{@employee}"],
  ]);
  return listing.split("\n").flatMap((line) => {
    const [window, pane, pid, employee = ""] = line.split(" ");
    return window !== undefined && pane !== undefined && ROLES.includes(window)
      ? [{ pane, pid: Number(pid), employee }]
      : [];
  });
}

/** @returns {string[]} the employees with a pane, by id (#62) */
function runningEmployees() {
  return employeePanes().flatMap(({ employee }) => (employee === "" ? [] : [employee]));
}

/**
 * Stop a pane and everything its agent started, the jail included: the
 * processes get `KILL_GRACE_MS` to exit before they are killed.
 *
 * @param {{ pane: string, pid: number }} stopped
 * @returns {Promise<void>}
 */
async function stopPane({ pane, pid }) {
  if (!Number.isInteger(pid) || pid <= 1) {
    console.error(`supervisor: pane ${pane} has no usable pid (${String(pid)}); not signalling`);
    tmux(["kill-pane", "-t", pane]);
    return;
  }
  const ps = spawnSync("ps", ["-e", "-o", "pid=,ppid="], { encoding: "utf8" });
  const processes = descendants(ps.stdout, pid).filter((p) => p !== process.pid);
  tmux(["kill-pane", "-t", pane]);
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    for (const p of processes) {
      try {
        process.kill(p, signal);
      } catch {
        // Gone already.
      }
    }
    if (signal === "SIGTERM") {
      await sleep(KILL_GRACE_MS);
    }
  }
}

/**
 * Take a stopped employee's runtime directories away. Its worktree and
 * branch stay: they are the work.
 *
 * @param {string} employee
 */
function clearEmployee(employee) {
  for (const dir of [
    path.join(HUB, employee),
    path.join(ROOT, "bus", employee),
    path.join(ROOT, "agents", employee),
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
 * @param {Map<string, number>} started when each employee was last started
 * @returns {Promise<void>}
 */
async function reconcilePanes(started) {
  let staff;
  try {
    staff = parseStaff(fs.readFileSync(STAFF, "utf8"));
  } catch (error) {
    console.error(
      `supervisor: staff.json: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const panes = employeePanes();
  const running = panes.flatMap(({ employee }) => (employee === "" ? [] : [employee]));
  const plan = reconcile(staff, panes, {
    now: Date.now(),
    between: betweenTurns(ROOT, running),
    rebooting: fs.existsSync(REBOOT) || fs.existsSync(REBOOTING),
    started,
  });

  for (const employee of plan.start) {
    started.set(employee, Date.now());
    const result = spawnSync("claude-llc", ["start-employee", employee], { encoding: "utf8" });
    console.error(
      result.status === 0
        ? `supervisor: started ${employee}`
        : `supervisor: could not start ${employee}: ${result.stderr}`,
    );
  }
  await Promise.all(
    plan.kill.map(async ({ pane, employee }) => {
      const found = panes.find((candidate) => candidate.pane === pane);
      console.error(`supervisor: stopping ${employee}`);
      if (found === undefined) {
        return;
      }
      await stopPane(found);
    }),
  );
  if (plan.forget.length > 0) {
    // Read again, under the lock hubd takes: it may have recorded a change
    // while the panes stopped.
    withStaffLock(STAFF, () => {
      const current = parseStaff(fs.readFileSync(STAFF, "utf8"));
      const next = withoutEmployees(current, plan.forget);
      fs.writeFileSync(`${STAFF}.part`, `${JSON.stringify(next, null, 2)}\n`);
      fs.renameSync(`${STAFF}.part`, STAFF);
    });
    for (const employee of plan.forget) {
      clearEmployee(employee);
      started.delete(employee);
    }
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

/** @returns {number} `hub` requests queued or being served, from hubd's heartbeat */
function inFlight() {
  try {
    return parseAlive(fs.readFileSync(path.join(HUB, "hubd.alive"), "utf8"))?.inflight ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Hand over to the restarter and stop supervising: the session it watches is
 * about to go. The record moves to `rebooting.json` first, so the supervisor
 * of the restarted company cannot mistake it for a new request.
 *
 * @returns {void}
 */
function restart() {
  try {
    fs.renameSync(REBOOT, REBOOTING);
  } catch {
    console.error("supervisor: the reboot was aborted just before it started");
    return;
  }
  // A plain claude-llc waits for a reboot at most 15 minutes from this
  // record's mtime (reboot-wait.mjs), which the rename kept from the
  // request: the reboot starts now.
  const now = new Date();
  fs.utimesSync(REBOOTING, now, now);
  if (RESTARTER === undefined) {
    console.error("supervisor: no restarter configured; restart claude-llc by hand");
    return;
  }
  // setsid: its own session, so killing the tmux session and everything in
  // it leaves the restarter running.
  spawn("setsid", ["-f", RESTARTER], { detached: true, stdio: "ignore" }).unref();
  console.error("supervisor: handed over to the restarter");
  releaseLock(LOCK);
  process.exit(0);
}

/* -------------------------------------------------------------------------- */

async function main() {
  // One supervisor: two would hand a reboot to the restarter twice (#23).
  if (!takeLock(LOCK)) {
    console.error(`supervisor: another supervisor holds ${LOCK}; not starting a second`);
    process.exit(1);
  }
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      releaseLock(LOCK);
      process.exit(0);
    });
  }
  console.error(`supervisor: waiting for a reboot of ${SESSION}`);

  /** @type {{ requestedAt: number, drainedAt: number | null } | null} */
  let drain = null;
  /** @type {Map<string, number>} */
  const started = new Map();

  for (;;) {
    try {
      await reconcilePanes(started);
    } catch (error) {
      console.error(`supervisor: reconciling the panes failed: ${String(error)}`);
    }

    // Vanishing mid-drain is an abort; a new record is a new drain.
    const reboot = parseReboot(readJson(REBOOT));
    if (reboot === null) {
      drain = null;
    } else if (drain?.requestedAt !== reboot.requestedAt) {
      drain = { requestedAt: reboot.requestedAt, drainedAt: null };
    }

    if (drain !== null && reboot !== null) {
      const running = runningEmployees();
      const step = drainStep({
        now: Date.now(),
        reboot,
        running,
        between: betweenTurns(ROOT, running),
        inflight: inFlight(),
        drainedAt: drain.drainedAt,
      });
      drain.drainedAt = step.drainedAt;
      if (step.stop) {
        restart();
        drain = null;
      }
    }

    await sleep(SAMPLE_MS);
  }
}

// Only run when invoked directly.
if (process.argv[1]?.endsWith("supervisor.mjs") === true) {
  await main();
}
