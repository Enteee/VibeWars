/**
 * One running copy per daemon: what keeps two hubds from carrying out every
 * request twice (issue #23).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { takeLock } from "./lock.mjs";

const LOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), "lock.mjs");

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} a lock path in a fresh directory */
function lockFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-test-"));
  dirs.push(dir);
  return path.join(dir, "daemon.lock");
}

/**
 * Whether another process can take the lock while this one holds it.
 *
 * @param {string} lock
 * @returns {Promise<boolean>}
 */
function otherProcessTakes(lock) {
  const script = `import { takeLock } from ${JSON.stringify(LOCK)}; process.exit(takeLock(${JSON.stringify(lock)}) ? 0 : 3);`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: "ignore",
    });
    child.on("exit", (code) => {
      resolve(code === 0);
    });
  });
}

describe("takeLock", () => {
  it("lets one process hold it, and refuses a second", async () => {
    const lock = lockFile();
    expect(takeLock(lock)).toBe(true);
    expect(fs.readFileSync(lock, "utf8")).toBe(`${String(process.pid)}\n`);
    expect(await otherProcessTakes(lock)).toBe(false);
  });

  it("takes over a lock whose holder has died", async () => {
    const lock = lockFile();
    // A pid that cannot be running: far above any pid_max.
    fs.writeFileSync(lock, "999999999\n");
    expect(await otherProcessTakes(lock)).toBe(true);
  });
});
