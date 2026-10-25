import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { releaseLock, takeLock } from "./instance-lock.mjs";

/** @type {(() => void)[]} */
const cleanups = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function lockFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-test-"));
  cleanups.push(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return path.join(dir, "daemon.lock");
}

describe("takeLock (#23)", () => {
  it("takes a free lock, and refuses it while a live process holds it", () => {
    const lock = lockFile();
    const holder = spawn("sleep", ["30"]);
    cleanups.push(() => holder.kill());
    fs.writeFileSync(lock, `${String(holder.pid)}\n`);
    expect(takeLock(lock)).toBe(false);
    expect(fs.readFileSync(lock, "utf8")).toBe(`${String(holder.pid)}\n`);

    holder.kill();
    const free = lockFile();
    expect(takeLock(free)).toBe(true);
    expect(fs.readFileSync(free, "utf8")).toBe(`${String(process.pid)}\n`);
  });

  it("takes over the lock of a holder that has died", () => {
    const lock = lockFile();
    const dead = spawnSync("sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(lock, `${dead}\n`);
    expect(takeLock(lock)).toBe(true);
    expect(fs.readFileSync(lock, "utf8")).toBe(`${String(process.pid)}\n`);
  });

  it("releases only its own lock", () => {
    const lock = lockFile();
    fs.writeFileSync(lock, "1\n");
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(true);
    fs.rmSync(lock);
    takeLock(lock);
    releaseLock(lock);
    expect(fs.existsSync(lock)).toBe(false);
  });
});
