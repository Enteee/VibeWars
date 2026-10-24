/**
 * The restarter, run for real against a scratch checkout and a local bare
 * remote. `devenv`, `tmux`, `pkill` and `pgrep` are stand-ins on PATH: the
 * real ones would build nix shells and kill processes this test does not own.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { obj } from "./protocol.mjs";

const RESTART = path.join(path.dirname(fileURLToPath(import.meta.url)), "restart.mjs");

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function sh(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/**
 * @param {string} message
 * @param {string} cwd
 * @returns {void}
 */
function commit(message, cwd) {
  sh(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message], cwd);
}

/**
 * An operator checkout booted at one commit, a remote whose main is one
 * company commit ahead of it, and a reboot handed over by the supervisor.
 *
 * @param {{ failBuild?: boolean }} [options]
 */
function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "restart-test-"));
  dirs.push(dir);
  const repo = path.join(dir, "repo");
  const remote = path.join(dir, "remote.git");
  const root = path.join(repo, ".bots");
  const bin = path.join(dir, "bin");
  const calls = path.join(dir, "calls.log");

  sh(["init", "--bare", "-q", "-b", "main", remote], dir);
  sh(["init", "-q", "-b", "main", repo], dir);
  fs.writeFileSync(path.join(repo, ".gitignore"), ".bots/\n");
  sh(["add", ".gitignore"], repo);
  commit("boot", repo);
  const boot = sh(["rev-parse", "HEAD"], repo);
  sh(["push", "-q", remote, "main"], repo);

  // The new main, made in a second clone so the checkout stays at boot.
  const other = path.join(dir, "other");
  sh(["clone", "-q", remote, other], dir);
  fs.mkdirSync(path.join(other, "scripts", "bots"), { recursive: true });
  fs.writeFileSync(path.join(other, "scripts", "bots", "new.mjs"), "x\n");
  sh(["add", "scripts"], other);
  commit("company: a new thing", other);
  sh(["push", "-q", "origin", "main"], other);
  const target = sh(["rev-parse", "HEAD"], other);

  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "company.json"), JSON.stringify({ repo: "o/r" }));
  fs.writeFileSync(
    path.join(root, "rebooting.json"),
    JSON.stringify({
      requestedAt: 1,
      reason: "load it",
      by: "manager",
      deadline: 2,
      bootSha: boot,
    }),
  );

  fs.mkdirSync(bin);
  const fake = (/** @type {string} */ name, /** @type {string} */ body) => {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  };
  fake(
    "devenv",
    `echo "devenv $PWD $* rebooted=$VIBEWARS_REBOOTED" >>${calls}\n${options.failBuild === true ? 'case "$*" in *--help*) exit 1 ;; esac' : ""}`,
  );
  fake("tmux", `echo "tmux $*" >>${calls}`);
  fake("pkill", `echo "pkill $*" >>${calls}`);
  fake("pgrep", "exit 1");

  /** @returns {{ code: number | null, boot: Record<string, unknown>, calls: string[] }} */
  const restart = () => {
    const result = spawnSync(process.execPath, [RESTART], {
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        DEVENV_ROOT: repo,
        VIBEWARS_BOT_ROOT: root,
        VIBEWARS_LLC_SESSION: "restart-test",
        VIBEWARS_GIT_REMOTE: remote,
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
      encoding: "utf8",
    });
    /** @type {unknown} */
    const boot = JSON.parse(fs.readFileSync(path.join(root, "boot.json"), "utf8"));
    return {
      code: result.status,
      boot: obj(boot),
      calls: fs.readFileSync(calls, "utf8").split("\n"),
    };
  };

  return { repo, root, boot, target, restart };
}

describe("the restarter", () => {
  it("stops the company, moves a clean main to the new main, and starts it", () => {
    const company = setup();

    const result = company.restart();

    expect(result.code).toBe(0);
    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.target);
    expect(result.calls).toContain("tmux kill-session -t restart-test");
    expect(result.calls).toContain("pkill -f hubd.mjs");
    expect(
      result.calls.some((c) => c.endsWith("reboot-check shell -- claude-llc --help rebooted=1")),
    ).toBe(true);
    expect(result.calls).toContain(`devenv ${company.repo} shell -- claude-llc up rebooted=1`);
    expect(result.boot).toMatchObject({
      sha: company.target,
      previousSha: company.boot,
      updated: true,
      note: `Rebooted onto ${company.target.slice(0, 8)}: company: a new thing.`,
    });
    expect(fs.existsSync(path.join(company.root, "rebooting.json"))).toBe(false);
    expect(fs.existsSync(path.join(company.root, "reboot-check"))).toBe(false);
  });

  it("never moves a checkout on another branch, and restarts on what it has", () => {
    const company = setup();
    sh(["checkout", "-q", "-b", "mine"], company.repo);

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(/did NOT update: checkout is on branch mine/);
    expect(result.calls).toContain(`devenv ${company.repo} shell -- claude-llc up rebooted=1`);
  });

  it("never moves a checkout with local changes", () => {
    const company = setup();
    fs.writeFileSync(path.join(company.repo, ".gitignore"), "changed\n");

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(/did NOT update: checkout has local changes/);
  });

  it("keeps the old code when the new main does not build", () => {
    const company = setup({ failBuild: true });

    const result = company.restart();

    expect(sh(["rev-parse", "HEAD"], company.repo)).toBe(company.boot);
    expect(String(result.boot.note)).toMatch(
      new RegExp(
        `onto ${company.target.slice(0, 8)} failed to build; running ${company.boot.slice(0, 8)}`,
      ),
    );
    expect(result.calls).toContain(`devenv ${company.repo} shell -- claude-llc up rebooted=1`);
  });
});
