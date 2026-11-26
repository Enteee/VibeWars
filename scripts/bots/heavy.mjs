/**
 * The client of `company heavy <cmd...>` (#3362): waits for hubd's single
 * heavy-job lease, runs the command in this jail with the lease id in
 * VIBEWARS_HEAVY, renews while it runs, releases when it ends. Pure apart
 * from what is injected, so it can be tested without a daemon or a child.
 */

import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";

/** Exit status when the wait ran out: EX_TEMPFAIL. */
export const EXIT_GAVE_UP = 75;
/** Exit status when the command could not be started. */
export const EXIT_NOT_FOUND = 127;
export const POLL_MS = 5_000;
export const RENEW_MS = 30_000;
export const DEFAULT_MAX_WAIT_MIN = 30;
/** A short job (`--short`, #3582) is killed after this long. */
export const SHORT_KILL_MS = 10 * 60_000;
/** Exit status of a short job killed at its limit: timeout(1)'s. */
export const EXIT_SHORT_KILLED = 124;
const KILL_GRACE_MS = 10_000;

/**
 * @typedef {object} HeavyDeps
 * @property {string[]} argv the words after `company heavy`
 * @property {Record<string, string | undefined>} env
 * @property {(op: string, args: string[]) => Promise<Record<string, unknown>>} request a hubd `heavy` request; resolves to its JSON answer, rejects if there was none
 * @property {(argv: string[], env: Record<string, string | undefined>) => { exited: Promise<number>, kill: (signal: NodeJS.Signals) => void }} spawnChild
 * @property {(ms: number) => Promise<void>} sleep
 * @property {() => number} now
 * @property {(line: string) => void} say
 * @property {(handler: (signal: NodeJS.Signals) => void) => void} onSignal
 */

/**
 * @param {string[]} argv
 * @returns {{ maxWaitMin: number, short: boolean, cmd: string[] } | { error: string }}
 */
export const parseHeavy = (argv) => {
  let maxWaitMin = DEFAULT_MAX_WAIT_MIN;
  let short = false;
  let rest = argv;
  for (;;) {
    if (rest[0] === "--max-wait") {
      const value = Number(rest[1]);
      if (!Number.isFinite(value) || value <= 0) return { error: "--max-wait takes minutes" };
      maxWaitMin = value;
      rest = rest.slice(2);
    } else if (rest[0] === "--short") {
      short = true;
      rest = rest.slice(1);
    } else {
      return { maxWaitMin, short, cmd: rest };
    }
  }
};

/**
 * @param {HeavyDeps} deps
 * @returns {Promise<number>} the exit status
 */
export const runHeavy = async (deps) => {
  const { env, request, spawnChild, sleep, now, say, onSignal } = deps;
  const parsed = parseHeavy(deps.argv);
  if ("error" in parsed) {
    say(`heavy: ${parsed.error}`);
    return 2;
  }
  const { maxWaitMin, short, cmd } = parsed;

  if (cmd.length === 0) {
    const status = await request("status", []);
    const queue = Array.isArray(status.queue) ? /** @type {string[]} */ (status.queue) : [];
    say(typeof status.holder === "string" ? `holder: ${status.holder}` : "holder: nobody (free)");
    for (const entry of queue) say(`queued: ${entry}`);
    return 0;
  }

  // Inside a heavy job already: one slot, no deadlock.
  if (env.VIBEWARS_HEAVY !== undefined && env.VIBEWARS_HEAVY !== "") {
    return spawnChild(cmd, env).exited;
  }

  /** Runs the command under the lease, renewing it until the command ends. */
  const runLeased = async (/** @type {string} */ leaseId) => {
    const child = spawnChild(cmd, { ...env, VIBEWARS_HEAVY: leaseId });
    onSignal((signal) => {
      child.kill(signal);
    });
    let warned = false;
    let killed = false;
    const startedAt = now();
    for (;;) {
      const ended = await Promise.race([
        child.exited.then(() => true),
        sleep(RENEW_MS).then(() => false),
      ]);
      if (ended) break;
      if (short && !killed && now() - startedAt >= SHORT_KILL_MS) {
        killed = true;
        say("heavy: short job killed at 10 min; run it without --short");
        child.kill("SIGTERM");
        void sleep(KILL_GRACE_MS).then(() => {
          child.kill("SIGKILL");
        });
      }
      const renewed = await request("renew", [leaseId]).catch(() => ({ ok: false }));
      if (renewed.ok !== true && !warned) {
        warned = true;
        say("heavy: lost the lease; the job keeps running, unlocked");
      }
    }
    const code = await child.exited;
    await request("release", [leaseId]).catch(() => ({}));
    return killed ? EXIT_SHORT_KILLED : code;
  };

  const label = cmd.slice(0, 3).join(" ");
  const deadline = now() + maxWaitMin * 60_000;
  let lastAhead = -1;
  let warnedDown = false;
  for (;;) {
    /** @type {Record<string, unknown>} */
    let answer;
    try {
      answer = await request("acquire", [label, short ? "short" : "long"]);
    } catch {
      // hubd restarting: it forgot the queue, so ask again on the next poll.
      if (!warnedDown) say("heavy: hubd did not answer; retrying");
      warnedDown = true;
      if (now() >= deadline) {
        say(`heavy: gave up after ${String(maxWaitMin)} min (hubd unreachable)`);
        return EXIT_GAVE_UP;
      }
      await sleep(POLL_MS);
      continue;
    }
    if (typeof answer.leaseId === "string" && answer.granted === true) {
      return runLeased(answer.leaseId);
    }
    if (typeof answer.ahead !== "number") {
      say(`heavy: unexpected answer from hubd: ${JSON.stringify(answer)}`);
      return 1;
    }
    const holder = typeof answer.holder === "string" ? answer.holder : "nobody yet";
    if (answer.ahead !== lastAhead) {
      say(
        `heavy: queued${short ? " (short)" : ""}, ${String(answer.ahead)} ahead (holder: ${holder})`,
      );
      lastAhead = answer.ahead;
    }
    if (now() >= deadline) {
      await request("leave", []).catch(() => ({}));
      say(`heavy: gave up after ${String(maxWaitMin)} min (holder: ${holder})`);
      return EXIT_GAVE_UP;
    }
    await sleep(POLL_MS);
  }
};

/**
 * Start the command as its own process group, so a signal reaches what a
 * wrapper (`bash -c`, `pnpm run`) started too and not only the wrapper.
 * @param {string[]} cmd
 * @param {Record<string, string | undefined>} env
 * @returns {{ exited: Promise<number>, kill: (signal: NodeJS.Signals) => void }}
 */
export function spawnInGroup(cmd, env) {
  const [file = "", ...args] = cmd;
  const child = spawn(file, args, { stdio: "inherit", env, detached: true });
  return {
    exited: new Promise((resolve) => {
      child.on("error", (error) => {
        console.error(`heavy: ${error.message}`);
        resolve(EXIT_NOT_FOUND);
      });
      child.on("exit", (status, signal) => {
        resolve(status ?? (signal === null ? 1 : 128 + osConstants.signals[signal]));
      });
    }),
    kill: (signal) => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, signal);
      } catch {
        // the group is already gone
      }
    },
  };
}
