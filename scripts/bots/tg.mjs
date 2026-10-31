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
 *   tg send <role> <text>   message every employee of a role (mirrored to the
 *                           Bots topic); tg send <role>@<n> messages one
 *   tg send operator <text> the manager only: reply to the operator, in the
 *                           Manager topic
 *   tg broadcast <text>     queue a message into General
 *   tg ask <question> [--option <text>]...
 *                           ask the operator (manager, architect, lead-dev);
 *                           the answer arrives in your inbox
 *   tg reply [--to <msg>] <text>
 *                           support only: answer a user in the Support
 *                           topic, as a reply to their message <msg>
 *   tg inbox [--all]        print unread messages, advancing the read cursor
 *   tg wait [--timeout N] [--all]
 *                           block until a message for you arrives, then print
 *                           everything unread; --all wakes on a plain
 *                           broadcast too
 *   tg roster               who is online, one line per employee
 *
 * `wait` is the important one: it is how an agent yields to a peer instead of
 * busy-polling or guessing.
 *
 * While the sidecar is down (sidecar.mjs), send, broadcast, ask and reply
 * still queue but exit 2 with a warning; wait warns once, keeps waiting, and
 * exits 2 at its timeout if the sidecar is still down.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

// The full roster, so an absent colleague can be reported as "not hired
// yet" rather than silently omitted.
import { contextFile, contextState, isOver, kilo, overLine, sayAtExit } from "./context.mjs";
import { ROLES } from "./hub-policy.mjs";
import { readRoster } from "./presence.mjs";
import {
  ASKERS,
  MAX_OPTION_CHARS,
  MAX_OPTIONS,
  OPERATOR_LINE,
  SUPPORT,
  TO_OPERATOR,
  formatLine,
  readInbox,
  wakes,
} from "./protocol.mjs";
import { readSidecar, sidecarDown } from "./sidecar.mjs";
import { roleOf } from "./staff.mjs";

// Who this agent is (#62): the bus directory is the employee's, and what it
// may do is its role's.
const EMPLOYEE = process.env.VIBEWARS_BOT_EMPLOYEE;
const ROLE = process.env.VIBEWARS_BOT_ROLE;
const BUS = process.env.VIBEWARS_BOT_BUS;

if (EMPLOYEE === undefined || ROLE === undefined || BUS === undefined) {
  console.error("tg: not running inside a claude-bot sandbox");
  process.exit(1);
}

const DIR = path.join(BUS, EMPLOYEE);
const INBOX = path.join(DIR, "inbox.jsonl");
const OUTBOX = path.join(DIR, "outbox");
const RECEIPTS = path.join(DIR, "receipts");
const CURSOR = path.join(DIR, "cursor");
const ROSTER = path.join(BUS, "roster");
/** The context of this agent's last call, written by agent-turn.mjs (#321). */
const CONTEXT = contextFile();

/* -------------------------------------------------------------------------- */

/**
 * Exit 2, loudly, if the sidecar is down (#583): everything still queues
 * and is sent once it is back, but an agent that believes its message went
 * out waits for an answer that cannot come. That hid a whole outage.
 *
 * @param {string} consequence what being down means for this command
 * @returns {void}
 */
function failIfSidecarDown(consequence) {
  const warning = sidecarWarning(consequence);
  if (warning !== null) {
    console.error(warning);
    process.exit(2);
  }
}

/**
 * @param {string} consequence
 * @returns {string | null} what to say if the sidecar is down, else null
 */
function sidecarWarning(consequence) {
  const record = readSidecar(BUS ?? "");
  if (!sidecarDown(Date.now(), record)) {
    return null;
  }
  const seen =
    record === null
      ? "no heartbeat"
      : `last seen ${String(Math.round((Date.now() - record.lastSeen) / 1000))} s ago`;
  return `tg: the Telegram sidecar is down (${seen}); ${consequence}. Tell the operator: claude-llc status`;
}

const UNREAD = "your message is queued but nobody is reading";

/**
 * Queue one message for the sidecar to send.
 *
 * Written to a temporary name and renamed into place so the sidecar, which
 * polls this directory, can never read a half-written file. The name is
 * ordered by time so messages leave in the order they were written.
 *
 * @param {Record<string, unknown> & { text: string }} entry
 * @returns {string} the entry's file name
 */
function queue(entry) {
  if (entry.text.trim() === "") {
    console.error("tg: refusing to send an empty message");
    process.exit(2);
  }
  fs.mkdirSync(OUTBOX, { recursive: true });
  const name = `${String(Date.now()).padStart(14, "0")}-${String(process.pid)}.json`;
  // Dotted AND without the final .json, so the sidecar cannot mistake a file
  // still being written for one ready to send.
  const tmp = path.join(OUTBOX, `.${name}.part`);
  fs.writeFileSync(tmp, JSON.stringify(entry));
  fs.renameSync(tmp, path.join(OUTBOX, name));
  return name;
}

