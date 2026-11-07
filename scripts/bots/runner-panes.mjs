#!/usr/bin/env node
/**
 * The CI-RUNNERS window's panes (#2729): one per alive runner, each tailing
 * its log, so the operator sees every runner at once.
 *
 * Runs as the run-forever daemon `runner-panes`, in the window's first
 * pane, which hub-window.mjs opens. Every 2 s it reads the runner log index
 * (`runnerLogIndex` in runner-logs.mjs) and reconciles the window to it:
 *
 * - one pane, above the rest, tailing the runner supervisor's log;
 * - one pane per alive runner, titled with its name, running
 *   `runner-tail.mjs <its log>`;
 * - a runner that exited keeps its pane 60 s, its last lines readable, and
 *   then the pane is killed;
 * - after any change, `select-layout tiled`;
 * - with no runner up, it says once in its own pane why: "no runners up:
 *   <reason>", from the runner supervisor's status file.
 *
 * A pane it opens carries the pane option `@vibewars-runner-pane` set to
 * the runner's name, which no program in the pane can change (a title it
 * can). Only those panes are adopted after a restart and only those are ever
 * killed: a pane someone else opened in the window is left alone.
 *
 * Read-only: the panes only tail files, and no input reaches a runner. The
 * runner supervisor knows nothing of tmux.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { RUNNERS_INDEX, run } from "./hub-window.mjs";
import { readStatus, runnersStateDir } from "./runners-state.mjs";

/** How long an exited runner's pane stays. */
export const KEEP_MS = 60_000;
export const TICK_MS = 2_000;
/** The pane option that marks a pane as this daemon's, set to what it shows. */
export const MARK = "@vibewars-runner-pane";
/** The mark of the supervisor's pane: no runner name has a colon. */
export const SUPERVISOR = ":supervisor";

/**
 * @typedef {object} RunnerLog what runner-logs.mjs's `runnerLogIndex` lists
 * @property {string} name
 * @property {string} file
 * @property {boolean} alive
 * @property {number | null} exitCode
 */

/**
 * @typedef {object} PaneDeps
 * @property {(args: string[]) => { code: number, stdout: string }} tmux
 * @property {() => RunnerLog[]} index
 * @property {() => number} now
 * @property {() => string} reason why no runner is up
 * @property {(line: string) => void} say a line in this daemon's own pane
 * @property {(file: string) => string} tail the shell command that tails `file`
 * @property {string} window the CI-RUNNERS window, as a tmux target
 * @property {string | null} self this daemon's own pane, the one the others split from
 * @property {string} cwd
 * @property {string} supervisorLog
 */

/**
 * @param {PaneDeps} deps
 * @returns {{ tick: () => void }}
 */
