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
 * @param {unknown[]} [seen] where to keep every request it answered
 * @param {Record<string, unknown>} [alive] fields of the heartbeat to override
 * @returns {string} the spool, for VIBEWARS_HUB
 */
function stubHubd(answer, seen = [], alive = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-test-"));
  const spool = path.join(dir, "developer");
  const req = path.join(spool, "req");
  const res = path.join(spool, "res");
  fs.mkdirSync(req, { recursive: true });
  fs.mkdirSync(res, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "hubd.alive"),
    JSON.stringify({
      pid: 1,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
      sha: null,
      inflight: 0,
      current: null,
      served: 0,
      refused: 0,
      lastError: null,
      ...alive,
    }),
  );

  const timer = setInterval(() => {
    for (const name of fs.readdirSync(req).filter((n) => n.endsWith(".json"))) {
      seen.push(JSON.parse(fs.readFileSync(path.join(req, name), "utf8")));
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
      env: {
        PATH: process.env.PATH ?? "",
        VIBEWARS_BOT_EMPLOYEE: "developer",
        VIBEWARS_BOT_ROLE: "developer",
        VIBEWARS_HUB: spool,
      },
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
      env: {
        PATH: process.env.PATH ?? "",
        VIBEWARS_BOT_EMPLOYEE: "developer",
        VIBEWARS_BOT_ROLE: "developer",
        VIBEWARS_HUB: spool,
      },
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

/**
 * @param {string} spool
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stderr: string }>}
 */
function hubStderr(spool, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HUB, ...args], {
      env: {
        PATH: process.env.PATH ?? "",
        VIBEWARS_BOT_EMPLOYEE: "developer",
        VIBEWARS_BOT_ROLE: "developer",
        VIBEWARS_HUB: spool,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (/** @type {Buffer} */ chunk) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });
}

describe("hub and a busy daemon (#496)", () => {
  it("says hubd is busy when the heartbeat is fresh and a request has run over 10 s", async () => {
    const current = {
      employee: "developer@2",
      command: "gh pr checks",
      startedAt: Date.now() - 15_000,
    };
    const spool = stubHubd({ code: 0, stdout: "ok" }, [], { inflight: 1, current });

    const result = await hubStderr(spool, ["issue", "list"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(
      /hubd is busy with developer@2's `gh pr checks` for 1\d s; queued/,
    );
    expect(result.stderr).not.toContain("not answering");
  });

  it("shows nothing but visible characters of the heartbeat", async () => {
    const current = {
      employee: "developer@2",
      command: "gh \u001b[2J\u202eevil",
      startedAt: Date.now() - 15_000,
    };
    const spool = stubHubd({ code: 0, stdout: "ok" }, [], { inflight: 1, current });

    const result = await hubStderr(spool, ["issue", "list"]);

    expect(result.stderr).not.toContain("\u001b");
    expect(result.stderr).not.toContain("\u202e");
    expect(result.stderr).toContain("busy with developer@2");
  });

  it("stays quiet for a request under 10 s, and says not answering for a stale heartbeat", async () => {
    const recent = {
      employee: "developer@2",
      command: "gh pr checks",
      startedAt: Date.now() - 2000,
    };
    const quiet = await hubStderr(stubHubd({ code: 0, stdout: "ok" }, [], { current: recent }), [
      "issue",
      "list",
    ]);
    expect(quiet.stderr).not.toContain("busy");

    const stale = await hubStderr(
      stubHubd({ code: 0, stdout: "ok" }, [], { heartbeatAt: Date.now() - 120_000 }),
      ["issue", "list"],
    );
    expect(stale.code).toBe(75);
    expect(stale.stderr).toContain("not answering");
  });
});

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
   * @param {string} [employee] the role's bare seat unless named
   * @returns {string}
   */
  const whoami = (role, employee = role) =>
    spawnSync(process.execPath, [HUB, "whoami"], {
      env: {
        PATH: process.env.PATH ?? "",
        VIBEWARS_BOT_EMPLOYEE: employee,
        VIBEWARS_BOT_ROLE: role,
        VIBEWARS_HUB: "/nonexistent",
      },
      encoding: "utf8",
    }).stdout;

  it("names the employee and its role, and pushes under the employee (#62)", () => {
    const said = whoami("qa-tester", "qa-tester@2");
    expect(said.startsWith("employee: qa-tester@2\nrole: qa-tester\n")).toBe(true);
    expect(whoami("developer", "developer@2")).toContain("yes  push branches (bot/developer@2/*)");
  });

  it("says only the manager may close and reopen", () => {
    expect(whoami("manager")).toContain("yes  close and reopen issues and pull requests");
    expect(whoami("lead-dev")).toContain("no   close and reopen issues and pull requests");
  });

  it("says every role may read code-scanning alerts (#184)", () => {
    expect(whoami("developer")).toContain("yes  read code-scanning alerts");
    expect(whoami("asset-designer")).toContain("yes  read code-scanning alerts");
  });
});

describe("hub alerts (#184)", () => {
  it("sends the alerts verb, not a gh command", async () => {
    /** @type {unknown[]} */
    const seen = [];
    const spool = stubHubd({ code: 0, stdout: "no open code-scanning alerts\n" }, seen);

    const { code } = await hub(spool, ["alerts", "--pr", "3"]);

    expect(code).toBe(0);
    expect(seen).toEqual([expect.objectContaining({ kind: "alerts", argv: ["--pr", "3"] })]);
  });
});
