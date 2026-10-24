#!/usr/bin/env node
/**
 * `tg` — the only way out of a claude-bot sandbox.
 *
 * This runs INSIDE the bubblewrap jail and deliberately has no network access
 * and no token. It reads and writes two bind-mounted directories and nothing
 * else; the sidecar (scripts/bots/link.mjs) is what actually talks to
 * Telegram. An agent cannot leak the bot token because it never has it, and
 * cannot call deleteChat because it has no API client.
 *
 *   tg send <role> <text>   queue a message into that role's topic
 *   tg broadcast <text>     queue a message into General
 *   tg inbox [--all]        print unread messages, advancing the read cursor
 *   tg wait [--timeout N]   block until something new arrives, then print it
 *   tg roster               who is online
 *
 * `wait` is the important one: it is how an agent yields to a peer instead of
 * busy-polling or guessing.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { formatLine, readInbox } from "./protocol.mjs";

const ROLE = process.env.VIBEWARS_BOT_ROLE;
const BUS = process.env.VIBEWARS_BOT_BUS;

if (ROLE === undefined || BUS === undefined) {
  console.error("tg: not running inside a claude-bot sandbox");
  process.exit(1);
}

const DIR = path.join(BUS, ROLE);
const INBOX = path.join(DIR, "inbox.jsonl");
const OUTBOX = path.join(DIR, "outbox");
const CURSOR = path.join(DIR, "cursor");
const ROSTER = path.join(BUS, "roster");

/* -------------------------------------------------------------------------- */

/**
 * Queue one message for the sidecar to send.
 *
 * Written to a temporary name and renamed into place so the sidecar, which
 * polls this directory, can never read a half-written file. The name is
 * ordered by time so messages leave in the order they were written.
 *
 * @param {string} to Role name, or "all" for General.
 * @param {string} text
 * @returns {void}
 */
function queue(to, text) {
  if (text.trim() === "") {
    console.error("tg: refusing to send an empty message");
    process.exit(2);
  }
  fs.mkdirSync(OUTBOX, { recursive: true });
  const name = `${String(Date.now()).padStart(14, "0")}-${String(process.pid)}.json`;
  // Dotted AND without the final .json, so the sidecar cannot mistake a file
  // still being written for one ready to send.
  const tmp = path.join(OUTBOX, `.${name}.part`);
  fs.writeFileSync(tmp, JSON.stringify({ to, text }));
  fs.renameSync(tmp, path.join(OUTBOX, name));
}

/** @returns {number} */
function readCursor() {
  try {
    const value = Number.parseInt(fs.readFileSync(CURSOR, "utf8").trim(), 10);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {boolean} fromStart Ignore the cursor and replay the whole inbox.
 * @param {boolean} advance Persist the new cursor.
 * @returns {number} How many messages were printed.
 */
function drain(fromStart, advance) {
  let contents;
  try {
    contents = fs.readFileSync(INBOX, "utf8");
  } catch {
    return 0;
  }

  const { lines, cursor } = readInbox(contents, fromStart ? 0 : readCursor());
  for (const line of lines) {
    console.log(formatLine(line));
  }
  if (advance) {
    fs.writeFileSync(CURSOR, `${String(cursor)}\n`);
  }
  return lines.length;
}

/**
 * @param {number} timeoutSeconds
 * @returns {Promise<number>}
 */
async function wait(timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    const printed = drain(false, true);
    if (printed > 0) {
      return printed;
    }
    if (Date.now() >= deadline) {
      console.log(`(nothing new in ${String(timeoutSeconds)}s)`);
      return 0;
    }
    // A poll rather than fs.watch: the inbox is written by a process in a
    // different mount namespace, and inotify across that boundary is not
    // something to bet a blocking call on. One second is far below the
    // latency an agent cares about.
    await sleep(1000);
  }
}

/** @returns {void} */
function roster() {
  /** @type {string[]} */
  let files;
  try {
    files = fs.readdirSync(ROSTER).filter((name) => name.endsWith(".json"));
  } catch {
    // No roster directory yet: nobody has ever started a sidecar here.
    files = [];
  }
  if (files.length === 0) {
    console.log("(nobody online)");
    return;
  }

  for (const name of files.sort()) {
    /** @type {unknown} */
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(ROSTER, name), "utf8"));
    } catch {
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const seen = typeof record.lastSeen === "number" ? record.lastSeen : 0;
    const ageSeconds = Math.round((Date.now() - seen) / 1000);
    // The sidecar heartbeats every 15s and removes its own entry on a clean
    // exit, so anything past a minute died without cleaning up. Its age is
    // then meaningless — a leftover file can claim to be decades old — so say
    // "stale" and stop there rather than printing a number nobody can use.
    const self = record.role === ROLE ? " (you)" : "";
    const state = ageSeconds > 60 ? "stale" : `online, ${String(ageSeconds)}s ago`;
    console.log(`${String(record.role).padEnd(14)} ${state}${self}`);
  }
}

/* -------------------------------------------------------------------------- */

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "send": {
    const [to, ...words] = rest;
    if (to === undefined || words.length === 0) {
      console.error("tg: usage: tg send <role> <text...>");
      process.exit(2);
    }
    queue(to, words.join(" "));
    console.log(`queued to ${to}`);
    break;
  }

  case "broadcast": {
    if (rest.length === 0) {
      console.error("tg: usage: tg broadcast <text...>");
      process.exit(2);
    }
    queue("all", rest.join(" "));
    console.log("queued to General");
    break;
  }

  case "inbox": {
    const all = rest.includes("--all");
    if (drain(all, !all) === 0) {
      console.log("(nothing new)");
    }
    break;
  }

  case "wait": {
    const flag = rest.indexOf("--timeout");
    const raw = flag === -1 ? undefined : rest[flag + 1];
    const timeout = raw === undefined ? 300 : Number.parseInt(raw, 10);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      console.error("tg: --timeout takes a positive number of seconds");
      process.exit(2);
    }
    await wait(timeout);
    break;
  }

  case "roster":
    roster();
    break;

  default:
    console.error("tg: usage: tg <send|broadcast|inbox|wait|roster> ...");
    process.exit(2);
}
