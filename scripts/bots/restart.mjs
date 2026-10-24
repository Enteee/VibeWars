#!/usr/bin/env node
/**
 * `claude-llc-restart` — the last step of a company reboot (#21).
 *
 * Started by the supervisor once the company has drained, in a session of
 * its own (`setsid`), because it kills the tmux session everything else runs
 * in. It then:
 *
 *   1. stops the company: the tmux session, hubd, the Telegram sidecar, and
 *      any jail still running after 15 s;
 *   2. checks that GitHub's `main` builds, in a scratch worktree;
 *   3. fast-forwards the operator's checkout to it, only if that is safe
 *      (reboot.mjs, `fastForwardDecision`) and it built;
 *   4. records what it loaded, or plainly why it did not, in
 *      `.bots/boot.json`, whose note claude-llc puts in the manager's first
 *      prompt so the manager can tell everyone;
 *   5. starts the company again with `devenv shell -- claude-llc up`, so nix
 *      rebuilds every script and briefing from the code now checked out.
 *
 * A main that does not build is never checked out: the company comes back on
 * the code it had, and the operator is told. The company must not stay down
 * because of a bad merge.
 *
 * Every git it runs is hardened (git-hardening.mjs): the operator's checkout
 * shares its `.git` with every agent's worktree.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";
import { obj } from "./protocol.mjs";
import { COMPANY_PATHSPECS, fastForwardDecision } from "./reboot.mjs";

/**
 * @param {string} name
 * @returns {string}
 */
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; claude-llc starts this`);
  }
  return value;
}

const REPO = required("DEVENV_ROOT");
const ROOT = required("VIBEWARS_BOT_ROOT");
const SESSION = process.env.VIBEWARS_LLC_SESSION ?? "vibewars-llc";
const REBOOTING = path.join(ROOT, "rebooting.json");
const LOG = path.join(ROOT, "hub", "reboot.log");
const CHECK = path.join(ROOT, "reboot-check");

/** How long the company gets to exit before what is left is killed. */
const STOP_TIMEOUT_MS = 15_000;

/**
 * @param {string} line
 * @returns {void}
 */
function log(line) {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}

/**
 * @param {string} file
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string> }} [options]
 * @returns {{ code: number, stdout: string }}
 */
function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd ?? REPO,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (stderr.trim() !== "") {
    log(`${file} ${args.join(" ")}: ${stderr.trim()}`);
  }
  return { code: result.status ?? 1, stdout };
}

/**
 * `devenv shell`, as the operator would start it from a fresh terminal:
 * without the variables of the devenv shell this process inherited, so the
 * new shell is built from the checkout it runs in and nothing else.
 *
 * Its output goes straight to the log, not through a pipe: `claude-llc up`
 * leaves daemons running, and a pipe they inherited would never close.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {number} its exit code
 */
function devenv(args, cwd) {
  log(`devenv shell -- ${args.join(" ")}`);
  const out = fs.openSync(LOG, "a");
  try {
    const result = spawnSync("devenv", ["shell", "--", ...args], {
      cwd,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !name.startsWith("DEVENV_") && name !== "IN_NIX_SHELL",
          ),
        ),
        // The boot record is already written; claude-llc must not replace it.
        VIBEWARS_REBOOTED: "1",
      },
      stdio: ["ignore", out, out],
    });
    return result.status ?? 1;
  } finally {
    fs.closeSync(out);
  }
}

/**
 * @param {string[]} args
 * @returns {{ code: number, stdout: string }}
 */
function git(args) {
  return run("git", [...GIT_HARDENING, "-C", REPO, ...args], { env: GIT_ENV });
}

/**
 * @param {string} pattern for `pgrep -f`
 * @returns {boolean}
 */
function running(pattern) {
  return run("pgrep", ["-f", pattern]).code === 0;
}

/** @returns {Promise<void>} */
async function stopCompany() {
  run("tmux", ["kill-session", "-t", SESSION]);
  // The jails are recognised by their worktree binds, which no other
  // process on the machine carries.
  const patterns = ["hubd.mjs", "supervisor.mjs", "link.mjs serve", `${ROOT}/wt/`];
  for (const pattern of patterns.slice(0, 3)) {
    run("pkill", ["-f", pattern]);
  }
  const until = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < until && patterns.some(running)) {
    await sleep(500);
  }
  for (const pattern of patterns.filter(running)) {
    log(`still running after ${String(STOP_TIMEOUT_MS / 1000)}s, killing: ${pattern}`);
    run("pkill", ["-KILL", "-f", pattern]);
  }
}

/**
 * Does this commit build? Checked in a scratch worktree, so the operator's
 * checkout is only moved to a commit already known to work.
 *
 * @param {string} sha
 * @returns {boolean}
 */
function builds(sha) {
  git(["worktree", "remove", "--force", CHECK]);
  if (git(["worktree", "add", "--detach", CHECK, sha]).code !== 0) {
    return false;
  }
  const built = devenv(["claude-llc", "--help"], CHECK) === 0;
  git(["worktree", "remove", "--force", CHECK]);
  return built;
}

/**
 * @param {string} sha
 * @returns {string}
 */
function short(sha) {
  return sha.slice(0, 8);
}

async function main() {
  const reboot = obj(JSON.parse(fs.readFileSync(REBOOTING, "utf8")));
  const bootSha = typeof reboot.bootSha === "string" ? reboot.bootSha : "HEAD";
  const company = obj(JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8")));
  const repo = typeof company.repo === "string" ? company.repo : "";
  log(`reboot: ${String(reboot.reason)}`);

  await stopCompany();

  // GitHub's main, by URL: never a remote an agent could have rewritten.
  // VIBEWARS_GIT_REMOTE is the host's to set, as for hubd: a test points it
  // at a local bare repository.
  const remote = process.env.VIBEWARS_GIT_REMOTE ?? `git@github.com:${repo}.git`;
  /** @type {string | null} */
  let target = null;
  if (git(["fetch", "-q", "--no-tags", remote, "main"]).code === 0) {
    target = git(["rev-parse", "FETCH_HEAD"]).stdout.trim();
  }

  /** @type {string} */
  let outcome;
  let updated = false;
  if (target === null) {
    outcome = "Rebooted, but did NOT update: could not fetch main from GitHub.";
  } else if (!builds(target)) {
    outcome = `Reboot onto ${short(target)} failed to build; running ${short(bootSha)}. Log: ${LOG}`;
  } else {
    const branch = git(["symbolic-ref", "--short", "-q", "HEAD"]);
    const decision = fastForwardDecision({
      branch: branch.code === 0 ? branch.stdout.trim() : null,
      dirty: git(["status", "--porcelain", "--untracked-files=no"]).stdout.trim() !== "",
      fastForward: git(["merge-base", "--is-ancestor", "HEAD", target]).code === 0,
    });
    if (!decision.update) {
      outcome = `Rebooted, but did NOT update: ${decision.reason}.`;
    } else if (git(["merge", "--ff-only", "-q", target]).code !== 0) {
      outcome = `Rebooted, but did NOT update: the fast-forward to ${short(target)} failed.`;
    } else {
      updated = true;
      const subjects = git(["log", "--format=%s", `${bootSha}..HEAD`, "--", ...COMPANY_PATHSPECS])
        .stdout.trim()
        .split("\n")
        .filter((line) => line !== "");
      outcome = `Rebooted onto ${short(target)}: ${subjects.join("; ") || "no company commits"}.`;
    }
  }

  // What this boot loaded. claude-llc puts the note in the manager's first
  // prompt, and the manager tells everyone; hubd reads sha and at for the
  // next reboot.
  log(outcome);
  fs.writeFileSync(
    path.join(ROOT, "boot.json"),
    `${JSON.stringify({
      sha: git(["rev-parse", "HEAD"]).stdout.trim(),
      at: Date.now(),
      previousSha: bootSha,
      updated,
      note: outcome,
    })}\n`,
  );
  fs.rmSync(REBOOTING, { force: true });

  const started = devenv(["claude-llc", "up"], REPO);
  if (started !== 0) {
    log(`the company did not come back up (exit ${String(started)})`);
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  log(`restart failed: ${error instanceof Error ? (error.stack ?? error.message) : "?"}`);
  process.exitCode = 1;
}
