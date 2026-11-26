#!/usr/bin/env node
/**
 * The hub window (#23): hubd on top, the supervisor below, and the runner
 * supervisor (#1890) below that, each under run-forever, which shows its
 * output, restarts it whenever it exits and tells everyone if it
 * crash-loops. This is the only way any of them starts.
 *
 * After it, at index 100, the CI-RUNNERS window (#2729): its first pane runs
 * the `runner-panes` daemon, also under run-forever, which opens a pane per
 * runner tailing its log (runner-panes.mjs).
 *
 *   hub-window.mjs open    open both, replacing whatever is at 99 and 100
 *   hub-window.mjs check   exit 0 if both are there, 1 if not
 *
 * Index 99 keeps it last however many role windows open after it. `open`
 * replaces a window already at 99 rather than failing on it (#315): the
 * company must never be left with hubd stopped and nothing to restart it.
 * The windows' names are pinned, so `check` can tell them from anything else.
 *
 * claude-llc runs it, with VIBEWARS_TMUX set to the tmux the session runs
 * on, and the variables the daemons read in its environment.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { uniquePath } from "./host-path.mjs";

export const HUB_INDEX = "99";
export const HUB_NAME = "hub";
export const RUNNERS_INDEX = "100";
export const RUNNERS_NAME = "CI-RUNNERS";

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

/**
 * @param {string} tmux
 * @param {string[]} args
 * @returns {{ code: number, stdout: string }}
 */
