/**
 * runner-tail (#2729): a runner's log followed across its rotation, every
 * line redacted and made visible before it reaches the pane.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MAX_LINE, follower } from "./runner-tail.mjs";

/** @type {string[]} */
const dirs = [];
const scratch = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-tail-test-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const TOKEN = `ghp_${"a".repeat(36)}`;

/**
 * @param {string} file
 * @returns {{ seen: string[], poll: () => void, close: () => void }}
 */
function tail(file) {
  /** @type {string[]} */
  const seen = [];
  const t = follower(file, (line) => seen.push(line));
  return {
    seen,
    poll: () => {
      t.poll();
    },
    close: () => {
      t.close();
    },
  };
}

describe("runner-tail following", () => {
  it("shows the end of the log, then each line as it is written", () => {
    const file = path.join(scratch(), "r1.log");
    fs.writeFileSync(file, "one\ntwo\nhal");
    const t = tail(file);

    t.poll();
    expect(t.seen).toEqual(["one", "two"]);
    fs.appendFileSync(file, "f done\nthree\n");
    t.poll();
    expect(t.seen).toEqual(["one", "two", "half done", "three"]);
    t.close();
  });

  it("waits for a log that does not exist yet", () => {
    const file = path.join(scratch(), "r1.log");
    const t = tail(file);

    t.poll();
    fs.writeFileSync(file, "started\n");
    t.poll();
    expect(t.seen).toEqual(["started"]);
    t.close();
  });

  it("follows the log across its rotation, reading the old file to its end first", () => {
    const file = path.join(scratch(), "r1.log");
    fs.writeFileSync(file, "before\n");
    const t = tail(file);
    t.poll();

    fs.appendFileSync(file, "last of the old\n");
    fs.renameSync(file, `${file}.1`);
    fs.writeFileSync(file, "first of the new\n");
    t.poll();
    fs.appendFileSync(file, "next\n");
    t.poll();

    expect(t.seen).toEqual(["before", "last of the old", "first of the new", "next"]);
    t.close();
  });

  it("reads a log cut shorter again from its start", () => {
    const file = path.join(scratch(), "r1.log");
    fs.writeFileSync(file, "a long first line\n");
    const t = tail(file);
    t.poll();

    fs.truncateSync(file, 0);
    fs.appendFileSync(file, "again\n");
    t.poll();

    expect(t.seen).toEqual(["a long first line", "again"]);
    t.close();
  });

  it("refuses a log that is a symlink", () => {
    const dir = scratch();
    fs.writeFileSync(path.join(dir, "secret"), "not a log\n");
    const file = path.join(dir, "r1.log");
    fs.symlinkSync(path.join(dir, "secret"), file);
    const t = tail(file);

    t.poll();
    t.poll();

    expect(t.seen).toEqual([`runner-tail: refusing ${file}: it is a symlink`]);
  });
});

/**
 * @param {string} line written to a log after the pane opened
 * @returns {string} what the pane shows of it
 */
function shown(line) {
  const file = path.join(scratch(), "r1.log");
  fs.writeFileSync(file, "");
  const t = tail(file);
  t.poll();
  fs.appendFileSync(file, `${line}\n`);
  t.poll();
  t.close();
  expect(t.seen).toHaveLength(1);
  return t.seen[0] ?? "";
}

describe("runner-tail redaction", () => {
  it("redacts a token in a line", () => {
    expect(shown(`token ${TOKEN} minted`)).toBe("token [redacted] minted");
  });

  it("keeps a token cut at the 400-character boundary redacted", () => {
    const line = `${"x ".repeat((MAX_LINE - 10) / 2)}${TOKEN}`;

    const out = shown(line);

    expect(out).not.toContain("ghp_");
    expect(out).not.toContain("aaaa");
    expect(out.length).toBeLessThanOrEqual(MAX_LINE);
  });

  it("redacts any run of 28 token characters, but not a commit SHA", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const out = shown(`remove-token AABBCCDDEEFFGGHHIIJJKKLLMMNN at ${sha}`);

    expect(out).toBe(`remove-token [redacted] at ${sha}`);
  });

  it("makes escape and control characters visible, so a line cannot retitle the pane", () => {
    const out = shown("\u001b]2;owned\u0007 job");

    expect(out).not.toContain("\u001b");
    expect(out).not.toContain("\u0007");
    expect(out).toContain("job");
  });

  it("redacts a PEM block whole, across lines and polls", () => {
    const file = path.join(scratch(), "r1.log");
    fs.writeFileSync(file, "before\n-----BEGIN RSA " + "PRIVATE KEY-----\n");
    const t = tail(file);
    t.poll();
    fs.appendFileSync(file, "MIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nafter\n");
    t.poll();

    expect(t.seen).toEqual(["before", "[redacted]", "[redacted]", "[redacted]", "after"]);
    t.close();
  });

  it("redacts a PEM block the backlog window cut in the middle", () => {
    const file = path.join(scratch(), "r1.log");
    fs.writeFileSync(
      file,
      "filler\n".repeat(40_000) +
        "-----BEGIN " +
        `PRIVATE KEY-----\n${"QUJD\n".repeat(60_000)}-----END PRIVATE KEY-----\nafter\n`,
    );
    const t = tail(file);

    t.poll();

    expect(t.seen.join("\n")).not.toContain("QUJD");
    expect(t.seen.at(-1)).toBe("after");
    t.close();
  });
});
