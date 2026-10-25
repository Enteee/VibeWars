#!/usr/bin/env node
/**
 * `agent-turn.mjs <state-dir> -- <command> [args…]`: run one turn of an
 * agent (#146, ADR-0027).
 *
 * The restart loop in nix/claude-llc.nix runs this with `claude-bot <role>`
 * as the command. It resumes the role's conversation by id, shows the
 * stream-json claude prints as readable lines (stream-format.mjs), and
 * exits 0 if the turn ended and 1 if the run failed, which is all the loop
 * needs to know.
 *
 * `<state-dir>/session-id` is the conversation to resume. This writes it
 * from the run's `system`/`init` event; the agent, inside its jail, cannot
 * see it. A run that failed before claude even started a session, which is
 * what `--resume` with an id claude no longer has looks like, deletes it,
 * so the next turn starts a fresh conversation instead of failing the same
 * way until the loop gives up.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

import { formatLine, parseEvent, runFailed, sessionIdOf } from "./stream-format.mjs";

const [state, separator, command, ...args] = process.argv.slice(2);
if (state === undefined || separator !== "--" || command === undefined) {
  console.error("usage: agent-turn.mjs <state-dir> -- <command> [args…]");
  process.exit(2);
}
const SESSION = path.join(state, "session-id");

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
  const part = `${SESSION}.part`;
  fs.writeFileSync(part, `${id}\n`);
  fs.renameSync(part, SESSION);
}

process.on("SIGINT", () => {
  // Ctrl-C reaches claude through the terminal and ends its turn. This stays
  // to see the run out and exit normally, so the loop carries on to the next
  // turn rather than bash taking the interrupt as its own.
});

fs.mkdirSync(state, { recursive: true });
const resume = savedSession();
const child = spawn(command, [...(resume === null ? [] : ["--resume", resume]), ...args], {
  stdio: ["inherit", "pipe", "inherit"],
});

/** What the run got as far as; set from the stream as it arrives. */
const seen = { init: false, result: false };
const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
lines.on("line", (line) => {
  const event = parseEvent(line);
  // The first init only: claude prints one, so a second is forged.
  const id = seen.init ? null : sessionIdOf(event);
  if (id !== null) {
    seen.init = true;
    saveSession(id);
  }
  if (event?.type === "result") {
    seen.result = true;
  }
  for (const out of formatLine(line)) {
    process.stdout.write(`${out}\n`);
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

if (!runFailed({ code, sawResult: seen.result })) {
  process.exit(0);
}
if (!seen.init && resume !== null) {
  fs.rmSync(SESSION, { force: true });
  console.error(`agent-turn: could not resume session ${resume}; the next turn starts a new one`);
}
console.error(
  `agent-turn: the run failed (${code === null ? "killed by a signal" : `exit ${String(code)}`}${seen.result ? "" : ", no result"})`,
);
process.exit(1);
