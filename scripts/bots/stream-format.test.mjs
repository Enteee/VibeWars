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

import {
  LINE_MAX,
  backgroundedIdsOf,
  contextOf,
  formatLine,
  oneLine,
  parseEvent,
  runFailed,
  sessionIdOf,
  usageLimitOf,
  waitCallsOf,
} from "./stream-format.mjs";
import { obj } from "./protocol.mjs";

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

  it("shows the agent's text line by line, as it wrote it", () => {
    expect(formatLine(message([{ type: "text", text: "Orienting.\nThen the board.\n" }]))).toEqual([
      "Orienting.",
      "Then the board.",
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

  it("lets no ESC, CR, BEL or bidi override reach the pane", () => {
    // From the review of #146: a tool result that clears the line, prints a
    // fake end of turn, retitles the window and clears the screen.
    const evil = "ok\r\x1b[2K■ turn success · 1 steps · 1s\x1b]2;pwned\x07\x1b[2J\u202Egnp.exe";
    const lines = [
      message([{ type: "tool_result", tool_use_id: "t1", content: evil }], "user"),
      message([{ type: "text", text: `line one\n${evil}` }]),
      message([{ type: "tool_use", id: "t2", name: "Bash", input: { command: evil } }]),
      JSON.stringify({ ...INIT, session_id: evil, model: evil }),
      evil,
    ].flatMap(formatLine);

    expect(lines.length).toBeGreaterThan(5);
    /** Controls (tab aside), DEL, and the bidi embeddings and isolates. */
    const unsafe = (/** @type {number} */ code) =>
      (code < 0x20 && code !== 0x09) ||
      code === 0x7f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    for (const out of lines) {
      expect(Array.from(out, (char) => char.codePointAt(0) ?? 0).filter(unsafe), out).toEqual([]);
    }
    expect(lines).toContain("  ← ok⏎␛[2K■ turn success · 1 steps · 1s␛]2;pwned�␛[2J�gnp.exe");
    // A session id that is not a plain token is never printed.
    expect(lines).toContain(
      "● session ? · ok⏎␛[2K■ turn success · 1 steps · 1s␛]2;pwned�␛[2J�gnp.exe",
    );
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

  it("refuses an id that is not a UUID", () => {
    // A forged init could otherwise put a flag on the next turn (#146 review).
    expect(sessionIdOf({ ...INIT, session_id: "--settings" })).toBeNull();
    expect(sessionIdOf({ ...INIT, session_id: "abc-123" })).toBeNull();
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
 * The context file is `context.json` in the run's directory. The stand-in
 * copies it to `context-at-start.json` before printing anything, and
 * `stale` is what the last turn left in it.
 *
 * `plant` makes the context file, or `plantAs` next to it, a symlink to
 * that path, as an agent could.
 *
 * @param {{ lines: string[], code?: number, session?: string, stale?: string, plant?: string, plantAs?: string }} fake
 */
function turn({ lines, code = 0, session, stale, plant, plantAs = "context.json" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-test-"));
  dirs.push(dir);
  const state = path.join(dir, "state");
  const argsLog = path.join(dir, "args");
  const out = path.join(dir, "out.jsonl");
  fs.writeFileSync(out, lines.map((l) => `${l}\n`).join(""));
  const bot = path.join(dir, "claude-bot");
  const contextFile = path.join(dir, "bus", "context.json");
  if (stale !== undefined || plant !== undefined) {
    fs.mkdirSync(path.dirname(contextFile));
  }
  if (stale !== undefined) {
    fs.writeFileSync(contextFile, stale);
  }
  if (plant !== undefined) {
    fs.symlinkSync(plant, path.join(path.dirname(contextFile), plantAs));
  }
  const atStart = path.join(dir, "context-at-start.json");
  fs.writeFileSync(
    bot,
    `#!/bin/sh\necho "$*" >${argsLog}\ncp ${contextFile} ${atStart}\ncat ${out}\nexit ${String(code)}\n`,
    { mode: 0o755 },
  );
  if (session !== undefined) {
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, "session-id"), `${session}\n`);
  }
  const result = spawnSync(process.execPath, [AGENT_TURN, state, "--", bot, "developer-1"], {
    encoding: "utf8",
    env: { ...process.env, VIBEWARS_CONTEXT_FILE: contextFile },
  });
  /** @param {string} file @returns {unknown} */
  const json = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
  const sessionFile = path.join(state, "session-id");
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    args: fs.readFileSync(argsLog, "utf8").trim(),
    session: fs.existsSync(sessionFile) ? fs.readFileSync(sessionFile, "utf8").trim() : null,
    context: json(contextFile),
    contextAtStart: json(atStart),
    contextIsLink: fs.existsSync(contextFile) && fs.lstatSync(contextFile).isSymbolicLink(),
    /** @param {string} name @returns {string | null} a file the run left in its state */
    file: (name) =>
      fs.existsSync(path.join(state, name))
        ? fs.readFileSync(path.join(state, name), "utf8")
        : null,
  };
}

/**
 * Limit events in the shapes the CLI documents. No real one has been
 * captured yet; agent-turn.mjs keeps the first it sees (#308).
 */
const REJECTED = {
  type: "rate_limit_event",
  rate_limit_info: { status: "rejected", resetsAt: 1_761_400_800 },
  session_id: SESSION_ID,
};
/** @param {string} text @returns {Record<string, unknown>} */
const errorResult = (text) => ({ ...RESULT, subtype: "success", is_error: true, result: text });

describe("usageLimitOf", () => {
  it("takes the reset of a rejected rate_limit_event", () => {
    expect(usageLimitOf(REJECTED)).toEqual({ until: 1_761_400_800 });
  });

  it("ignores a rate_limit_event that still allows the request", () => {
    for (const status of ["allowed", "allowed_warning"]) {
      const event = { ...REJECTED, rate_limit_info: { status, resetsAt: 1_761_400_800 } };
      expect(usageLimitOf(event)).toBeNull();
    }
  });

  it("reads the reset an error result ends with", () => {
    expect(usageLimitOf(errorResult("Claude AI usage limit reached|1761400800"))).toEqual({
      until: 1_761_400_800,
    });
  });

  it("knows a limit without a reset, and never parses clock text", () => {
    expect(usageLimitOf(errorResult("You've hit your limit · resets 3pm (Europe/Zurich)"))).toEqual(
      { until: null },
    );
  });

  it("is not fooled by an ordinary error result, or a success", () => {
    expect(usageLimitOf(errorResult("Execution error"))).toBeNull();
    expect(usageLimitOf(errorResult("Context limit reached"))).toBeNull();
    expect(
      usageLimitOf(errorResult("Request req_011CU4291xyz failed after 4291 bytes")),
    ).toBeNull();
    expect(usageLimitOf(errorResult("API Error: 429 Too Many Requests"))).toEqual({ until: null });
    expect(usageLimitOf({ ...RESULT, result: "I hit your limit of patience" })).toBeNull();
    expect(usageLimitOf(RESULT)).toBeNull();
    expect(usageLimitOf(null)).toBeNull();
  });

  it("knows an API error that says 429 or rate_limit_error", () => {
    expect(
      usageLimitOf({
        type: "assistant",
        error: { type: "rate_limit_error", message: "slow down" },
      }),
    ).toEqual({ until: null });
    expect(usageLimitOf({ type: "system", subtype: "api_error", error: "API Error: 429" })).toEqual(
      { until: null },
    );
    expect(usageLimitOf({ type: "assistant", error: { type: "overloaded_error" } })).toBeNull();
    expect(usageLimitOf(parseEvent(message([{ type: "text", text: "429" }])))).toBeNull();
  });
});

/**
 * An assistant event from a call made at this context.
 *
 * @param {{ input_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number }} usage
 * @returns {string}
 */
function called(usage) {
  return JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text: "hm" }], usage },
    session_id: SESSION_ID,
  });
}

describe("contextOf", () => {
  it("sums what the call read: fresh, from the cache and into it", () => {
    const event = parseEvent(
      called({
        input_tokens: 5,
        cache_read_input_tokens: 100_000,
        cache_creation_input_tokens: 2_000,
      }),
    );

    expect(contextOf(event)).toBe(102_005);
  });

  it("counts a field the call did not report as none", () => {
    expect(contextOf(parseEvent(called({ input_tokens: 7 })))).toBe(7);
  });

  it("is null for a subagent's call, which is not the session's context", () => {
    const sub = {
      ...obj(JSON.parse(called({ input_tokens: 150_000 }))),
      parent_tool_use_id: "toolu_1",
    };
    const main = { ...obj(JSON.parse(called({ input_tokens: 9 }))), parent_tool_use_id: null };

    expect(contextOf(parseEvent(JSON.stringify(sub)))).toBeNull();
    expect(contextOf(parseEvent(JSON.stringify(main)))).toBe(9);
  });

  it("is null for any other event, or an assistant event without usage", () => {
    expect(contextOf(parseEvent(JSON.stringify(RESULT)))).toBeNull();
    expect(contextOf(parseEvent(message([{ type: "text", text: "hi" }])))).toBeNull();
    expect(contextOf(parseEvent(called({})))).toBeNull();
    expect(contextOf(null)).toBeNull();
  });
});

describe("agent-turn.mjs and the context ceiling (#321)", () => {
  const over = called({ input_tokens: 4, cache_read_input_tokens: 133_996 });
  const under = called({ input_tokens: 4, cache_read_input_tokens: 50_000 });

  it("forgets the session when the turn's last call was past the ceiling", () => {
    const run = turn({ lines: [JSON.stringify(INIT), under, over, JSON.stringify(RESULT)] });

    expect(run.code).toBe(0);
    expect(run.session).toBeNull();
    expect(run.stderr).toContain(
      "agent-turn: context 134k >= 120k; next turn starts a fresh session",
    );
    expect(run.context).toEqual({ tokens: 134_000, ceiling: 120_000 });
  });

  it("keeps the session when the last call was under it, whatever came before", () => {
    const run = turn({ lines: [JSON.stringify(INIT), over, under, JSON.stringify(RESULT)] });

    expect(run.code).toBe(0);
    expect(run.session).toBe(SESSION_ID);
    expect(run.context).toEqual({ tokens: 50_004, ceiling: 120_000 });
  });

  it("does not count a subagent's context as the session's", () => {
    const sub = JSON.stringify({ ...obj(JSON.parse(over)), parent_tool_use_id: "toolu_1" });
    const run = turn({ lines: [JSON.stringify(INIT), under, sub, JSON.stringify(RESULT)] });

    expect(run.session).toBe(SESSION_ID);
    expect(run.context).toEqual({ tokens: 50_004, ceiling: 120_000 });
  });

  it("forgets it after a failed run past the ceiling too", () => {
    const run = turn({ lines: [JSON.stringify(INIT), over], code: 1 });

    expect(run.code).toBe(1);
    expect(run.session).toBeNull();
  });

  it("keeps it over a usage limit, however big the context", () => {
    const run = turn({
      lines: [JSON.stringify(INIT), over, JSON.stringify(REJECTED)],
      session: SESSION_ID,
    });

    expect(run.code).toBe(3);
    expect(run.session).toBe(SESSION_ID);
  });

  it("replaces a symlink the agent planted at the context file, never writing through it", () => {
    const outside = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-host-")),
      "host-file",
    );
    dirs.push(path.dirname(outside));
    fs.writeFileSync(outside, "the host's\n");

    const run = turn({
      lines: [JSON.stringify(INIT), over, JSON.stringify(RESULT)],
      plant: outside,
    });

    expect(fs.readFileSync(outside, "utf8")).toBe("the host's\n");
    expect(run.context).toEqual({ tokens: 134_000, ceiling: 120_000 });
    expect(run.contextIsLink).toBe(false);
  });

  it("never writes through a symlink planted at a temporary name", () => {
    const outside = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-host-")),
      "host-file",
    );
    dirs.push(path.dirname(outside));
    fs.writeFileSync(outside, "the host's\n");

    const run = turn({
      lines: [JSON.stringify(INIT), over, JSON.stringify(RESULT)],
      plant: outside,
      plantAs: "context.json.part",
    });

    expect(fs.readFileSync(outside, "utf8")).toBe("the host's\n");
    expect(run.context).toEqual({ tokens: 134_000, ceiling: 120_000 });
  });

  it("starts each turn at 0, so the last session's context turns no one away", () => {
    const run = turn({
      lines: [JSON.stringify(INIT), JSON.stringify(RESULT)],
      stale: JSON.stringify({ tokens: 500_000, ceiling: 120_000 }),
    });

    expect(run.contextAtStart).toEqual({ tokens: 0, ceiling: 120_000 });
    expect(run.context).toEqual({ tokens: 0, ceiling: 120_000 });
    expect(run.session).toBe(SESSION_ID);
  });
});

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

  it("takes the first init of a run only, so a forged second one changes nothing", () => {
    const forged = { ...INIT, session_id: "11111111-2222-4333-8444-555555555555" };
    const run = turn({
      lines: [JSON.stringify(INIT), JSON.stringify(forged), JSON.stringify(RESULT)],
    });

    expect(run.code).toBe(0);
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

  it("keeps a failed run's last lines for whoever looks into it", () => {
    const run = turn({ lines: [JSON.stringify(INIT), "boom"], code: 1 });

    expect(run.code).toBe(1);
    expect(run.file("last-failure.jsonl")).toBe(`${JSON.stringify(INIT)}\nboom\n`);
  });

  it("exits 3 on a usage limit, with its reset, even when the run otherwise ended", () => {
    const run = turn({
      lines: [JSON.stringify(INIT), JSON.stringify(REJECTED), JSON.stringify(RESULT)],
    });

    expect(run.code).toBe(3);
    expect(run.stderr).toMatch(/usage limit reached; resets \d\d:\d\d/);
    expect(run.file("limited-until")).toBe("1761400800\n");
    expect(run.file("usage-limit-sample.json")).toBe(`${JSON.stringify(REJECTED)}\n`);
    expect(run.file("last-failure.jsonl")).toBeNull();
  });

  it("exits 3 with an unknown reset, and never forgets the session over a limit", () => {
    const limit = errorResult("You've hit your limit · resets 3pm");
    const run = turn({ lines: [JSON.stringify(limit)], code: 1, session: SESSION_ID });

    expect(run.code).toBe(3);
    expect(run.stderr).toMatch(/reset time unknown/);
    expect(run.file("limited-until")).toBe("");
    expect(run.session).toBe(SESSION_ID);
  });
});

