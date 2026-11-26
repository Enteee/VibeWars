import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WAITS_FILE, WAITS_KEEP_MS, appendWait, parseWaits } from "./waits.mjs";

const NOW = 1_800_000_000_000;

/**
 * @param {number} end
 * @returns {import("./waits.mjs").WaitLine}
 */
function line(end) {
  return { start: end - 1000, end, cmd: "tg", woke: "timeout" };
}

describe("the wait log (#1615)", () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "waits-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const log = () => fs.readFileSync(path.join(dir, WAITS_FILE), "utf8");

  it("reads back what it appends", () => {
    const board = { start: NOW - 5000, end: NOW, cmd: "board", woke: "card" };
    appendWait(dir, line(NOW - 9000));
    appendWait(dir, /** @type {import("./waits.mjs").WaitLine} */ (board));
    expect(parseWaits(log())).toEqual([line(NOW - 9000), board]);
  });

  it("skips a torn line and lines of another shape", () => {
    const text = [
      JSON.stringify(line(NOW)),
      JSON.stringify({ ...line(NOW), woke: "bored" }),
      JSON.stringify({ ...line(NOW), start: NOW + 1 }),
      '{"start":1,"end":',
    ].join("\n");
    expect(parseWaits(text)).toEqual([line(NOW)]);
  });

  it("keeps the last 8 days, once its first line is older", () => {
    appendWait(dir, line(NOW - WAITS_KEEP_MS - 1));
    appendWait(dir, line(NOW - WAITS_KEEP_MS + 1));
    appendWait(dir, line(NOW));
    expect(parseWaits(log())).toEqual([line(NOW - WAITS_KEEP_MS + 1), line(NOW)]);
  });

  it("never fails the wait it measures", () => {
    expect(() => {
      appendWait(path.join(dir, "missing"), line(NOW));
    }).not.toThrow();
  });
});