export function run(tmux, args) {
  const result = spawnSync(tmux, args, { encoding: "utf8" });
  if (result.error !== undefined) {
    throw new Error(`${tmux} ${args.join(" ")}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
  }
  return { code: result.status ?? 1, stdout: result.stdout };
}

/**
 * Are the hub window at 99 and the CI-RUNNERS window at 100 both there?
 * Whatever else sits at either, or one that lost its name, is not.
 *
 * @param {string} tmux
 * @param {string} session
 * @returns {boolean}
 */
export function hubWindowUp(tmux, session) {
  const windows = run(tmux, [
    "list-windows",
    "-t",
    `=${session}`,
    "-F",
    "#{window_index} #{window_name}",
  ]);
  const lines = windows.stdout.split("\n");
  return (
    lines.includes(`${HUB_INDEX} ${HUB_NAME}`) && lines.includes(`${RUNNERS_INDEX} ${RUNNERS_NAME}`)
  );
}

/**
 * @param {string} tmux
 * @param {string} session
 * @returns {void}
 */
export function openHubWindow(tmux, session) {
  const root = required("DEVENV_ROOT");
  const botRoot = required("VIBEWARS_BOT_ROOT");
  const node = process.execPath;
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  // A pane gets the tmux server's environment, not this script's, so what
  // the daemons read is passed on explicitly: hubd needs DEVENV_ROOT and VIBEWARS_CODE, the
  // agents' Claude logs for `company load` (#747), and gh and git on PATH. Each PATH entry once: tmux refuses a command over 16 KB,
  // and a PATH from nested nix shells repeats most of itself (host-path.mjs).
  const env = [
    `DEVENV_ROOT=${root}`,
    `VIBEWARS_CODE=${required("VIBEWARS_CODE")}`,
    `VIBEWARS_BOT_ROOT=${botRoot}`,
    `VIBEWARS_BOT_BUS=${path.join(botRoot, "bus")}`,
    `VIBEWARS_LLC_SESSION=${session}`,
    `VIBEWARS_LLC_RESTART=${required("VIBEWARS_LLC_RESTART")}`,
    `VIBEWARS_CLAUDE_BOXES=${required("VIBEWARS_CLAUDE_BOXES")}`,
    `VIBEWARS_TMUX=${tmux}`,
    // The runner supervisor's config (#1890); its max is in company.json (#2764).
    ...[
      "VIBEWARS_RUNNER_CPUS",
      "VIBEWARS_RUNNER_MEMORY_GIB",
      "VIBEWARS_RUNNER_TASKS_MAX",
      "VIBEWARS_RUNNER_SCRATCH",
    ].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [`${name}=${value}`];
    }),
    `PATH=${uniquePath(process.env.PATH ?? "")}`,
  ].flatMap((pair) => ["-e", pair]);
  const daemon = (/** @type {string} */ name) =>
    `${node} ${scripts}/run-forever.mjs ${name} -- ${node} ${scripts}/${name}.mjs`;

  const hubd = run(tmux, [
    "new-window",
    ...["-d", "-k", "-P", "-F", "#{pane_id}"],
    ...["-t", `=${session}:${HUB_INDEX}`, "-n", HUB_NAME, "-c", root],
    ...env,
    daemon("hubd"),
  ]);
  if (hubd.code !== 0) {
    throw new Error(`could not open the hub window at ${session}:${HUB_INDEX}`);
  }
  const hubdPane = hubd.stdout.trim();
  const supervisor = run(tmux, [
    "split-window",
    ...["-v", "-P", "-F", "#{pane_id}", "-t", hubdPane, "-c", root],
    ...env,
    daemon("supervisor"),
  ]);
  if (supervisor.code !== 0) {
    throw new Error("could not open the supervisor's pane in the hub window");
  }
  // Where the runners' token is: its pane alone is told, never hubd's.
  const credentials = process.env.VIBEWARS_CREDENTIALS;
  const runners = run(tmux, [
    "split-window",
    ...["-v", "-l", "25%", "-P", "-F", "#{pane_id}", "-t", supervisor.stdout.trim(), "-c", root],
    ...env,
    ...(credentials === undefined ? [] : ["-e", `VIBEWARS_CREDENTIALS=${credentials}`]),
    daemon("runner-supervisor"),
  ]);
  if (runners.code !== 0) {
    throw new Error("could not open the runner supervisor's pane in the hub window");
  }
  run(tmux, ["select-pane", "-t", hubdPane, "-T", "HUBD"]);
  run(tmux, ["select-pane", "-t", supervisor.stdout.trim(), "-T", "SUPERVISOR"]);
  run(tmux, ["select-pane", "-t", runners.stdout.trim(), "-T", "RUNNERS"]);
  pinWindow(tmux, hubdPane);

  // The runners' window: runner-panes opens the rest of its panes.
  const panes = run(tmux, [
    "new-window",
    ...["-d", "-k", "-P", "-F", "#{pane_id}"],
    ...["-t", `=${session}:${RUNNERS_INDEX}`, "-n", RUNNERS_NAME, "-c", root],
    ...env,
    daemon("runner-panes"),
  ]);
  if (panes.code !== 0) {
    throw new Error(`could not open the CI-RUNNERS window at ${session}:${RUNNERS_INDEX}`);
  }
  const panesPane = panes.stdout.trim();
  run(tmux, ["select-pane", "-t", panesPane, "-T", "RUNNER-PANES"]);
  pinWindow(tmux, panesPane);
}

/**
 * The name is how `check` finds a window: nothing may rename it. Each pane
 * shows its title on its border.
 *
 * @param {string} tmux
 * @param {string} pane any pane of the window
 * @returns {void}
 */
function pinWindow(tmux, pane) {
  for (const [option, value] of [
    ["automatic-rename", "off"],
    ["allow-rename", "off"],
    ["pane-border-status", "top"],
    ["pane-border-format", " #[bold]#{pane_title}#[nobold] "],
  ]) {
    run(tmux, ["set-option", "-w", "-t", pane, option, value]);
  }
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tmux = required("VIBEWARS_TMUX");
  const session = required("VIBEWARS_LLC_SESSION");
  const command = process.argv[2];
  try {
    if (command === "open") {
      openHubWindow(tmux, session);
    } else if (command === "check") {
      process.exitCode = hubWindowUp(tmux, session) ? 0 : 1;
    } else {
      console.error("usage: hub-window.mjs open | check");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`hub-window: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
