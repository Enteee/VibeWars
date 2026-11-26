/**
 * Attaching to the company (#740): the plan, and the CLI against a tmux
 * stand-in that records what it is asked.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { NO_TTY_MESSAGE, attachPlan } from "./attach.mjs";

const ATTACH = path.join(path.dirname(fileURLToPath(import.meta.url)), "attach.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Runs the CLI with pipes for stdin and stdout, so it never has a TTY.
 *
 * @param {Record<string, string>} env
 * @returns {{ code: number | null, stdout: string, calls: string[] }}
 */
function attach(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "attach-test-"));
  dirs.push(dir);
  const calls = path.join(dir, "calls.log");
  const tmux = path.join(dir, "tmux");
  fs.writeFileSync(tmux, ["#!/bin/sh", `printf '%s\\n' "$*" >>${calls}`].join("\n"), {
    mode: 0o755,
  });
  const result = spawnSync(process.execPath, [ATTACH, "vibewars-llc"], {
    env: { PATH: process.env.PATH ?? "", VIBEWARS_TMUX: tmux, ...env },
    encoding: "utf8",
  });
  return {
    code: result.status,
    stdout: result.stdout,
    calls: fs.existsSync(calls) ? fs.readFileSync(calls, "utf8").trim().split("\n") : [],
  };
}

describe("attachPlan", () => {
  it("switches the client inside tmux, terminal or not", () => {
    expect(attachPlan({ insideTmux: true, hasTty: true })).toBe("switch-client");
    expect(attachPlan({ insideTmux: true, hasTty: false })).toBe("switch-client");
  });

  it("attaches outside tmux from a terminal", () => {
    expect(attachPlan({ insideTmux: false, hasTty: true })).toBe("attach-session");
  });

  it("does not attach without a terminal", () => {
    expect(attachPlan({ insideTmux: false, hasTty: false })).toBe("none");
  });
});

describe("attach.mjs", () => {
  it("switches the tmux client it runs in to the session", () => {
    const result = attach({ TMUX: "/tmp/tmux-1000/default,123,0" });

    expect(result.code).toBe(0);
    expect(result.calls).toEqual(["switch-client -t vibewars-llc"]);
  });

  it("without a terminal, says how to attach and calls no tmux at all", () => {
    const result = attach({});

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(NO_TTY_MESSAGE);
    expect(result.calls).toEqual([]);
  });
});
