#!/usr/bin/env node
/**
 * The pauses between an agent's turns, for the restart loop in
 * nix/claude-llc.nix (#146, ADR-0027).
 *
 *   agent-loop.mjs pause <previous> <ran> <failed>
 *       print the next pause in seconds (`nextPause`)
 *   agent-loop.mjs wait <role> <seconds>
 *       return after `seconds`, or sooner once the role has unread mail
 *   agent-loop.mjs gave-up <role>
 *       tell the company the loop has stopped for good
 *
 * Agents end turns while idle, whatever the briefing says, and a resumed
 * turn re-reads the whole conversation. A fixed ten seconds between turns
 * would have an idle agent spend more than a working one. So the pause
 * doubles while turns stay short, and the wait ends early when someone
 * writes to the agent, which is what an idle agent is waiting for anyway.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { readInbox, SYSTEM } from "./protocol.mjs";

/** Never less: an agent that ends turns instead of waiting cannot spin. */
export const PAUSE_MIN = 10;

/** Never more: board changes do not wake an agent, so it looks at least this often. */
export const PAUSE_MAX = 300;

/** A turn shorter than this did nothing much, most likely an empty inbox. */
export const SHORT_TURN = 60;

/** How often a wait looks at the inbox. */
const POLL_MS = 2000;

/**
 * The pause before the next turn.
 *
 * A short turn that ended normally doubles the last pause, up to
 * `PAUSE_MAX`; a long turn means work, and a failure has its own limit, so
 * both go back to `PAUSE_MIN`.
 *
 * @param {{ previous: number, ran: number, failed: boolean }} turn seconds
 * @returns {number} seconds
 */
export function nextPause({ previous, ran, failed }) {
  if (failed || ran >= SHORT_TURN) {
    return PAUSE_MIN;
  }
  return Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, previous * 2));
}

/**
 * Has `dir`, a role's bus directory, mail its `tg` has not read yet?
 *
 * @param {string} dir
 * @returns {boolean}
 */
export function hasUnread(dir) {
  let contents;
  try {
    contents = fs.readFileSync(path.join(dir, "inbox.jsonl"), "utf8");
  } catch {
    return false;
  }
  let cursor = 0;
  try {
    const value = Number.parseInt(fs.readFileSync(path.join(dir, "cursor"), "utf8").trim(), 10);
    cursor = Number.isFinite(value) ? value : 0;
  } catch {
    // Never read: everything is unread.
  }
  return readInbox(contents, cursor).lines.length > 0;
}

/**
 * @param {string} name
 * @returns {string}
 */
function env(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    console.error(`agent-loop: ${name} is not set; claude-llc-agent sets it`);
    process.exit(2);
  }
  return value;
}

/**
 * @param {string | undefined} value
 * @returns {number}
 */
function seconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`agent-loop: not a number of seconds: ${String(value)}`);
    process.exit(2);
  }
  return parsed;
}

/**
 * @param {string | undefined} role
 * @returns {string}
 */
function roleName(role) {
  if (role === undefined || !/^[a-z0-9][a-z0-9-]*$/.test(role)) {
    console.error(`agent-loop: not a role: ${String(role)}`);
    process.exit(2);
  }
  return role;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "pause") {
    const [previous, ran, failed] = args;
    const pause = nextPause({
      previous: seconds(previous),
      ran: seconds(ran),
      failed: failed === "1",
    });
    console.log(String(pause));
    return;
  }
  if (command === "wait") {
    const dir = path.join(env("VIBEWARS_BOT_ROOT"), "bus", roleName(args[0]));
    const until = Date.now() + seconds(args[1]) * 1000;
    await sleep(PAUSE_MIN * 1000);
    while (Date.now() < until && !hasUnread(dir)) {
      await sleep(Math.min(POLL_MS, Math.max(0, until - Date.now())));
    }
    return;
  }
  if (command === "gave-up") {
    const role = roleName(args[0]);
    // The sidecar's system outbox, as run-forever uses: a broadcast nobody
    // can mistake for the agent's own words.
    const outbox = path.join(env("VIBEWARS_BOT_ROOT"), "bus", SYSTEM, "outbox");
    fs.mkdirSync(outbox, { recursive: true });
    const file = `${String(Date.now())}-${role}-stopped.json`;
    const text =
      `${role} failed five runs in a row and is stopped. Its window says why; ` +
      `restart it there with: claude-llc-agent ${role}`;
    fs.writeFileSync(path.join(outbox, `.${file}.part`), JSON.stringify({ to: "all", text }));
    fs.renameSync(path.join(outbox, `.${file}.part`), path.join(outbox, file));
    return;
  }
  console.error(
    "usage: agent-loop.mjs pause <previous> <ran> <failed> | wait <role> <seconds> | gave-up <role>",
  );
  process.exit(2);
}

// Only run when invoked directly; the test imports the rules.
if (process.argv[1]?.endsWith("agent-loop.mjs") === true) {
  await main();
}
