#!/usr/bin/env node
/**
 * `agent-turn.mjs <state-dir> -- <command> [args…]`: run one turn of an
 * agent (#146, ADR-0027).
 *
 * The restart loop in nix/claude-llc.nix runs this with `claude-bot <role>`
 * as the command. It resumes the role's conversation by id, shows the
 * stream-json claude prints as readable lines (stream-format.mjs), and
 * exits 0 if the turn ended, 1 if the run failed and 3 if Claude's usage
 * limit is reached (#308), which is all the loop needs to know.
 *
 * `<state-dir>/session-id` is the conversation to resume. This writes it
 * from the run's `system`/`init` event; the agent, inside its jail, cannot
 * see it. A run that failed before claude even started a session, which is
 * what `--resume` with an id claude no longer has looks like, deletes it,
 * so the next turn starts a fresh conversation instead of failing the same
 * way until the loop gives up.
 *
 * A limited run writes `<state-dir>/limited-until`, the reset in unix
 * seconds or empty when it is unknown, for agent-loop.mjs to wait on. It
 * also keeps the event that said so in `usage-limit-sample.json`, and a
 * failed run its last raw lines in `last-failure.jsonl`, so the shapes
 * the limit detection guesses at can be checked against real ones.
 *
 * Every call re-reads the whole conversation, so a long one is paid for on
 * every call (#321). The context of each call goes to
 * `$VIBEWARS_CONTEXT_FILE`, where `tg wait` reads it and tells an agent
 * past CONTEXT_CEILING to end its turn. A turn that ends within NEAR_MARGIN
 * of it forgets the session, so the next one starts fresh from the kickoff
 * prompt: one that near has too little room to start a card (#1838).
 *
 * How much of Claude's usage is left (#452): every `rate_limit_event`
 * goes to `$VIBEWARS_LIMIT_FILE`, whitelisted and dated, for the
 * dashboard's CLAUDE pane.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { isNear, NEAR_MARGIN } from "./context.mjs";
import { withJailDir } from "./jail-fs.mjs";
import { peekWriter } from "./peek.mjs";
import {
  backgroundedIdsOf,
  contextOf,
  formatLine,
  mcpServersOf,
  parseEvent,
  rateLimitInfoOf,
  runFailed,
  sessionIdOf,
  usageLimitOf,
  waitCallsOf,
} from "./stream-format.mjs";

const [state, separator, command, ...args] = process.argv.slice(2);
if (state === undefined || separator !== "--" || command === undefined) {
  console.error("usage: agent-turn.mjs <state-dir> -- <command> [args…]");
  process.exit(2);
}
const SESSION = path.join(state, "session-id");
const ROLE = process.env.VIBEWARS_BOT_ROLE ?? path.basename(state);
/** The employee id: the state directory is named for it (`qa-tester@2`). */
const EMPLOYEE = path.basename(state);

/**
 * What the manager's `peek` reads (#19): every line this prints, as the pane
 * shows it. Unset in tests that do not look.
 */
const PEEK_DIR = process.env.VIBEWARS_PEEK_DIR ?? "";
const peek =
  PEEK_DIR === ""
    ? null
    : peekWriter(PEEK_DIR, EMPLOYEE, {
        // A recording that cannot be written costs the notice, never the turn.
        onError: (error) => {
          console.error(
            `agent-turn: peek is off for this run: ${error instanceof Error ? error.message : "?"}`,
          );
        },
      });

/**
 * A line for the pane and for `peek`.
 *
 * @param {string} out
 * @param {"out" | "err"} [stream]
 * @returns {void}
 */
function show(out, stream = "out") {
  if (stream === "out") {
    process.stdout.write(`${out}\n`);
  } else {
    console.error(out);
  }
  peek?.line(out);
}

/**
 * @param {number} code
 * @param {"between" | "limited"} state
 * @returns {never}
 */
function quit(code, state) {
  peek?.finish(state);
  process.exit(code);
}

/** How many raw lines of a failed run `last-failure.jsonl` keeps. */
const FAILURE_LINES = 20;

/**
 * The context ceiling (#321). Within NEAR_MARGIN of it, the next turn
 * starts a new session (#1838).
 */
const CONTEXT_CEILING = 120_000;
const CONTEXT_FILE = process.env.VIBEWARS_CONTEXT_FILE ?? "";
/** Where the last `rate_limit_event` goes, for the dashboard (#452). */
const LIMIT_FILE = process.env.VIBEWARS_LIMIT_FILE ?? "";

