/**
 * The host-side worktree repair (#69), run for real against scratch
 * repositories.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ensureWorktree } from "./worktree.mjs";

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

/** An operator checkout with one commit and `.bots/` ignored. */
function setup() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "worktree-test-")));
  dirs.push(repo);
  sh(["init", "-q", "-b", "main"], repo);
  fs.writeFileSync(path.join(repo, ".gitignore"), ".bots/\n");
  fs.writeFileSync(path.join(repo, "tracked.txt"), "main\n");
  sh(["add", "."], repo);
  commit("boot", repo);
  sh(["update-ref", "refs/remotes/origin/main", "HEAD"], repo);
  return {
    repo,
    worktree: path.join(repo, ".bots", "wt", "dev"),
    admin: path.join(repo, ".git", "worktrees", "dev"),
  };
}

describe("ensureWorktree", () => {
  it("creates a missing worktree, detached at origin/main, then leaves it alone", () => {
    const { repo, worktree } = setup();
    expect(ensureWorktree(repo, "dev")).toEqual([`created ${worktree}`]);
    expect(sh(["rev-parse", "HEAD"], worktree)).toBe(sh(["rev-parse", "origin/main"], repo));
    expect(sh(["branch", "--show-current"], worktree)).toBe("");
    expect(ensureWorktree(repo, "dev")).toEqual([]);
  });

  it("creates it on bot/<role> when that branch exists", () => {
    const { repo, worktree } = setup();
    sh(["branch", "bot/dev"], repo);
    ensureWorktree(repo, "dev");
    expect(sh(["branch", "--show-current"], worktree)).toBe("bot/dev");
  });

  it("re-adds a deleted worktree whose admin dir is still registered", () => {
    const { repo, worktree } = setup();
    ensureWorktree(repo, "dev");
    fs.rmSync(worktree, { recursive: true });
    expect(ensureWorktree(repo, "dev")).toEqual([`created ${worktree}`]);
    expect(sh(["worktree", "list", "--porcelain"], repo)).toContain(`worktree ${worktree}\n`);
  });

  it("re-creates a pruned admin dir and keeps every uncommitted file", () => {
    const { repo, worktree, admin } = setup();
    ensureWorktree(repo, "dev");
    sh(["switch", "-q", "-c", "bot/dev/issue-1"], worktree);
    fs.writeFileSync(path.join(worktree, "tracked.txt"), "edited\n");
    fs.writeFileSync(path.join(worktree, "new.txt"), "untracked\n");
    // What a `git worktree prune` in another jail did.
    fs.rmSync(admin, { recursive: true });

    expect(ensureWorktree(repo, "dev")).toEqual([
      `re-created the admin dir of ${worktree}, HEAD bot/dev/issue-1`,
    ]);
    expect(sh(["branch", "--show-current"], worktree)).toBe("bot/dev/issue-1");
    // Unstaged, not staged: the index is HEAD's again. (sh trims the leading space.)
    expect(sh(["status", "--porcelain"], worktree)).toBe("M tracked.txt\n?? new.txt");
    expect(sh(["diff", "--cached", "--name-only"], worktree)).toBe("");
    expect(fs.readFileSync(path.join(worktree, "tracked.txt"), "utf8")).toBe("edited\n");
    expect(sh(["worktree", "list", "--porcelain"], repo)).toContain(`worktree ${worktree}\n`);
  });

  it("re-links a .git file that points elsewhere", () => {
    const { repo, worktree, admin } = setup();
    ensureWorktree(repo, "dev");
    fs.writeFileSync(path.join(worktree, ".git"), "gitdir: /elsewhere\n");
    expect(ensureWorktree(repo, "dev")).toEqual([
      `re-linked ${path.join(worktree, ".git")} to ${admin}`,
    ]);
    expect(sh(["rev-parse", "--absolute-git-dir"], worktree)).toBe(admin);
  });

  it("replaces a planted symlink instead of writing through it", () => {
    const { repo, worktree, admin } = setup();
    ensureWorktree(repo, "dev");
    const victim = path.join(repo, "victim");
    fs.writeFileSync(victim, "untouched\n");
    fs.rmSync(path.join(admin, "gitdir"));
    fs.symlinkSync(victim, path.join(admin, "gitdir"));

    expect(ensureWorktree(repo, "dev")).toEqual([
      `re-linked ${admin} to ${path.join(worktree, ".git")}`,
    ]);
    expect(fs.readFileSync(victim, "utf8")).toBe("untouched\n");
    expect(fs.lstatSync(path.join(admin, "gitdir")).isSymbolicLink()).toBe(false);
  });

  it("refuses a role name that could leave .git/worktrees", () => {
    const { repo } = setup();
    expect(() => ensureWorktree(repo, "../x")).toThrow("not a role name");
  });
});
