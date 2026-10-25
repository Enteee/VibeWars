#!/usr/bin/env node
/**
 * `supervisor` — keeps nine autonomous agents working.
 *
 * This is the least elegant part of the company, so here is the honest
 * reasoning rather than a clean-sounding story.
 *
 * Each pane runs the *interactive* Claude TUI, not `claude -p`, because the
 * manager's window has to accept the operator typing a feature request into
 * it. An interactive session ends its turn and waits. An agent with work to do
 * therefore stops having work to do, silently, and the company stalls.
 *
 * Two things keep it moving. The first is in the agents' own hands: a role
 * with nothing to do runs `tg wait --timeout 900`, which blocks, extending its
 * current turn so it resumes the moment a colleague or the operator speaks.
 * That covers idleness but not turn *end*.
 *
 * The second is this process: it samples each pane, and when one has sat
 * unchanged at an input prompt across several samples, it types a short nudge
 * into it. That is as crude as it sounds. What makes it tolerable is that it
 * is conservative — it would rather leave an agent idle than interrupt one —
 * and that it never touches the pane the operator is looking at, so a nudge
 * cannot land in the middle of something you are typing.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { parseAlive } from "./hub-health.mjs";
import { releaseLock, takeLock } from "./instance-lock.mjs";
import { ROLES } from "./hub-policy.mjs";
import { drainStep, parseReboot } from "./reboot.mjs";

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

/** How often to sample each pane. */
const SAMPLE_MS = 30_000;

/** Consecutive unchanged samples before a pane counts as genuinely stuck. */
const IDLE_SAMPLES = 3;

/** Never nudge the same window more often than this. */
const NUDGE_COOLDOWN_MS = 300_000;

const NUDGE =
  "Check `tg inbox` and `board ls`, then continue with the most valuable thing you can finish.";

/**
 * @param {string[]} args
 * @returns {string}
 */
function tmux(args) {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * Does this pane look like it is sitting at a prompt waiting for input,
 * rather than working?
 *
 * Deliberately a pure function of two snapshots so it can be tested, because
 * getting it wrong is costly in both directions: too eager and it interrupts
 * an agent mid-thought, too lax and the company quietly stops.
 *
 * Two signals have to agree. The pane must not have changed at all since the
 * last sample — a working agent emits output constantly — and its tail must
 * not look like Claude still being busy. The second test is what stops a
 * long-running tool call, which produces no output while it waits, from being
 * mistaken for an idle prompt.
 *
 * @param {string} previous
 * @param {string} current
 * @returns {boolean}
 */
export function looksIdle(previous, current) {
  if (previous === "" || current === "" || previous !== current) {
    return false;
  }
  const tail = current.trimEnd().split("\n").slice(-6).join("\n");

  // The footer carries "esc to interrupt" for exactly as long as a turn is in
  // flight, which makes it a far better busy signal than looking for a
  // spinner: it is also present while a long tool call produces no output, so
  // a blocking `tg wait` is correctly seen as working rather than stuck.
  if (/esc to interrupt/i.test(tail)) {
    return false;
  }

  // The input box. Claude Code draws "❯", not ">" — an earlier version of
  // this function looked for the ASCII form and therefore never fired, which
  // is why interrupted agents sat idle instead of being nudged.
  return /❯|Try "|What should Claude do instead/.test(tail);
}

/* -------------------------------------------------------------------------- */

/** @type {Map<string, { snapshot: string, idle: number, nudgedAt: number }>} */
const state = new Map();

/**
 * @returns {string | null} The window the operator is currently looking at.
 */
function focusedWindow() {
  // Nobody attached means nobody is typing, so every pane is fair game.
  if (tmux(["list-clients", "-t", SESSION, "-F", "#{client_session}"]).trim() === "") {
    return null;
  }
  const active = tmux(["display-message", "-p", "-t", SESSION, "-F", "#{window_name}"]).trim();
  return active === "" ? null : active;
}

/* -------------------------------------------------------------------------- */
/* Company reboot (#21)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The supervisor already watches every pane, so it is what drains the
 * company for a reboot hubd has accepted: it waits for each agent to run
 * `company ready` or go idle, then for any `hub` request in flight, and
 * then starts the restarter, detached, because nothing inside the tmux
 * session survives the session being killed. Everything it needs is in
 * `.bots/reboot.json` and hubd's heartbeat; the announcements are the
 * manager's `company` broadcasts.
 */

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
  console.error(`supervisor: watching ${String(ROLES.length)} panes in ${SESSION}`);

  /** @type {{ requestedAt: number, idle: Record<string, number>, drainedAt: number | null } | null} */
  let drain = null;

  for (;;) {
    // Vanishing mid-drain is an abort; a new record is a new drain.
    const reboot = parseReboot(readJson(REBOOT));
    if (reboot === null) {
      drain = null;
    } else if (drain?.requestedAt !== reboot.requestedAt) {
      drain = { requestedAt: reboot.requestedAt, idle: {}, drainedAt: null };
    }

    const focused = focusedWindow();
    /** @type {string[]} */
    const running = [];

    for (const role of ROLES) {
      const target = `${SESSION}:${role}`;
      const snapshot = tmux(["capture-pane", "-p", "-t", target]);
      if (snapshot === "") {
        // No such window — the company may be partly up, which is fine.
        continue;
      }
      running.push(role);

      const previous = state.get(role) ?? { snapshot: "", idle: 0, nudgedAt: 0 };
      const isIdle = looksIdle(previous.snapshot, snapshot);
      const idle = isIdle ? previous.idle + 1 : 0;
      let nudgedAt = previous.nudgedAt;

      if (drain !== null) {
        drain.idle[role] = isIdle ? (drain.idle[role] ?? 0) + 1 : 0;
      }

      // No nudges during a drain: an agent that said `ready` is meant to sit.
      const dueANudge =
        drain === null &&
        idle >= IDLE_SAMPLES &&
        Date.now() - nudgedAt > NUDGE_COOLDOWN_MS &&
        role !== focused;

      if (dueANudge) {
        // Typed as text then Enter separately, so a pane that is NOT actually
        // at a prompt gets a stray line of text rather than an executed
        // command.
        tmux(["send-keys", "-t", target, NUDGE]);
        tmux(["send-keys", "-t", target, "Enter"]);
        nudgedAt = Date.now();
        console.error(`supervisor: nudged ${role}`);
      }

      state.set(role, { snapshot, idle: dueANudge ? 0 : idle, nudgedAt });
    }

    if (drain !== null && reboot !== null) {
      const step = drainStep({
        now: Date.now(),
        reboot,
        running,
        idle: drain.idle,
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

// Only run when invoked directly; the test imports looksIdle.
if (process.argv[1]?.endsWith("supervisor.mjs") === true) {
  await main();
}
