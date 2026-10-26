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
 *   2. fetches GitHub's `main` into hubd's mirror and checks that it builds,
 *      from an archive of it, never a checkout;
 *   3. fast-forwards the operator's checkout to exactly that commit, only if
 *      that is safe (reboot.mjs, `fastForwardDecision`) and it built;
 *   4. records what it loaded, or plainly why it did not, in
 *      `.bots/boot.json`, whose note claude-llc puts in the manager's first
 *      prompt so the manager can tell everyone;
 *   5. starts the company again with
 *      `devenv shell --refresh-eval-cache -- claude-llc up`, so nix rebuilds
 *      every script and briefing from the code now checked out.
 *
 * A main that does not build is never checked out: the company comes back on
 * the code it had, and the operator is told. The company must not stay down
 * because of a bad merge.
 *
 * The operator's checkout shares its `.git` with every agent's worktree, so
 * nothing about where `main` comes from is taken from it: the fetch and the
 * build happen in hubd's mirror, which no jail can write, and the commit
 * fetched into the checkout must be the mirror's, or it is not used. Every
 * git run in the checkout is hardened (git-hardening.mjs), including against
 * the filter drivers its config names. The agents are all stopped first, so
 * that config cannot change while this runs.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { FILTER_KEYS, GIT_ENV, GIT_HARDENING, filterPins } from "./git-hardening.mjs";
import { hostPath } from "./host-path.mjs";
import { api } from "./link.mjs";
import { obj, parseRegistry } from "./protocol.mjs";
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
/** The session, exactly: tmux takes a bare name as a prefix if nothing has it whole. */
const TARGET = `=${SESSION}`;
/**
 * The tmux the session runs on, as claude-llc passes it: not whatever is on
 * PATH. Checked in main(), so that a missing one is logged.
 */
const TMUX = process.env.VIBEWARS_TMUX ?? "";
const REBOOTING = path.join(ROOT, "rebooting.json");
const LOG = path.join(ROOT, "hub", "reboot.log");
const CHECK = path.join(ROOT, "reboot-check");
/** hubd's own clone (hubd.mjs): no jail can write its config. */
const MIRROR = path.join(ROOT, "hub", ".git-mirror");

/** How long the company gets to exit before what is left is killed. */
const STOP_TIMEOUT_MS = 15_000;
/** How long the tmux session gets to go after each kill-session, which is synchronous. */
const SESSION_TIMEOUT_MS = 1_000;
/** Kill-session, then its panes' processes, then once more both. */
const SESSION_ATTEMPTS = 3;

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
  // A command that could not even start must not pass for one that ran and
  // found nothing to do (#315).
  if (result.error !== undefined) {
    log(`${file} ${args.join(" ")}: ${result.error.message}`);
  }
  if (stderr.trim() !== "") {
    log(`${file} ${args.join(" ")}: ${stderr.trim()}`);
  }
  return { code: result.status ?? 1, stdout };
}

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
 * @returns {number} its exit code
 */
function devenv(args, cwd) {
  log(`devenv shell --refresh-eval-cache -- ${args.join(" ")}`);
  const out = fs.openSync(LOG, "a");
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
 * git in hubd's mirror, hardened like hubd's own.
 *
 * @param {string[]} args
 * @returns {{ code: number, stdout: string }}
 */
function mirror(args) {
  return run("git", [...GIT_HARDENING, `--git-dir=${MIRROR}`, ...args], { env: GIT_ENV });
}

/**
 * git in the operator's checkout: hardened, and with every filter driver its
 * config names pinned empty. Read once, after the agents have stopped.
 *
 * @returns {(args: string[]) => { code: number, stdout: string }}
 */
function checkoutGit() {
  const base = [...GIT_HARDENING, "-C", REPO];
  const pins = filterPins(
    run("git", [...base, "config", "--get-regexp", FILTER_KEYS], { env: GIT_ENV }).stdout,
  );
  return (args) => run("git", [...base, ...pins, ...args], { env: GIT_ENV });
}

/**
 * @param {string} pattern for `pgrep -f`
 * @returns {boolean}
 */
function running(pattern) {
  return run("pgrep", ["-f", pattern]).code === 0;
}

/** @returns {boolean} */
function sessionUp() {
  return run(TMUX, ["has-session", "-t", TARGET]).code === 0;
}

/**
 * Kill the tmux session, and check that it is gone (#315): a session that
 * survives is the old company, and `claude-llc up` would join it. Each
 * attempt that leaves it standing kills the processes in its panes, which
 * closes them, and the session with its last one.
 *
 * @returns {Promise<boolean>} whether it is gone
 */
async function stopSession() {
  for (let attempt = 1; attempt <= SESSION_ATTEMPTS; attempt += 1) {
    run(TMUX, ["kill-session", "-t", TARGET]);
    const until = Date.now() + SESSION_TIMEOUT_MS;
    while (Date.now() < until && sessionUp()) {
      await sleep(250);
    }
    if (!sessionUp()) {
      return true;
    }
    log(
      `tmux session ${SESSION} survived kill-session (attempt ${String(attempt)}); killing its panes`,
    );
    const panes = run(TMUX, ["list-panes", "-s", "-t", TARGET, "-F", "#{pane_pid}"]);
    for (const pid of panes.stdout
      .split("\n")
      .map(Number)
      .filter((n) => n > 0)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Gone already.
      }
    }
  }
  log(`tmux session ${SESSION} would not stop`);
  return false;
}

