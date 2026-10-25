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

/** The repository's own ignore rules, so the tests prove its entries. */
const GITIGNORE = fs.readFileSync(new URL("../../.gitignore", import.meta.url), "utf8");

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
 * An operator checkout with one commit and the repository's `.gitignore`,
 * whose `.pre-commit-config.yaml` links into a fake store, as devenv's
 * git-hooks links it into `/nix/store`. The `/nix/store/` check is tested
 * through `ensureWorktree`'s `store` option, set to that fake store.
 */
function setup() {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "worktree-test-")));
  dirs.push(repo);
  const store = `${fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "worktree-store-")))}/`;
  dirs.push(store);
  const config = path.join(store, "abc-pre-commit-config.json");
  fs.writeFileSync(config, "{}\n");
  sh(["init", "-q", "-b", "main"], repo);
  fs.symlinkSync(config, path.join(repo, ".pre-commit-config.yaml"));
  fs.writeFileSync(path.join(repo, ".gitignore"), GITIGNORE);
  fs.writeFileSync(path.join(repo, "tracked.txt"), "main\n");
  sh(["add", "."], repo);
  commit("boot", repo);
  sh(["update-ref", "refs/remotes/origin/main", "HEAD"], repo);
  const worktree = path.join(repo, ".bots", "wt", "dev");
  return {
    repo,
    worktree,
    admin: path.join(repo, ".git", "worktrees", "dev"),
    store,
    config,
    linked: `linked ${path.join(worktree, ".pre-commit-config.yaml")}`,
  };
}

