import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { POLL_MS, REBOOT_WAIT_MS, WAITED, waitForReboot } from "./reboot-wait.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "reboot-wait.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A rebooting.json written at `writtenAt` on a clock that each sleep moves
 * on, removed once the clock reaches `removedAt`.
 *
 * @param {{ writtenAt: number | null, removedAt?: number, rebooted?: boolean }} world
 */
function world({ writtenAt, removedAt = Infinity, rebooted = false }) {
  let clock = 1_000_000;
  /** @type {string[]} */
  const said = [];
  let sleeps = 0;
  const deps = {
    rebooted,
    mtime: () => (writtenAt === null || clock >= removedAt ? null : writtenAt),
    now: () => clock,
    sleep: async (/** @type {number} */ ms) => {
      sleeps += 1;
      clock += ms;
      await Promise.resolve();
    },
    say: (/** @type {string} */ line) => {
      said.push(line);
    },
  };
  return { deps, said, sleeps: () => sleeps, start: clock };
}

describe("waitForReboot", () => {
  it("returns at once when no reboot is in progress", async () => {
    const w = world({ writtenAt: null });
    expect(await waitForReboot(w.deps)).toBe("none");
    expect(w.said).toEqual([]);
    expect(w.sleeps()).toBe(0);
  });

  it("never blocks the restarter's own up", async () => {
    const w = world({ writtenAt: 1_000_000, rebooted: true });
    expect(await waitForReboot(w.deps)).toBe("none");
    expect(w.sleeps()).toBe(0);
  });

  it("waits while the record exists, and says so once", async () => {
    const w = world({ writtenAt: 1_000_000, removedAt: 1_000_000 + 5 * POLL_MS });
    expect(await waitForReboot(w.deps)).toBe("finished");
    expect(w.said).toEqual(["a reboot is in progress, waiting for it"]);
    expect(w.sleeps()).toBe(5);
  });

  it("gives up on a record older than the deadline, counted from its mtime", async () => {
    const w = world({ writtenAt: 1_000_000 - REBOOT_WAIT_MS + 3 * POLL_MS });
    expect(await waitForReboot(w.deps)).toBe("abandoned");
    expect(w.sleeps()).toBe(3);
    expect(w.said.at(-1)).toBe(
      "the reboot has not finished after 15 min; rebooting.json looks abandoned. Carrying on",
    );
  });
});

describe("reboot-wait.mjs, the 2026-10-26 race", () => {
  /**
   * @param {string} root
   * @param {Record<string, string>} env
   */
  const run = (root, env = {}) =>
    spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, VIBEWARS_BOT_ROOT: root, VIBEWARS_REBOOTED: "", ...env },
      stdio: ["ignore", "ignore", "pipe"],
    });

  it("holds a plain claude-llc until the restarter is done, then says it waited", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "reboot-wait-test-"));
    dirs.push(root);
    const record = path.join(root, "rebooting.json");
    fs.writeFileSync(record, "{}\n");

    const child = run(root);
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    await sleep(POLL_MS + 500);
    expect(child.exitCode).toBeNull();
    fs.rmSync(record);
    await once(child, "exit");

    expect(child.exitCode).toBe(WAITED);
    expect(stderr).toBe("claude-llc: a reboot is in progress, waiting for it\n");
  }, 20_000);

  it("lets the restarter's own up through at once", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "reboot-wait-test-"));
    dirs.push(root);
    fs.writeFileSync(path.join(root, "rebooting.json"), "{}\n");

    const child = run(root, { VIBEWARS_REBOOTED: "1" });
    await once(child, "exit");

    expect(child.exitCode).toBe(0);
  });
});
