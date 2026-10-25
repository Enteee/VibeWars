#!/usr/bin/env node
/**
 * `worktree.mjs <repo> <employee>` — make sure an employee's worktree is
 * attached before its jail starts (#69). An employee is a role's bare name
 * or `<role>@<n>` (#62); each has its own worktree and branch prefix.
 *
 * A jail sees the shared `.git` but only its own worktree, and git cannot
 * tell "invisible" from "deleted": one `git worktree prune` in a jail once
 * removed the admin dir of every other agent's worktree. So the jail gets
 * `.git/worktrees` read-only, except its own `.git/worktrees/<employee>`, and
 * creating or repairing a worktree is the host's job, done here by
 * claude-bot before it starts bwrap:
 *
 *   - no worktree: `git worktree add` it, detached at GitHub's main, fetched
 *     by URL first. Never on `bot/<employee>`: agents work on
 *     `bot/<employee>/<topic>`, and while any of those exist git cannot create
 *     a branch named `bot/<employee>` (#71, #72);
 *   - a worktree whose admin dir is gone: recreate `gitdir`, `commondir` and
 *     `HEAD`, then rebuild the index with a mixed `git reset`. Never
 *     `--hard`: the agent's uncommitted files are the point of keeping the
 *     directory, and they come back as unstaged changes;
 *   - a worktree whose `.git` file and admin dir do not point at each other:
 *     rewrite both links, which is what `git worktree repair` does;
 *   - a worktree with no `.pre-commit-config.yaml`: link it to the host's.
 *     devenv generates it on the host, it is not tracked (#283), and the
 *     shared pre-commit hook reads it from whichever worktree commits. Jails
 *     cannot run devenv, so without the link every agent commit fails in the
 *     hook.
 *
 * Everything under `.bots/wt/<employee>` and `.git/worktrees/<employee>` is the
 * agent's to write, so nothing is read from there: the admin dir is derived
 * from the employee id, every link is written fresh rather than through
 * whatever is at its path (a planted symlink would otherwise aim a host
 * write anywhere), and git runs hardened (git-hardening.mjs), including
 * against the filter drivers the shared config names: both the checkout
 * and the reset run on a tree an agent may have chosen.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { FILTER_KEYS, GIT_ENV, GIT_HARDENING, filterPins } from "./git-hardening.mjs";
import { obj } from "./protocol.mjs";
import { roleOf } from "./staff.mjs";

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function run(cwd, args) {
  const result = spawnSync("git", [...GIT_HARDENING, "-C", cwd, ...args], {
    env: { ...process.env, ...GIT_ENV },
    encoding: "utf8",
  });
  return {
    code: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string} stdout
 */
function git(cwd, args) {
  const result = run(cwd, args);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/**
 * Writes `file` as a new regular file. Whatever was at its path goes first,
 * so a symlink there is replaced, never followed.
 *
 * @param {string} file
 * @param {string} content
 * @returns {void}
 */
function writeFresh(file, content) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat?.isDirectory() === true) {
    throw new Error(`${file} is a directory`);
  }
  if (stat !== undefined) {
    fs.unlinkSync(file);
  }
  fs.writeFileSync(file, content, { flag: "wx" });
}

/**
 * @param {string} file
 * @returns {string | null} its content, or null unless it is a regular file
 */
function readPlain(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  return stat?.isFile() === true ? fs.readFileSync(file, "utf8") : null;
}

/** Where a real hook config lives: devenv's git-hooks writes it to the store. */
const NIX_STORE = "/nix/store/";

/**
 * Links `<worktree>/.pre-commit-config.yaml` to `hookConfig`, the store file
 * devenv's `config.git-hooks.configFile` names (claude-bot passes it, so it
 * does not hang on `devenv shell` having linked the host's own copy, which
 * untracking it in #283 deleted); without one, to the store path the host's
 * `<repo>/.pre-commit-config.yaml` resolves to. Only when nothing is at that
 * path.
 *
 * Anything already there is left alone, unread and unfollowed. On a branch
 * from before #283 the file is still tracked, and retargeting it would dirty
 * the worktree, so that checking out main aborts. A stale link costs that
 * agent its local hooks until it deletes the entry. CI's `git hooks` job is
 * the gate either way. Never throws: a jail without hooks still starts.
 *
 * @param {string} repo
 * @param {string} worktree
 * @param {string} store
 * @param {string | undefined} hookConfig
 * @returns {string | null} what was done, or null if something is already there
 */
