#!/usr/bin/env node
/**
 * The company's commit lock (#897, ADR-0044): `.bots/company.lock` names the
 * one commit the company runs, whatever the operator's checkout holds. Only
 * a reboot (restart.mjs) or the operator (`claude-llc lock`) moves it.
 *
 *   company-lock.mjs check   write and verify the locked tree
 *                            (`.bots/company/<sha>/`), print its sha; or
 *                            exit 1 with the reason. A checkout that is not
 *                            the lock is a warning on stderr
 *   company-lock.mjs lock    pin the checkout's HEAD, after its checks and
 *                            a build
 *   company-lock.mjs sha     print the lock's sha
 *
 * The file and the trees are in the host-only bot root, which no jail
 * mounts: no agent can write or read them, and a tracked file could not name
 * its own commit.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { tamperedPaths, treeMismatches, writeTreeFromMirror } from "./checkout-verify.mjs";
import { builds } from "./company-build.mjs";
import { FILTER_KEYS, GIT_ENV, GIT_HARDENING, filterPins } from "./git-hardening.mjs";
import { obj } from "./protocol.mjs";

export const LOCK_FILE = "company.lock";

/** A version that only rejects: another value is unreadable, never adapted. */
export const LOCK_SCHEMA_VERSION = 1;

/**
 * @typedef {object} Lock
 * @property {1} schemaVersion
 * @property {string} sha 40 hex
 * @property {number} lockedAt epoch ms
 * @property {"reboot" | "operator"} by
 */

/**
 * @param {string} text
 * @returns {Lock | null} `null` for anything not exactly a lock
 */
export function parseLock(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const lock = obj(raw);
  const keys = Object.keys(lock).sort().join(",");
  if (
    keys !== "by,lockedAt,schemaVersion,sha" ||
    lock.schemaVersion !== LOCK_SCHEMA_VERSION ||
    typeof lock.sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(lock.sha) ||
    typeof lock.lockedAt !== "number" ||
    !Number.isFinite(lock.lockedAt) ||
    (lock.by !== "reboot" && lock.by !== "operator")
  ) {
    return null;
  }
  return { schemaVersion: 1, sha: lock.sha, lockedAt: lock.lockedAt, by: lock.by };
}

/**
 * The lock in `root`: `"missing"`, `"unreadable"`, or the lock.
 *
 * @param {string} root the bot root
 * @returns {Lock | "missing" | "unreadable"}
 */
export function readLock(root) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, LOCK_FILE), "utf8");
  } catch {
    return "missing";
  }
  return parseLock(text) ?? "unreadable";
}

/**
 * @param {string} root the bot root
 * @param {string} sha
 * @param {"reboot" | "operator"} by
 * @param {number} now
 * @returns {void}
 */
