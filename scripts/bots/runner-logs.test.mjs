import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_LINE,
  WINDOW_BYTES,
  appendLog,
  cleanTail,
  formatRunnerLogs,
  openRunnerLog,
  pruneRunnerLogs,
  readLogWindow,
  readRunnerLogs,
  redactLine,
  redactWindow,
  rotateIfLarge,
  runnerLogIndex,
  tailLines,
} from "./runner-logs.mjs";

const GHS = `ghs_${"A1b2C3d4E5".repeat(4)}`;
const SK = "sk-ant-api03-abcdefghijklmnop";
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** @returns {string} a fresh hub directory, with `runners/` in it */
function hub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-logs-"));
  fs.mkdirSync(path.join(dir, "runners"));
  return dir;
}

/**
 * @param {string} file
 * @param {string} text
 * @param {number} mtimeMs
 */
function write(file, text, mtimeMs) {
  fs.writeFileSync(file, text);
  fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
}

/**
 * @param {number} from
 * @param {number} to
 * @returns {string}
 */
const numbered = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `line ${String(from + i)}\n`).join("");

describe("tailLines", () => {
  it("takes the last n lines, without an empty one for the final newline", () => {
    expect(tailLines("a\nb\nc\n", 2)).toEqual(["b", "c"]);
    expect(tailLines("a\nb", 5)).toEqual(["a", "b"]);
    expect(tailLines("", 5)).toEqual([]);
  });

  it("cuts a line over 400 characters with …", () => {
    const [line] = tailLines(`${"x".repeat(1000)}\n`, 1);
    expect(line).toHaveLength(MAX_LINE);
    expect(line?.endsWith("x…")).toBe(true);
  });
});

describe("the read pipeline", () => {
  it("redacts GitHub tokens, sk-ant- keys and long generic tokens, but not a SHA", () => {
    const lines = cleanTail(
      [
        `[out] token ${GHS}`,
        `[err] key ${SK}`,
        `[out] reg Zm9vYmFyYmF6cXV4cXV1eGNvcmdl`,
        `[out] commit ${SHA}`,
      ].join("\n"),
      10,
    );
    expect(lines.join("\n")).not.toContain(GHS);
    expect(lines.join("\n")).not.toContain(SK);
    expect(lines[2]).toBe("[out] reg [redacted]");
    expect(lines[3]).toBe(`[out] commit ${SHA}`);
  });

  it("keeps a token cut at the 400 boundary redacted", () => {
    const long = `${"a ".repeat(195)}${GHS}`;
    expect(long.indexOf(GHS)).toBeLessThan(MAX_LINE);
    expect(long.length).toBeGreaterThan(MAX_LINE);
    const [line] = cleanTail(long, 1);
    expect(line).not.toContain("ghs_A1b2");
    expect(line).toContain("[redacted]");
  });

  it("redacts a PEM block, and an END whose BEGIN was before the window", () => {
    const block =
      "-----BEGIN RSA " + "PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----";
    expect(cleanTail(`before\n${block}\nafter\n`, 10)).toEqual(["before", "[redacted]", "after"]);
    const mid = "MIIEowsecretbody\nmore\n-----END PRIVATE KEY-----\nafter\n";
    expect(cleanTail(mid, 10)).toEqual(["[redacted]", "after"]);
  });

  it("makes escapes and controls harmless", () => {
    expect(cleanTail("\u001b[31mred\u001b[0m\u0007 done\n", 1)).toEqual(["red� done"]);
  });

  it("keeps the runners' names, which are as long as a token", () => {
    const name = "vibewars-somehost-lq8x2k1a-12";
    expect(name.length).toBeGreaterThanOrEqual(28);
    expect(redactWindow(`started ${name}`, new Set([name]))).toBe(`started ${name}`);
    expect(redactWindow(`started ${name}`)).toBe("started [redacted]");
  });

  it("redacts a line at a time, carrying a PEM block across lines", () => {
    const state = { inside: false };
    const out = [
      "ok",
      "-----BEGIN OPENSSH " + "PRIVATE KEY-----",
      "b3BlbnNzaC1rZXk",
      "-----END OPENSSH PRIVATE KEY-----",
      `x ${GHS}`,
      "after",
    ].map((line) => redactLine(line, state));
    expect(out).toEqual(["ok", "[redacted]", "[redacted]", "[redacted]", "x [redacted]", "after"]);
  });
});