export function paneReconciler(deps) {
  /** @type {Map<string, number>} runner name → when its pane was first seen with it exited */
  const exited = new Map();
  /** @type {string | null} */
  let said = null;

  /**
   * Opens a pane tailing `file`, marked `mark` and titled `title`.
   *
   * @param {string} mark
   * @param {string} title
   * @param {string} file
   * @param {boolean} above
   * @returns {boolean}
   */
  function open(mark, title, file, above) {
    const split = () =>
      deps.tmux([
        "split-window",
        ...["-d", ...(above ? ["-b"] : []), "-P", "-F", "#{pane_id}"],
        ...["-t", deps.self ?? deps.window, "-c", deps.cwd],
        deps.tail(file),
      ]);
    let pane = split();
    if (pane.code !== 0) {
      // Most likely no room left to split: lay out what is there, try once more.
      deps.tmux(["select-layout", "-t", deps.window, "tiled"]);
      pane = split();
    }
    if (pane.code !== 0) {
      return false;
    }
    const id = pane.stdout.trim();
    deps.tmux(["set-option", "-p", "-t", id, MARK, mark]);
    deps.tmux(["select-pane", "-t", id, "-T", title]);
    return true;
  }

  return {
    tick() {
      const listed = deps.tmux(["list-panes", "-t", deps.window, "-F", `#{pane_id}\t#{${MARK}}`]);
      if (listed.code !== 0) {
        return; // the window is gone; claude-llc reopens it
      }
      /** @type {Map<string, string>} mark → pane id, of the panes this opened */
      const ours = new Map();
      for (const line of listed.stdout.split("\n")) {
        const [id = "", mark = ""] = line.split("\t");
        if (id !== "" && mark !== "") {
          ours.set(mark, id);
        }
      }
      const runners = deps.index();
      const byName = new Map(runners.map((runner) => [runner.name, runner]));
      let changed = false;

      if (!ours.has(SUPERVISOR)) {
        changed = open(SUPERVISOR, "runner-supervisor", deps.supervisorLog, true) || changed;
      }
      for (const runner of runners) {
        if (runner.alive && !ours.has(runner.name)) {
          changed = open(runner.name, runner.name, runner.file, false) || changed;
        }
      }
      for (const [mark, id] of ours) {
        if (mark === SUPERVISOR) {
          continue;
        }
        const runner = byName.get(mark);
        if (runner?.alive === true) {
          exited.delete(mark);
          continue;
        }
        const since = exited.get(mark);
        if (since === undefined) {
          exited.set(mark, deps.now());
          const code = runner?.exitCode;
          deps.tmux([
            "select-pane",
            ...["-t", id, "-T", `${mark} (exited${code == null ? "" : ` ${String(code)}`})`],
          ]);
        } else if (deps.now() - since >= KEEP_MS) {
          deps.tmux(["kill-pane", "-t", id]);
          exited.delete(mark);
          changed = true;
        }
      }
      for (const name of exited.keys()) {
        if (!ours.has(name)) {
          exited.delete(name);
        }
      }
      if (changed) {
        deps.tmux(["select-layout", "-t", deps.window, "tiled"]);
      }

      const up = runners.filter((runner) => runner.alive).length;
      const line = up === 0 ? `no runners up: ${deps.reason()}` : `runners up: ${String(up)}`;
      if (line !== said) {
        deps.say(line);
        said = line;
      }
    },
  };
}

/**
 * Why no runner is up, as the runner supervisor's status says.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function noRunnersReason(env) {
  const status = readStatus(runnersStateDir(env));
  if (status === null) {
    return "the runner supervisor has not written a status";
  }
  if (status.reason !== null) {
    return status.reason;
  }
  return status.target === 0
    ? "the target is 0 (company runners <n>)"
    : `${String(status.target)} wanted, none started yet`;
}

/**
 * @param {string} text
 * @returns {string} `text` as one shell word
 */
function quote(text) {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tmux = process.env.VIBEWARS_TMUX ?? "";
  const session = process.env.VIBEWARS_LLC_SESSION ?? "";
  if (tmux === "" || session === "") {
    console.error(
      "runner-panes: VIBEWARS_TMUX and VIBEWARS_LLC_SESSION must be set; hub-window starts this",
    );
    process.exit(2);
  }
  const root = process.env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
  const logs = path.join(root, "hub", "runners");
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  // Loaded here, not at the top, so the tests need none of it.
  const { runnerLogIndex } = await import("./runner-logs.mjs");
  const panes = paneReconciler({
    tmux: (args) => run(tmux, args),
    index: () => runnerLogIndex(logs, Date.now()),
    now: () => Date.now(),
    reason: () => noRunnersReason(process.env),
    say: (line) => {
      console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
    },
    tail: (file) =>
      `${quote(process.execPath)} ${quote(path.join(scripts, "runner-tail.mjs"))} ${quote(file)}`,
    window: `=${session}:${RUNNERS_INDEX}`,
    self: process.env.TMUX_PANE ?? null,
    cwd: root,
    supervisorLog: path.join(root, "hub", "runner-supervisor.log"),
  });
  for (;;) {
    try {
      panes.tick();
    } catch (error) {
      console.error(`runner-panes: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(TICK_MS);
  }
}
