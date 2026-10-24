#!/usr/bin/env node
/**
 * `run-forever <name> -- <command...>`: keep a daemon running, in plain sight.
 *
 * hubd once died on startup and every agent lost GitHub until a human noticed
 * (issue #23). So hubd and the supervisor each run under this, in a pane of
 * the `hub` tmux window: their output shows there live and is appended to
 * `.bots/hub/<name>.log`, and when one exits for any reason it is started
 * again, with a line in the pane saying so.
 *
 * Restarts back off 1, 2, 4 … 60 s, starting over after five minutes of
 * uptime. Five exits in five minutes is a crash loop: it keeps retrying every
 * minute, and says so once in Telegram, so a bad merge is announced instead
 * of failing quietly. The decisions are pure and tested, in hub-health.mjs.
 *
 * Node rather than a shell script so that the loop runs the same `nextDelay`
 * the tests check. A signal stops the runner and its child together, which is
 * how `claude-llc stop` ends it without a restart: it signals the pid in
 * `<name>.runner.pid`.
 *
 * Typed with JSDoc; see protocol.mjs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { duration, nextDelay, parseExits, recentExits } from "./hub-health.mjs";
import { takeLock } from "./lock.mjs";

const [name, separator, command, ...args] = process.argv.slice(2);
if (
  name === undefined ||
  !/^[a-z0-9-]+$/.test(name) ||
  separator !== "--" ||
  command === undefined
) {
  console.error("usage: run-forever.mjs <name> -- <command> [args...]");
  process.exit(2);
}
const root = process.env.VIBEWARS_BOT_ROOT;
const bus = process.env.VIBEWARS_BOT_BUS;
if (root === undefined || root === "" || bus === undefined || bus === "") {
  console.error("run-forever: VIBEWARS_BOT_ROOT and VIBEWARS_BOT_BUS must be set");
  process.exit(2);
}

const HUB = path.join(root, "hub");
const LOG = path.join(HUB, `${name}.log`);
const RESTARTS = path.join(HUB, `${name}.restarts`);
const PID = path.join(HUB, `${name}.runner.pid`);
/** Read by the sidecar, which is the only writer of inboxes (see link.mjs). */
const SYSTEM_OUTBOX = path.join(bus, "_system", "outbox");

fs.mkdirSync(HUB, { recursive: true });
if (!takeLock(PID)) {
  console.error(`run-forever: ${name} is already supervised (${PID})`);
  process.exit(1);
}

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
/** Set by a signal handler, so in an object rather than narrowed away. */
const runner = { stopping: false };

/** @param {NodeJS.Signals} signal */
const stop = (signal) => {
  runner.stopping = true;
  if (child !== null && child.exitCode === null) {
    child.kill(signal === "SIGHUP" ? "SIGTERM" : signal);
  } else {
    fs.rmSync(PID, { force: true });
    process.exit(0);
  }
};
process.on("SIGTERM", () => {
  stop("SIGTERM");
});
process.on("SIGINT", () => {
  stop("SIGINT");
});
// The tmux pane closing.
process.on("SIGHUP", () => {
  stop("SIGHUP");
});

/**
 * One line in the pane and the log.
 *
 * @param {string} text
 */
function say(text) {
  const line = `── ${text} ──\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG, line);
}

/**
 * Tell the company, through the sidecar, which mirrors it to General.
 *
 * @param {string} text
 */
function alert(text) {
  fs.mkdirSync(SYSTEM_OUTBOX, { recursive: true });
  const file = `${String(Date.now()).padStart(14, "0")}-${String(process.pid)}.json`;
  const tmp = path.join(SYSTEM_OUTBOX, `.${file}.part`);
  fs.writeFileSync(tmp, JSON.stringify({ text }));
  fs.renameSync(tmp, path.join(SYSTEM_OUTBOX, file));
}

/** @returns {import("./hub-health.mjs").Exit[]} */
function readExits() {
  try {
    return parseExits(fs.readFileSync(RESTARTS, "utf8"));
  } catch {
    return [];
  }
}

let restarts = 0;
let alerted = false;
for (;;) {
  const startedAt = Date.now();
  const log = fs.createWriteStream(LOG, { flags: "a" });
  let lastError = "";
  const running = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  child = running;
  running.stdout.on("data", (/** @type {Buffer} */ chunk) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  running.stderr.on("data", (/** @type {Buffer} */ chunk) => {
    process.stderr.write(chunk);
    log.write(chunk);
    const lines = chunk.toString().trim().split("\n");
    lastError = lines[lines.length - 1] ?? lastError;
  });
  /** @type {number | null} */
  const code = await new Promise((resolve) => {
    running.on("close", (exitCode) => {
      resolve(exitCode);
    });
    // Could not be started at all, e.g. no such command: an exit like any other.
    running.on("error", (error) => {
      lastError = error.message;
      resolve(127);
    });
  });
  await new Promise((resolve) => {
    log.end(resolve);
  });
  child = null;

  if (runner.stopping) {
    say(`${name} stopped`);
    fs.rmSync(PID, { force: true });
    process.exit(0);
  }

  const now = Date.now();
  const history = recentExits([...readExits(), { startedAt, exitedAt: now, code }], now);
  fs.writeFileSync(RESTARTS, JSON.stringify(history));
  const { delayMs, crashLooping } = nextDelay(history, now);
  restarts += 1;
  say(
    `${name} exited (${code === null ? "killed" : `code ${String(code)}`}) after ${duration(now - startedAt)}; ` +
      `restart #${String(restarts)} in ${duration(delayMs)}${crashLooping ? " (crash-looping)" : ""}`,
  );
  if (crashLooping && !alerted) {
    alert(`${name} is crash-looping: ${lastError === "" ? "no error output" : lastError}`);
    alerted = true;
  } else if (!crashLooping) {
    alerted = false;
  }

  // A signal now finds no child, and stop() exits at once.
  await sleep(delayMs);
}