export function writeLock(root, sha, by, now) {
  const file = path.join(root, LOCK_FILE);
  const tmp = `${file}.part`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify({ schemaVersion: LOCK_SCHEMA_VERSION, sha, lockedAt: now, by })}\n`,
  );
  fs.renameSync(tmp, file);
}

/**
 * @param {string} sha
 * @returns {string}
 */
function short(sha) {
  return sha.slice(0, 7);
}

/**
 * The one line `claude-llc up` prints when the checkout is not the lock: the
 * checkout is the operator's to move, so this is a warning, never a refusal.
 *
 * @param {object} facts
 * @param {string} facts.head the checkout's HEAD
 * @param {string} facts.sha the lock's
 * @param {number | null} facts.ahead commits HEAD has that the lock does not, null if git could not say
 * @param {number | null} facts.behind commits the lock has that HEAD does not
 * @returns {string | null} null when the checkout holds the lock
 */
export function driftWarning({ head, sha, ahead, behind }) {
  if (head === sha) {
    return null;
  }
  const locked = short(sha);
  const plural = (/** @type {number} */ n) => `${String(n)} commit${n === 1 ? "" : "s"}`;
  let where = `is not the locked ${locked}`;
  if (ahead !== null && behind !== null) {
    if (behind === 0) {
      where = `is ${plural(ahead)} ahead of the locked ${locked}`;
    } else if (ahead === 0) {
      where = `is ${plural(behind)} behind the locked ${locked}`;
    } else {
      where = `has diverged from the locked ${locked} (${plural(ahead)} ahead, ${plural(behind)} behind)`;
    }
  }
  return `warning: checkout HEAD ${short(head)} ${where}; the company runs ${locked}. 'claude-llc lock' to move it`;
}

/**
 * Whether the company may start on the lock (#1861, ADR-0044), and if not,
 * the one thing to tell the operator. The checkout's HEAD and dirty state do
 * not decide this: nothing in the checkout runs.
 *
 * @param {object} facts
 * @param {Lock | "missing" | "unreadable"} facts.lock
 * @param {readonly string[]} facts.tampered files of the locked tree that are not the mirror's content for the lock
 * @param {boolean} facts.onMain whether the lock's sha is an ancestor of GitHub's main
 * @param {string | null} facts.fetchError why GitHub's main could not be fetched
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function lockVerdict({ lock, tampered, onMain, fetchError }) {
  /** @param {string} message */
  const refuse = (message) => ({ ok: false, message });
  if (lock === "missing") {
    return refuse("company.lock is missing: run 'claude-llc lock' to pin the checkout's HEAD");
  }
  if (lock === "unreadable") {
    return refuse("company.lock is unreadable: run 'claude-llc lock' to write it again");
  }
  if (fetchError !== null) {
    return refuse(`could not fetch GitHub main to check the lock: ${fetchError}`);
  }
  if (!onMain) {
    return refuse(`locked ${short(lock.sha)} is not on GitHub main`);
  }
  if (tampered.length > 0) {
    return refuse(
      `the locked tree does not match ${short(lock.sha)} in hubd's mirror, even rewritten from it: ${tampered.slice(0, 10).join(", ")}. Something is writing to .bots/company/; find it before 'claude-llc up'`,
    );
  }
  return { ok: true };
}

/**
 * Whether `claude-llc lock` may pin the checkout's HEAD: it must be clean,
 * on GitHub's main, and hold that commit's files.
 *
 * @param {object} facts
 * @param {string} facts.head the checkout's HEAD
 * @param {readonly string[]} facts.dirtyPaths `git status --porcelain`, one entry each
 * @param {readonly string[]} facts.tampered tracked files that are not the mirror's content for HEAD
 * @param {boolean} facts.onMain whether HEAD is an ancestor of GitHub's main
 * @param {string | null} facts.fetchError why GitHub's main could not be fetched
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function pinVerdict({ head, dirtyPaths, tampered, onMain, fetchError }) {
  /** @param {string} message */
  const refuse = (message) => ({ ok: false, message });
  if (dirtyPaths.length > 0) {
    return refuse(`the checkout has uncommitted changes: ${dirtyPaths.slice(0, 5).join(", ")}`);
  }
  if (fetchError !== null) {
    return refuse(`could not fetch GitHub main to check the lock: ${fetchError}`);
  }
  if (!onMain) {
    return refuse(`checkout HEAD ${short(head)} is not on GitHub main`);
  }
  if (tampered.length > 0) {
    return refuse(
      `checkout does not match ${short(head)} in hubd's mirror: ${tampered.slice(0, 10).join(", ")}. The checkout's git objects may have been tampered with; run 'git fsck' and re-clone before 'claude-llc lock'`,
    );
  }
  return { ok: true };
}

/**
 * @param {string} stderr
 * @returns {string} git's `fatal:` line, else its last
 */
function failureLine(stderr) {
  const lines = stderr.trim().split("\n");
  return lines.find((line) => line.startsWith("fatal:")) ?? lines.at(-1) ?? "git fetch failed";
}

/**
 * @param {string[]} args
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
function git(args) {
  const result = spawnSync("git", [...GIT_HARDENING, ...args], {
    env: { ...process.env, ...GIT_ENV },
    encoding: "utf8",
  });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * git in the operator's checkout, with every filter driver its config names
 * pinned empty.
 *
 * @param {string} repoDir
 * @returns {(args: string[]) => { code: number, stdout: string, stderr: string }}
 */
function checkoutGit(repoDir) {
  const base = ["-C", repoDir];
  const pins = filterPins(git([...base, "config", "--get-regexp", FILTER_KEYS]).stdout);
  return (args) => git([...base, ...pins, ...args]);
}

