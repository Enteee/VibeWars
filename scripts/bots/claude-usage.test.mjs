/**
 * Tokens per role from the agents' session logs (#50): each reply counted
 * once, only the window's, and only the bytes appended since last time.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUsageReader, formatCount, parseUsageLine, summarize } from "./claude-usage.mjs";

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
  const ids = (reader) => (reader.read(now - WINDOW) ?? []).map((r) => `${r.role}:${r.id}`).sort();

  it("is null before any agent has a box", () => {
    expect(createUsageReader(path.join(boxes, "missing"), ["manager"]).read(0)).toBeNull();
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

  it("forgets replies older than it was asked for", () => {
    const reader = createUsageReader(boxes, ["manager"]);
    fs.writeFileSync(log, `${reply("old", now - WINDOW - HOUR)}\n${reply("new", now)}\n`);
    expect(ids(reader)).toEqual(["manager:new"]);
  });
});
