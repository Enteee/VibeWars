#!/usr/bin/env node
/**
 * The pauses between an agent's turns, for the restart loop in
 * nix/claude-llc.nix (#146, ADR-0027).
 *
 *   agent-loop.mjs pause <previous> <ran> <failed>
 *       print the next pause in seconds (`nextPause`)
 *   agent-loop.mjs wait <employee> <seconds>
 *       return after `seconds`, or sooner once the employee has unread mail
 *   agent-loop.mjs idle <employee>
 *       after a turn `tg wait` called idle (#1694): return after
 *       `IDLE_PAUSE`, or sooner on mail for the employee, a card arriving
 *       in its role's column, or a reboot; say which in `agents/<employee>/woke`
 *   agent-loop.mjs gave-up <employee>
 *       tell the company the loop has stopped for good; the manager's keeps
 *       trying (#384), and the message says so
 *   agent-loop.mjs limited <employee> <state-dir> <previous>
 *       print how long to wait out Claude's usage limit (`limitPause`),
 *       and tell the company, once for all roles (#308)
 *   agent-loop.mjs sleep <seconds>
 *       return after `seconds`, whatever arrives: a message must not wake
 *       a role into another run the limit refuses
 *   agent-loop.mjs resumed <employee>
 *       after a turn that ended, tell the company a limit is over, once
 *
 * Agents end turns while idle, whatever the briefing says, and a resumed
 * turn re-reads the whole conversation. A fixed ten seconds between turns
 * would have an idle agent spend more than a working one. So the pause
 * doubles while turns stay short, and the wait ends early when someone
 * writes to the agent, which is what an idle agent is waiting for anyway.
 *
 * An agent `tg wait` found idle sleeps here, not in `tg wait` (#1694):
 * every `tg wait` that returns empty is a call that re-reads the whole
 * context, and a wait between turns costs nothing.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { RELEASE_AT, diskHold, freeBytes, gib } from "./disk.mjs";
import { answerBoard, arrivals, readBoardState } from "./hub-board.mjs";
import { obj, readInbox, SYSTEM, wakes } from "./protocol.mjs";
import { roleOf, WORK_COLUMN } from "./staff.mjs";

/** Never less: an agent that ends turns instead of waiting cannot spin. */
export const PAUSE_MIN = 10;

/** Never more: board changes do not wake an agent, so it looks at least this often. */
export const PAUSE_MAX = 300;

/**
 * An idle agent's wait (#1694): 50 minutes, inside the prompt cache's
 * hour, so the turn it wakes into still reads its context from the cache.
 */
export const IDLE_PAUSE = 3000;

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

/** The company-wide disk hold notice, under VIBEWARS_BOT_ROOT (#358). */
const DISK_NOTICE = "disk-hold.json";

/** How often a disk hold looks at the disk again. */
const DISK_POLL_MS = 60_000;

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
export function tellCompany(root, name, text) {
  const outbox = path.join(root, "bus", SYSTEM, "outbox");
  fs.mkdirSync(outbox, { recursive: true });
  const file = `${String(Date.now())}-${name}.json`;
  fs.writeFileSync(
    path.join(outbox, `.${file}.part`),
    JSON.stringify({ to: "all", text, nudge: null, direct: false }),
  );
  fs.renameSync(path.join(outbox, `.${file}.part`), path.join(outbox, file));
}

/**
 * What the company is told when an employee's loop fails five runs in a row.
 * The manager's loop does not stop, since a company without one cannot be
 * steered (#384): it tries again at the longest pause.
 *
 * @param {string} employee
 * @returns {string}
 */
export function gaveUpText(employee) {
  return roleOf(employee) === "manager"
    ? `${employee} failed five runs in a row. It keeps trying every ${String(PAUSE_MAX / 60)} minutes; ` +
        "its window says why."
    : `${employee} failed five runs in a row and is stopped. Its window says why; ` +
        `restart it there with: claude-llc-agent ${employee}`;
}

/**
 * Block while the disk is nearly full (#358); returns at once otherwise.
 * Nine loops may all be here: creating the notice file is what makes one of
 * them say so, and removing it what makes one say the hold is over. A turn
 * already running is not stopped; only the next one waits.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @param {string} dir a directory on the filesystem to watch
 * @returns {Promise<void>}
 */
