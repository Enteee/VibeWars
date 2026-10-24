/**
 * `hub` prints the daemon's answer into a pipe, and a pipe is asynchronous in
 * Node: calling process.exit() straight after the write dropped whatever the
 * reader had not taken yet. `board ls` got a truncated item-list and could not
 * parse it (issue #37). This plays the daemon and reads hub through a pipe.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "hub.mjs");

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Runs `hub issue list` against a stand-in daemon that answers with `response`,
 * and collects everything hub writes, read slowly so the pipe backs up.
 * @param {Record<string, unknown>} response
 * @param {string[]} [extra] arguments after `issue list`
 * @returns {Promise<{ code: number | null, stdout: string }>}
 */
async function runHub(response, extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-output-"));
  dirs.push(root);
  const spool = path.join(root, "developer-2");
  fs.mkdirSync(path.join(spool, "req"), { recursive: true });
  fs.mkdirSync(path.join(spool, "res"), { recursive: true });
  fs.writeFileSync(path.join(root, "hubd.alive"), String(Date.now()));

  const child = spawn(process.execPath, [HUB, "issue", "list", ...extra], {
    env: {
      ...process.env,
      VIBEWARS_BOT_ROLE: "developer-2",
      VIBEWARS_HUB: spool,
      VIBEWARS_ACTING: "",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });

  /** @type {Buffer[]} */
  const chunks = [];
  child.stdout.on("data", (/** @type {Buffer} */ chunk) => {
    chunks.push(chunk);
    child.stdout.pause();
    setTimeout(() => child.stdout.resume(), 1);
  });
  /** @type {Promise<number | null>} */
  const exited = new Promise((resolve) => child.on("close", resolve));

  for (;;) {
    const pending = fs.readdirSync(path.join(spool, "req")).filter((f) => f.endsWith(".json"));
    if (pending.length > 0) {
      const file = /** @type {string} */ (pending[0]);
      fs.writeFileSync(path.join(spool, "res", file), JSON.stringify(response));
      break;
    }
    await sleep(20);
  }

  const code = await exited;
  return { code, stdout: Buffer.concat(chunks).toString("utf8") };
}

describe("hub's output through a pipe", () => {
  it("delivers every byte of a large answer", async () => {
    const big = JSON.stringify({
      items: Array.from({ length: 20_000 }, (_, i) => ({ n: i, pad: "x".repeat(60) })),
    });
    expect(big.length).toBeGreaterThan(1_000_000);

    const { code, stdout } = await runHub({ allow: true, code: 0, stdout: big });

    expect(code).toBe(0);
    expect(stdout.length).toBe(big.length);
    expect(stdout).toBe(big);
  });

  it("still exits with the daemon's code once the output is out", async () => {
    const { code, stdout } = await runHub({ allow: true, code: 3, stdout: "partial\n" });

    expect(code).toBe(3);
    expect(stdout).toBe("partial\n");
  });

  it("delivers every byte of a large --jq result", async () => {
    const items = Array.from({ length: 20_000 }, (_, i) => ({ n: i, pad: "y".repeat(60) }));

    const { code, stdout } = await runHub({ allow: true, code: 0, stdout: JSON.stringify(items) }, [
      "--json",
      "number",
      "--jq",
      ".[].pad",
    ]);

    expect(code).toBe(0);
    expect(stdout).toBe(items.map((item) => `${item.pad}\n`).join(""));
  });
});
