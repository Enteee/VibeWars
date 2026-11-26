#!/usr/bin/env node
/**
 * `reboot-wait.mjs` — a plain `claude-llc` waits for a reboot in progress,
 * and never starts a company of its own into it (#557).
 *
 * On 2026-10-26 the operator ran `claude-llc` while a reboot's restarter had
 * the company stopped. It created the session from their shell's old build,
 * the restarter's own `claude-llc up` then failed twice on that session, and
 * the company left running was the old code.
 *
 * `.bots/rebooting.json` exists from the supervisor's handover until the
 * restarter's `up` has finished (restart.mjs). While it does, this waits,
 * unless it is the restarter's own `up`, which carries `VIBEWARS_REBOOTED`.
 *
 * Exits 0 when there was no reboot to wait for, or the record looks
 * abandoned, and claude-llc carries on as usual; exits `WAITED` once a
 * reboot finished, and claude-llc then joins the company it brought up, or
 * says it failed. Either way, it never creates one.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

/**
 * How long a reboot may take before its record counts as left behind by a
 * crashed restarter: counted from the record's mtime, which the supervisor
 * sets when it hands over.
 */
export const REBOOT_WAIT_MS = 15 * 60_000;

/** How often to look again. */
export const POLL_MS = 2_000;

/** The exit code once a reboot this waited for has finished. */
export const WAITED = 4;

/**
 * @typedef {{
 *   rebooted: boolean,
 *   mtime: () => number | null,
 *   now: () => number,
 *   sleep: (ms: number) => Promise<unknown>,
 *   say: (line: string) => void,
 * }} WaitDeps
 *
 * `rebooted` is whether this is the restarter's own `up`; `mtime` is the
 * record's mtime in epoch milliseconds, `null` once it is gone.
 */

/**
 * @param {WaitDeps} deps
 * @returns {Promise<"none" | "finished" | "abandoned">}
 */
export async function waitForReboot({ rebooted, mtime, now, sleep: pause, say }) {
  if (rebooted || mtime() === null) {
    return "none";
  }
  say("a reboot is in progress, waiting for it");
  for (;;) {
    const since = mtime();
    if (since === null) {
      return "finished";
    }
    if (now() - since >= REBOOT_WAIT_MS) {
      say(
        `the reboot has not finished after ${String(REBOOT_WAIT_MS / 60_000)} min; ` +
          "rebooting.json looks abandoned. Carrying on",
      );
      return "abandoned";
    }
    await pause(POLL_MS);
  }
}

// Only run when invoked directly.
if (process.argv[1]?.endsWith("reboot-wait.mjs") === true) {
  const root = process.env.VIBEWARS_BOT_ROOT;
  if (root === undefined) {
    throw new Error("VIBEWARS_BOT_ROOT is not set; claude-llc starts this");
  }
  const file = path.join(root, "rebooting.json");
  const outcome = await waitForReboot({
    rebooted: (process.env.VIBEWARS_REBOOTED ?? "") !== "",
    mtime: () => {
      try {
        return fs.statSync(file).mtimeMs;
      } catch {
        return null;
      }
    },
    now: Date.now,
    sleep,
    say: (line) => {
      process.stderr.write(`claude-llc: ${line}\n`);
    },
  });
  if (outcome === "finished") {
    process.exitCode = WAITED;
  }
}