/**
 * Post a question for the operator and print its Q number. Does not wait for
 * the answer: that arrives in the inbox like anything else, so `tg wait` is
 * still how an agent waits. It only waits for the sidecar to accept it.
 *
 * @param {string} text
 * @param {string[]} options
 * @returns {Promise<void>}
 */
async function ask(text, options) {
  // Checked here for a fast, specific answer; the sidecar checks again.
  if (!ASKERS.includes(ROLE ?? "")) {
    console.error(`tg: only ${ASKERS.join(", ")} may ask the operator. Ask the manager instead.`);
    process.exit(2);
  }
  if (
    options.length > MAX_OPTIONS ||
    options.some((o) => o === "" || o.length > MAX_OPTION_CHARS)
  ) {
    console.error(
      `tg: at most ${String(MAX_OPTIONS)} options, each 1-${String(MAX_OPTION_CHARS)} characters`,
    );
    process.exit(2);
  }
  const name = queue({ kind: "ask", text, options });
  failIfSidecarDown(UNREAD);
  const receipt = path.join(RECEIPTS, name);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    /** @type {Record<string, unknown>} */
    let answer;
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(fs.readFileSync(receipt, "utf8"));
      answer = /** @type {Record<string, unknown>} */ (parsed);
    } catch {
      await sleep(250);
      continue;
    }
    fs.rmSync(receipt, { force: true });
    if (typeof answer.question === "number") {
      console.log(
        `Q${String(answer.question)}: posted to the operator. The answer will arrive in your inbox.`,
      );
      return;
    }
    console.error(`tg: ${typeof answer.error === "string" ? answer.error : "refused"}`);
    process.exit(2);
  }
  console.log("queued for the operator; the sidecar has not confirmed it yet (is it running?)");
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
 * @param {(line: import("./protocol.mjs").InboxLine) => boolean} [ends] Print
 *   and advance only if some unread line satisfies this; otherwise nothing.
 * @returns {number} How many messages were printed.
 */
function drain(fromStart, advance, ends = () => true) {
  let contents;
  try {
    contents = fs.readFileSync(INBOX, "utf8");
  } catch {
    return 0;
  }

  const { lines, cursor } = readInbox(contents, fromStart ? 0 : readCursor());
  if (!lines.some(ends)) {
    return 0;
  }
  for (const line of lines) {
    console.log(formatLine(line));
  }
  if (advance) {
    fs.writeFileSync(CURSOR, `${String(cursor)}\n`);
  }
  return lines.length;
}

/**
 * The ceiling line `tg wait` ends on (#321), when the context is past it.
 *
 * @returns {string | null}
 */
function ceilingLine() {
  const state = contextState(CONTEXT);
  return state !== null && isOver(state)
    ? `Your context is over the ceiling (${kilo(state.tokens)} of ${kilo(state.ceiling)}). Commit and push any WIP, put anything that lives only in this conversation on the card or in a memory, then END YOUR TURN. The next turn starts fresh; your inbox is kept.`
    : null;
}

/**
 * @param {number} timeoutSeconds
 * @param {boolean} all wake on a plain broadcast too
 * @returns {Promise<number>}
 */
async function wait(timeoutSeconds, all) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  /** Whether this wait has said the sidecar is down, since it last was up. */
  let warned = false;
  for (;;) {
    const printed = drain(false, true, all ? () => true : (line) => wakes(line, EMPLOYEE ?? ""));
    // Waiting on would make every call of the next task re-read all of
    // this one (#321): end the turn here, and the next starts fresh. Said
    // after what arrived too (#1695): that may be work to hand on first.
    const over = ceilingLine();
    if (printed > 0) {
      if (over !== null) {
        console.log(over);
      }
      return printed;
    }
    if (over !== null) {
      console.log(over);
      return 0;
    }
    // Said once, and the wait goes on (#583): returning at once would
    // turn every agent's loop into a busy loop for the whole outage.
    const down = sidecarWarning("nothing can arrive until it is back");
    if (down !== null && !warned) {
      console.error(down);
    }
    warned = down !== null;
    if (Date.now() >= deadline) {
      if (down !== null) {
        console.log(`(nothing for you in ${String(timeoutSeconds)}s; the sidecar is still down)`);
        process.exit(2);
      }
      const queued = pending();
      console.log(
        queued === 0
          ? `(nothing new in ${String(timeoutSeconds)}s)`
          : `(nothing for you in ${String(timeoutSeconds)}s; ${String(queued)} General messages queued, tg inbox shows them)`,
      );
      return 0;
    }
    // A poll rather than fs.watch: the inbox is written by a process in a
    // different mount namespace, and inotify across that boundary is not
    // something to bet a blocking call on. One second is far below the
    // latency an agent cares about.
    await sleep(1000);
  }
}

/** @returns {number} how many unread lines wait, which `wait` left unprinted */
function pending() {
  try {
    return readInbox(fs.readFileSync(INBOX, "utf8"), readCursor()).lines.length;
  } catch {
    return 0;
  }
}

/**
 * The seat of an employee id, for listing a role's employees in order:
 * the bare role is 1, `<role>@<n>` is n.
 *
 * @param {string} employee
 * @returns {number}
 */