async function holdForDisk(root, dir) {
  const file = path.join(root, DISK_NOTICE);
  let holding = fs.existsSync(file);
  for (;;) {
    const free = freeBytes(dir);
    holding = diskHold({ freeBytes: free, holding });
    if (!holding) {
      try {
        fs.unlinkSync(file);
        tellCompany(root, "disk-hold-over", "Disk space is back; agent turns resume.");
      } catch {
        // Not held, or another loop already said so.
      }
      return;
    }
    try {
      fs.writeFileSync(file, JSON.stringify({ at: Date.now() }), { flag: "wx" });
      tellCompany(
        root,
        "disk-hold",
        `Disk nearly full (${gib(free)} GiB free where the repository is): agent turns are on hold until ${gib(RELEASE_AT)} GiB is free.`,
      );
    } catch {
      // Another loop already said so.
    }
    await sleep(DISK_POLL_MS);
  }
}

/**
 * The lines in `dir`, an employee's bus directory, its `tg` has not read yet.
 *
 * @param {string} dir
 * @returns {import("./protocol.mjs").InboxLine[]}
 */
function unread(dir) {
  let contents;
  try {
    contents = fs.readFileSync(path.join(dir, "inbox.jsonl"), "utf8");
  } catch {
    return [];
  }
  let cursor = 0;
  try {
    const value = Number.parseInt(fs.readFileSync(path.join(dir, "cursor"), "utf8").trim(), 10);
    cursor = Number.isFinite(value) ? value : 0;
  } catch {
    // Never read: everything is unread.
  }
  return readInbox(contents, cursor).lines;
}

/**
 * Has `dir`, an employee's bus directory, mail its `tg` has not read yet?
 *
 * @param {string} dir
 * @returns {boolean}
 */
export function hasUnread(dir) {
  return unread(dir).length > 0;
}

/**
 * Has `dir`, an employee's bus directory, unread mail that would end its
 * `tg wait` (`wakes`)? A plain General broadcast, which `tg wait` leaves
 * unread, does not count, or it would wake an idle agent at once.
 *
 * @param {string} dir
 * @param {string} employee
 * @returns {boolean}
 */
export function hasWaking(dir, employee) {
  return unread(dir).some((line) => wakes(line, employee));
}

/**
 * Why an idle wait ended.
 *
 * @typedef {{ by: "message" } | { by: "card", number: number | null, column: string }
 *   | { by: "timer" } | { by: "reboot" }} Woken
 */

/**
 * Wait, idle, for what an idle agent has work in (#1694): mail, a card
 * arriving in `column`, or a reboot, for at most `seconds`. A card already
 * in the column when the wait starts wakes nobody, as in `board wait`.
 * `changes` answers `board changes --since <token>` (null: the whole
 * board), or `null` while there is no board to read; with none at the
 * start, the wait is on mail alone.
 *
 * @param {{
 *   seconds: number,
 *   column: string | null,
 *   mail: () => boolean,
 *   rebooting: () => boolean,
 *   changes: (since: string | null) => Record<string, unknown> | null,
 *   now?: () => number,
 *   pause?: (ms: number) => Promise<unknown>,
 * }} options
 * @returns {Promise<Woken>}
 */
export async function idleWait({
  seconds: limit,
  column,
  mail,
  rebooting,
  changes,
  now = Date.now,
  pause = sleep,
}) {
  const until = now() + limit * 1000;
  const start = column === null ? null : changes(null);
  let watch =
    column === null || start === null
      ? null
      : { column, token: String(start.token), known: arrivals(new Set(), start, column).known };
  for (;;) {
    if (mail()) {
      return { by: "message" };
    }
    if (rebooting()) {
      return { by: "reboot" };
    }
    if (watch !== null) {
      const next = changes(watch.token);
      // Unreadable for a moment: try again next time round.
      if (next !== null) {
        const seen = arrivals(watch.known, next, watch.column);
        const [card] = seen.arrived;
        if (card !== undefined) {
          return { by: "card", number: card.number, column: watch.column };
        }
        watch = { ...watch, token: String(next.token), known: seen.known };
      }
    }
    const left = until - now();
    if (left <= 0) {
      return { by: "timer" };
    }
    await pause(Math.min(POLL_MS, left));
  }
}

/**
 * The line the next turn's prompt opens with (`agents/<employee>/woke`), or
 * `null` for a reboot, whose turn starts a fresh session anyway.
 *
 * @param {Woken} woken
 * @returns {string | null}
 */
export function wokeText(woken) {
  switch (woken.by) {
    case "message":
      return "You were idle; woken by: a message.";
    case "card":
      return `You were idle; woken by: card #${String(woken.number ?? "-")} in ${woken.column}.`;
    case "timer":
      return `You were idle; woken by: the ${String(IDLE_PAUSE / 60)}-minute timer.`;
    case "reboot":
      return null;
  }
}

/**
 * Where an idle wait says what woke it: the employee's host-only state
 * directory, never its bus directory. The jail can write there, so a
 * symlink planted as `woke` would have the host overwrite, or the
 * launcher read into the prompt, any file the operator can.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @param {string} employee
 * @returns {string}
 */