function linkHookConfig(repo, worktree, store, hookConfig) {
  const name = ".pre-commit-config.yaml";
  const link = path.join(worktree, name);
  if (fs.lstatSync(link, { throwIfNoEntry: false }) !== undefined) {
    return null;
  }
  /** @type {string} */
  let target;
  try {
    target = fs.realpathSync(hookConfig ?? path.join(repo, name));
  } catch {
    target = "";
  }
  if (!target.startsWith(store)) {
    return `no ${hookConfig ?? path.join(repo, name)} in ${store} (has devenv shell run?); git hooks will not run in ${worktree}`;
  }
  try {
    fs.symlinkSync(target, link);
    return `linked ${link}`;
  } catch (error) {
    return `could not link ${link}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * The commit a new worktree starts from: GitHub's `main`, by the SHA the
 * fetch itself reports, never by reading back a ref every jail can write.
 *
 * If the fetch fails, the existing `origin/main` is used, with one line to
 * say so. That is a starting point, not a trusted base: refs are writable
 * from every jail, so it may be anything an agent put there. Nothing runs
 * on the strength of it (the checkout is hardened), and every issue
 * branches from a fresh fetch anyway (the fresh-branch skill).
 *
 * @param {string} repo
 * @param {string | undefined} remote
 * @param {string[]} done where to say so if the fetch failed
 * @returns {string}
 */
function mainCommit(repo, remote, done) {
  const ref = "refs/remotes/origin/main";
  if (remote !== undefined) {
    const fetched = run(repo, [
      "fetch",
      "-v",
      "--porcelain",
      "--no-tags",
      remote,
      `+refs/heads/main:${ref}`,
    ]);
    const line = fetched.stdout.split("\n").find((l) => l.endsWith(` ${ref}`));
    const sha = line?.split(" ")[2];
    if (fetched.code === 0 && sha !== undefined) {
      return sha;
    }
    done.push(`could not fetch main from ${remote}; using the existing origin/main`);
  }
  const existing = run(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (existing.code !== 0) {
    throw new Error("no origin/main to start the worktree from");
  }
  return existing.stdout.trim();
}

/**
 * Attaches `<repo>/.bots/wt/<employee>` to `<repo>/.git/worktrees/<employee>`,
 * creating or repairing whichever half is missing.
 *
 * @param {string} repo the operator's checkout
 * @param {string} employee
 * @param {{ remote?: string, store?: string, hookConfig?: string }} [options] `remote`: where to
 *   fetch `main` from; omitted, nothing is fetched and the existing
 *   `origin/main` is used. `store`: the prefix a hook config must resolve
 *   into, `/nix/store/` unless a test says otherwise. `hookConfig`: the
 *   store file to link as the hook config
 * @returns {string[]} what was done, one line each; empty if nothing was needed
 */
export function ensureWorktree(repo, employee, options = {}) {
  if (roleOf(employee) === null) {
    throw new Error(`not an employee id: ${employee}`);
  }
  const worktree = path.join(repo, ".bots", "wt", employee);
  const dotGit = path.join(worktree, ".git");
  const admin = path.join(repo, ".git", "worktrees", employee);
  const pins = filterPins(run(repo, ["config", "--get-regexp", FILTER_KEYS]).stdout);
  /** @type {string[]} */
  const done = [];
  /**
   * @param {string[]} lines
   * @returns {string[]}
   */
  const withHookConfig = (lines) => {
    const linked = linkHookConfig(repo, worktree, options.store ?? NIX_STORE, options.hookConfig);
    return linked === null ? lines : [...lines, linked];
  };

  if (!fs.existsSync(worktree)) {
    const base = mainCommit(repo, options.remote, done);
    // An admin dir whose worktree is gone is a registered-but-missing
    // worktree, which `add` refuses without -f. -f reuses the name.
    const force = fs.existsSync(admin) ? ["-f"] : [];
    git(repo, [...pins, "worktree", "add", "-q", ...force, "--detach", worktree, base]);
    done.push(`created ${worktree} at ${base.slice(0, 7)}`);
    return withHookConfig(done);
  }

  const adminStat = fs.lstatSync(admin, { throwIfNoEntry: false });
  if (adminStat !== undefined && !adminStat.isDirectory()) {
    throw new Error(`${admin} is not a directory; move it aside and start again`);
  }
  if (adminStat === undefined) {
    // HEAD went with the admin dir. The employee's newest branch is the best
    // guess at what it had checked out, and the agent can switch from there.
    // With none, main, detached, as for a new worktree.
    const newest = git(repo, [
      "for-each-ref",
      "--sort=-committerdate",
      "--count=1",
      "--format=%(refname)",
      `refs/heads/bot/${employee}`,
    ]).trim();
    const head = newest === "" ? mainCommit(repo, options.remote, done) : `ref: ${newest}`;
    fs.mkdirSync(admin);
    writeFresh(path.join(admin, "commondir"), "../..\n");
    writeFresh(path.join(admin, "HEAD"), `${head}\n`);
    writeFresh(path.join(admin, "gitdir"), `${dotGit}\n`);
    writeFresh(dotGit, `gitdir: ${admin}\n`);
    git(worktree, [...pins, "reset", "-q"]);
    done.push(
      `re-created the admin dir of ${worktree}, HEAD ${head.replace(/^ref: refs\/heads\//, "")}`,
    );
  }
  if (readPlain(dotGit)?.trim() !== `gitdir: ${admin}`) {
    writeFresh(dotGit, `gitdir: ${admin}\n`);
    done.push(`re-linked ${dotGit} to ${admin}`);
  }
  if (readPlain(path.join(admin, "gitdir"))?.trim() !== dotGit) {
    writeFresh(path.join(admin, "gitdir"), `${dotGit}\n`);
    done.push(`re-linked ${admin} to ${dotGit}`);
  }
  return withHookConfig(done);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repo, employee, hookConfig] = process.argv.slice(2);
  if (repo === undefined || employee === undefined) {
    process.stderr.write("usage: worktree.mjs <repo> <employee> [hook-config]\n");
    process.exit(2);
  }
  // GitHub's main, by URL, as the reboot fetches it. VIBEWARS_GIT_REMOTE is
  // the host's to set: a test points it at a local bare repository.
  const company = path.join(repo, ".bots", "company.json");
  const slug = fs.existsSync(company)
    ? obj(JSON.parse(fs.readFileSync(company, "utf8"))).repo
    : undefined;
  const remote =
    process.env.VIBEWARS_GIT_REMOTE ??
    (typeof slug === "string" && slug !== "" ? `git@github.com:${slug}.git` : undefined);
  try {
    for (const line of ensureWorktree(repo, employee, { remote, hookConfig })) {
      process.stdout.write(`claude-bot: ${line}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`claude-bot: ${employee}: ${message}\n`);
    process.exit(1);
  }
}
