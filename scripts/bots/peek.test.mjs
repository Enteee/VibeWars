/**
 * What the manager's `peek` records and prints (#19).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KEEP_LINES, MAX_LINE, peek, peekWriter, redact, stripAnsi } from "./peek.mjs";

const PEEK = path.join(path.dirname(fileURLToPath(import.meta.url)), "peek.mjs");

/** @type {string[]} */
const dirs = [];
const scratch = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-test-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  vi.useRealTimers();
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("redact", () => {
  it("replaces each kind of secret", () => {
    const github = `ghp_${"a".repeat(36)}`;
    const pat = `github_pat_${"B1_".repeat(10)}`;
    const telegram = `123456789:${"x".repeat(35)}`;
    const anthropic = "sk-ant-api03-abcDEF_123-xyz";
    for (const secret of [github, pat, telegram, anthropic]) {
      expect(redact(`token ${secret} end`)).toBe("token [redacted] end");
    }
    expect(redact("Authorization: Bearer abc.def-123")).toBe("Authorization: [redacted]");
    expect(redact("curl -H 'x' Bearer abcdefghij1234")).toBe("curl -H 'x' Bearer [redacted]");
    expect(
      redact(
        "a\n-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\nBBBB\n-----END OPENSSH PRIVATE KEY-----\nb",
      ),
    ).toBe("a\n[redacted]\nb");
  });

  it("leaves ordinary text alone, including issue numbers and SHAs", () => {
    const text = "taking #123 at 7e45facb0123456789abcdef0123456789abcdef; 12:34:56 ghp_ short";
    expect(redact(text)).toBe(text);
  });
});

describe("stripAnsi", () => {
  it("removes escape sequences and keeps unicode", () => {
    expect(stripAnsi("\u001b[31m✓ ┌─┐ ünï\u001b[0m\u001b]0;title\u0007 ok")).toBe("✓ ┌─┐ ünï ok");
  });
});

describe("peekWriter", () => {
  it("keeps the last 500 lines, cuts long ones, and redacts a key block across lines", () => {
    const dir = path.join(scratch(), "peek");
    const writer = peekWriter(dir, "developer-1");
    for (let i = 0; i < KEEP_LINES + 20; i += 1) {
      writer.line(`line ${String(i)}`);
    }
    writer.line("x".repeat(MAX_LINE + 50));
    writer.line("-----BEGIN RSA PRIVATE KEY-----");
    writer.line("SECRETSECRET");
    writer.line("-----END RSA PRIVATE KEY-----");
    writer.line("after");
    writer.finish("between");

    const lines = fs.readFileSync(path.join(dir, "developer-1.txt"), "utf8").split("\n");
    expect(lines).toHaveLength(KEEP_LINES + 1);
    expect(lines.at(-2)).toBe("after");
    expect(lines.at(-3)).toBe("[redacted]");
    expect(lines.join("\n")).not.toContain("SECRETSECRET");
    expect(lines.at(-6)).toHaveLength(MAX_LINE);
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dir, "developer-1.txt")).mode & 0o777).toBe(0o600);
  });

  it("throttles to one write a second, and finish always writes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const dir = scratch();
    const writer = peekWriter(dir, "qa-tester@2");
    const read = () => fs.readFileSync(path.join(dir, "qa-tester@2.txt"), "utf8");

    writer.line("one");
    expect(read()).toBe("one\n");
    writer.line("two");
    expect(read()).toBe("one\n");
    vi.advanceTimersByTime(1000);
    expect(read()).toBe("one\ntwo\n");
    writer.line("three");
    writer.finish("limited");
    expect(read()).toBe("one\ntwo\nthree\n");
    /** @type {unknown} */
    const row = JSON.parse(fs.readFileSync(path.join(dir, "qa-tester@2.json"), "utf8"));
    expect(row).toMatchObject({ employee: "qa-tester@2", state: "limited", lastLine: "three" });
  });

  it("carries the lines over to the next turn", () => {
    const dir = scratch();
    const first = peekWriter(dir, "architect");
    first.line("from the last turn");
    first.finish("between");
    const second = peekWriter(dir, "architect");
    second.line("from this turn");
    second.finish("between");

    expect(fs.readFileSync(path.join(dir, "architect.txt"), "utf8")).toBe(
      "from the last turn\nfrom this turn\n",
    );
  });

  it("refuses an employee id that is not one", () => {
    expect(() => peekWriter(scratch(), "../etc")).toThrow(/refused employee/);
  });
});

describe("peek", () => {
  /** @param {string} dir */
  const fill = (dir) => {
    let at = 10_000;
    for (const [who, state, last] of [
      ["qa-tester@2", "turn", "y".repeat(150)],
      ["developer-1", "between", "pushed"],
    ]) {
      const writer = peekWriter(dir, who ?? "", { now: () => at });
      for (let i = 0; i < 100; i += 1) {
        writer.line(`${who ?? ""} ${String(i)}`);
      }
      writer.line(last ?? "");
      writer.finish(/** @type {"turn" | "between"} */ (state));
      at += 1000;
    }
  };

  it("summarises one row per employee, sorted, with age and the last line cut to 100", () => {
    const dir = scratch();
    fill(dir);

    const { code, out } = peek([], dir, 13_000);

    expect(code).toBe(0);
    const rows = out.trimEnd().split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^developer-1\s+between turns\s+2s ago\s+pushed$/);
    expect(rows[1]).toMatch(/^qa-tester@2\s+in turn\s+3s ago\s+y{100}$/);
  });

  it("prints the last 80 lines, more with --lines, and at most 500", () => {
    const dir = scratch();
    fill(dir);

    expect(peek(["developer-1"], dir, 0).out.trimEnd().split("\n")).toHaveLength(80);
    expect(peek(["developer-1", "--lines", "3"], dir, 0).out.trimEnd().split("\n")).toEqual([
      "developer-1 98",
      "developer-1 99",
      "pushed",
    ]);
    expect(peek(["developer-1", "--lines", "9999"], dir, 0).out.trimEnd().split("\n")).toHaveLength(
      101,
    );
  });

  it("exits 1 for an unknown employee and lists the known ones", () => {
    const dir = scratch();
    fill(dir);

    expect(peek(["../../etc/passwd"], dir, 0)).toEqual({
      code: 1,
      out: "peek: no output from ../../etc/passwd; known: developer-1, qa-tester@2\n",
    });
  });

  it("is a command: it refuses to run without the manager's directory", () => {
    const result = spawnSync(process.execPath, [PEEK], {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/only the manager has peek/);
  });
});

beforeEach(() => {
  vi.useRealTimers();
});
