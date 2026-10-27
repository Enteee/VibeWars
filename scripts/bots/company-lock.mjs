#!/usr/bin/env node
/**
 * The company's commit lock (#897, ADR-0033): `.bots/company.lock` names the
 * one commit the company runs. `claude-llc up` refuses to start on any other,
 * and only a reboot (restart.mjs) or the operator (`claude-llc lock`) moves it.
 *
 *   company-lock.mjs check   exit 0, or 1 with the reason
 *   company-lock.mjs lock    pin the checkout's HEAD, after the same checks
 *                            and a build
 *
 * The file is in the host-only bot root, which no jail mounts: no agent can
 * write or read it, and a tracked file could not name its own commit.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { tamperedPaths } from "./checkout-verify.mjs";
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
 * Whether the company may start, and if not, the one thing to tell the
 * operator.
 *
 * @param {object} facts
 * @param {Lock | "missing" | "unreadable"} facts.lock
 * @param {string} facts.head the checkout's HEAD
 * @param {readonly string[]} facts.dirtyPaths `git status --porcelain`, one entry each
 * @param {readonly string[]} facts.tampered tracked files that are not the mirror's content for the lock
 * @param {boolean} facts.onMain whether the lock's sha is an ancestor of GitHub's main
 * @param {string | null} facts.fetchError why GitHub's main could not be fetched
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function lockVerdict({ lock, head, dirtyPaths, tampered, onMain, fetchError }) {
  /** @param {string} message */
  const refuse = (message) => ({ ok: false, message });
  if (lock === "missing") {
    return refuse("company.lock is missing: run 'claude-llc lock' to pin the checkout's HEAD");
  }
  if (lock === "unreadable") {
    return refuse("company.lock is unreadable: run 'claude-llc lock' to write it again");
  }
  if (head !== lock.sha) {
    return refuse(
      `checkout HEAD ${short(head)} is not the locked ${short(lock.sha)}: something moved the checkout. Reset it to the lock, or run 'claude-llc lock' if you moved it on purpose`,
    );
  }
  if (dirtyPaths.length > 0) {
    return refuse(`the checkout has uncommitted changes: ${dirtyPaths.slice(0, 5).join(", ")}`);
  }
  if (fetchError !== null) {
    return refuse(`could not fetch GitHub main to check the lock: ${fetchError}`);
  }
  if (!onMain) {
    return refuse(`locked ${short(lock.sha)} is not on GitHub main`);
  }
  if (tampered.length > 0) {
    return refuse(
      `checkout does not match ${short(lock.sha)} in hubd's mirror: ${tampered.slice(0, 10).join(", ")}. The checkout's git objects may have been tampered with; run 'git fsck' and re-clone before 'claude-llc lock'`,
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
 * What git says about the checkout and GitHub's main for `sha`. The fetch goes
 * by URL into hubd's mirror, never through a local ref (ADR-0015), as the
 * restarter's does.
 *
 * @param {{ repoDir: string, root: string, sha: string | null }} where `sha` null: the checkout's HEAD
 * @returns {{ head: string, dirtyPaths: string[], tampered: string[], onMain: boolean, fetchError: string | null }}
 */
export function gitFacts({ repoDir, root, sha }) {
  /**
   * @param {string[]} args
   * @returns {{ code: number, stdout: string, stderr: string }}
   */
  const git = (args) => {
    const result = spawnSync("git", [...GIT_HARDENING, ...args], {
      env: { ...process.env, ...GIT_ENV },
      encoding: "utf8",
    });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  };
  const base = ["-C", repoDir];
  const pins = filterPins(git([...base, "config", "--get-regexp", FILTER_KEYS]).stdout);
  const head = git([...base, ...pins, "rev-parse", "HEAD"]).stdout.trim();
  const dirtyPaths = git([...base, ...pins, "status", "--porcelain"])
    .stdout.split("\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(3));

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
    return {
      head,
      dirtyPaths,
      tampered: [],
      onMain: false,
      fetchError: failureLine(fetched.stderr),
    };
  }
  const onMain =
    git([`--git-dir=${mirror}`, "merge-base", "--is-ancestor", sha ?? head, "refs/heads/main"])
      .code === 0;
  const tampered = onMain ? tamperedPaths({ mirror, repoDir, sha: sha ?? head }) : [];
  return { head, dirtyPaths, tampered, onMain, fetchError: null };
}

/**
 * @param {string} root
 * @param {string} repoDir
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
function check(root, repoDir) {
  const lock = readLock(root);
  if (typeof lock === "string") {
    return lockVerdict({
      lock,
      head: "",
      dirtyPaths: [],
      tampered: [],
      onMain: false,
      fetchError: null,
    });
  }
  return lockVerdict({ lock, ...gitFacts({ repoDir, root, sha: lock.sha }) });
}

/**
 * `claude-llc lock`: checks 3 and 4 for the current HEAD, the build, then the
 * lock.
 *
 * @param {string} root
 * @param {string} repoDir
 * @returns {{ ok: true, sha: string } | { ok: false, message: string }}
 */
function pin(root, repoDir) {
  const facts = gitFacts({ repoDir, root, sha: null });
  const verdict = lockVerdict({
    lock: { schemaVersion: 1, sha: facts.head, lockedAt: 0, by: "operator" },
    ...facts,
  });
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
  if (root === "" || repoDir === "" || (verb !== "check" && verb !== "lock")) {
    console.error("usage: company-lock.mjs <check|lock> (with VIBEWARS_BOT_ROOT and DEVENV_ROOT)");
    process.exit(2);
  }
  const verdict = verb === "check" ? check(root, repoDir) : pin(root, repoDir);
  if (!verdict.ok) {
    console.error(`claude-llc: ${verdict.message}`);
    process.exit(1);
  }
  if (verb === "lock" && "sha" in verdict) {
    console.log(`claude-llc: locked ${short(verdict.sha)}`);
  }
}
