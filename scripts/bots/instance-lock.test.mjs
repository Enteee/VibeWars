import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { afterEach, describe, expect, it } from "vitest";

import { releaseLock, takeLock } from "./instance-lock.mjs";

/** @type {(() => void)[]} */
const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

const BOOT = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
const MINE = `${String(process.pid)} ${BOOT}\n`;

function lockFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-test-"));
  cleanups.push(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return path.join(dir, "daemon.lock");
}

/**
 * A live process whose command line carries `marker`, as a daemon's
 * carries its script's name.
 *
 * @param {string} marker
 * @returns {number} its pid
 */
function running(marker) {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", marker]);
  cleanups.push(() => child.kill());
  const pid = child.pid ?? 0;
  // spawn() returns before the child has exec'd, and until then
  // /proc/<pid>/cmdline is still the forked parent's. Wait until the marker
  // shows, or a loaded runner makes takeLock see a holder that is not the
  // daemon (#4067).
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      if (fs.readFileSync(`/proc/${String(pid)}/cmdline`, "utf8").includes(marker)) {
        return pid;
      }
    } catch {
      /* not there yet */
    }
    if (Date.now() > deadline) {
      throw new Error(`pid ${String(pid)} never showed ${marker} in its command line`);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
}

describe("takeLock (#23)", () => {
  it("takes a free lock, recording its pid and this boot", () => {
    const lock = lockFile();
    expect(takeLock(lock, "daemon.mjs")).toBe(true);
    expect(fs.readFileSync(lock, "utf8")).toBe(MINE);
  });

  it("refuses a lock the same daemon holds, alive, in this boot", () => {
    const lock = lockFile();
    const holder = running("daemon.mjs");
    fs.writeFileSync(lock, `${String(holder)} ${BOOT}\n`);
    expect(takeLock(lock, "daemon.mjs")).toBe(false);
  });

  it("takes over a lock whose pid now belongs to another program", () => {
    // After a host reboot, the old pid can be anything at all.
    const lock = lockFile();
    const other = running("something-else.mjs");
    fs.writeFileSync(lock, `${String(other)} ${BOOT}\n`);
    expect(takeLock(lock, "daemon.mjs")).toBe(true);
    expect(fs.readFileSync(lock, "utf8")).toBe(MINE);
  });

  it("takes over a lock from another boot, whatever runs under its pid now", () => {
    const lock = lockFile();
    const holder = running("daemon.mjs");
    fs.writeFileSync(lock, `${String(holder)} 00000000-0000-0000-0000-000000000000\n`);
    expect(takeLock(lock, "daemon.mjs")).toBe(true);
  });

  it("takes over the lock of a holder that has died", () => {
    const lock = lockFile();
    const dead = spawnSync("sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(lock, `${dead} ${BOOT}\n`);
    expect(takeLock(lock, "daemon.mjs")).toBe(true);
  });

  it("releases only its own lock", () => {
    const lock = lockFile();
    fs.writeFileSync(lock, `1 ${BOOT}\n`);
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(true);
    fs.rmSync(lock);
    takeLock(lock, "daemon.mjs");
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(false);
  });
});
