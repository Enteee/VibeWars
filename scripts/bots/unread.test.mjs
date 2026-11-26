import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { unreadOf } from "./unread.mjs";

const line = (/** @type {string} */ nudge) =>
  JSON.stringify({ ts: 1, from: "system", kind: "link", text: "t", nudge }) + "\n";

describe("unreadOf (#547)", () => {
  /** @type {string} */
  let bus;
  /** @type {string} */
  let dir;

  beforeEach(() => {
    bus = fs.mkdtempSync(path.join(os.tmpdir(), "unread-"));
    dir = path.join(bus, "manager");
    fs.mkdirSync(dir);
  });
  afterEach(() => {
    fs.rmSync(bus, { recursive: true, force: true });
  });

  it("returns the lines past the cursor", () => {
    const first = line("a");
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), first + line("b"));
    fs.writeFileSync(path.join(dir, "cursor"), String(Buffer.byteLength(first)));
    expect(unreadOf(bus, "manager").map((l) => l.nudge)).toEqual(["b"]);
  });

  it("reads everything when there is no cursor, and nothing when there is no inbox", () => {
    expect(unreadOf(bus, "manager")).toEqual([]);
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line("a"));
    expect(unreadOf(bus, "manager")).toHaveLength(1);
  });

  it("gives no lines, and does not hang, for a FIFO inbox", () => {
    execFileSync("mkfifo", [path.join(dir, "inbox.jsonl")]);
    expect(unreadOf(bus, "manager")).toEqual([]);
  });

  it("does not follow a symlinked inbox or cursor", () => {
    const target = path.join(bus, "elsewhere");
    fs.writeFileSync(target, line("a"));
    fs.symlinkSync(target, path.join(dir, "inbox.jsonl"));
    expect(unreadOf(bus, "manager")).toEqual([]);
    fs.rmSync(path.join(dir, "inbox.jsonl"));
    fs.writeFileSync(path.join(dir, "inbox.jsonl"), line("a") + line("b"));
    fs.symlinkSync(target, path.join(dir, "cursor"));
    // A cursor that cannot be read is no cursor: all unread, never the link's target.
    expect(unreadOf(bus, "manager")).toHaveLength(2);
  });
});
