import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOCK_FILE,
  gitFacts,
  lockVerdict,
  parseLock,
  readLock,
  writeLock,
} from "./company-lock.mjs";

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);
/** @type {import("./company-lock.mjs").Lock} */
const LOCK = { schemaVersion: 1, sha: SHA, lockedAt: 1, by: "operator" };

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** @returns {string} */
function scratch() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "company-lock-"));
  dirs.push(dir);
  return dir;
}

describe("parseLock", () => {
  it("reads a lock", () => {
    expect(parseLock(JSON.stringify(LOCK))).toEqual(LOCK);
  });

  it.each([
    ["another schemaVersion", { ...LOCK, schemaVersion: 2 }],
    ["a short sha", { ...LOCK, sha: "abc1234" }],
    ["an unknown writer", { ...LOCK, by: "agent" }],
    ["an extra key", { ...LOCK, extra: 1 }],
    ["a missing key", { schemaVersion: 1, sha: SHA, by: "reboot" }],
  ])("rejects %s", (_name, value) => {
    expect(parseLock(JSON.stringify(value))).toBeNull();
  });

  it("rejects what is not JSON", () => {
    expect(parseLock("not json")).toBeNull();
  });
});

describe("lockVerdict", () => {
  const ok = { lock: LOCK, head: SHA, dirtyPaths: [], onMain: true, fetchError: null };

  it("lets a pinned, clean checkout on main start", () => {
    expect(lockVerdict(ok)).toEqual({ ok: true });
  });

  it("refuses without a lock, and with one it cannot read", () => {
    expect(lockVerdict({ ...ok, lock: "missing" })).toMatchObject({
      ok: false,
      message: "company.lock is missing: run 'claude-llc lock' to pin the checkout's HEAD",
    });
    expect(JSON.stringify(lockVerdict({ ...ok, lock: "unreadable" }))).toContain("unreadable");
  });

  it("refuses a HEAD that is not the lock, naming both", () => {
    const verdict = lockVerdict({ ...ok, head: OTHER });
    expect(verdict).toMatchObject({ ok: false });
    expect(JSON.stringify(verdict)).toContain("bbbbbbb is not the locked aaaaaaa");
  });

  it("refuses a dirty checkout, listing the first five paths", () => {
    const verdict = lockVerdict({
      ...ok,
      dirtyPaths: ["a", "b", "c", "d", "e", "f"],
    });
    expect(verdict).toEqual({
      ok: false,
      message: "the checkout has uncommitted changes: a, b, c, d, e",
    });
  });

  it("refuses when GitHub's main cannot be fetched, whatever else holds", () => {
    expect(lockVerdict({ ...ok, fetchError: "no route" })).toEqual({
      ok: false,
      message: "could not fetch GitHub main to check the lock: no route",
    });
  });

  it("refuses a lock that is not on main", () => {
    expect(lockVerdict({ ...ok, onMain: false })).toEqual({
      ok: false,
      message: "locked aaaaaaa is not on GitHub main",
    });
  });
});

describe("the lock file", () => {
  it("is written atomically and read back", () => {
    const root = scratch();
    expect(readLock(root)).toBe("missing");
    writeLock(root, SHA, "reboot", 5);
    expect(readLock(root)).toEqual({ schemaVersion: 1, sha: SHA, lockedAt: 5, by: "reboot" });
    expect(fs.existsSync(path.join(root, `${LOCK_FILE}.part`))).toBe(false);
  });

  it("is unreadable when it is not a lock", () => {
    const root = scratch();
    fs.writeFileSync(path.join(root, LOCK_FILE), "{}");
    expect(readLock(root)).toBe("unreadable");
  });
});

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {string}
 */
function git(args, cwd) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

describe("gitFacts, over throwaway repositories", () => {
  /** A checkout with `.bots/` ignored, and a bare remote it pushed main to. */
  function company() {
    const dir = scratch();
    const remote = path.join(dir, "remote.git");
    const repo = path.join(dir, "repo");
    const root = path.join(repo, ".bots");
    git(["init", "--bare", "-q", "-b", "main", remote], dir);
    git(["init", "-q", "-b", "main", repo], dir);
    fs.writeFileSync(path.join(repo, ".gitignore"), ".bots/\n");
    git(["add", ".gitignore"], repo);
    git(["commit", "-q", "-m", "boot"], repo);
    git(["push", "-q", remote, "main"], repo);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "company.json"), JSON.stringify({ repo: "o/r" }));
    process.env.VIBEWARS_GIT_REMOTE = remote;
    return { repo, root, remote, head: git(["rev-parse", "HEAD"], repo) };
  }
  afterEach(() => {
    delete process.env.VIBEWARS_GIT_REMOTE;
  });

  it("finds a pushed commit on main, and a clean tree", () => {
    const c = company();
    const facts = gitFacts({ repoDir: c.repo, root: c.root, sha: c.head });
    expect(facts).toEqual({ head: c.head, dirtyPaths: [], onMain: true, fetchError: null });
  });

  it("finds the checkout's own HEAD when asked for none", () => {
    const c = company();
    expect(gitFacts({ repoDir: c.repo, root: c.root, sha: null }).onMain).toBe(true);
  });

  it("finds a commit that was never pushed off main, and lists a dirty path", () => {
    const c = company();
    fs.writeFileSync(path.join(c.repo, "new.txt"), "x");
    git(["add", "new.txt"], c.repo);
    git(["commit", "-q", "-m", "local"], c.repo);
    fs.writeFileSync(path.join(c.repo, "stray.txt"), "x");
    const head = git(["rev-parse", "HEAD"], c.repo);
    const facts = gitFacts({ repoDir: c.repo, root: c.root, sha: head });
    expect(facts.onMain).toBe(false);
    expect(facts.dirtyPaths).toEqual(["stray.txt"]);
  });

  it("says why when GitHub cannot be reached", () => {
    const c = company();
    process.env.VIBEWARS_GIT_REMOTE = path.join(c.root, "nowhere.git");
    const facts = gitFacts({ repoDir: c.repo, root: c.root, sha: c.head });
    expect(facts.onMain).toBe(false);
    expect(facts.fetchError).not.toBeNull();
  });
});
