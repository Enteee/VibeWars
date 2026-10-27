/**
 * Tokens per role from the agents' session logs (#50): each reply counted
 * once, only the window's, and only the bytes appended since last time.
 * The last hour's burn and the newest usage reading (#452).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHUNK_BYTES,
  MAX_KEPT,
  MAX_LINE_BYTES,
  ROLE_BYTES,
  burnOf,
  createUsageReader,
  formatCount,
  newestLimit,
  parseLimitFile,
  parseUsageLine,
  summarize,
} from "./claude-usage.mjs";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "claude-log.jsonl",
);
const HOUR = 60 * 60 * 1000;
const WINDOW = 5 * HOUR;

/**
 * One assistant reply's log line.
 *
 * @param {string} id
 * @param {number} ts
 * @param {{ output?: number, model?: string }} [fields]
 * @returns {string}
 */
function reply(id, ts, { output = 10, model = "claude-opus-5-5" } = {}) {
  return JSON.stringify({
    type: "assistant",
    timestamp: new Date(ts).toISOString(),
    message: {
      id,
      model,
      content: [{ type: "text", text: "secret" }],
      usage: {
        input_tokens: 1,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 100,
        output_tokens: output,
      },
    },
  });
}

/**
 * @param {string} line
 * @param {string} role
 */
function record(line, role) {
  const parsed = parseUsageLine(line);
  if (parsed === null) {
    throw new Error("expected a reply");
  }
  return { ...parsed, role };
}

describe("parseUsageLine", () => {
  const [user = "", assistant = ""] = fs.readFileSync(FIXTURE, "utf8").split("\n");

  it("reads an assistant reply's usage, and nothing of its text", () => {
    expect(parseUsageLine(assistant)).toEqual({
      id: "msg_fixture1",
      ts: Date.parse("2026-10-25T11:36:56.059Z"),
      model: "claude-opus-5-5",
      input: 2,
      output: 60,
      cacheWrite: 10694,
      cacheRead: 10374,
      sidechain: false,
    });
  });

  it("is null for a user line, a reply without usage, a cut line and an empty one", () => {
    expect(parseUsageLine(user)).toBeNull();
    const noUsage = {
      type: "assistant",
      timestamp: "2026-10-25T11:36:56.059Z",
      message: { id: "msg_1", model: "claude-opus-5-5", content: [] },
    };
    expect(parseUsageLine(JSON.stringify(noUsage))).toBeNull();
    expect(parseUsageLine(assistant.slice(0, 80))).toBeNull();
    expect(parseUsageLine("")).toBeNull();
  });
});

describe("summarize", () => {
  const now = new Date(2026, 9, 25, 16, 0).getTime();
  const dayStart = new Date(2026, 9, 25).getTime();

  it("counts one reply once, however many lines logged it", () => {
    const line = reply("m1", now - HOUR);
    const summary = summarize(
      [line, line, line, line].map((l) => record(l, "manager")),
      { now, windowMs: WINDOW, dayStart },
    );
    expect(summary.roles.get("manager")).toEqual({
      replies: 1,
      output: 10,
      input: 3,
      cacheRead: 100,
      model: "claude-opus-5-5",
    });
    expect(summary.total.replies).toBe(1);
  });

  it("counts a reply inside the 5-hour window, not one just outside it", () => {
    const summary = summarize(
      [
        record(reply("in", now - WINDOW + 1000), "architect"),
        record(reply("out", now - WINDOW - 1000), "architect"),
      ],
      { now, windowMs: WINDOW, dayStart },
    );
    expect(summary.roles.get("architect")?.replies).toBe(1);
  });

  it("counts today's output from local midnight", () => {
    const summary = summarize(
      [
        record(reply("today", dayStart + 1000, { output: 7 }), "manager"),
        record(reply("yesterday", dayStart - 1000, { output: 5 }), "manager"),
      ],
      { now, windowMs: 24 * HOUR, dayStart },
    );
    expect(summary.todayOutput).toBe(7);
    expect(summary.total.output).toBe(12);
  });

  it("shows the latest reply's model", () => {
    const summary = summarize(
      [
        record(reply("b", now - HOUR, { model: "claude-sonnet-5-5" }), "manager"),
        record(reply("a", now - 2 * HOUR, { model: "claude-opus-5-5" }), "manager"),
      ],
      { now, windowMs: WINDOW, dayStart },
    );
    expect(summary.roles.get("manager")?.model).toBe("claude-sonnet-5-5");
  });
});

