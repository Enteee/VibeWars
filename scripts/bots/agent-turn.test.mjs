/**
 * One turn of an agent (agent-turn.mjs): a `tg wait` that Bash moved to
 * the background gives the inbox back (#325), and what a
 * `rate_limit_event` says is kept for the dashboard (#452). The command is a stand-in
 * that prints stream-json.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { obj } from "./protocol.mjs";

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
  bigCall: JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [], usage: { input_tokens: 130_000 } },
  }),
  nearCall: JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [], usage: { input_tokens: 100_000 } },
  }),
  justUnderCall: JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [], usage: { input_tokens: 99_999 } },
  }),
  smallCall: JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [], usage: { input_tokens: 1000 } },
  }),
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
  rateLimit: JSON.stringify({
    type: "rate_limit_event",
    rate_limit_info: {
      status: "allowed",
      rateLimitType: "five_hour",
      resetsAt: 1_761_400_800,
      utilization: 0.38,
      overageStatus: "rejected",
      unifiedWindows: {
        five_hour: { utilization: 0.38, resetsAt: 1_761_400_800, extra: "x" },
        seven_day: { utilization: 0.74, resetsAt: 1_761_900_000 },
      },
    },
    uuid: "u-1",
    session_id: SESSION_ID,
  }),
};

/**
 * Run a turn that prints these events; the inbox cursor starts at 100.
 *
 * @param {string[]} events keys of EVENTS
 * @param {string} [peekDir] where `peek` is recorded, if anywhere
 * @param {{ limitUnwritable?: boolean, session?: boolean, peak?: string }} [options]
 *   make the limit file a directory, so writing it fails; leave a saved
 *   session (and the context peak a killed run left) for the turn to find
 * @returns {{ resumed: boolean, kept: boolean, code: number | null, stdout: string, stderr: string, cursor: string, log: string, limit: string }}
 */
function turn(events, peekDir = "", { limitUnwritable = false, session = false, peak = "" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-turn-test-"));
  dirs.push(dir);
  const bus = path.join(dir, "bus");
  const state = path.join(dir, "developer");
  fs.mkdirSync(bus);
  fs.writeFileSync(path.join(bus, "cursor"), "100\n");
  const limitFile = path.join(bus, "limit.json");
  if (limitUnwritable) {
    fs.mkdirSync(limitFile);
  }
  fs.mkdirSync(state);
  if (session) {
    fs.writeFileSync(path.join(state, "session-id"), `${SESSION_ID}\n`);
  }
  if (peak !== "") {
    fs.writeFileSync(path.join(state, "context-peak"), `${peak}\n`);
  }
  const argvFile = path.join(dir, "argv");
  const script = path.join(dir, "claude.mjs");
  fs.writeFileSync(
    script,
    [
      `#!${process.execPath}`,
      'import fs from "node:fs";',
      `fs.writeFileSync(${JSON.stringify(argvFile)}, process.argv.slice(2).join(" "));`,
      ...events.map((key) =>
        key === "swallow"
          ? `await new Promise((r) => setTimeout(r, 300)); fs.writeFileSync(${JSON.stringify(path.join(bus, "cursor"))}, "500\\n");`
          : `console.log(${JSON.stringify(EVENTS[key])});`,
      ),
    ].join("\n"),
  );
  fs.chmodSync(script, 0o755);
  const result = spawnSync(process.execPath, [AGENT_TURN, state, "--", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      VIBEWARS_BOT_ROLE: "developer",
      VIBEWARS_CONTEXT_FILE: path.join(bus, "context.json"),
      VIBEWARS_LIMIT_FILE: limitFile,
      ...(peekDir === "" ? {} : { VIBEWARS_PEEK_DIR: peekDir }),
    },
  });
  const logFile = path.join(state, "backgrounded-waits.jsonl");
  return {
    resumed: fs.readFileSync(argvFile, "utf8").includes("--resume"),
    kept: fs.existsSync(path.join(state, "session-id")),
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    cursor: fs.readFileSync(path.join(bus, "cursor"), "utf8"),
    log: fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "",
    limit: fs.statSync(limitFile, { throwIfNoEntry: false })?.isFile()
      ? fs.readFileSync(limitFile, "utf8")
      : "",
  };
}

describe("a rate_limit_event (#452)", () => {
  it("is kept in the limit file, its whitelisted fields only, and dated", () => {
    const before = Date.now();
    const result = turn(["init", "rateLimit", "result"]);

    expect(result.code).toBe(0);
    const kept = obj(JSON.parse(result.limit));
    expect(kept.at).toBeGreaterThanOrEqual(before);
    expect(kept.at).toBeLessThanOrEqual(Date.now());
    expect({ ...kept, at: 0 }).toEqual({
      at: 0,
      status: "allowed",
      rateLimitType: "five_hour",
      resetsAt: 1_761_400_800,
      utilization: 0.38,
      fiveHour: { utilization: 0.38, resetsAt: 1_761_400_800 },
      sevenDay: { utilization: 0.74, resetsAt: 1_761_900_000 },
    });
  });

  it("writes nothing when the turn saw none", () => {
    expect(turn(["init", "result"]).limit).toBe("");
  });

  it("never costs the turn: a limit file that cannot be written is only a notice", () => {
    const result = turn(["init", "rateLimit", "result"], "", { limitUnwritable: true });

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("limit.json");
  });
});

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

describe("the context ceiling (#1815)", () => {
  it("drops the session when the peak was over it though the last call was under", () => {
    expect(turn(["init", "bigCall", "smallCall", "result"], "", { session: true }).kept).toBe(
      false,
    );
  });

  it("drops the session of a usage-limited turn over the ceiling, and still exits 3", () => {
    const result = turn(["init", "bigCall", "limited"], "", { session: true });

    expect(result.code).toBe(3);
    expect(result.kept).toBe(false);
  });

  it("starts fresh after a run killed over the ceiling left its peak", () => {
    const result = turn(["init", "smallCall", "result"], "", { session: true, peak: "130000" });

    expect(result.resumed).toBe(false);
    expect(result.stderr).toContain("starting a fresh session");
  });

  it("resumes a session that stayed under it", () => {
    const result = turn(["init", "smallCall", "result"], "", { session: true, peak: "5000" });

    expect(result.resumed).toBe(true);
    expect(result.kept).toBe(true);
  });
});

// Within NEAR_MARGIN of the 120k ceiling, from 100k, an agent is told it
// has too little room to start a card; the next turn must give it some.
describe("near the context ceiling (#1838)", () => {
  it("drops the session of a turn whose peak reached ceiling minus NEAR_MARGIN", () => {
    const result = turn(["init", "nearCall", "result"], "", { session: true });

    expect(result.kept).toBe(false);
    expect(result.stderr).toContain(
      "agent-turn: context 100k is near the context ceiling (>= 100k); next turn starts a fresh session",
    );
  });

  it("keeps the session of a turn one token under it", () => {
    expect(turn(["init", "justUnderCall", "result"], "", { session: true }).kept).toBe(true);
  });

  it("starts fresh after a run killed in the near zone left its peak", () => {
    const result = turn(["init", "smallCall", "result"], "", { session: true, peak: "105000" });

    expect(result.resumed).toBe(false);
    expect(result.stderr).toContain("starting a fresh session");
  });

  it("resumes after a killed run whose peak stayed one token under it", () => {
    const result = turn(["init", "smallCall", "result"], "", { session: true, peak: "99999" });

    expect(result.resumed).toBe(true);
  });
});
