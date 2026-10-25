/**
 * The pane's view of a turn, the rule that tells a failed run from an ended
 * turn, and agent-turn.mjs run for real against a stand-in for claude-bot.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { LINE_MAX, formatLine, oneLine, runFailed, sessionIdOf } from "./stream-format.mjs";

const AGENT_TURN = path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-turn.mjs");

const SESSION_ID = "0f3c9a1e-5b2d-4c8e-9a7f-1d2e3f4a5b6c";

const INIT = {
  type: "system",
  subtype: "init",
  session_id: SESSION_ID,
  model: "claude-opus-5-5",
  tools: ["Bash", "Read"],
};
const RESULT = {
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 7,
  duration_ms: 41_600,
  total_cost_usd: 0.123,
  result: "Done.",
  session_id: SESSION_ID,
};

/**
 * @param {unknown[]} content
 * @param {"assistant" | "user"} type
 * @returns {string}
 */
function message(content, type = "assistant") {
  return JSON.stringify({ type, message: { role: type, content }, session_id: SESSION_ID });
}

describe("formatLine", () => {
  it("opens with the session and model", () => {
    expect(formatLine(JSON.stringify(INIT))).toEqual([`● session ${SESSION_ID} · claude-opus-5-5`]);
  });

  it("shows the agent's text as it wrote it", () => {
    expect(formatLine(message([{ type: "text", text: "Orienting.\nThen the board.\n" }]))).toEqual([
      "Orienting.\nThen the board.",
    ]);
  });

  it("gives each tool call one line naming what it is about", () => {
    const line = message([
      { type: "thinking", thinking: "hmm" },
      {
        type: "tool_use",
        id: "t1",
        name: "Bash",
        input: { command: "tg inbox", description: "x" },
      },
      { type: "tool_use", id: "t2", name: "Read", input: { file_path: "/w/CLAUDE.md" } },
      { type: "tool_use", id: "t3", name: "TodoWrite", input: { todos: [] } },
    ]);
    expect(formatLine(line)).toEqual([
      "→ Bash: tg inbox",
      "→ Read: /w/CLAUDE.md",
      '→ TodoWrite: {"todos":[]}',
    ]);
  });

  it("cuts a tool result to one line, and marks an error", () => {
    const long = "x".repeat(LINE_MAX + 50);
    const line = message(
      [
        { type: "tool_result", tool_use_id: "t1", content: "first\nsecond\nthird" },
        { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: long }] },
        { type: "tool_result", tool_use_id: "t3", content: "Exit code 1", is_error: true },
      ],
      "user",
    );
    expect(formatLine(line)).toEqual([
      "  ← first (+2 lines)",
      `  ← ${"x".repeat(LINE_MAX - 1)}…`,
      "  ✗ Exit code 1",
    ]);
  });

  it("closes with how the turn ended", () => {
    expect(formatLine(JSON.stringify(RESULT))).toEqual(["■ turn success · 7 steps · 42s · $0.12"]);
  });

  it("skips events it does not know, and never throws", () => {
    for (const line of [
      JSON.stringify({ type: "stream_event", event: {} }),
      JSON.stringify({ type: "system", subtype: "compact_boundary" }),
      JSON.stringify({ type: "assistant" }),
      JSON.stringify({ type: "user", message: { content: "a plain prompt" } }),
      JSON.stringify({ type: "assistant", message: { content: [null, 3, { type: "text" }] } }),
      JSON.stringify([1, 2]),
      JSON.stringify({ no: "type" }),
      "",
      "   ",
    ]) {
      expect(formatLine(line), line).toEqual([]);
    }
  });

  it("shows a line that is not JSON, cut to one line", () => {
    expect(formatLine("Error: No conversation found\n  at x")).toEqual([
      "Error: No conversation found (+1 lines)",
    ]);
    expect(formatLine('{"type": "assistant", "mess')).toEqual(['{"type": "assistant", "mess']);
  });
});

