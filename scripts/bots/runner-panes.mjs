#!/usr/bin/env node
/**
 * The CI-RUNNERS window's daemon (#2729), under run-forever: every 2 s it
 * reads which runners are alive and keeps one pane per runner, each
 * following that runner's log (runner-tail.mjs), above the supervisor's own
 * log. A runner that exited keeps its pane for 60 s, so its last lines can
 * be read, then the pane goes. It only ever kills panes it made, and
 * tracks them by title. The supervisor has no tmux dependency: this does.
 *
 * Its own pane, the first, says "no runners up: <reason>" while none is.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { runnerLogIndex } from "./runner-logs.mjs";
import { readStatus, runnersStateDir } from "./runners-state.mjs";

export const POLL_MS = 2_000;
export const EXITED_KEEP_MS = 60_000;
export const SUPERVISOR_TITLE = "SUPERVISOR LOG";

/**
 * @typedef {object} Pane
 * @property {string} id
 * @property {number | null} exitedAt null while its runner is alive
 */

/**
 * @typedef {object} Deps
 * @property {(args: string[]) => string} tmux runs tmux, returns stdout
 * @property {() => number} now
 * @property {string} window the window's id
 * @property {string} logDir
 * @property {string} supervisorLog
 * @property {string} tail the runner-tail.mjs command, up to the file
 * @property {() => string[]} alive names of the runners up
 * @property {(line: string) => void} say
 * @property {() => string | null} reason why no runner is up, if the status says
 */

/**
 * One reconciliation. `panes` is the state: title to pane, only ours.
 *
 * @param {Map<string, Pane>} panes
 * @param {Deps} deps
 * @returns {void}
 */
export function reconcile(panes, deps) {
  const { tmux, now, window } = deps;
  const open = new Set(
    tmux(["list-panes", "-t", window, "-F", "#{pane_id}"])
      .split("\n")
      .filter((id) => id !== ""),
  );
  // Closed by hand: forget it, and make it again if its runner still runs.
  for (const [title, pane] of panes) {
    if (!open.has(pane.id)) {
      panes.delete(title);
    }
  }
  let changed = false;
  /**
   * @param {string} title
   * @param {string} file
   */
  const add = (title, file) => {
    const id = tmux([
      ...["split-window", "-d", "-P", "-F", "#{pane_id}", "-t", window],
      `${deps.tail} ${file}`,
    ]).trim();
    tmux(["select-pane", "-t", id, "-T", title]);
    panes.set(title, { id, exitedAt: null });
    changed = true;
  };
  if (!panes.has(SUPERVISOR_TITLE)) {
    add(SUPERVISOR_TITLE, deps.supervisorLog);
  }
  const alive = new Set(deps.alive());
  for (const name of alive) {
    const pane = panes.get(name);
    if (pane === undefined) {
      add(name, path.join(deps.logDir, `${name}.log`));
    } else {
      pane.exitedAt = null;
    }
  }
  for (const [title, pane] of panes) {
    if (title === SUPERVISOR_TITLE || alive.has(title)) {
      continue;
    }
    pane.exitedAt ??= now();
    if (now() - pane.exitedAt >= EXITED_KEEP_MS) {
      tmux(["kill-pane", "-t", pane.id]);
      panes.delete(title);
      changed = true;
    }
  }
  if (changed) {
    tmux(["select-layout", "-t", window, "tiled"]);
  }
  if (alive.size === 0) {
    deps.say(`no runners up: ${deps.reason() ?? "no reason given"}`);
  }
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const env = process.env;
  const tmuxBin = env.VIBEWARS_TMUX ?? "tmux";
  const pane = env.TMUX_PANE;
  const root = env.VIBEWARS_BOT_ROOT ?? path.join(process.cwd(), ".bots");
  const state = runnersStateDir(env);
  const logDir = path.join(root, "hub", "runners");
  /** @param {string[]} args */
  const tmux = (args) => {
    const result = spawnSync(tmuxBin, args, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`tmux ${args.join(" ")}: ${result.stderr.trim()}`);
    }
    return result.stdout;
  };
  if (pane === undefined) {
    console.error("runner-panes: TMUX_PANE is not set; run it in a tmux pane");
    process.exit(1);
  }
  const window = tmux(["display-message", "-p", "-t", pane, "#{window_id}"]).trim();
  const here = path.dirname(fileURLToPath(import.meta.url));
  /** @type {Map<string, Pane>} */
  const panes = new Map();
  let lastSaid = "";
  const deps = {
    tmux,
    now: () => Date.now(),
    window,
    logDir,
    supervisorLog: path.join(root, "hub", "runner-supervisor.log"),
    tail: `${process.execPath} ${here}/runner-tail.mjs`,
    alive: () => {
      const up = readStatus(state)?.runners.map((runner) => runner.name);
      return runnerLogIndex(logDir)
        .filter((entry) => entry.exitCode === null && (up === undefined || up.includes(entry.name)))
        .map((entry) => entry.name);
    },
    reason: () => readStatus(state)?.reason ?? null,
    say: (/** @type {string} */ line) => {
      if (line !== lastSaid) {
        console.log(line);
        lastSaid = line;
      }
    },
  };
  for (;;) {
    reconcile(panes, deps);
    await sleep(POLL_MS);
  }
}