/**
 * Write `value` as JSON to `file`, unless `file` is unset.
 *
 * The file is in the agent's own bus directory, which its jail can write,
 * and this runs on the host: jail-fs.mjs (#329). A write that fails costs
 * what the file was for, never the turn.
 *
 * @param {string} file
 * @param {unknown} value
 * @returns {void}
 */
function saveBusFile(file, value) {
  if (file === "") {
    return;
  }
  try {
    withJailDir(path.dirname(file), "", {}, (dir) => {
      dir.writeAtomic(path.basename(file), `${JSON.stringify(value)}\n`);
    });
  } catch (error) {
    console.error(
      `agent-turn: could not write ${file}: ${error instanceof Error ? error.message : "?"}`,
    );
  }
}

/**
 * @param {number} tokens
 * @returns {void}
 */
function saveContext(tokens) {
  saveBusFile(CONTEXT_FILE, { tokens, ceiling: CONTEXT_CEILING });
}

/**
 * What the role's read cursor is now (#325), or `null` if it has none.
 *
 * @returns {string | null}
 */
function readCursor() {
  try {
    return withJailDir(path.dirname(CONTEXT_FILE), "", {}, (dir) => dir.readSmall("cursor", 64));
  } catch {
    return null;
  }
}

/**
 * Put the cursor back (#325). The jail is gone, so nothing races this.
 *
 * @param {string} cursor
 * @returns {void}
 */
function restoreCursor(cursor) {
  try {
    withJailDir(path.dirname(CONTEXT_FILE), "", {}, (dir) => {
      dir.writeAtomic("cursor", cursor);
    });
  } catch (error) {
    console.error(
      `agent-turn: could not rewind the inbox: ${error instanceof Error ? error.message : "?"}`,
    );
  }
}

/**
 * @param {number} tokens
 * @returns {string}
 */
function kilo(tokens) {
  return `${String(Math.round(tokens / 1000))}k`;
}