/**
 * Fetch GitHub's main by URL into hubd's mirror, never through a local ref
 * (ADR-0015), as the restarter's does, and say whether `sha` is on it.
 *
 * @param {string} root the bot root
 * @param {string} sha
 * @returns {{ mirror: string, onMain: boolean, fetchError: string | null }}
 */
function mainFacts(root, sha) {
  const mirror = path.join(root, "hub", ".git-mirror");
  if (!fs.existsSync(mirror)) {
    git(["init", "--bare", "-q", mirror]);
  }
  const company = obj(JSON.parse(fs.readFileSync(path.join(root, "company.json"), "utf8")));
  const repo = typeof company.repo === "string" ? company.repo : "";
  const remote = process.env.VIBEWARS_GIT_REMOTE ?? `git@github.com:${repo}.git`;
  const fetched = git([
    `--git-dir=${mirror}`,
    "fetch",
    "-q",
    "--no-tags",
    remote,
    "+refs/heads/main:refs/heads/main",
  ]);
  if (fetched.code !== 0) {
    return { mirror, onMain: false, fetchError: failureLine(fetched.stderr) };
  }
  const onMain =
    git([`--git-dir=${mirror}`, "merge-base", "--is-ancestor", sha, "refs/heads/main"]).code === 0;
  return { mirror, onMain, fetchError: null };
}

/**
 * What git says about the checkout's HEAD and GitHub's main, for
 * `claude-llc lock`.
 *
 * @param {{ repoDir: string, root: string }} where
 * @returns {{ head: string, dirtyPaths: string[], tampered: string[], onMain: boolean, fetchError: string | null }}
 */
export function gitFacts({ repoDir, root }) {
  const checkout = checkoutGit(repoDir);
  const head = checkout(["rev-parse", "HEAD"]).stdout.trim();
  const dirtyPaths = checkout(["status", "--porcelain"])
    .stdout.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(3));
  const { mirror, onMain, fetchError } = mainFacts(root, head);
  const tampered = onMain ? tamperedPaths({ mirror, repoDir, sha: head }) : [];
  return { head, dirtyPaths, tampered, onMain, fetchError };
}

/** Where the locked trees live, in the host-only bot root. */
export const TREES_DIR = "company";

/** The operator's devenv settings, which git ignores. */
const LOCAL_SETTINGS = "devenv.local.nix";

/**
 * The tree the company runs (#1861): `<root>/company/<sha>/`, holding exactly
 * the mirror's files for `sha`. A tree that does not match is derived state:
 * it is discarded and written again from the mirror (ADR-0016), then
 * checked. Every other sha's tree is deleted.
 *
 * It gets a git repository of its own, with the files staged and no commit,
 * as the reboot's build check does (company-build.mjs): devenv would
 * otherwise install its hooks into the checkout's, and nix reads only
 * tracked files from a git tree. The operator's own settings,
 * `devenv.local.nix`, are the checkout's, not the commit's: git ignores
 * them, and the tree gets the checkout's copy, or none.
 *
 * @param {{ root: string, mirror: string, sha: string, repoDir: string }} where `repoDir`: the checkout
 * @returns {{ dir: string, tampered: string[] }} `tampered`: paths still not the mirror's
 */
export function lockedTree({ root, mirror, sha, repoDir }) {
  const trees = path.join(root, TREES_DIR);
  const dir = path.join(trees, sha);
  fs.mkdirSync(trees, { recursive: true });
  for (const name of fs.readdirSync(trees)) {
    if (name !== sha) {
      fs.rmSync(path.join(trees, name), { recursive: true, force: true });
    }
  }
  const local = () => {
    const file = path.join(repoDir, LOCAL_SETTINGS);
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, path.join(dir, LOCAL_SETTINGS));
    } else {
      fs.rmSync(path.join(dir, LOCAL_SETTINGS), { force: true });
    }
  };
  if (fs.existsSync(dir) && treeMismatches({ mirror, dir, sha }).length === 0) {
    local();
    return { dir, tampered: [] };
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir);
  if (!writeTreeFromMirror({ mirror, dir, sha })) {
    return { dir, tampered: [`(cannot write ${short(sha)} from the mirror)`] };
  }
  for (const args of [
    ["init", "-q"],
    ["add", "-A"],
  ]) {
    if (git(["-C", dir, ...args]).code !== 0) {
      return { dir, tampered: [`(git ${String(args[0])} failed in the locked tree)`] };
    }
  }
  const tampered = treeMismatches({ mirror, dir, sha });
  local();
  return { dir, tampered };
}