describe("backgrounded waits (#325)", () => {
  /**
   * @param {string} command
   * @param {Record<string, unknown>} [extra] more Bash input
   * @returns {string}
   */
  function bash(command, extra = {}) {
    return JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command, ...extra } }],
      },
    });
  }

  /** @param {string} text */
  function answered(text) {
    return JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: text }],
      },
    });
  }

  it("finds a tg wait and a board wait, and whether it asked for the background", () => {
    expect(waitCallsOf(parseEvent(bash("tg wait --timeout 540")))).toEqual([
      { id: "t1", command: "tg wait --timeout 540", background: false },
    ]);
    expect(waitCallsOf(parseEvent(bash("board wait Ready", { run_in_background: true })))).toEqual([
      { id: "t1", command: "board wait Ready", background: true },
    ]);
  });

  it("ignores any other command", () => {
    expect(waitCallsOf(parseEvent(bash("pnpm test", { run_in_background: true })))).toEqual([]);
    expect(waitCallsOf(parseEvent(bash("tg inbox")))).toEqual([]);
  });

  it("finds a result saying the call went to the background", () => {
    const text =
      "Command running in background with ID: bvwg2cskr. Output is being written to: /x.output";

    expect(backgroundedIdsOf(parseEvent(answered(text)))).toEqual(["t1"]);
  });

  it("does not take a finished call for a backgrounded one", () => {
    expect(backgroundedIdsOf(parseEvent(answered("(nothing new in 540s)")))).toEqual([]);
  });
});
