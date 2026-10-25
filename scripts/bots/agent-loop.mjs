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
 *   agent-loop.mjs limited <role> <state-dir> <previous>
 *       print how long to wait out Claude's usage limit (`limitPause`),
 *       and tell the company, once for all roles (#308)
 *   agent-loop.mjs sleep <seconds>
 *       return after `seconds`, whatever arrives: a message must not wake
 *       a role into another run the limit refuses
 *   agent-loop.mjs resumed <role>
 *       after a turn that ended, tell the company a limit is over, once
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

import { obj, readInbox, SYSTEM } from "./protocol.mjs";

/** Never less: an agent that ends turns instead of waiting cannot spin. */
export const PAUSE_MIN = 10;

/** Never more: board changes do not wake an agent, so it looks at least this often. */
export const PAUSE_MAX = 300;

/** A turn shorter than this did nothing much, most likely an empty inbox. */
export const SHORT_TURN = 60;

/** The shortest wait for a usage limit, and the margin past its reset. */
export const LIMIT_MARGIN = 60;

/** The longest wait for a usage limit with a known reset. */
export const LIMIT_MAX = 6 * 60 * 60;

/** The first wait for a usage limit whose reset is unknown. */
export const LIMIT_UNKNOWN_MIN = 300;

/** The longest wait for a usage limit whose reset is unknown. */
export const LIMIT_UNKNOWN_MAX = 1800;

/** A notice whose reset is this far past is stale; so is one with no reset this old. */
const NOTICE_STALE_PAST = 10 * 60;

/** The company-wide usage limit notice, under VIBEWARS_BOT_ROOT. */
const NOTICE = "usage-limit.json";

/** How often a wait looks at the inbox. */
const POLL_MS = 2000;

/**
 * The pause before the next turn.
 *
 * A short turn that ended normally doubles the last pause, up to
 * `PAUSE_MAX`; a long turn means work, so it goes back to `PAUSE_MIN`. A
 * failed run doubles too, however long it ran, so a short outage cannot use
 * up a role's five tries in under a minute (#308).
 *
 * @param {{ previous: number, ran: number, failed: boolean }} turn seconds
 * @returns {number} seconds
 */
export function nextPause({ previous, ran, failed }) {
  if (!failed && ran >= SHORT_TURN) {
    return PAUSE_MIN;
  }
  return Math.min(PAUSE_MAX, Math.max(PAUSE_MIN, previous * 2));
}

/**
 * How long to wait out Claude's usage limit, in seconds (#308).
 *
 * A known reset is waited for, plus a margin, within 1 min and 6 h. An
 * unknown one is retried at 5 min, doubling to at most 30 min; `previous`
 * is the last limit wait, 0 after a turn that ended.
 *
 * @param {{ until: number | null, now: number, previous: number }} limit unix seconds
 * @returns {number} seconds
 */
export function limitPause({ until, now, previous }) {
  if (until !== null) {
    return Math.min(LIMIT_MAX, Math.max(LIMIT_MARGIN, until - now + LIMIT_MARGIN));
  }
  return Math.min(LIMIT_UNKNOWN_MAX, Math.max(LIMIT_UNKNOWN_MIN, previous * 2));
}

/**
 * The reset agent-turn.mjs wrote to `<state>/limited-until`; `null` when it
 * is empty, missing or not a time, all of which mean "unknown".
 *
 * @param {string} state
 * @returns {number | null} unix seconds
 */
export function limitedUntil(state) {
  let text;
  try {
    text = fs.readFileSync(path.join(state, "limited-until"), "utf8").trim();
  } catch {
    return null;
  }
  const until = Number(text);
  return text !== "" && Number.isInteger(until) && until > 0 ? until : null;
}

/**
 * Is the usage limit notice at `file` stale, or not one at all?
 *
 * @param {string} file
 * @param {number} now unix seconds
 * @returns {boolean}
 */
function staleNotice(file, now) {
  let notice;
  try {
    notice = obj(/** @type {unknown} */ (JSON.parse(fs.readFileSync(file, "utf8"))));
  } catch {
    return true;
  }
  const { until, at } = notice;
  if (typeof until === "number") {
    return now > until + NOTICE_STALE_PAST;
  }
  return until !== null || typeof at !== "number" || now - at > LIMIT_MAX;
}

/**
 * Claim the company's usage limit notice: `true` if this call created it,
 * and so is the one to tell everyone; `false` if someone already has.
 *
 * The `wx` create is the dedupe, so nine roles hitting the limit at once
 * post one message. A stale notice, left by a limit long over, is replaced.
 * Two roles that both find it stale can race: the second removes the
 * first's fresh notice and posts again. Two notices is harmless, and rare
 * enough not to lock for.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @param {number | null} until unix seconds
 * @param {number} now unix seconds
 * @returns {boolean}
 */
export function claimNotice(root, until, now) {
  const file = path.join(root, NOTICE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, JSON.stringify({ until, at: now }));
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") {
        throw error;
      }
    }
    if (attempt > 0 || !staleNotice(file, now)) {
      return false;
    }
    fs.rmSync(file, { force: true });
  }
  return false;
}