describe("burnOf (#452)", () => {
  const now = new Date(2026, 9, 25, 16, 0).getTime();

  it("counts only the last hour, and a reply logged twice once", () => {
    const twice = reply("m1", now - 10_000, { output: 40 });
    const burn = burnOf(
      [
        record(twice, "manager"),
        record(twice, "manager"),
        record(reply("m2", now - HOUR + 1000, { output: 2 }), "manager"),
        record(reply("old", now - HOUR - 1000, { output: 500 }), "manager"),
      ],
      now,
    );
    expect(burn).toEqual({ output: 42, replies: 2, top: [{ role: "manager", output: 42 }] });
  });

  it("names the three roles that wrote the most, most first", () => {
    const burn = burnOf(
      [
        ["a", "qa-tester", 30],
        ["b", "developer", 80],
        ["c", "manager", 5],
        ["d", "lead-dev", 50],
      ].map(([id, role, output]) =>
        record(reply(String(id), now - HOUR / 2, { output: Number(output) }), String(role)),
      ),
      now,
    );
    expect(burn.top).toEqual([
      { role: "developer", output: 80 },
      { role: "lead-dev", output: 50 },
      { role: "qa-tester", output: 30 },
    ]);
    expect(burn.output).toBe(165);
  });

  it("is empty for a quiet hour", () => {
    expect(burnOf([], now)).toEqual({ output: 0, replies: 0, top: [] });
  });
});

describe("parseLimitFile and newestLimit (#452)", () => {
  const now = new Date(2026, 9, 25, 16, 0).getTime();
  /** @param {number} at @param {number} [utilization] */
  const reading = (at, utilization = 0.38) => ({
    at,
    status: "allowed",
    rateLimitType: "five_hour",
    resetsAt: 1_761_400_800,
    utilization,
    fiveHour: { utilization, resetsAt: 1_761_400_800 },
    sevenDay: null,
  });

  it("reads a file in the shape agent-turn writes", () => {
    expect(parseLimitFile(`${JSON.stringify(reading(now))}\n`)).toEqual(reading(now));
  });

  it("counts a malformed file as none", () => {
    for (const text of [
      "",
      "{",
      "[]",
      JSON.stringify({ ...reading(now), status: "\u001b[2J" }),
      JSON.stringify({ ...reading(now), rateLimitType: "forever" }),
      JSON.stringify({ ...reading(now), at: "now" }),
      JSON.stringify({ ...reading(now), fiveHour: { utilization: "38%", resetsAt: 1 } }),
      JSON.stringify({ ...reading(now), sevenDay: { utilization: 1, resetsAt: 1, x: 1 } }),
      JSON.stringify({ ...reading(now), extra: 1 }),
      JSON.stringify({ ...reading(now), sevenDay: undefined }),
    ]) {
      expect(parseLimitFile(text), text).toBeNull();
    }
  });

  it("keeps the newest of several, and skips the malformed", () => {
    const files = [
      JSON.stringify(reading(now - 60_000, 0.4)),
      JSON.stringify(reading(now - 1000, 0.41)),
      "not json",
    ];
    expect(newestLimit(files.map(parseLimitFile), now)).toEqual(reading(now - 1000, 0.41));
    expect(newestLimit([null], now)).toBeNull();
  });

  it("ignores one dated in the future: a jail could forge it to win", () => {
    expect(newestLimit([reading(now - 1000, 0.4), reading(now + HOUR, 0)], now)).toEqual(
      reading(now - 1000, 0.4),
    );
  });
});

describe("formatCount", () => {
  it("fits a count in a few characters", () => {
    expect(formatCount(950)).toBe("950");
    expect(formatCount(38_400)).toBe("38k");
    expect(formatCount(999_600)).toBe("1.0M");
    expect(formatCount(1_100_000)).toBe("1.1M");
    expect(formatCount(22_000_000)).toBe("22.0M");
  });
});

