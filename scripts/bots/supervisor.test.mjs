/**
 * Which agents the supervisor counts as between turns during a reboot drain.
 *
 * The restart loop in nix/claude-llc.nix creates the marker before its pause
 * and removes it before the next turn; a turn in flight has none.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { betweenTurns } from "./supervisor.mjs";

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("betweenTurns", () => {
  it("is the roles whose loop has written its marker, and no others", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "supervisor-test-"));
    dirs.push(root);
    fs.mkdirSync(path.join(root, "agents", "manager"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "manager", "between-turns"), "");
    // In a turn: the state directory and its session, but no marker.
    fs.mkdirSync(path.join(root, "agents", "architect"), { recursive: true });
    fs.writeFileSync(path.join(root, "agents", "architect", "session-id"), "abc\n");

    expect(betweenTurns(root, ["manager", "architect", "developer-1"])).toEqual(["manager"]);
  });
});
