#!/usr/bin/env node
/**
 * `worktree.mjs <repo> <role>` — make sure a role's worktree is attached
 * before its jail starts (#69).
 *
 * A jail sees the shared `.git` but only its own worktree, and git cannot
 * tell "invisible" from "deleted": one `git worktree prune` in a jail once
 * removed the admin dir of every other agent's worktree. So the jail gets
 * `.git/worktrees` read-only, except its own `.git/worktrees/<role>`, and
 * creating or repairing a worktree is the host's job, done here by
 * claude-bot before it starts bwrap:
 *
 *   - no worktree: `git worktree add` it, detached at the checkout's HEAD.
 *     Not on `bot/<role>`: that branch would block every
 *     `bot/<role>/issue-<n>` the agent creates;
 *   - a worktree whose admin dir is gone: recreate `gitdir`, `commondir` and
 *     `HEAD`, then rebuild the index with a mixed `git reset`. Never
 *     `--hard`: the agent's uncommitted files are the point of keeping the
 *     directory, and they come back as unstaged changes;
 *   - a worktree whose `.git` file and admin dir do not point at each other:
 *     rewrite both links, which is what `git worktree repair` does.
 *
 * Everything under `.bots/wt/<role>` and `.git/worktrees/<role>` is the
 * agent's to write, so nothing is read from there: the admin dir is derived
 * from the role name, every link is written fresh rather than through
 * whatever is at its path (a planted symlink would otherwise aim a host
 * write anywhere), and git runs hardened (git-hardening.mjs).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { FILTER_KEYS, GIT_ENV, GIT_HARDENING, filterPins } from "./git-hardening.mjs";

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

/**
 * Attaches `<repo>/.bots/wt/<role>` to `<repo>/.git/worktrees/<role>`,
 * creating or repairing whichever half is missing.
 *
 * @param {string} repo the operator's checkout
 * @param {string} role
 * @returns {string[]} what was done, one line each; empty if nothing was needed
 */
export function ensureWorktree(repo, role) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(role)) {
    throw new Error(`not a role name: ${role}`);
  }
  const worktree = path.join(repo, ".bots", "wt", role);
  const dotGit = path.join(worktree, ".git");
  const admin = path.join(repo, ".git", "worktrees", role);

  if (!fs.existsSync(worktree)) {
    // An admin dir whose worktree is gone is a registered-but-missing
    // worktree, which `add` refuses without -f. -f reuses the name.
    const force = fs.existsSync(admin) ? ["-f"] : [];
    git(repo, ["worktree", "add", "-q", ...force, "--detach", worktree, "HEAD"]);
    return [`created ${worktree}`];
  }

  /** @type {string[]} */
  const done = [];
  const adminStat = fs.lstatSync(admin, { throwIfNoEntry: false });
  if (adminStat !== undefined && !adminStat.isDirectory()) {
    throw new Error(`${admin} is not a directory; move it aside and start again`);
  }
  if (adminStat === undefined) {
    // HEAD went with the admin dir. The role's newest branch is the best
    // guess at what it had checked out, and the agent can switch from there.
    // With none, the checkout's HEAD, detached, as for a new worktree.
    const newest = git(repo, [
      "for-each-ref",
      "--sort=-committerdate",
      "--count=1",
      "--format=%(refname)",
      `refs/heads/bot/${role}`,
    ]).trim();
    const head = newest === "" ? git(repo, ["rev-parse", "HEAD"]).trim() : `ref: ${newest}`;
    fs.mkdirSync(admin);
    writeFresh(path.join(admin, "commondir"), "../..\n");
    writeFresh(path.join(admin, "HEAD"), `${head}\n`);
    writeFresh(path.join(admin, "gitdir"), `${dotGit}\n`);
    writeFresh(dotGit, `gitdir: ${admin}\n`);
    const pins = filterPins(run(repo, ["config", "--get-regexp", FILTER_KEYS]).stdout);
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
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [repo, role] = process.argv.slice(2);
  if (repo === undefined || role === undefined) {
    process.stderr.write("usage: worktree.mjs <repo> <role>\n");
    process.exit(2);
  }
  try {
    for (const line of ensureWorktree(repo, role)) {
      process.stdout.write(`claude-bot: ${line}\n`);
    }
  } catch (error) {
    process.stderr.write(`claude-bot: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