export function wokeFile(root, employee) {
  return path.join(root, "agents", employee, "woke");
}

/**
 * Write `text` as the next turn's opening line, or remove it for `null`.
 * A rename, so the file is whole when the launcher reads it.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @param {string} employee
 * @param {string | null} text
 */
export function writeWoke(root, employee, text) {
  const file = wokeFile(root, employee);
  if (text === null) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${String(process.pid)}`;
  fs.writeFileSync(temp, `${text}\n`);
  fs.renameSync(temp, file);
}

/**
 * `board changes` for the loop, which runs outside the jail and has no
 * `hub`: answered from hubd's copy of the board, `hub/board.json`, as hubd
 * answers it. `null` while there is no copy, or none in the current shape.
 *
 * @param {string} root VIBEWARS_BOT_ROOT
 * @returns {(since: string | null) => Record<string, unknown> | null}
 */
export function boardChanges(root) {
  return (since) => {
    /** @type {unknown} */
    let raw;
    /** @type {unknown} */
    let cfg;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(root, "hub", "board.json"), "utf8"));
      cfg = JSON.parse(fs.readFileSync(path.join(root, "company.json"), "utf8"));
    } catch {
      return null;
    }
    const state = readBoardState(raw);
    const { repo } = obj(cfg);
    if (state === null || typeof repo !== "string") {
      return null;
    }
    return answerBoard(state, { verb: "changes", since }, repo);
  };
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
 * @param {string | undefined} employee
 * @returns {string}
 */
function employeeName(employee) {
  if (employee === undefined || roleOf(employee) === null) {
    console.error(`agent-loop: not an employee: ${String(employee)}`);
    process.exit(2);
  }
  return employee;
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
    const dir = path.join(env("VIBEWARS_BOT_ROOT"), "bus", employeeName(args[0]));
    const until = Date.now() + seconds(args[1]) * 1000;
    await sleep(PAUSE_MIN * 1000);
    while (Date.now() < until && !hasUnread(dir)) {
      await sleep(Math.min(POLL_MS, Math.max(0, until - Date.now())));
    }
    return;
  }
  if (command === "idle") {
    const employee = employeeName(args[0]);
    const root = env("VIBEWARS_BOT_ROOT");
    const dir = path.join(root, "bus", employee);
    const woken = await idleWait({
      seconds: IDLE_PAUSE,
      column: WORK_COLUMN[roleOf(employee) ?? ""] ?? null,
      mail: () => hasWaking(dir, employee),
      rebooting: () => fs.existsSync(path.join(root, "reboot.json")),
      changes: boardChanges(root),
    });
    writeWoke(root, employee, wokeText(woken));
    return;
  }
  if (command === "disk") {
    await holdForDisk(env("VIBEWARS_BOT_ROOT"), env("DEVENV_ROOT"));
    return;
  }
  if (command === "sleep") {
    await sleep(seconds(args[0]) * 1000);
    return;
  }
  if (command === "gave-up") {
    const employee = employeeName(args[0]);
    tellCompany(env("VIBEWARS_BOT_ROOT"), `${employee}-stopped`, gaveUpText(employee));
    return;
  }
  if (command === "limited") {
    const employee = employeeName(args[0]);
    const state = args[1];
    if (state === undefined || state === "") {
      console.error("agent-loop: limited needs the employee's state directory");
      process.exit(2);
    }
    const previous = seconds(args[2]);
    const root = env("VIBEWARS_BOT_ROOT");
    const now = Math.floor(Date.now() / 1000);
    const until = limitedUntil(state);
    if (claimNotice(root, until, now)) {
      tellCompany(
        root,
        `${employee}-usage-limit`,
        until === null
          ? "Claude usage limit reached; agents retry every few minutes until it resets."
          : `Claude usage limit reached; agents resume at ${clock(until)}.`,
      );
    }
    console.log(String(limitPause({ until, now, previous })));
    return;
  }
  if (command === "resumed") {
    const employee = employeeName(args[0]);
    const root = env("VIBEWARS_BOT_ROOT");
    if (releaseNotice(root)) {
      tellCompany(
        root,
        `${employee}-usage-limit-over`,
        "Claude usage limit over; agents are back.",
      );
    }
    return;
  }
  console.error(
    "usage: agent-loop.mjs pause <previous> <ran> <failed> | wait <employee> <seconds> | " +
      "idle <employee> | " +
      "sleep <seconds> | disk | gave-up <employee> | " +
      "limited <employee> <state-dir> <previous> | resumed <employee>",
  );
  process.exit(2);
}

// Only run when invoked directly; the test imports the rules.
if (process.argv[1]?.endsWith("agent-loop.mjs") === true) {
  await main();
}
