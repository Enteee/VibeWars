#!/usr/bin/env node
/**
 * `supervisor` — drains the company for a reboot (#21).
 *
 * It used to keep the agents working, too. Each pane ran the interactive
 * Claude TUI, which ends a turn and then waits at its prompt for input
 * nobody sends, so this sampled every pane and typed a nudge into one that
 * had sat unchanged at a prompt. That was screen-scraping, and it failed
 * silently once, looking for ">" where Claude Code draws "❯". Now every
 * agent runs one turn per process (#146, ADR-0027): a turn that ends exits,
 * and claude-llc-agent starts the next. There is nothing left to nudge.
 *
 * What remains is the reboot: wait for each running agent to run `company
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
import { ROLES } from "./hub-policy.mjs";
import { betweenTurns, drainStep, parseReboot } from "./reboot.mjs";
import { roleOf } from "./staff.mjs";

const SESSION = process.env.VIBEWARS_LLC_SESSION ?? "vibewars-llc";

/** The company's state directory; the test imports this module without one. */
const ROOT = process.env.VIBEWARS_BOT_ROOT ?? "";
const HUB = path.join(ROOT, "hub");
const LOCK = path.join(HUB, "supervisor.lock");
/** A reboot hubd accepted (see hubd.mjs and reboot.mjs). */
const REBOOT = path.join(ROOT, "reboot.json");
/** The same record, once handed to the restarter. */
const REBOOTING = path.join(ROOT, "rebooting.json");
/** `claude-llc-restart`, which claude-llc passes in. */
const RESTARTER = process.env.VIBEWARS_LLC_RESTART;

/** How often to look at the reboot record and the agents. */
const SAMPLE_MS = 5_000;

/**
 * @param {string[]} args
 * @returns {string}
 */
function tmux(args) {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * @returns {string[]} the employees with a window in the session, each
 *   named by its employee id (#62)
 */
function runningEmployees() {
  const windows = tmux(["list-windows", "-t", SESSION, "-F", "#{window_name}"]).split("\n");
  return windows.filter((name) => ROLES.includes(roleOf(name) ?? ""));
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

  for (;;) {
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