function seat(employee) {
  const [, n] = employee.split("@");
  return n === undefined ? 1 : Number(n);
}

/** @returns {void} */
function roster() {
  /** @type {string[]} */
  let entries = [];
  try {
    entries = fs.readdirSync(ROSTER);
  } catch {
    // No roster directory yet: nobody has come online.
  }
  const employees = entries
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .filter((employee) => roleOf(employee) !== null);
  const seen = readRoster(ROSTER, employees, Date.now());

  // Every role is listed, hired or not. The company runs with a partial
  // roster, and an agent that cannot tell "nobody has reviewed my pull
  // request yet" from "there is no reviewer" waits forever for a colleague
  // who was never hired. A role with employees gets a line for each.
  for (const role of ROLES) {
    const mine = [...seen]
      .filter(([employee]) => roleOf(employee) === role)
      .sort(([a], [b]) => seat(a) - seat(b));
    if (mine.length === 0) {
      console.log(`${role.padEnd(16)} not hired yet`);
      continue;
    }
    for (const [employee, entry] of mine) {
      const self = employee === EMPLOYEE ? " (you)" : "";
      const ageSeconds = Math.round((Date.now() - entry.lastSeen) / 1000);
      // The sidecar heartbeats every 15s and removes its own entry on a clean
      // exit, so anything past a minute died without cleaning up. Its age is
      // then meaningless, so say "stale" and stop there.
      console.log(
        `${employee.padEnd(16)} ${entry.fresh ? `online, ${String(ageSeconds)}s ago` : "stale"}${self}`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */

const [command, ...rest] = process.argv.slice(2);

// Every command but `wait`, which says its own line (#1695).
if (command !== "wait") {
  sayAtExit(() => [overLine(contextState(CONTEXT))]);
}

switch (command) {
  case "send": {
    const [to, ...words] = rest;
    if (to === undefined || words.length === 0) {
      console.error("tg: usage: tg send <role|employee> <text...>");
      process.exit(2);
    }
    // The sidecar refuses this too; saying so here saves a round trip.
    if (to === TO_OPERATOR && ROLE !== OPERATOR_LINE) {
      console.error(
        `tg: only the ${OPERATOR_LINE} writes to the operator. Tell the ${OPERATOR_LINE} instead.`,
      );
      process.exit(2);
    }
    queue({ to, text: words.join(" ") });
    console.log(`queued to ${to}`);
    failIfSidecarDown(UNREAD);
    break;
  }

  case "broadcast": {
    if (rest.length === 0) {
      console.error("tg: usage: tg broadcast <text...>");
      process.exit(2);
    }
    queue({ to: "all", text: rest.join(" ") });
    console.log("queued to General");
    failIfSidecarDown(UNREAD);
    break;
  }
  case "ask": {
    /** @type {string[]} */
    const words = [];
    /** @type {string[]} */
    const options = [];
    for (let i = 0; i < rest.length; i += 1) {
      const word = rest[i] ?? "";
      if (word === "--option") {
        const option = rest[i + 1];
        if (option === undefined) {
          console.error("tg: --option needs the option's text");
          process.exit(2);
        }
        options.push(option);
        i += 1;
      } else {
        words.push(word);
      }
    }
    if (words.length === 0) {
      console.error('tg: usage: tg ask "<question>" [--option "<text>"]...');
      process.exit(2);
    }
    await ask(words.join(" "), options);
    break;
  }

  case "reply": {
    // The sidecar refuses this too; saying so here saves a round trip.
    if (ROLE !== SUPPORT) {
      console.error(`tg: only ${SUPPORT} posts in the Support topic.`);
      process.exit(2);
    }
    /** @type {number | undefined} */
    let replyTo;
    let words = rest;
    if (rest[0] === "--to") {
      replyTo = Number(rest[1]);
      if (!Number.isInteger(replyTo) || replyTo <= 0) {
        console.error("tg: --to takes the message number shown as (msg N) in your inbox");
        process.exit(2);
      }
      words = rest.slice(2);
    }
    if (words.length === 0) {
      console.error("tg: usage: tg reply [--to <msg>] <text...>");
      process.exit(2);
    }
    queue({ kind: "reply", text: words.join(" "), ...(replyTo === undefined ? {} : { replyTo }) });
    console.log("queued to Support");
    failIfSidecarDown(UNREAD);
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
    // 110 s fits Bash's 120 s default timeout; 540 s fits its 600 s maximum.
    let timeout = raw === undefined ? 110 : Number.parseInt(raw, 10);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      console.error("tg: --timeout takes a positive number of seconds");
      process.exit(2);
    }
    if (timeout > 540) {
      console.log("(tg wait: --timeout capped at 540 s)");
      timeout = 540;
    }
    await wait(timeout, rest.includes("--all"));
    break;
  }

  case "roster":
    roster();
    break;

  default:
    console.error("tg: usage: tg <send|broadcast|ask|reply|inbox|wait|roster> ...");
    process.exit(2);
}
