/**
 * run-forever, for real: a command that keeps dying is restarted and every
 * exit recorded, and a signal stops it for good (issue #23). The backoff and
 * crash-loop decisions are covered in hub-health.test.mjs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { parseExits } from "./hub-health.mjs";

const RUN_FOREVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-forever.mjs");

/** @type {(() => void)[]} */
const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/**
 * @param {() => boolean} condition
 * @param {string} label
 * @param {number} [ms]
 */
async function until(condition, label, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await sleep(50);
  }
}

/**
 * Supervise `script` (Node source) as "demo".
 *
 * @param {string} script
 */
function supervise(script) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-forever-"));
  const hub = path.join(root, "hub");
  const child = spawn(
    process.execPath,
    [RUN_FOREVER, "demo", "--", process.execPath, "-e", script],
    {
      env: { ...process.env, VIBEWARS_BOT_ROOT: root, VIBEWARS_BOT_BUS: path.join(root, "bus") },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (/** @type {Buffer} */ chunk) => (output += chunk.toString()));
  child.stderr.on("data", (/** @type {Buffer} */ chunk) => (output += chunk.toString()));
  /** @type {Promise<number | null>} */
  const exited = new Promise((resolve) => {
    child.on("exit", (code) => {
      resolve(code);
    });
  });
  cleanups.push(() => {
    child.kill("SIGKILL");
    fs.rmSync(root, { recursive: true, force: true });
  });
  const read = (/** @type {string} */ file) => {
    try {
      return fs.readFileSync(path.join(hub, file), "utf8");
    } catch {
      return null;
    }
  };
  return { root, child, exited, output: () => output, read };
}

describe("run-forever", () => {
  it("restarts a command that exits, says so, and records each exit", async () => {
    const run = supervise('console.error("boom"); process.exit(3)');

    await until(() => parseExits(run.read("demo.restarts")).length >= 2, "two exits");

    const exits = parseExits(run.read("demo.restarts"));
    expect(exits.map((exit) => exit.code)).toEqual(exits.map(() => 3));
    expect(run.output()).toMatch(/── demo exited \(code 3\) after 0 s; restart #1 in 1 s ──/);
    expect(run.output()).toMatch(/restart #2 in 2 s/);
    // The child's own output goes to the pane and the log alike.
    expect(run.output()).toContain("boom");
    expect(run.read("demo.log")).toContain("boom");
  }, 20_000);

  it("stops with its child on a signal, without restarting it", async () => {
    const run = supervise("setInterval(() => {}, 1000)");
    await until(() => run.read("demo.runner.pid") !== null, "the runner's pid file");
    await sleep(300);

    run.child.kill("SIGTERM");

    expect(await run.exited).toBe(0);
    expect(run.output()).toContain("── demo stopped ──");
    expect(run.read("demo.restarts")).toBeNull();
    expect(run.read("demo.runner.pid")).toBeNull();
  }, 20_000);

  it("refuses to supervise the same name twice", async () => {
    const first = supervise("setInterval(() => {}, 1000)");
    await until(() => first.read("demo.runner.pid") !== null, "the first runner");

    const second = spawn(
      process.execPath,
      [RUN_FOREVER, "demo", "--", process.execPath, "-e", ""],
      {
        env: {
          ...process.env,
          VIBEWARS_BOT_ROOT: first.root,
          VIBEWARS_BOT_BUS: path.join(first.root, "bus"),
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    second.stderr.on("data", (/** @type {Buffer} */ chunk) => (stderr += chunk.toString()));
    /** @type {number | null} */
    const code = await new Promise((resolve) => {
      second.on("exit", resolve);
    });

    expect(code).toBe(1);
    expect(stderr).toMatch(/already supervised/);
  }, 20_000);
});