describe("ensureWorktree", () => {
  it("creates a missing worktree, detached at origin/main, then leaves it alone", () => {
    const { repo, worktree, store, linked } = setup();
    const main = sh(["rev-parse", "origin/main"], repo);
    expect(ensureWorktree(repo, "dev", { store })).toEqual([
      `created ${worktree} at ${main.slice(0, 7)}`,
      linked,
    ]);
    expect(sh(["rev-parse", "HEAD"], worktree)).toBe(main);
    expect(sh(["branch", "--show-current"], worktree)).toBe("");
    expect(ensureWorktree(repo, "dev", { store })).toEqual([]);
  });

  it("never checks out bot/<role>, which would block bot/<role>/<topic>", () => {
    const { repo, worktree, store } = setup();
    sh(["branch", "bot/dev"], repo);
    ensureWorktree(repo, "dev", { store });
    expect(sh(["branch", "--show-current"], worktree)).toBe("");
  });

  it("starts from main as fetched, not from a local origin/main someone moved", () => {
    const { repo, worktree, store, linked } = setup();
    const remote = path.join(repo, ".bots", "remote.git");
    sh(["init", "-q", "--bare", "-b", "main", remote], repo);
    sh(["push", "-q", remote, "HEAD:refs/heads/main"], repo);
    const github = sh(["rev-parse", "HEAD"], repo);
    // A jail can write refs: point origin/main at a commit of its choosing.
    fs.writeFileSync(path.join(repo, "planted.txt"), "x\n");
    sh(["add", "planted.txt"], repo);
    commit("planted", repo);
    sh(["update-ref", "refs/remotes/origin/main", "HEAD"], repo);

    expect(ensureWorktree(repo, "dev", { remote, store })).toEqual([
      `created ${worktree} at ${github.slice(0, 7)}`,
      linked,
    ]);
    expect(sh(["rev-parse", "HEAD"], worktree)).toBe(github);
  });

  it("falls back to the existing origin/main, saying so, when the fetch fails", () => {
    const { repo, worktree, store, linked } = setup();
    const main = sh(["rev-parse", "origin/main"], repo);
    const remote = path.join(repo, "no-such-remote.git");
    expect(ensureWorktree(repo, "dev", { remote, store })).toEqual([
      `could not fetch main from ${remote}; using the existing origin/main`,
      `created ${worktree} at ${main.slice(0, 7)}`,
      linked,
    ]);
  });

  it("refuses to start with no main at all", () => {
    const { repo, store } = setup();
    sh(["update-ref", "-d", "refs/remotes/origin/main"], repo);
    expect(() => ensureWorktree(repo, "dev", { store })).toThrow("no origin/main");
  });

  it("never runs a filter driver the shared config names, on checkout or on reset", () => {
    const { repo, worktree, admin, store } = setup();
    const ran = path.join(repo, "filter-ran");
    // The operator's config names a driver, and a tree an agent chose
    // selects it for every file.
    sh(["config", "filter.planted.smudge", `touch ${ran}; cat`], repo);
    sh(["config", "filter.planted.clean", `touch ${ran}; cat`], repo);
    fs.writeFileSync(path.join(repo, ".gitattributes"), "* filter=planted\n");
    sh(["-c", "filter.planted.clean=cat", "add", ".gitattributes"], repo);
    sh(
      [
        "-c",
        "filter.planted.clean=cat",
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "commit",
        "-q",
        "-m",
        "attrs",
      ],
      repo,
    );
    sh(["update-ref", "refs/remotes/origin/main", "HEAD"], repo);

    ensureWorktree(repo, "dev", { store });
    expect(fs.existsSync(path.join(worktree, "tracked.txt"))).toBe(true);
    fs.rmSync(admin, { recursive: true });
    ensureWorktree(repo, "dev", { store });
    expect(fs.existsSync(ran)).toBe(false);
  });

  it("re-adds a deleted worktree whose admin dir is still registered", () => {
    const { repo, worktree, store } = setup();
    ensureWorktree(repo, "dev", { store });
    fs.rmSync(worktree, { recursive: true });
    expect(ensureWorktree(repo, "dev", { store })[0]).toMatch(/^created /);
    expect(sh(["worktree", "list", "--porcelain"], repo)).toContain(`worktree ${worktree}\n`);
  });

  it("re-creates a pruned admin dir and keeps every uncommitted file", () => {
    const { repo, worktree, admin, store } = setup();
    ensureWorktree(repo, "dev", { store });
    sh(["switch", "-q", "-c", "bot/dev/issue-1"], worktree);
    fs.writeFileSync(path.join(worktree, "tracked.txt"), "edited\n");
    fs.writeFileSync(path.join(worktree, "new.txt"), "untracked\n");
    // What a `git worktree prune` in another jail did.
    fs.rmSync(admin, { recursive: true });

    expect(ensureWorktree(repo, "dev", { store })).toEqual([
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
    const { repo, worktree, admin, store } = setup();
    ensureWorktree(repo, "dev", { store });
    fs.writeFileSync(path.join(worktree, ".git"), "gitdir: /elsewhere\n");
    expect(ensureWorktree(repo, "dev", { store })).toEqual([
      `re-linked ${path.join(worktree, ".git")} to ${admin}`,
    ]);
    expect(sh(["rev-parse", "--absolute-git-dir"], worktree)).toBe(admin);
  });

  it("replaces a planted symlink instead of writing through it", () => {
    const { repo, worktree, admin, store } = setup();
    ensureWorktree(repo, "dev", { store });
    const victim = path.join(repo, "victim");
    fs.writeFileSync(victim, "untouched\n");
    fs.rmSync(path.join(admin, "gitdir"));
    fs.symlinkSync(victim, path.join(admin, "gitdir"));

    expect(ensureWorktree(repo, "dev", { store })).toEqual([
      `re-linked ${admin} to ${path.join(worktree, ".git")}`,
    ]);
    expect(fs.readFileSync(victim, "utf8")).toBe("untouched\n");
    expect(fs.lstatSync(path.join(admin, "gitdir")).isSymbolicLink()).toBe(false);
  });

  it("links the worktree's hook config to the store path the host's resolves to", () => {
    const { repo, worktree, store, config } = setup();
    ensureWorktree(repo, "dev", { store });
    const link = path.join(worktree, ".pre-commit-config.yaml");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe(config);
    // Ignored, by the repository's own .gitignore: the worktree stays clean.
    expect(sh(["status", "--porcelain"], worktree)).toBe("");
  });

  it("links the config it is given when the host's own copy is gone", () => {
    const { repo, worktree, store, config } = setup();
    fs.unlinkSync(path.join(repo, ".pre-commit-config.yaml"));
    ensureWorktree(repo, "dev", { store, hookConfig: config });
    expect(fs.readlinkSync(path.join(worktree, ".pre-commit-config.yaml"))).toBe(config);
  });

  it("leaves any existing hook config entry untouched, file or link", () => {
    const { repo, worktree, store } = setup();
    ensureWorktree(repo, "dev", { store });
    const link = path.join(worktree, ".pre-commit-config.yaml");

    // A planted file, unreadable, so reading it would fail the run.
    fs.rmSync(link);
    fs.writeFileSync(link, "planted\n");
    fs.chmodSync(link, 0o000);
    expect(ensureWorktree(repo, "dev", { store })).toEqual([]);
    expect(fs.lstatSync(link).isFile()).toBe(true);
    fs.chmodSync(link, 0o600);
    expect(fs.readFileSync(link, "utf8")).toBe("planted\n");

    // A link to another store path: what an old branch tracks.
    const old = path.join(store, "old-pre-commit-config.json");
    fs.rmSync(link);
    fs.symlinkSync(old, link);
    expect(ensureWorktree(repo, "dev", { store })).toEqual([]);
    expect(fs.readlinkSync(link)).toBe(old);

    // A link out of the store, at a file the host must not touch.
    const victim = path.join(repo, "victim");
    fs.writeFileSync(victim, "untouched\n");
    fs.rmSync(link);
    fs.symlinkSync(victim, link);
    expect(ensureWorktree(repo, "dev", { store })).toEqual([]);
    expect(fs.readlinkSync(link)).toBe(victim);
    expect(fs.readFileSync(victim, "utf8")).toBe("untouched\n");
  });

  it("keeps an old branch's tracked hook config clean, so checking out main works", () => {
    const { repo, worktree, store } = setup();
    // An old branch: the config tracked, as a link to an older store path.
    const old = path.join(store, "old-pre-commit-config.json");
    sh(["switch", "-q", "-c", "old"], repo);
    fs.rmSync(path.join(repo, ".pre-commit-config.yaml"));
    fs.symlinkSync(old, path.join(repo, ".pre-commit-config.yaml"));
    sh(["add", "-f", ".pre-commit-config.yaml"], repo);
    commit("tracked hook config", repo);
    sh(["switch", "-q", "main"], repo);
    fs.rmSync(path.join(repo, ".pre-commit-config.yaml"), { force: true });
    fs.symlinkSync(
      path.join(store, "abc-pre-commit-config.json"),
      path.join(repo, ".pre-commit-config.yaml"),
    );
    ensureWorktree(repo, "dev", { store });
    sh(["checkout", "-q", "old"], worktree);

    expect(ensureWorktree(repo, "dev", { store })).toEqual([]);
    expect(sh(["status", "--porcelain"], worktree)).toBe("");
    sh(["checkout", "-q", "--detach", "main"], worktree);
    expect(
      fs.lstatSync(path.join(worktree, ".pre-commit-config.yaml"), { throwIfNoEntry: false }),
    ).toBeUndefined();
  });

  it("says so, and links nothing, when the host's hook config is not in the store", () => {
    const { repo, worktree, store } = setup();
    fs.rmSync(path.join(repo, ".pre-commit-config.yaml"));
    const main = sh(["rev-parse", "origin/main"], repo);
    expect(ensureWorktree(repo, "dev", { store })).toEqual([
      `created ${worktree} at ${main.slice(0, 7)}`,
      `no ${path.join(repo, ".pre-commit-config.yaml")} in ${store} (has devenv shell run?); git hooks will not run in ${worktree}`,
    ]);
    expect(
      fs.lstatSync(path.join(worktree, ".pre-commit-config.yaml"), { throwIfNoEntry: false }),
    ).toBeUndefined();

    // A config outside the store is refused the same way.
    fs.writeFileSync(path.join(repo, ".pre-commit-config.yaml"), "{}\n");
    expect(ensureWorktree(repo, "dev", { store })).toHaveLength(1);
    expect(
      fs.lstatSync(path.join(worktree, ".pre-commit-config.yaml"), { throwIfNoEntry: false }),
    ).toBeUndefined();
  });

  it("refuses a role name that could leave .git/worktrees", () => {
    const { repo, store } = setup();
    expect(() => ensureWorktree(repo, "../x", { store })).toThrow("not a role name");
  });
});