/**
 * How far the checkout's HEAD is from `sha`, for the warning.
 *
 * @param {string} repoDir
 * @param {string} sha
 * @returns {string | null}
 */
function drift(repoDir, sha) {
  const checkout = checkoutGit(repoDir);
  const head = checkout(["rev-parse", "HEAD"]).stdout.trim();
  const counts = checkout(["rev-list", "--left-right", "--count", `HEAD...${sha}`]);
  const [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
  const known = counts.code === 0 && ahead !== undefined && behind !== undefined;
  return driftWarning({
    head,
    sha,
    ahead: known ? ahead : null,
    behind: known ? behind : null,
  });
}

/**
 * `claude-llc up`'s check: the lock, GitHub's main, and the locked tree,
 * written if it must be.
 *
 * @param {string} root
 * @param {string} repoDir
 * @returns {{ ok: true, sha: string, warning: string | null } | { ok: false, message: string }}
 */
function check(root, repoDir) {
  const lock = readLock(root);
  if (typeof lock === "string") {
    return lockVerdict({ lock, tampered: [], onMain: false, fetchError: null });
  }
  const facts = mainFacts(root, lock.sha);
  const tampered = facts.onMain
    ? lockedTree({ root, mirror: facts.mirror, sha: lock.sha, repoDir }).tampered
    : [];
  const verdict = lockVerdict({ lock, tampered, ...facts });
  if (!verdict.ok) {
    return verdict;
  }
  return { ok: true, sha: lock.sha, warning: drift(repoDir, lock.sha) };
}

/**
 * `claude-llc lock`: the checks for the current HEAD, the build, then the
 * lock.
 *
 * @param {string} root
 * @param {string} repoDir
 * @returns {{ ok: true, sha: string } | { ok: false, message: string }}
 */
function pin(root, repoDir) {
  const facts = gitFacts({ repoDir, root });
  const verdict = pinVerdict(facts);
  if (!verdict.ok) {
    return verdict;
  }
  const log = path.join(root, "hub", "reboot.log");
  const where = {
    mirror: path.join(root, "hub", ".git-mirror"),
    scratch: path.join(root, "lock-check"),
    logFile: log,
    log: (/** @type {string} */ line) => {
      fs.appendFileSync(log, `${new Date().toISOString()} ${line}\n`);
    },
  };
  if (!builds(where, facts.head)) {
    return { ok: false, message: `${short(facts.head)} does not build; see ${log}` };
  }
  writeLock(root, facts.head, "operator", Date.now());
  return { ok: true, sha: facts.head };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.VIBEWARS_BOT_ROOT ?? "";
  const repoDir = process.env.DEVENV_ROOT ?? "";
  const verb = process.argv[2];
  if (root === "" || repoDir === "" || (verb !== "check" && verb !== "lock" && verb !== "sha")) {
    console.error(
      "usage: company-lock.mjs <check|lock|sha> (with VIBEWARS_BOT_ROOT and DEVENV_ROOT)",
    );
    process.exit(2);
  }
  if (verb === "sha") {
    const lock = readLock(root);
    if (typeof lock === "string") {
      console.error(`claude-llc: company.lock is ${lock}`);
      process.exit(1);
    }
    console.log(lock.sha);
    process.exit(0);
  }
  if (verb === "check") {
    const verdict = check(root, repoDir);
    if (!verdict.ok) {
      console.error(`claude-llc: ${verdict.message}`);
      process.exit(1);
    }
    if (verdict.warning !== null) {
      console.error(`claude-llc: ${verdict.warning}`);
    }
    // The sha whose tree to run, for claude-llc.
    console.log(verdict.sha);
    process.exit(0);
  }
  const verdict = pin(root, repoDir);
  if (!verdict.ok) {
    console.error(`claude-llc: ${verdict.message}`);
    process.exit(1);
  }
  console.log(`claude-llc: locked ${short(verdict.sha)}`);
}