describe("createUsageReader", () => {
  /** @type {string} */
  let boxes;
  /** @type {string} */
  let log;
  const now = Date.now();

  beforeEach(() => {
    boxes = fs.mkdtempSync(path.join(os.tmpdir(), "claude-usage-"));
    const dir = path.join(boxes, "manager", "config", "projects", "-some-project");
    fs.mkdirSync(dir, { recursive: true });
    log = path.join(dir, "session.jsonl");
  });

  afterEach(() => {
    fs.rmSync(boxes, { recursive: true, force: true });
  });

  /** @param {ReturnType<typeof createUsageReader>} reader */
  const ids = (reader) =>
    (reader.read(now - WINDOW, now)?.records ?? []).map((r) => `${r.role}:${r.id}`).sort();

  it("is null before any agent has a box", () => {
    expect(createUsageReader(path.join(boxes, "missing"), ["manager"]).read(0, now)).toBeNull();
  });

  it("adds only the replies appended since the last read", () => {
    const reader = createUsageReader(boxes, ["manager", "architect"]);
    fs.writeFileSync(log, `${reply("m1", now)}\n`);
    expect(ids(reader)).toEqual(["manager:m1"]);
    fs.appendFileSync(log, `${reply("m2", now)}\n`);
    expect(ids(reader)).toEqual(["manager:m1", "manager:m2"]);
  });

  it("completes a half-written last line on the next read", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    const line = reply("m1", now);
    fs.writeFileSync(log, line.slice(0, 40));
    expect(ids(reader)).toEqual([]);
    fs.appendFileSync(log, `${line.slice(40)}\n`);
    expect(ids(reader)).toEqual(["manager:m1"]);
  });

  it("reads a file cut short or replaced from the start", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    fs.writeFileSync(log, `${reply("m1", now)}\n${reply("m2", now)}\n`);
    expect(ids(reader)).toEqual(["manager:m1", "manager:m2"]);
    fs.writeFileSync(log, `${reply("m3", now)}\n`);
    expect(ids(reader)).toEqual(["manager:m1", "manager:m2", "manager:m3"]);
    fs.rmSync(log);
    fs.writeFileSync(log, `${reply("m4", now)}\n${reply("m5", now)}\n${reply("m6", now)}\n`);
    expect(ids(reader)).toContain("manager:m6");
  });

  it("does not keep a reply dated in the future", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    fs.writeFileSync(log, `${reply("future", now + HOUR)}\n${reply("new", now)}\n`);
    expect(ids(reader)).toEqual(["manager:new"]);
  });

  it("keeps at most MAX_KEPT replies of a role, and says it is over the cap", () => {
    const reader = createUsageReader(boxes, ["manager", "architect"]);
    const other = path.join(boxes, "architect", "config", "projects", "-p", "s.jsonl");
    fs.mkdirSync(path.dirname(other), { recursive: true });
    fs.writeFileSync(other, `${reply("a1", now)}\n`);
    fs.writeFileSync(
      log,
      Array.from({ length: MAX_KEPT + 10_000 }, (_, i) => `${reply(`m${String(i)}`, now)}\n`).join(
        "",
      ),
    );
    const refreshes = Math.ceil(fs.statSync(log).size / CHUNK_BYTES) + 1;
    /** @type {ReturnType<ReturnType<typeof createUsageReader>["read"]>} */
    let read = null;
    for (let i = 0; i < refreshes; i++) {
      read = reader.read(now - WINDOW, now);
    }
    const records = read?.records ?? [];
    expect(records.filter((r) => r.role === "manager")).toHaveLength(MAX_KEPT);
    expect(records.filter((r) => r.role === "architect")).toHaveLength(1);
    expect([...(read?.capped ?? [])]).toEqual(["manager"]);
  });

  it("forgets replies older than it was asked for", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    fs.writeFileSync(log, `${reply("old", now - WINDOW - HOUR)}\n${reply("new", now)}\n`);
    expect(ids(reader)).toEqual(["manager:new"]);
  });

  it("names each reply's session, and a subagent's log as its session's (#833)", () => {
    const sub = path.join(path.dirname(log), "session", "subagents", "agent-1.jsonl");
    fs.mkdirSync(path.dirname(sub), { recursive: true });
    fs.writeFileSync(log, `${reply("m1", now)}\n`);
    fs.writeFileSync(sub, `${reply("a1", now)}\n`);
    const records = createUsageReader(boxes, ["manager"]).read(now - WINDOW, now)?.records ?? [];
    expect(
      records
        .map(({ id, session, sidechain }) => ({ id, session, sidechain }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([
      { id: "a1", session: "-some-project/session", sidechain: true },
      { id: "m1", session: "-some-project/session", sidechain: false },
    ]);
  });

  it("says a log is still pending while it has more than a refresh reads (#833)", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    fs.writeFileSync(log, Buffer.alloc(CHUNK_BYTES + 10, 0x0a));
    expect(reader.read(now - WINDOW, now)?.pending).toBe(true);
    expect(reader.read(now - WINDOW, now)?.pending).toBe(false);
  });
});

