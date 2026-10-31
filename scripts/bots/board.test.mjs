/**
 * `board` and the context ceiling (#1695), against a stub `hub` on PATH:
 * the line comes once, from `board`, after its output, and a move into
 * In Progress near the ceiling is advised against but still made.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const BOARD = path.join(path.dirname(fileURLToPath(import.meta.url)), "board.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A stub `hub` that answers `board show` with card #7 in Ready and
 * anything else with success, and logs each call's words and whether it
 * was told to keep quiet about the context.
 */
const STUB = `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, quiet: process.env.VIBEWARS_CONTEXT_QUIET ?? null }) + "\\n");
if (args[0] === "board") {
  process.stdout.write(JSON.stringify({ card: { id: "PVTI_7", status: "Ready", title: "seven" }, cards: [], token: "t" }));
}
`;

/**
 * Run `board` with `context` as the employee's context.json (none if
 * undefined).
 *
 * @param {string[]} args
 * @param {unknown} [context]
 */
function board(args, context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "board-test-"));
  dirs.push(root);
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "hub"), STUB, { mode: 0o755 });
  fs.mkdirSync(path.join(root, "developer"));
  if (context !== undefined) {
    fs.writeFileSync(path.join(root, "developer", "context.json"), JSON.stringify(context));
  }
  const log = path.join(root, "hub.log");
  const result = spawnSync(process.execPath, [BOARD, ...args], {
    encoding: "utf8",
    env: {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      VIBEWARS_BOT_BUS: root,
      VIBEWARS_BOT_EMPLOYEE: "developer",
      VIBEWARS_BOARD: JSON.stringify({
        projectId: "PVT_1",
        statusField: { id: "F_1", options: { Ready: "o1", "In Progress": "o2" } },
      }),
      STUB_LOG: log,
    },
  });
  const calls = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      /** @type {unknown} */
      const call = JSON.parse(line);
      return /** @type {{ args: string[], quiet: string | null }} */ (call);
    });
  return { result, calls };
}

const NEAR = { tokens: 104_000, ceiling: 120_000 };
const OVER = { tokens: 128_000, ceiling: 120_000 };
const START =
  "context 104k of 120k: too little room to start a card; end your turn and start it fresh.\n";

describe("board and the context ceiling (#1695)", () => {
  it("moves a card into In Progress near the ceiling, and advises against starting it", () => {
    const { result, calls } = board(["move", "7", "In Progress"], NEAR);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("#7: Ready -> In Progress\n");
    expect(result.stderr).toBe(START);
    expect(calls.map((call) => call.args[0])).toEqual(["board", "project"]);
  });

  it("tells the hub it runs to keep quiet, so the line is said once", () => {
    const { calls } = board(["show", "7"], OVER);

    expect(calls.map((call) => call.quiet)).toEqual(["1"]);
  });

  it("says the ceiling after any command's output, past it", () => {
    const { result } = board(["show", "7"], OVER);

    expect(result.stdout).toBe("#7 Ready — seven\n");
    expect(result.stderr).toBe(
      "context 128k of 120k: finish this step, commit and push, then end your turn.\n",
    );
  });

  it("advises nothing on a move elsewhere, or with room left", () => {
    expect(board(["move", "7", "Ready"], NEAR).result.stderr).toBe("");
    expect(
      board(["move", "7", "In Progress"], { tokens: 99_000, ceiling: 120_000 }).result.stderr,
    ).toBe("");
    expect(board(["move", "7", "In Progress"]).result.stderr).toBe("");
  });
});