describe("reading a log", () => {
  it("tops up from .log.1 when .log is short", () => {
    const dir = hub();
    const file = path.join(dir, "runners", "r-1.log");
    fs.writeFileSync(`${file}.1`, numbered(1, 10));
    fs.writeFileSync(file, numbered(11, 12));
    const window = readLogWindow(file, 5);
    expect(tailLines(window ?? "", 5)).toEqual([
      "line 8",
      "line 9",
      "line 10",
      "line 11",
      "line 12",
    ]);
    expect(tailLines(readLogWindow(file, 2) ?? "", 2)).toEqual(["line 11", "line 12"]);
  });

  it("reads at most 256 KiB, without the partial first line", () => {
    const dir = hub();
    const file = path.join(dir, "big.log");
    fs.writeFileSync(file, `${"y".repeat(100)}\n`.repeat(4000));
    const window = readLogWindow(file, 10) ?? "";
    expect(Buffer.byteLength(window)).toBeLessThanOrEqual(WINDOW_BYTES);
    expect(window.split("\n").every((line) => line === "" || line.length === 100)).toBe(true);
  });

  it("refuses a symlinked log", () => {
    const dir = hub();
    const secret = path.join(dir, "secret");
    fs.writeFileSync(secret, "the operator's\n");
    fs.symlinkSync(secret, path.join(dir, "runners", "r-1.log"));
    expect(runnerLogIndex(path.join(dir, "runners"), 0)).toEqual([]);
    expect(readRunnerLogs(dir, "r-1", 10, 0)).toBe("no log for r-1; runners with logs: none\n");
    expect(() => readLogWindow(path.join(dir, "runners", "r-1.log"), 10)).toThrow(
      /not a regular file/,
    );
  });
});

describe("the index", () => {
  it("lists runner logs newest first, alive or exited with its code", () => {
    const dir = path.join(hub(), "runners");
    write(path.join(dir, "r-1.log"), "t [out] hi\nt exited 3\n", 1_000_000);
    write(path.join(dir, "r-2.log"), "t [out] working\n", 3_000_000);
    write(path.join(dir, "r-3.log"), "t [out] done\nt exited 0\n", 2_000_000);
    write(path.join(dir, "notes.txt"), "x", 4_000_000);
    write(path.join(dir, "r-3.log.1"), "older", 4_000_000);
    const index = runnerLogIndex(dir, 3_060_000);
    expect(index.map((log) => [log.name, log.alive, log.exitCode])).toEqual([
      ["r-2", true, null],
      ["r-3", false, 0],
      ["r-1", false, 3],
    ]);
    expect(index[0]).toMatchObject({ file: path.join(dir, "r-2.log"), size: 16, ageMs: 60_000 });
    expect(path.isAbsolute(index[0]?.file ?? "")).toBe(true);
  });

  it("prunes to the 20 newest, each with its .1, and never a live runner's", () => {
    const dir = path.join(hub(), "runners");
    for (let i = 0; i < 25; i += 1) {
      const file = path.join(dir, `r-${String(i)}.log`);
      write(file, "t exited 0\n", 1_000_000 + i * 1000);
      write(`${file}.1`, "old\n", 1_000_000 + i * 1000);
    }
    write(path.join(dir, "gone.log.1"), "orphan\n", 9_000_000);
    const removed = pruneRunnerLogs(dir, new Set(["r-0"]));
    expect(removed.sort()).toEqual(["r-1", "r-2", "r-3", "r-4"]);
    const left = fs.readdirSync(dir);
    expect(left).toHaveLength(42);
    expect(left).toContain("r-0.log");
    expect(left).toContain("r-0.log.1");
    expect(left).not.toContain("r-1.log.1");
    expect(left).not.toContain("gone.log.1");
  });
});

