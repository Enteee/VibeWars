/**
 * One turn of an agent (agent-turn.mjs). So far: a `tg wait` that Bash moved
 * to the background gives the inbox back (#325). The command is a stand-in
 * that prints stream-json.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const AGENT_TURN = path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-turn.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SESSION_ID = "11111111-2222-3333-4444-555555555555";

/** @type {Record<string, string>} */
const EVENTS = {
  init: JSON.stringify({ type: "system", subtype: "init", session_id: SESSION_ID }),
  initWithMcp: JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: SESSION_ID,
    mcp_servers: [{ name: "claude.ai Claude Docs", status: "connected" }],
  }),
  initNoMcp: JSON.stringify({
    type: "system",
    subtype: "init",
    session_id: SESSION_ID,
    mcp_servers: [],
  }),
  wait: JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", id: "w1", name: "Bash", input: { command: "tg wait --timeout 540" } },
      ],
    },
  }),
  background: JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "w1",
          content: "Command running in background with ID: b1. Output is being written to: /x",
        },
      ],
    },
  }),
  timedOut: JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "w1",
          content:
            "Command did not complete within its 590s timeout and was moved to the background (ID: b2). Output is being written to: /x",
        },
      ],
    },
  }),
  foreground: JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "w1", content: "(nothing new in 540s)" }],
    },
  }),
  limited: JSON.stringify({ type: "result", is_error: true, result: "Claude usage limit reached" }),
  result: JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ok" }),
};

/**
 * Run a turn that prints these events; the inbox cursor starts at 100.
 *
 * @param {string[]} events keys of EVENTS
 * @param {string} [peekDir] where `peek` is recorded, if anywhere
 * @returns {{ code: number | null, stdout: string, stderr: string, cursor: string, log: string }}
 */
function turn(events, peekDir = "") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-test-"));
  dirs.push(dir);
  const bus = path.join(dir, "bus");
  const state = path.join(dir, "developer");
  fs.mkdirSync(bus);
  fs.writeFileSync(path.join(bus, "cursor"), "100\n");
  const script = path.join(dir, "claude.mjs");
  fs.writeFileSync(
    script,
    [
      'import fs from "node:fs";',
      ...events.map((key) =>
        key === "swallow"
          ? `await new Promise((r) => setTimeout(r, 300)); fs.writeFileSync(${JSON.stringify(path.join(bus, "cursor"))}, "500\\n");`
          : `console.log(${JSON.stringify(EVENTS[key])});`,
      ),
    ].join("\n"),
  );
  const result = spawnSync(process.execPath, [AGENT_TURN, state, "--", process.execPath, script], {
    encoding: "utf8",
    env: {
      ...process.env,
      VIBEWARS_BOT_ROLE: "developer",
      VIBEWARS_CONTEXT_FILE: path.join(bus, "context.json"),
      ...(peekDir === "" ? {} : { VIBEWARS_PEEK_DIR: peekDir }),
    },
  });
  const logFile = path.join(state, "backgrounded-waits.jsonl");
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    cursor: fs.readFileSync(path.join(bus, "cursor"), "utf8"),
    log: fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "",
  };
}

describe("a tg wait that went to the background", () => {
  it("is logged, and the inbox cursor is put back to where it was", () => {
    // "swallow": the background wait marks messages read after the detection.
    const result = turn(["init", "wait", "background", "swallow", "result"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("⚠ tg wait went to the background; inbox rewound");
    const [entry] = result.log.trim().split("\n");
    expect(JSON.parse(entry ?? "")).toMatchObject({
      role: "developer",
      command: "tg wait --timeout 540",
    });
    expect(result.cursor).toBe("100\n");
  });

  it("is caught when Bash moved it there after its timeout", () => {
    const result = turn(["init", "wait", "timedOut", "swallow", "result"]);

    expect(result.log.trim().split("\n")).toHaveLength(1);
    expect(result.cursor).toBe("100\n");
  });

  it("is not claimed by a wait that finished in the foreground", () => {
    const result = turn(["init", "wait", "foreground", "swallow", "result"]);

    expect(result.stdout).not.toContain("went to the background");
    expect(result.log).toBe("");
    expect(result.cursor).toBe("500\n");
  });
});

describe("what the manager can peek at (#19)", () => {
  const peekDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-peek-"));
    dirs.push(dir);
    return dir;
  };
  /** @param {string} dir */
  const row = (dir) => {
    /** @type {unknown} */
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, "developer.json"), "utf8"));
    return /** @type {{ state: string }} */ (parsed);
  };

  it("gets the lines the pane got, and goes from turn to between turns", () => {
    const dir = peekDir();
    const result = turn(["init", "wait", "background", "swallow", "result"], dir);

    const recorded = fs.readFileSync(path.join(dir, "developer.txt"), "utf8");
    expect(result.stdout).toContain("⚠ tg wait went to the background; inbox rewound");
    expect(recorded).toContain("⚠ tg wait went to the background; inbox rewound");
    for (const line of result.stdout.trimEnd().split("\n")) {
      expect(recorded).toContain(line);
    }
    expect(row(dir).state).toBe("between");
  });

  it("never costs the turn: a peek directory that cannot be written is only a notice", () => {
    const dir = peekDir();
    const blocked = path.join(dir, "file");
    fs.writeFileSync(blocked, "");
    const plain = turn(["init", "wait", "foreground", "result"]);
    const withBadPeek = turn(["init", "wait", "foreground", "result"], blocked);

    expect(withBadPeek.code).toBe(0);
    expect(withBadPeek.stdout).toBe(plain.stdout);
  });

  it("says limited when the turn hit the usage limit", () => {
    const dir = peekDir();
    const result = turn(["init", "limited"], dir);

    expect(result.code).toBe(3);
    expect(row(dir).state).toBe("limited");
  });
});

describe("an MCP server in the jail (#753)", () => {
  it("stops the turn at once, naming it", () => {
    const result = turn(["initWithMcp", "result"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "agent-turn: the jail has MCP servers (claude.ai Claude Docs); refusing to run: see #753",
    );
  });

  it("runs a turn whose init lists none", () => {
    const result = turn(["initNoMcp", "result"]);

    expect(result.code).toBe(0);
  });
});