describe("createUsageReader, on a tree the jail controls (#329)", () => {
  /** @type {string} */
  let boxes;
  /** @type {string} */
  let outside;
  /** @type {string} */
  let projects;
  const now = Date.now();

  beforeEach(() => {
    boxes = fs.mkdtempSync(path.join(os.tmpdir(), "claude-usage-"));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "claude-usage-host-"));
    projects = path.join(boxes, "manager", "config", "projects");
    fs.mkdirSync(path.join(projects, "-some-project"), { recursive: true });
    fs.writeFileSync(path.join(outside, "host.jsonl"), `${reply("host", now)}\n`);
  });

  afterEach(() => {
    fs.rmSync(boxes, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  /** @param {ReturnType<typeof createUsageReader>} reader */
  const ids = (reader) =>
    (reader.read(now - WINDOW, now)?.records ?? []).map((r) => `${r.role}:${r.id}`).sort();

  /** @param {string} line */
  const ok = (line) => {
    fs.writeFileSync(path.join(projects, "-some-project", "ok.jsonl"), `${line}\n`);
  };

  it("does not follow a symlinked projects directory", () => {
    fs.rmSync(projects, { recursive: true });
    fs.symlinkSync(outside, projects);
    expect(ids(createUsageReader(boxes, ["manager"]))).toEqual([]);
  });

  it("does not follow a symlinked project directory or log", () => {
    fs.symlinkSync(outside, path.join(projects, "-linked"));
    fs.symlinkSync(
      path.join(outside, "host.jsonl"),
      path.join(projects, "-some-project", "x.jsonl"),
    );
    ok(reply("m1", now));
    expect(ids(createUsageReader(boxes, ["manager"]))).toEqual(["manager:m1"]);
  });

  it("skips a .jsonl that is a directory or a FIFO", () => {
    fs.mkdirSync(path.join(projects, "-some-project", "dir.jsonl"));
    execFileSync("mkfifo", [path.join(projects, "-some-project", "fifo.jsonl")]);
    ok(reply("m1", now));
    expect(ids(createUsageReader(boxes, ["manager"]))).toEqual(["manager:m1"]);
  });

  it("reads a huge sparse log a chunk at a time, and the role's other logs still count", () => {
    const huge = path.join(projects, "-some-project", "huge.jsonl");
    fs.writeFileSync(huge, "");
    fs.truncateSync(huge, 64 * 1024 ** 3);
    ok(reply("m1", now));
    const reader = createUsageReader(boxes, ["manager"]);
    const started = Date.now();
    expect(ids(reader)).toEqual(["manager:m1"]);
    expect(ids(reader)).toEqual(["manager:m1"]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("drops a line longer than MAX_LINE_BYTES and reads the one after it", () => {
    const log = path.join(projects, "-some-project", "long.jsonl");
    fs.writeFileSync(log, Buffer.alloc(MAX_LINE_BYTES + CHUNK_BYTES, 0x61));
    fs.appendFileSync(log, `\n${reply("after", now)}\n`);
    const reader = createUsageReader(boxes, ["manager"]);
    const reads = Math.ceil(fs.statSync(log).size / CHUNK_BYTES);
    for (let i = 1; i < reads; i++) {
      expect(ids(reader)).toEqual([]);
    }
    expect(ids(reader)).toEqual(["manager:after"]);
  });

  it("reads at most ROLE_BYTES of a role per refresh, and its real log still gets a turn", () => {
    for (let i = 0; i < 12; i++) {
      const sparse = path.join(projects, "-some-project", `sparse-${String(i)}.jsonl`);
      fs.writeFileSync(sparse, "");
      fs.truncateSync(sparse, 4 * MAX_LINE_BYTES);
    }
    ok(reply("m1", now));
    const reader = createUsageReader(boxes, ["manager"]);
    const readSync = vi.spyOn(fs, "readSync");
    try {
      /** @type {string[][]} */
      const seen = [];
      let total = 0;
      for (let i = 0; i < 5; i++) {
        readSync.mockClear();
        seen.push(ids(reader));
        const bytes = readSync.mock.results.reduce(
          (sum, result) => sum + (typeof result.value === "number" ? result.value : 0),
          0,
        );
        expect(bytes).toBeLessThanOrEqual(ROLE_BYTES);
        total += bytes;
      }
      // The spy saw the sparse logs being read, over several refreshes.
      expect(total).toBeGreaterThan(ROLE_BYTES);
      expect(seen.at(-1)).toEqual(["manager:m1"]);
    } finally {
      readSync.mockRestore();
    }
  });

  it.skipIf(process.getuid?.() === 0)("skips an unreadable directory, not the whole role", () => {
    const locked = path.join(projects, "-locked");
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0);
    ok(reply("m1", now));
    try {
      expect(ids(createUsageReader(boxes, ["manager"]))).toEqual(["manager:m1"]);
    } finally {
      fs.chmodSync(locked, 0o700);
    }
  });
});