/** @returns {string | null} */
function savedSession() {
  try {
    const id = fs.readFileSync(SESSION, "utf8").trim();
    return id === "" ? null : id;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @returns {void}
 */
function saveSession(id) {
  writeAtomically(SESSION, `${id}\n`);
}

/**
 * @param {string} file
 * @param {string} contents
 * @returns {void}
 */
function writeAtomically(file, contents) {
  const part = `${file}.part`;
  fs.writeFileSync(part, contents);
  fs.renameSync(part, file);
}

/**
 * @param {number | null} until unix seconds
 * @returns {string}
 */
function resetText(until) {
  if (until === null) {
    return "reset time unknown";
  }
  const at = new Date(until * 1000);
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `resets ${hh}:${mm}`;
}

process.on("SIGINT", () => {
  // Ctrl-C reaches claude through the terminal and ends its turn. This stays
  // to see the run out and exit normally, so the loop carries on to the next
  // turn rather than bash taking the interrupt as its own.
});

fs.mkdirSync(state, { recursive: true });
for (const file of [CONTEXT_FILE, LIMIT_FILE]) {
  if (file !== "") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
}
// So a file left from the last session never turns this one away.
saveContext(0);
// A run killed after its context crossed the ceiling never reached the check
// at its end; the peak it left behind is read here (#1815). A missing or
// unreadable file is a first start, so 0.
const PEAK = path.join(state, "context-peak");
/** @returns {number} */
function savedPeak() {
  try {
    const peak = Number(fs.readFileSync(PEAK, "utf8").trim());
    return Number.isFinite(peak) ? peak : 0;
  } catch {
    return 0;
  }
}
if (isNear({ tokens: savedPeak(), ceiling: CONTEXT_CEILING })) {
  fs.rmSync(SESSION, { force: true });
  show(
    `agent-turn: the last run ended near the context ceiling (>= ${kilo(CONTEXT_CEILING - NEAR_MARGIN)}); starting a fresh session`,
    "err",
  );
}
writeAtomically(PEAK, "0\n");
const resume = savedSession();
peek?.state("turn");
const child = spawn(command, [...(resume === null ? [] : ["--resume", resume]), ...args], {
  stdio: ["inherit", "pipe", "inherit"],
});

/** What the run got as far as; set from the stream as it arrives. */
/** @type {{ init: boolean, result: boolean, limit: { until: number | null } | null, limitLine: string, context: number, peak: number }} */
const seen = { init: false, result: false, limit: null, limitLine: "", context: 0, peak: 0 };
/** @type {string[]} */
const recent = [];
/** The `tg wait` and `board wait` calls of this turn, by tool call id (#325). */
/** @type {Map<string, string>} */
const waits = new Map();
/** @type {Set<string>} */
const counted = new Set();
/** The inbox cursor when the first wait went to the background (#325). */
/** @type {{ to: string | null }} */
const rewind = { to: null };

/**
 * @param {string} command
 * @returns {void}
 */
function backgrounded(command) {
  show("⚠ tg wait went to the background; inbox rewound");
  try {
    fs.appendFileSync(
      path.join(state, "backgrounded-waits.jsonl"),
      `${JSON.stringify({ ts: Date.now(), role: ROLE, command })}\n`,
    );
  } catch (error) {
    console.error(
      `agent-turn: could not log the wait: ${error instanceof Error ? error.message : "?"}`,
    );
  }
  if (rewind.to === null && CONTEXT_FILE !== "") {
    rewind.to = readCursor();
  }
}
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
lines.on("line", (line) => {
  recent.push(line);
  if (recent.length > FAILURE_LINES) {
    recent.shift();
  }
  const event = parseEvent(line);
  const info = rateLimitInfoOf(event);
  if (info !== null) {
    saveBusFile(LIMIT_FILE, { at: Date.now(), ...info });
  }
  const limit = usageLimitOf(event);
  if (limit !== null) {
    seen.limit = limit;
    seen.limitLine = line;
  }
  // The first init only: claude prints one, so a second is forged.
  const id = seen.init ? null : sessionIdOf(event);
  const mcp = id === null ? [] : mcpServersOf(event);
  if (mcp.length > 0) {
    // An open channel to outside hub's checks: not one more call (#753).
    child.kill();
    show(
      `agent-turn: the jail has MCP servers (${mcp.join(", ")}); refusing to run: see #753`,
      "err",
    );
    quit(1, "between");
  }
  if (id !== null) {
    seen.init = true;
    saveSession(id);
  }
  if (event?.type === "result") {
    seen.result = true;
  }
  for (const call of waitCallsOf(event)) {
    waits.set(call.id, call.command);
    if (call.background) {
      counted.add(call.id);
      backgrounded(call.command);
    }
  }
  for (const id of backgroundedIdsOf(event)) {
    const command = waits.get(id);
    // An explicit run_in_background was counted when it was called.
    if (command !== undefined && !counted.has(id)) {
      backgrounded(command);
    }
  }
  const context = contextOf(event);
  if (context !== null) {
    seen.context = context;
    saveContext(context);
    // The peak, not the last call, says whether the session is over: a
    // compaction or a short last call must not hide it.
    if (context > seen.peak) {
      seen.peak = context;
      writeAtomically(PEAK, `${String(context)}\n`);
    }
  }
  for (const out of formatLine(line)) {
    show(out);
  }
});

/** @type {Promise<number | null>} */
const exited = new Promise((resolve) => {
  child.on("error", (error) => {
    console.error(`agent-turn: could not start ${command}: ${error.message}`);
    resolve(127);
  });
  child.on("close", (code) => {
    resolve(code);
  });
});
const code = await exited;

// Messages a backgrounded wait marked read were never seen (#325); a
// duplicate in the next inbox is the price of not losing one.
if (rewind.to !== null) {
  restoreCursor(rewind.to);
}

if (isNear({ tokens: seen.peak, ceiling: CONTEXT_CEILING })) {
  fs.rmSync(SESSION, { force: true });
  show(
    `agent-turn: context ${kilo(seen.peak)} is near the context ceiling (>= ${kilo(CONTEXT_CEILING - NEAR_MARGIN)}); next turn starts a fresh session`,
    "err",
  );
}

// A limit outranks the exit code and the result: the run that hit it may
// well have ended "normally", and it must not count as a failure either.
if (seen.limit !== null) {
  const { until } = seen.limit;
  writeAtomically(path.join(state, "limited-until"), until === null ? "" : `${String(until)}\n`);
  writeAtomically(path.join(state, "usage-limit-sample.json"), `${seen.limitLine}\n`);
  show(`agent-turn: Claude usage limit reached; ${resetText(until)}`, "err");
  quit(3, "limited");
}
if (!runFailed({ code, sawResult: seen.result })) {
  quit(0, "between");
}
writeAtomically(path.join(state, "last-failure.jsonl"), recent.map((line) => `${line}\n`).join(""));
if (!seen.init && resume !== null) {
  fs.rmSync(SESSION, { force: true });
  show(`agent-turn: could not resume session ${resume}; the next turn starts a new one`, "err");
}
show(
  `agent-turn: the run failed (${code === null ? "killed by a signal" : `exit ${String(code)}`}${seen.result ? "" : ", no result"})`,
  "err",
);
quit(1, "between");
