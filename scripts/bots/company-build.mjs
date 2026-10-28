/**
 * Does a commit build? Shared by the reboot's restarter and `claude-llc lock`
 * (#897): the same check, so a locked commit is one a reboot would load.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";
import { hostPath } from "./host-path.mjs";

/**
 * `devenv shell`, as the operator would start it from a fresh terminal:
 * without the variables of the devenv shell this process inherited, so the
 * new shell is built from the checkout it runs in and nothing else. That
 * includes PATH: devenv prepends to the PATH it finds, so starting it with
 * this one would nest every reboot's shell inside the last, until PATH is
 * too long for tmux and the company cannot come up (host-path.mjs).
 *
 * Always with `--refresh-eval-cache`. devenv's evaluation cache only tracks
 * the .nix and devenv files, not `scripts/bots`, which enters the store as a
 * path literal (ADR-0014): a merge that changed only .mjs files would
 * otherwise come back up on the cached evaluation, running the old scripts.
 * Refreshing also leaves the cache right for the operator's next shell.
 *
 * Its output goes straight to the log, not through a pipe: `claude-llc up`
 * leaves daemons running, and a pipe they inherited would never close.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @param {string} logFile
 * @param {(line: string) => void} log
 * @returns {number} its exit code
 */
export function devenvShell(args, cwd, logFile, log) {
  log(`devenv shell --refresh-eval-cache -- ${args.join(" ")}`);
  const out = fs.openSync(logFile, "a");
  try {
    const result = spawnSync("devenv", ["shell", "--refresh-eval-cache", "--", ...args], {
      cwd,
      env: {
        ...Object.fromEntries(
          // Nor the bot token, which is the restarter's alone: the tmux
          // server claude-llc starts would hand it to every pane.
          Object.entries(process.env).filter(
            ([name]) =>
              !name.startsWith("DEVENV_") &&
              !name.startsWith("TELEGRAM_") &&
              name !== "IN_NIX_SHELL",
          ),
        ),
        PATH: hostPath(process.env.PATH ?? ""),
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
 * Does this commit build? Checked in a scratch directory unpacked from the
 * mirror with `git archive`: no checkout, so no filter or hook of any
 * repository runs, and the operator's checkout only ever moves to a commit
 * already known to work.
 *
 * @param {{ mirror: string, scratch: string, logFile: string, log: (line: string) => void }} where
 * @param {string} sha
 * @returns {boolean}
 */
export function builds({ mirror, scratch, logFile, log }, sha) {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  try {
    const archive = spawnSync("git", [...GIT_HARDENING, `--git-dir=${mirror}`, "archive", sha], {
      env: { ...process.env, ...GIT_ENV },
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (archive.status !== 0) {
      log(`git archive ${sha}: exit ${String(archive.status)}`);
      return false;
    }
    if (spawnSync("tar", ["-x", "-C", scratch], { input: archive.stdout }).status !== 0) {
      log(`could not unpack ${sha}`);
      return false;
    }
    // The scratch sits inside the operator's checkout. Without a repository of
    // its own, devenv installs the git hooks into that one, pointing them at a
    // config no worktree has, so every commit there fails.
    // Staged, because nix reads only tracked files from a git tree.
    for (const args of [
      ["init", "-q"],
      ["add", "-A"],
    ]) {
      const step = spawnSync("git", [...GIT_HARDENING, "-C", scratch, ...args], {
        env: { ...process.env, ...GIT_ENV },
      });
      if (step.status !== 0) {
        log("scratch repository: git " + String(args[0]) + " failed");
        return false;
      }
    }
    return devenvShell(["claude-llc", "--help"], scratch, logFile, log) === 0;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