describe("oneLine", () => {
  it("leaves a short single line alone", () => {
    expect(oneLine("  ok  ")).toBe("ok");
  });
});

describe("sessionIdOf", () => {
  it("takes the id from the init event only", () => {
    expect(sessionIdOf(INIT)).toBe(SESSION_ID);
    expect(sessionIdOf(RESULT)).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });

  it("refuses an id that is not a plain token", () => {
    expect(sessionIdOf({ ...INIT, session_id: "../../etc" })).toBeNull();
    expect(sessionIdOf({ ...INIT, session_id: "" })).toBeNull();
    expect(sessionIdOf({ ...INIT, session_id: 7 })).toBeNull();
  });
});

describe("runFailed", () => {
  it("is a non-zero exit, or no result event", () => {
    expect(runFailed({ code: 0, sawResult: true })).toBe(false);
    expect(runFailed({ code: 0, sawResult: false })).toBe(true);
    expect(runFailed({ code: 1, sawResult: true })).toBe(true);
    expect(runFailed({ code: 1, sawResult: false })).toBe(true);
    expect(runFailed({ code: null, sawResult: true })).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A stand-in for `claude-bot`: records its arguments, prints `lines` and
 * exits with `code`.
 *
 * @param {{ lines: string[], code?: number, session?: string }} fake
 */
function turn({ lines, code = 0, session }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-test-"));
  dirs.push(dir);
  const state = path.join(dir, "state");
  const argsLog = path.join(dir, "args");
  const out = path.join(dir, "out.jsonl");
  fs.writeFileSync(out, lines.map((l) => `${l}\n`).join(""));
  const bot = path.join(dir, "claude-bot");
  fs.writeFileSync(bot, `#!/bin/sh\necho "$*" >${argsLog}\ncat ${out}\nexit ${String(code)}\n`, {
    mode: 0o755,
  });
  if (session !== undefined) {
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, "session-id"), `${session}\n`);
  }
  const result = spawnSync(process.execPath, [AGENT_TURN, state, "--", bot, "developer-1"], {
    encoding: "utf8",
  });
  const sessionFile = path.join(state, "session-id");
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    args: fs.readFileSync(argsLog, "utf8").trim(),
    session: fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8").trim() : null,
  };
}

describe("agent-turn.mjs", () => {
  it("records the session of a first turn, and exits 0 when the turn ends", () => {
    const run = turn({ lines: [JSON.stringify(INIT), JSON.stringify(RESULT)] });

    expect(run.code).toBe(0);
    expect(run.args).toBe("developer-1");
    expect(run.session).toBe(SESSION_ID);
    expect(run.stdout).toContain(`● session ${SESSION_ID}`);
    expect(run.stdout).toContain("■ turn success");
  });

  it("resumes the recorded session by id", () => {
    const run = turn({
      lines: [JSON.stringify(INIT), JSON.stringify(RESULT)],
      session: SESSION_ID,
    });

    expect(run.code).toBe(0);
    expect(run.args).toBe(`--resume ${SESSION_ID} developer-1`);
    expect(run.session).toBe(SESSION_ID);
  });

  it("fails a run with no result, but keeps a session that started", () => {
    const run = turn({ lines: [JSON.stringify(INIT)], session: SESSION_ID });

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/no result/);
    expect(run.session).toBe(SESSION_ID);
  });

  it("fails a non-zero exit even after a result", () => {
    const run = turn({ lines: [JSON.stringify(INIT), JSON.stringify(RESULT)], code: 2 });

    expect(run.code).toBe(1);
    expect(run.stderr).toMatch(/exit 2/);
  });

  it("forgets a session claude could not resume, so the next turn starts fresh", () => {
    const run = turn({
      lines: [`No conversation found with session ID: ${SESSION_ID}`],
      code: 1,
      session: SESSION_ID,
    });

    expect(run.code).toBe(1);
    expect(run.session).toBeNull();
    expect(run.stdout).toContain("No conversation found");
  });
});