/**
 * Release the usage limit notice after a turn that ended: `true` if this
 * call removed it, and so is the one to say the limit is over.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @returns {boolean}
 */
export function releaseNotice(root) {
  try {
    fs.unlinkSync(path.join(root, NOTICE));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {number} until unix seconds
 * @returns {string} host local time, 24 h
 */
function clock(until) {
  const at = new Date(until * 1000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * Tell the whole company, through the sidecar's system outbox, as
 * run-forever uses: a broadcast nobody can mistake for an agent's own words.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @param {string} name what the file is about, for whoever lists the outbox
 * @param {string} text
 * @returns {void}
 */
function tellCompany(root, name, text) {
  const outbox = path.join(root, "bus", SYSTEM, "outbox");
  fs.mkdirSync(outbox, { recursive: true });
  const file = `${String(Date.now())}-${name}.json`;
  fs.writeFileSync(path.join(outbox, `.${file}.part`), JSON.stringify({ to: "all", text }));
  fs.renameSync(path.join(outbox, `.${file}.part`), path.join(outbox, file));
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
  if (command === "sleep") {
    await sleep(seconds(args[0]) * 1000);
    return;
  }
  if (command === "gave-up") {
    const role = roleName(args[0]);
    tellCompany(
      env("VIBEWARS_BOT_ROOT"),
      `${role}-stopped`,
      `${role} failed five runs in a row and is stopped. Its window says why; ` +
        `restart it there with: claude-llc-agent ${role}`,
    );
    return;
  }
  if (command === "limited") {
    const role = roleName(args[0]);
    const state = args[1];
    if (state === undefined || state === "") {
      console.error("agent-loop: limited needs the role's state directory");
      process.exit(2);
    }
    const previous = seconds(args[2]);
    const root = env("VIBEWARS_BOT_ROOT");
    const now = Math.floor(Date.now() / 1000);
    const until = limitedUntil(state);
    if (claimNotice(root, until, now)) {
      tellCompany(
        root,
        `${role}-usage-limit`,
        until === null
          ? "Claude usage limit reached; agents retry every few minutes until it resets."
          : `Claude usage limit reached; agents resume at ${clock(until)}.`,
      );
    }
    console.log(String(limitPause({ until, now, previous })));
    return;
  }
  if (command === "resumed") {
    const role = roleName(args[0]);
    const root = env("VIBEWARS_BOT_ROOT");
    if (releaseNotice(root)) {
      tellCompany(root, `${role}-usage-limit-over`, "Claude usage limit over; agents are back.");
    }
    return;
  }
  console.error(
    "usage: agent-loop.mjs pause <previous> <ran> <failed> | wait <role> <seconds> | " +
      "sleep <seconds> | gave-up <role> | limited <role> <state-dir> <previous> | resumed <role>",
  );
  process.exit(2);
}

// Only run when invoked directly; the test imports the rules.
if (process.argv[1]?.endsWith("agent-loop.mjs") === true) {
  await main();
}
