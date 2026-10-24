/**
 * `hub` itself, against a stub daemon: a test that answers the spool the way
 * hubd does, so what is under test is only what `hub` does with the answer.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const HUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "hub.mjs");

/** More than the 1 MiB that both Node's pipe writes and spawnSync cut off at. */
const BIG = 3 * 1024 * 1024;

/** @type {(() => void)[]} */
const cleanups = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

/**
 * A spool with a live heartbeat, and a stub daemon answering every request
 * on it with `answer`.
 *
 * @param {{ code: number, stdout: string }} answer
 * @returns {string} the spool, for VIBEWARS_HUB
 */
function stubHubd(answer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-test-"));
  const spool = path.join(dir, "developer-1");
  const req = path.join(spool, "req");
  const res = path.join(spool, "res");
  fs.mkdirSync(req, { recursive: true });
  fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(path.join(dir, "hubd.alive"), JSON.stringify({ ts: Date.now(), inFlight: 0 }));

  const timer = setInterval(() => {
    for (const name of fs.readdirSync(req).filter((n) => n.endsWith(".json"))) {
      fs.rmSync(path.join(req, name));
      const tmp = path.join(res, `.${name}.part`);
      fs.writeFileSync(tmp, JSON.stringify({ allow: true, stderr: "", ...answer }));
      fs.renameSync(tmp, path.join(res, name));
    }
  }, 20);
  cleanups.push(() => {
    clearInterval(timer);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return spool;
}

/**
 * Run hub with its stdout on a pipe, as `hub ... | something` has it.
 *
 * @param {string} spool
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stdout: string }>}
 */
function hub(spool, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HUB, ...args], {
      env: { PATH: process.env.PATH ?? "", VIBEWARS_BOT_ROLE: "developer-1", VIBEWARS_HUB: spool },
      stdio: ["ignore", "pipe", "inherit"],
    });
    /** @type {Buffer[]} */
    const chunks = [];
    child.stdout.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    child.on("close", (code) => {
      resolve({ code, stdout: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

/**
 * Run hub with a reader that takes one chunk and then closes the pipe, as
 * `hub ... | head -1` does.
 *
 * @param {string} spool
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stderr: string }>}
 */
function hubIntoHead(spool, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HUB, ...args], {
      env: { PATH: process.env.PATH ?? "", VIBEWARS_BOT_ROLE: "developer-1", VIBEWARS_HUB: spool },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (/** @type {Buffer} */ chunk) => (stderr += chunk.toString()));
    child.stdout.once("data", () => child.stdout.destroy());
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });
}

/** @returns {string} a JSON array of issues, BIG bytes or more */
function bigJson() {
  const issues = [];
  for (let n = 0, size = 0; size < BIG; n += 1) {
    const issue = { number: n, title: `issue number ${String(n)} with a longish title` };
    issues.push(issue);
    size += JSON.stringify(issue).length + 1;
  }
  return `${JSON.stringify(issues)}\n`;
}

describe("hub writing a large answer to a pipe", () => {
  it("writes all of it, byte for byte", async () => {
    const stdout = bigJson();
    const spool = stubHubd({ code: 0, stdout });

    const result = await hub(spool, ["issue", "list", "--json", "number,title"]);

    expect(result.code).toBe(0);
    expect(result.stdout.length).toBe(stdout.length);
    expect(result.stdout === stdout).toBe(true);
  }, 30_000);

  it("writes all of jq's output too, past spawnSync's default buffer", async () => {
    const stdout = bigJson();
    const spool = stubHubd({ code: 0, stdout });
    const expected = spawnSync("jq", ["-r", "."], {
      input: stdout,
      encoding: "utf8",
      maxBuffer: 4 * BIG,
    }).stdout;

    const result = await hub(spool, ["issue", "list", "--json", "number,title", "--jq", "."]);

    expect(result.code).toBe(0);
    expect(result.stdout.length).toBe(expected.length);
    expect(result.stdout === expected).toBe(true);
  }, 30_000);

  it("stops quietly, with the daemon's code, when the reader closes early", async () => {
    const spool = stubHubd({ code: 0, stdout: bigJson() });

    const result = await hubIntoHead(spool, ["issue", "list", "--json", "number,title"]);

    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
  }, 30_000);

  it("still exits with the daemon's code", async () => {
    const stdout = bigJson();
    const spool = stubHubd({ code: 3, stdout });

    const result = await hub(spool, ["issue", "list", "--json", "number,title"]);

    expect(result.code).toBe(3);
    expect(result.stdout === stdout).toBe(true);
  }, 30_000);
});

describe("hub whoami", () => {
  /**
   * @param {string} role
   * @returns {string}
   */
  const whoami = (role) =>
    spawnSync(process.execPath, [HUB, "whoami"], {
      env: { PATH: process.env.PATH ?? "", VIBEWARS_BOT_ROLE: role, VIBEWARS_HUB: "/nonexistent" },
      encoding: "utf8",
    }).stdout;

  it("says only the manager may close and reopen", () => {
    expect(whoami("manager")).toContain("yes  close and reopen issues and pull requests");
    expect(whoami("lead-dev")).toContain("no   close and reopen issues and pull requests");
  });
});
