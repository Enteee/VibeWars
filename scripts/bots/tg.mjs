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
 *   tg send <role> <text>   message one colleague (mirrored to the Bots topic)
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

// The full roster, so an absent colleague can be reported as "not hired
// yet" rather than silently omitted.
import { ROLES } from "./hub-policy.mjs";
import {
  ASKERS,
  MAX_OPTION_CHARS,
  MAX_OPTIONS,
  OPERATOR_LINE,
  SUPPORT,
  TO_OPERATOR,
  formatLine,
  readInbox,
} from "./protocol.mjs";

const ROLE = process.env.VIBEWARS_BOT_ROLE;
const BUS = process.env.VIBEWARS_BOT_BUS;

if (ROLE === undefined || BUS === undefined) {
  console.error("tg: not running inside a claude-bot sandbox");
  process.exit(1);
}

const DIR = path.join(BUS, ROLE);
const INBOX = path.join(DIR, "inbox.jsonl");
const OUTBOX = path.join(DIR, "outbox");
const RECEIPTS = path.join(DIR, "receipts");
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
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const name of files) {
    /** @type {unknown} */
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(ROSTER, name), "utf8"));
    } catch {
      continue;
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    if (typeof record.role === "string" && typeof record.lastSeen === "number") {
      seen.set(record.role, record.lastSeen);
    }
  }

  // Every role is listed, hired or not. The company runs with a partial
  // roster, and an agent that cannot tell "nobody has reviewed my pull
  // request yet" from "there is no reviewer" waits forever for a colleague
  // who was never hired.
  for (const role of ROLES) {
    const self = role === ROLE ? " (you)" : "";
    const last = seen.get(role);
    if (last === undefined) {
      console.log(`${role.padEnd(16)} not hired yet${self}`);
      continue;
    }
    const ageSeconds = Math.round((Date.now() - last) / 1000);
    // The sidecar heartbeats every 15s and removes its own entry on a clean
    // exit, so anything past a minute died without cleaning up. Its age is
    // then meaningless, so say "stale" and stop there.
    console.log(
      `${role.padEnd(16)} ${ageSeconds > 60 ? "stale" : `online, ${String(ageSeconds)}s ago`}${self}`,
    );
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
    // The sidecar refuses this too; saying so here saves a round trip.
    if (to === TO_OPERATOR && ROLE !== OPERATOR_LINE) {
      console.error(
        `tg: only the ${OPERATOR_LINE} writes to the operator. Tell the ${OPERATOR_LINE} instead.`,
      );
      process.exit(2);
    }
    queue({ to, text: words.join(" ") });
    console.log(`queued to ${to}`);
    break;
  }

  case "broadcast": {
    if (rest.length === 0) {
      console.error("tg: usage: tg broadcast <text...>");
      process.exit(2);
    }
    queue({ to: "all", text: rest.join(" ") });
    console.log("queued to General");
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
    console.error("tg: usage: tg <send|broadcast|ask|reply|inbox|wait|roster> ...");
    process.exit(2);
}
