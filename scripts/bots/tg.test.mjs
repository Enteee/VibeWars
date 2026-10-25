/**
 * `tg wait` and the context ceiling (#321): an agent past it is told to end
 * its turn instead of waiting, and never loses a message for it.
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const TG = path.join(path.dirname(fileURLToPath(import.meta.url)), "tg.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A role's bus directory, with `context` as its context.json if given and
 * `messages` in its inbox.
 *
 * @param {{ context?: unknown, messages?: string[] }} [options]
 */
function bus({ context, messages = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tg-test-"));
  dirs.push(root);
  const dir = path.join(root, "developer-1");
  fs.mkdirSync(dir);
  if (context !== undefined) {
    fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(context));
  }
  fs.writeFileSync(
    path.join(dir, "inbox.jsonl"),
    messages.map((text) => `${JSON.stringify({ ts: 1, from: "manager", text })}\n`).join(""),
  );
  const env = { ...process.env, VIBEWARS_BOT_ROLE: "developer-1", VIBEWARS_BOT_BUS: root };
  return { dir, env };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {number} timeout seconds
 */
function wait(env, timeout) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [TG, "wait", "--timeout", String(timeout)], {
    env,
    encoding: "utf8",
  });
  return { code: result.status, stdout: result.stdout, ms: Date.now() - started };
}

const OVER = { tokens: 134_000, ceiling: 120_000 };

describe("tg wait, past the context ceiling", () => {
  it("returns at once with an empty inbox, and says to end the turn", () => {
    const { env } = bus({ context: OVER });

    const result = wait(env, 20);

    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(10_000);
    expect(result.stdout).toBe(
      "Your context is over the ceiling (134k of 120k). Commit and push any WIP, put anything that lives only in this conversation on the card or in a memory, then END YOUR TURN. The next turn starts fresh; your inbox is kept.\n",
    );
  });

  it("prints the messages already waiting, and nothing else", () => {
    const { env } = bus({ context: OVER, messages: ["review #12"] });

    const result = wait(env, 20);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/manager: review #12\n$/);
    expect(result.stdout).not.toMatch(/ceiling/);
  });

  it("stops waiting when the context passes the ceiling mid-wait", async () => {
    const { dir, env } = bus({ context: { tokens: 0, ceiling: 120_000 } });
    const child = spawn(process.execPath, [TG, "wait", "--timeout", "20"], { env });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    const exited = once(child, "exit");
    setTimeout(() => {
      fs.writeFileSync(path.join(dir, "context.json"), JSON.stringify(OVER));
    }, 1500);

    await exited;

    expect(child.exitCode).toBe(0);
    expect(stdout).toMatch(/^Your context is over the ceiling \(134k of 120k\)/);
  }, 15_000);
});

describe("tg wait, under the ceiling or without a context file", () => {
  it("waits as before when there is no file", () => {
    const { env } = bus();

    const result = wait(env, 1);

    expect(result.stdout).toBe("(nothing new in 1s)\n");
    expect(result.ms).toBeGreaterThanOrEqual(1000);
  });

  it("waits as before when the file is not JSON", () => {
    const { dir, env } = bus();
    fs.writeFileSync(path.join(dir, "context.json"), "{");

    expect(wait(env, 1).stdout).toBe("(nothing new in 1s)\n");
  });

  it("waits as before under the ceiling", () => {
    const { env } = bus({ context: { tokens: 119_999, ceiling: 120_000 } });

    expect(wait(env, 1).stdout).toBe("(nothing new in 1s)\n");
  });
});