describe("writing", () => {
  it("rotates a log over its bound to .1, replacing the old one", () => {
    const dir = hub();
    const file = path.join(dir, "hubd.log");
    expect(rotateIfLarge(file, 10)).toBe(false);
    fs.writeFileSync(`${file}.1`, "oldest");
    fs.writeFileSync(file, "0123456789");
    expect(rotateIfLarge(file, 10)).toBe(false);
    appendLog(file, "a");
    expect(rotateIfLarge(file, 10)).toBe(true);
    expect(fs.readFileSync(`${file}.1`, "utf8")).toBe("0123456789a");
    expect(fs.readFileSync(file, "utf8")).toBe("");
    appendLog(file, "new\n");
    expect(fs.readFileSync(file, "utf8")).toBe("new\n");
  });

  it("refuses to append through a symlink", () => {
    const dir = hub();
    const target = path.join(dir, "target");
    fs.writeFileSync(target, "");
    fs.symlinkSync(target, path.join(dir, "x.log"));
    expect(() => {
      appendLog(path.join(dir, "x.log"), "a");
    }).toThrow();
    expect(fs.readFileSync(target, "utf8")).toBe("");
  });

  it("writes whole lines with the time and stream, rotates, and ends with exited", () => {
    const dir = hub();
    const file = path.join(dir, "runners", "r-1.log");
    const log = openRunnerLog(file, { now: () => 0, maxBytes: 120 });
    log.write("out", "hel");
    log.write("err", "oops\n");
    log.write("out", "lo\nmore\n");
    log.write("out", "x".repeat(40));
    log.end(2);
    log.write("out", "late\n");
    const t = new Date(0).toISOString();
    expect(fs.readFileSync(file, "utf8")).toBe(`${t} [out] ${"x".repeat(40)}\n${t} exited 2\n`);
    const all = `${fs.readFileSync(`${file}.1`, "utf8")}${fs.readFileSync(file, "utf8")}`;
    expect(all).toBe(
      `${t} [err] oops\n${t} [out] hello\n${t} [out] more\n${t} [out] ${"x".repeat(40)}\n${t} exited 2\n`,
    );
    expect(runnerLogIndex(path.join(dir, "runners"), 0)[0]).toMatchObject({
      name: "r-1",
      alive: false,
      exitCode: 2,
    });
  });

  it("never opens a log that is there already", () => {
    const dir = hub();
    const file = path.join(dir, "runners", "r-1.log");
    fs.writeFileSync(file, "planted\n");
    /** @type {unknown[]} */
    const errors = [];
    const log = openRunnerLog(file, { onError: (error) => errors.push(error) });
    log.write("out", "x\n");
    expect(errors).toHaveLength(1);
    expect(fs.readFileSync(file, "utf8")).toBe("planted\n");
  });
});

describe("company runners logs", () => {
  it("shows the supervisor's tail and one line per runner log, redacted", () => {
    const dir = hub();
    write(
      path.join(dir, "runner-supervisor.log"),
      `runners: started r-1\nrunners: mint failed ${GHS}\n`,
      0,
    );
    write(path.join(dir, "runners", "r-1.log"), "t [out] x\nt exited 1\n", 1_000_000);
    const text = readRunnerLogs(dir, null, 80, 1_120_000);
    expect(text).toBe(
      [
        "supervisor log, last 80 lines:",
        "runners: started r-1",
        "runners: mint failed [redacted]",
        "",
        "runner logs:",
        "  r-1  exited 1  21 B  written 2 min ago",
        "",
      ].join("\n"),
    );
  });

  it("shows one runner's tail, redacted, and names the others for an unknown one", () => {
    const dir = hub();
    write(path.join(dir, "runners", "r-1.log"), `t [out] ${SK}\nt [err] two\n`, 1);
    write(path.join(dir, "runners", "r-2.log"), "t [out] y\n", 2);
    expect(readRunnerLogs(dir, "r-1", 1, 10)).toBe("t [err] two\n");
    expect(readRunnerLogs(dir, "r-1", 5, 10)).toBe("t [out] [redacted]\nt [err] two\n");
    expect(readRunnerLogs(dir, "r-9", 5, 10)).toBe("no log for r-9; runners with logs: r-2, r-1\n");
  });

  it("says when there is no supervisor log and no runner log", () => {
    expect(formatRunnerLogs({ runner: null, n: 80, index: [], lines: null })).toBe(
      "no supervisor log (.bots/hub/runner-supervisor.log)\n\nno runner logs\n",
    );
  });
});
