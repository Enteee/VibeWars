import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  KEEP_LOGS,
  LINE_MAX,
  formatRunnerLogs,
  pruneRunnerLogs,
  readLogLines,
  rotateIfLarge,
  runnerLogIndex,
  runnerLogWriter,
  tailLines,
} from "./runner-logs.mjs";

const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "runner-logs-"));

describe("tailLines", () => {
  it("keeps the last n lines and cuts a long one with an ellipsis", () => {
    expect(tailLines("a\nb\nc\n", 2)).toEqual(["b", "c"]);
    const [cut] = tailLines("x".repeat(LINE_MAX + 50), 1);
    expect(cut).toBe(`${"x".repeat(LINE_MAX)}…`);
  });
});

describe("readLogLines", () => {
  it("tops up from the rotated file when the current one is short", () => {
    const file = path.join(scratch(), "r.log");
    fs.writeFileSync(`${file}.1`, "old1\nold2\nold3\n");
    fs.writeFileSync(file, "new1\nnew2\n");
    expect(readLogLines(file, 4)).toEqual(["old2", "old3", "new1", "new2"]);
    expect(readLogLines(file, 1)).toEqual(["new2"]);
  });

  it("is null when there is no log", () => {
    expect(readLogLines(path.join(scratch(), "none.log"), 5)).toBeNull();
  });
});

describe("rotateIfLarge", () => {
  it("renames an oversize file to .1, replacing the old one", () => {
    const file = path.join(scratch(), "d.log");
    fs.writeFileSync(`${file}.1`, "ancient");
    fs.writeFileSync(file, "x".repeat(20));
    expect(rotateIfLarge(file, 10)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readFileSync(`${file}.1`, "utf8")).toBe("x".repeat(20));
    expect(rotateIfLarge(file, 10)).toBe(false);
  });
});

describe("runnerLogWriter and runnerLogIndex", () => {
  it("stamps whole lines, holds a partial one, and records the exit", () => {
    const dir = scratch();
    const file = path.join(dir, "vibewars-runner-1.log");
    const writer = runnerLogWriter(file, () => 0);
    writer.chunk("out", "one\ntw");
    writer.chunk("out", "o\n");
    writer.chunk("err", "half");
    expect(runnerLogIndex(dir)[0]?.exitCode).toBeNull();
    writer.exited(7);
    expect(fs.readFileSync(file, "utf8")).toBe(
      [
        "1970-01-01T00:00:00.000Z [out] one",
        "1970-01-01T00:00:00.000Z [out] two",
        "1970-01-01T00:00:00.000Z [err] half",
        "1970-01-01T00:00:00.000Z exited 7",
        "",
      ].join("\n"),
    );
    expect(runnerLogIndex(dir)[0]).toMatchObject({ name: "vibewars-runner-1", exitCode: 7 });
  });

  it("lists newest write first and prunes to the newest 20, with their .1", () => {
    const dir = scratch();
    for (let i = 0; i < KEEP_LOGS + 3; i += 1) {
      const file = path.join(dir, `r-${String(i)}.log`);
      fs.writeFileSync(file, "x\n");
      fs.writeFileSync(`${file}.1`, "y\n");
      fs.utimesSync(file, i, i);
    }
    expect(runnerLogIndex(dir)[0]?.name).toBe(`r-${String(KEEP_LOGS + 2)}`);
    expect(pruneRunnerLogs(dir).sort()).toEqual(["r-0", "r-1", "r-2"]);
    expect(runnerLogIndex(dir)).toHaveLength(KEEP_LOGS);
    expect(fs.existsSync(path.join(dir, "r-0.log.1"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "r-3.log.1"))).toBe(true);
  });
});

describe("formatRunnerLogs", () => {
  it("redacts secrets in the final text and says when there is nothing", () => {
    const text = formatRunnerLogs({
      supervisor: [
        "token ghs_abcdefghijklmnopqrstuvwxyz0123456789",
        "key sk-ant-api03-abcdefghijklmnop",
      ],
      index: [],
      now: 0,
    });
    expect(text).not.toContain("ghs_abcdef");
    expect(text).not.toContain("sk-ant-api03");
    expect(text).toContain("no runner logs");
    expect(formatRunnerLogs({ supervisor: null, index: [], now: 0 })).toContain(
      "no supervisor log",
    );
  });
});
