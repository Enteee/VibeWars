/**
 * The boot check, run for real against a scratch checkout, a scratch "store
 * copy" and a boot record, as claude-llc runs it.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { obj } from "./protocol.mjs";

const CHECK = path.join(path.dirname(fileURLToPath(import.meta.url)), "boot-check.mjs");
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A checkout and a running copy holding the same scripts, and a boot record
 * a reboot onto `SHA` wrote.
 */
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "boot-check-test-"));
  dirs.push(dir);
  const repo = path.join(dir, "repo");
  const bots = path.join(repo, "scripts", "bots");
  const root = path.join(repo, ".bots");
  const running = path.join(dir, "store-scripts");
  for (const d of [bots, root, running]) {
    fs.mkdirSync(d, { recursive: true });
  }
  for (const d of [bots, running]) {
    fs.writeFileSync(path.join(d, "hubd.mjs"), "same\n");
  }
  fs.writeFileSync(
    path.join(root, "boot.json"),
    `${JSON.stringify({ sha: SHA, at: 1, previousSha: "f".repeat(40), updated: true, note: "Rebooted onto 01234567: company: a new thing." })}\n`,
  );

  /** @returns {{ code: number | null, stderr: string, boot: Record<string, unknown> }} */
  const check = () => {
    const result = spawnSync(process.execPath, [CHECK, running], {
      env: { ...process.env, DEVENV_ROOT: repo, VIBEWARS_BOT_ROOT: root },
      encoding: "utf8",
    });
    /** @type {unknown} */
    const boot = JSON.parse(fs.readFileSync(path.join(root, "boot.json"), "utf8"));
    return { code: result.status, stderr: result.stderr, boot: obj(boot) };
  };

  return { bots, running, check };
}

describe("the boot check", () => {
  it("leaves the boot record alone when the company runs the checkout's scripts", () => {
    const company = setup();
    // A test that differs is not a script the company runs.
    fs.writeFileSync(path.join(company.bots, "hubd.test.mjs"), "new test\n");

    const result = company.check();

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.boot).toMatchObject({
      updated: true,
      note: "Rebooted onto 01234567: company: a new thing.",
    });
  });

  it("says loudly, in the note and on stderr, that a stale copy is running", () => {
    const company = setup();
    fs.writeFileSync(path.join(company.bots, "hub-spend.mjs"), "new\n");

    const result = company.check();

    expect(result.code).toBe(0);
    expect(result.boot).toMatchObject({ sha: SHA, updated: false });
    expect(String(result.boot.note)).toMatch(
      /^Rebooted, but its company code did NOT load\. WARNING: .*hub-spend\.mjs differs/,
    );
    expect(String(result.boot.note)).toContain(company.running);
    expect(result.stderr).toContain(String(result.boot.note));
  });
});