/** @returns {Promise<boolean>} whether the tmux session is gone */
async function stopCompany() {
  const stopped = await stopSession();
  // The jails are recognised by their worktree binds, which no other
  // process on the machine carries.
  // The loops first, so stopping what they run does not restart it: an
  // agent's (#315) and the daemons' (#23). Killing the session has usually
  // stopped them already.
  const patterns = [
    "claude-llc-agent",
    "run-forever.mjs",
    "hubd.mjs",
    "supervisor.mjs",
    "link.mjs serve",
    `${ROOT}/wt/`,
  ];
  for (const pattern of patterns.slice(0, -1)) {
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
  return stopped;
}

/**
 * Does this commit build? Checked in a scratch directory unpacked from the
 * mirror with `git archive`: no checkout, so no filter or hook of any
 * repository runs, and the operator's checkout only ever moves to a commit
 * already known to work.
 *
 * @param {string} sha
 * @returns {boolean}
 */
function builds(sha) {
  fs.rmSync(CHECK, { recursive: true, force: true });
  fs.mkdirSync(CHECK, { recursive: true });
  try {
    const archive = spawnSync("git", [...GIT_HARDENING, `--git-dir=${MIRROR}`, "archive", sha], {
      env: { ...process.env, ...GIT_ENV },
      maxBuffer: 1024 * 1024 * 1024,
    });
    if (archive.status !== 0) {
      log(`git archive ${sha}: exit ${String(archive.status)}`);
      return false;
    }
    if (spawnSync("tar", ["-x", "-C", CHECK], { input: archive.stdout }).status !== 0) {
      log(`could not unpack ${sha}`);
      return false;
    }
    return devenv(["claude-llc", "--help"], CHECK) === 0;
  } finally {
    fs.rmSync(CHECK, { recursive: true, force: true });
  }
}

/**
 * @param {string} sha
 * @returns {string}
 */
function short(sha) {
  return sha.slice(0, 8);
}

/**
 * Move the operator's checkout to `target`, if that is safe.
 *
 * @param {(args: string[]) => { code: number, stdout: string }} git
 * @param {string} target the commit the mirror fetched from GitHub and built
 * @returns {{ updated: boolean, why: string }}
 */
function update(git, target) {
  // From the mirror, and then checked: a URL rewrite in the checkout's
  // config could hand back any commit, and only the mirror's is reviewed.
  if (git(["fetch", "-q", "--no-tags", MIRROR, "refs/heads/main"]).code !== 0) {
    return { updated: false, why: "could not fetch main from hubd's mirror" };
  }
  const fetched = git(["rev-parse", "FETCH_HEAD"]).stdout.trim();
  if (fetched !== target) {
    return {
      updated: false,
      why: `fetching main from hubd's mirror gave ${short(fetched)}, not ${short(target)}`,
    };
  }
  const branch = git(["symbolic-ref", "--short", "-q", "HEAD"]);
  const decision = fastForwardDecision({
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    dirty: git(["status", "--porcelain", "--untracked-files=no"]).stdout.trim() !== "",
    fastForward: git(["merge-base", "--is-ancestor", "HEAD", target]).code === 0,
  });
  if (!decision.update) {
    return { updated: false, why: decision.reason };
  }
  if (git(["merge", "--ff-only", "-q", target]).code !== 0) {
    return { updated: false, why: `the fast-forward to ${short(target)} failed` };
  }
  return { updated: true, why: "" };
}

async function main() {
  if (TMUX === "") {
    throw new Error("VIBEWARS_TMUX is not set; claude-llc starts this");
  }
  const reboot = obj(JSON.parse(fs.readFileSync(REBOOTING, "utf8")));
  const bootSha = typeof reboot.bootSha === "string" ? reboot.bootSha : "HEAD";
  const company = obj(JSON.parse(fs.readFileSync(path.join(ROOT, "company.json"), "utf8")));
  const repo = typeof company.repo === "string" ? company.repo : "";
  log(`reboot: ${String(reboot.reason)}`);

  if (!(await stopCompany())) {
    // `claude-llc up` would join the old company: better down and said so
    // than up on the old code and called a reboot (#315).
    await tellOperator(
      `Reboot FAILED: tmux session ${SESSION} would not stop; the company was not restarted.`,
    );
    process.exitCode = 1;
    return;
  }
  // A reboot starts every agent on a fresh conversation, with the kickoff
  // prompt: the sessions to resume go with the restart loops' state.
  fs.rmSync(path.join(ROOT, "agents"), { recursive: true, force: true });
  const git = checkoutGit();

  // GitHub's main, by URL, into the mirror. VIBEWARS_GIT_REMOTE is the
  // host's to set, as for hubd: a test points it at a local bare repository.
  const remote = process.env.VIBEWARS_GIT_REMOTE ?? `git@github.com:${repo}.git`;
  if (!fs.existsSync(MIRROR)) {
    run("git", ["init", "--bare", "-q", MIRROR], { env: GIT_ENV });
  }
  /** @type {string | null} */
  let target = null;
  if (mirror(["fetch", "-q", "--no-tags", remote, "+refs/heads/main:refs/heads/main"]).code === 0) {
    target = mirror(["rev-parse", "refs/heads/main"]).stdout.trim();
  }

  /** @type {string} */
  let outcome;
  let updated = false;
  if (target === null) {
    outcome = "Rebooted, but NOT updated: could not fetch main from GitHub.";
  } else if (!builds(target)) {
    outcome = `Rebooted, but NOT updated: main ${short(target)} failed to build; running ${short(bootSha)}. Log: ${LOG}`;
  } else {
    const result = update(git, target);
    updated = result.updated;
    if (!updated) {
      outcome = `Rebooted, but NOT updated: ${result.why}.`;
    } else {
      const subjects = mirror([
        "log",
        "--format=%s",
        `${bootSha}..${target}`,
        "--",
        ...COMPANY_PATHSPECS,
      ])
        .stdout.trim()
        .split("\n")
        .filter((line) => line !== "");
      outcome = `Rebooted onto ${short(target)}: ${subjects.join("; ") || "no company commits"}.`;
    }
  }

  // What this boot loaded. claude-llc puts the note in the manager's first
  // prompt, and the manager tells everyone; hubd reads sha and at for the
  // next reboot.
  const sha = git(["rev-parse", "HEAD"]).stdout.trim();
  /** @param {string} note */
  const record = (note) => {
    log(note);
    fs.writeFileSync(
      path.join(ROOT, "boot.json"),
      `${JSON.stringify({ sha, at: Date.now(), previousSha: bootSha, updated, note })}\n`,
    );
  };
  record(outcome);

  // Once more if it fails, from a stopped company again: whatever made it
  // fail may have left half a company running (#315).
  let started = devenv(["claude-llc", "up"], REPO);
  /** @type {string | null} */
  let failure = null;
  if (started !== 0) {
    log(`the company did not come back up (exit ${String(started)}); stopping it to try once more`);
    if (!(await stopCompany())) {
      failure = `claude-llc up exited ${String(started)}, and then tmux session ${SESSION} would not stop`;
    } else {
      // In the manager's first prompt, if this try works.
      record(
        `${outcome} It came up on the second try: the first claude-llc up exited ${String(started)}.`,
      );
      started = devenv(["claude-llc", "up"], REPO);
      if (started !== 0) {
        failure = `claude-llc up exited ${String(started)}, twice`;
      }
    }
  }
  if (failure !== null) {
    record(`Reboot FAILED: ${failure}. ${outcome}`);
    await tellOperator(
      `Reboot FAILED: ${failure}. Restart by hand: claude-llc stop, then claude-llc.`,
    );
    process.exitCode = 1;
  }
}

/**
 * Straight to the operator's topic, with the company bot's token (#315):
 * the reboot failed, so no sidecar is running to carry a message.
 * claude-llc-restart passes the token, as claude-bot passes it to the
 * sidecar; without one configured there is only the log.
 *
 * @param {string} text
 * @returns {Promise<void>}
 */
async function tellOperator(text) {
  const token = process.env.TELEGRAM_MANAGER_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  if (token === "" || chatId === "") {
    log("no Telegram token or chat configured; the operator is told only here");
    return;
  }
  const registry = path.join(ROOT, "registry.json");
  const topic = parseRegistry(fs.existsSync(registry) ? fs.readFileSync(registry, "utf8") : null)
    .registry.operator?.topicId;
  try {
    await api(token, "sendMessage", {
      chat_id: chatId,
      text: `${text} Log: ${LOG}`,
      ...(topic === undefined ? {} : { message_thread_id: topic }),
    });
    log("told the operator on Telegram");
  } catch (error) {
    log(`could not tell the operator on Telegram: ${error instanceof Error ? error.message : "?"}`);
  }
}

try {
  await main();
} catch (error) {
  log(`restart failed: ${error instanceof Error ? (error.stack ?? error.message) : "?"}`);
  process.exitCode = 1;
} finally {
  // Only now, with the company up or the failure recorded in boot.json: a
  // plain claude-llc waits while it exists (reboot-wait.mjs, #557), so it
  // cannot start the old build into the gap between the stop and the up.
  fs.rmSync(REBOOTING, { force: true });
}
