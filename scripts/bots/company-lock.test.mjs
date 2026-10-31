import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LOCK_FILE,
  driftWarning,
  gitFacts,
  lockVerdict,
  lockedTree,
  pinVerdict,
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
  const ok = { lock: LOCK, tampered: [], onMain: true, fetchError: null };

  it("lets a lock on main start, whatever the checkout holds", () => {
    expect(lockVerdict(ok)).toEqual({ ok: true });
  });

  it("refuses a locked tree whose files are not the merged commit's", () => {
    const verdict = lockVerdict({ ...ok, tampered: ["s/f"] });
    expect(verdict).toMatchObject({ ok: false });
    expect(JSON.stringify(verdict)).toContain("s/f");
  });

  it("refuses without a lock, and with one it cannot read", () => {
    expect(lockVerdict({ ...ok, lock: "missing" })).toMatchObject({
      ok: false,
      message: "company.lock is missing: run 'claude-llc lock' to pin the checkout's HEAD",
    });
    expect(JSON.stringify(lockVerdict({ ...ok, lock: "unreadable" }))).toContain("unreadable");
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

describe("driftWarning", () => {
  it("says nothing for a checkout on the lock", () => {
    expect(driftWarning({ head: SHA, sha: SHA, ahead: 0, behind: 0 })).toBeNull();
  });

  it.each([
    [63, 0, "is 63 commits ahead of the locked aaaaaaa"],
    [0, 1, "is 1 commit behind the locked aaaaaaa"],
    [2, 3, "has diverged from the locked aaaaaaa (2 commits ahead, 3 commits behind)"],
    [null, null, "is not the locked aaaaaaa"],
  ])("warns a checkout %s ahead and %s behind that it %s", (ahead, behind, where) => {
    expect(driftWarning({ head: OTHER, sha: SHA, ahead, behind })).toBe(
      `warning: checkout HEAD bbbbbbb ${where}; the company runs aaaaaaa. 'claude-llc lock' to move it`,
    );
  });
});

describe("pinVerdict", () => {
  const ok = { head: SHA, dirtyPaths: [], tampered: [], onMain: true, fetchError: null };

  it("pins a clean checkout on main", () => {
    expect(pinVerdict(ok)).toEqual({ ok: true });
  });

  it("refuses a dirty checkout, listing the first five paths", () => {
    expect(pinVerdict({ ...ok, dirtyPaths: ["a", "b", "c", "d", "e", "f"] })).toEqual({
      ok: false,
      message: "the checkout has uncommitted changes: a, b, c, d, e",
    });
  });

  it("refuses a HEAD that is not on main, or whose files are not the mirror's", () => {
    expect(pinVerdict({ ...ok, onMain: false })).toEqual({
      ok: false,
      message: "checkout HEAD aaaaaaa is not on GitHub main",
    });
    expect(JSON.stringify(pinVerdict({ ...ok, tampered: ["s/f"] }))).toContain("s/f");
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
    const facts = gitFacts({ repoDir: c.repo, root: c.root });
    expect(facts).toEqual({
      head: c.head,
      dirtyPaths: [],
      tampered: [],
      onMain: true,
      fetchError: null,
    });
  });

  it("finds a commit that was never pushed off main, and lists a dirty path", () => {
    const c = company();
    fs.writeFileSync(path.join(c.repo, "new.txt"), "x");
    git(["add", "new.txt"], c.repo);
    git(["commit", "-q", "-m", "local"], c.repo);
    fs.writeFileSync(path.join(c.repo, "stray.txt"), "x");
    const facts = gitFacts({ repoDir: c.repo, root: c.root });
    expect(facts.onMain).toBe(false);
    expect(facts.dirtyPaths).toEqual(["stray.txt"]);
  });

  it("says why when GitHub cannot be reached", () => {
    const c = company();
    process.env.VIBEWARS_GIT_REMOTE = path.join(c.root, "nowhere.git");
    const facts = gitFacts({ repoDir: c.repo, root: c.root });
    expect(facts.onMain).toBe(false);
    expect(facts.fetchError).not.toBeNull();
  });
});

describe("lockedTree, over throwaway repositories", () => {
  /** A remote with two commits on main, its mirror fetched, and a bot root. */
  function company() {
    const dir = scratch();
    const remote = path.join(dir, "remote.git");
    const work = path.join(dir, "work");
    const repo = path.join(dir, "repo");
    const root = path.join(repo, ".bots");
    const mirror = path.join(root, "hub", ".git-mirror");
    git(["init", "--bare", "-q", "-b", "main", remote], dir);
    git(["init", "-q", "-b", "main", work], dir);
    fs.writeFileSync(path.join(work, ".gitignore"), ".devenv*\ndevenv.local.nix\n");
    fs.mkdirSync(path.join(work, "s"));
    fs.writeFileSync(path.join(work, "s", "f"), "locked\n");
    git(["add", "-A"], work);
    git(["commit", "-q", "-m", "locked"], work);
    const sha = git(["rev-parse", "HEAD"], work);
    fs.writeFileSync(path.join(work, "s", "f"), "later\n");
    git(["commit", "-q", "-am", "later"], work);
    git(["push", "-q", remote, "main"], work);
    fs.mkdirSync(path.dirname(mirror), { recursive: true });
    git(["clone", "-q", "--bare", remote, mirror], dir);
    return { repo, root, mirror, sha, work };
  }

  it("writes the lock's files from the mirror while the checkout sits on a later commit", () => {
    const c = company();
    const tree = lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    expect(tree).toEqual({ dir: path.join(c.root, "company", c.sha), tampered: [] });
    expect(fs.readFileSync(path.join(tree.dir, "s", "f"), "utf8")).toBe("locked\n");
    expect(fs.readFileSync(path.join(c.work, "s", "f"), "utf8")).toBe("later\n");
    // Its own repository, the files staged, for devenv and nix.
    expect(git(["ls-files"], tree.dir).split("\n")).toEqual([".gitignore", "s/f"]);
  });

  it("keeps a tree that matches, ignored files and all", () => {
    const c = company();
    const { dir } = lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    fs.writeFileSync(path.join(dir, ".devenv.flake.nix"), "cache");
    expect(
      lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo }).tampered,
    ).toEqual([]);
    expect(fs.existsSync(path.join(dir, ".devenv.flake.nix"))).toBe(true);
  });

  it("writes a tampered tree again, without what was planted in it", () => {
    const c = company();
    const { dir } = lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    fs.writeFileSync(path.join(dir, "s", "f"), "forged\n");
    fs.writeFileSync(path.join(dir, "s", "planted.mjs"), "x");
    expect(
      lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo }).tampered,
    ).toEqual([]);
    expect(fs.readFileSync(path.join(dir, "s", "f"), "utf8")).toBe("locked\n");
    expect(fs.existsSync(path.join(dir, "s", "planted.mjs"))).toBe(false);
  });

  it("brings the checkout's devenv.local.nix along, and drops it when the checkout has none", () => {
    const c = company();
    fs.writeFileSync(path.join(c.repo, "devenv.local.nix"), "{ }\n");
    const { dir } = lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    expect(fs.readFileSync(path.join(dir, "devenv.local.nix"), "utf8")).toBe("{ }\n");
    fs.rmSync(path.join(c.repo, "devenv.local.nix"));
    lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    expect(fs.existsSync(path.join(dir, "devenv.local.nix"))).toBe(false);
  });

  it("deletes every other sha's tree", () => {
    const c = company();
    const old = path.join(c.root, "company", OTHER);
    fs.mkdirSync(old, { recursive: true });
    lockedTree({ root: c.root, mirror: c.mirror, sha: c.sha, repoDir: c.repo });
    expect(fs.readdirSync(path.join(c.root, "company"))).toEqual([c.sha]);
  });

  it("says so when the mirror lacks the sha", () => {
    const c = company();
    expect(
      lockedTree({ root: c.root, mirror: c.mirror, sha: SHA, repoDir: c.repo }).tampered,
    ).toEqual(["(cannot write aaaaaaa from the mirror)"]);
  });
});
