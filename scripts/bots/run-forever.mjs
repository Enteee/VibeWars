#!/usr/bin/env node
/**
 * `run-forever.mjs <name> -- <command> [args…]`: keep a host daemon running
 * (#23).
 *
 * hubd once died on startup, and every agent lost GitHub until a human
 * noticed. So claude-llc runs hubd and the supervisor under this, each in a
 * pane of the `hub` window. The command's output goes to the pane and to
 * `$VIBEWARS_BOT_ROOT/hub/<name>.log`. When it exits, for any reason, this
 * says so in the pane, waits as `nextDelay` says (1, 2, 4 … 60 s) and starts
 * it again. Every exit is recorded in `<name>.restarts` for the dashboard.
 * Five exits in five minutes is a crash loop, and the company is told once,
 * through the sidecar's system outbox.
 *
 * SIGTERM, SIGINT or SIGHUP stop this and its command, with no restart:
 * `claude-llc stop`, the restarter and a killed tmux session all stop it
 * that way.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { nextDelay } from "./hub-health.mjs";
import { releaseLock, takeLock } from "./instance-lock.mjs";
import { SYSTEM, visible } from "./protocol.mjs";

const [name, separator, command, ...args] = process.argv.slice(2);
if (name === undefined || !/^[a-z][a-z0-9-]*$/.test(name) || separator !== "--" || !command) {
  console.error("usage: run-forever.mjs <name> -- <command> [args…]");
  process.exit(2);
}
/** The daemon, by the name its files and lines carry. */
const NAME = name;

const ROOT = process.env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
const HUB = path.join(ROOT, "hub");
const BUS = process.env.VIBEWARS_BOT_BUS ?? path.join(ROOT, "bus");
const LOG = path.join(HUB, `${NAME}.log`);
const RESTARTS = path.join(HUB, `${NAME}.restarts`);
const LOCK = path.join(HUB, `${NAME}.loop.lock`);

fs.mkdirSync(HUB, { recursive: true });
// One loop per daemon: two would each restart it, and fight.
if (!takeLock(LOCK)) {
  console.error(`run-forever: another loop for ${NAME} holds ${LOCK}`);
  process.exit(1);
}

/** @param {string} text */
function say(text) {
  process.stdout.write(text);
  fs.appendFileSync(LOG, text);
}

/**
 * Tell everyone, through the sidecar: atomically, so it never reads half a file.
 *
 * @param {string} text
 */
function alert(text) {
  // Never the reason this loop stops: the daemon matters more than the news.
  try {
    const outbox = path.join(BUS, SYSTEM, "outbox");
    fs.mkdirSync(outbox, { recursive: true });
    const file = `${String(Date.now())}-${NAME}.json`;
    const tmp = path.join(outbox, `.${file}.part`);
    fs.writeFileSync(tmp, JSON.stringify({ to: "all", text, nudge: null, direct: false }));
    fs.renameSync(tmp, path.join(outbox, file));
  } catch (error) {
    say(`── could not tell the company: ${error instanceof Error ? error.message : "failed"} ──\n`);
  }
}

/** @type {import("node:child_process").ChildProcess | null} */
let child = null;
/** Set by a signal handler, so it is read through an object. */
const state = { stopping: false };

for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT", "SIGHUP"])) {
  process.on(signal, () => {
    state.stopping = true;
    if (child !== null && child.exitCode === null) {
      child.kill("SIGTERM");
    } else {
      releaseLock(LOCK);
      process.exit(0);
    }
  });
}

/** @type {{ startedAt: number, exitedAt: number }[]} */
let runs = [];
let alerted = false;

for (;;) {
  const startedAt = Date.now();
  let lastLine = "";
  const running = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  child = running;
  running.stdout.on("data", (/** @type {Buffer} */ chunk) => {
    say(chunk.toString("utf8"));
  });
  running.stderr.on("data", (/** @type {Buffer} */ chunk) => {
    const text = chunk.toString("utf8");
    say(text);
    lastLine = text.trim().split("\n").at(-1) ?? lastLine;
  });
  /** @type {string} */
  const how = await new Promise((resolve) => {
    running.on("error", (error) => {
      resolve(`could not start (${error.message})`);
    });
    running.on("exit", (code, signal) => {
      resolve(signal === null ? `exited (code ${String(code)})` : `was killed (${signal})`);
    });
  });
  if (state.stopping) {
    releaseLock(LOCK);
    process.exit(0);
  }

  const exitedAt = Date.now();
  runs = [...runs, { startedAt, exitedAt }].filter((run) => exitedAt - run.exitedAt < 60 * 60_000);
  fs.writeFileSync(RESTARTS, JSON.stringify(runs.map((run) => run.exitedAt)));
  const { delayMs, crashLooping } = nextDelay(runs, exitedAt);
  const after = Math.round((exitedAt - startedAt) / 1000);
  say(
    `── ${NAME} ${how} after ${String(after)} s; ` +
      `restart #${String(runs.length)} in ${String(delayMs / 1000)} s ──\n`,
  );
  if (crashLooping && !alerted) {
    // The last line is the daemon's, and can echo request text: quoted and
    // made visible, so it cannot pass for something the system says.
    alert(`${NAME} is crash-looping. Its last line: "${visible(lastLine || how)}"`);
    alerted = true;
  } else if (!crashLooping) {
    // Out of the loop again: the next one is worth telling, too.
    alerted = false;
  }
  // A signal now finds no child running, and stops this at once.
  await sleep(delayMs);
}
