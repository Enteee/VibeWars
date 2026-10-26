#!/usr/bin/env node
/**
 * The hub window (#23): hubd on top, the supervisor below, each under
 * run-forever, which shows its output, restarts it whenever it exits and
 * tells everyone if it crash-loops. This is the only way either daemon
 * starts.
 *
 *   hub-window.mjs open    open it at index 99, replacing whatever is there
 *   hub-window.mjs check   exit 0 if window 99 is the hub window, 1 if not
 *
 * Index 99 keeps it last however many role windows open after it. `open`
 * replaces a window already at 99 rather than failing on it (#315): the
 * company must never be left with hubd stopped and nothing to restart it.
 * The window's name is pinned, so `check` can tell it from anything else.
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
function run(tmux, args) {
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
 * Is window 99 the hub window? Whatever else sits there, or a hub window
 * that lost its name, is not.
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
  return windows.stdout.split("\n").includes(`${HUB_INDEX} ${HUB_NAME}`);
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
  // the daemons read is passed on explicitly: hubd needs DEVENV_ROOT, and gh
  // and git on PATH. Each PATH entry once: tmux refuses a command over 16 KB,
  // and a PATH from nested nix shells repeats most of itself (host-path.mjs).
  const env = [
    `DEVENV_ROOT=${root}`,
    `VIBEWARS_BOT_ROOT=${botRoot}`,
    `VIBEWARS_BOT_BUS=${path.join(botRoot, "bus")}`,
    `VIBEWARS_LLC_SESSION=${session}`,
    `VIBEWARS_LLC_RESTART=${required("VIBEWARS_LLC_RESTART")}`,
    `VIBEWARS_TMUX=${tmux}`,
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
  run(tmux, ["select-pane", "-t", hubdPane, "-T", "HUBD"]);
  run(tmux, ["select-pane", "-t", supervisor.stdout.trim(), "-T", "SUPERVISOR"]);
  // The name is how `check` finds it: nothing may rename it.
  for (const [option, value] of [
    ["automatic-rename", "off"],
    ["allow-rename", "off"],
    ["pane-border-status", "top"],
    ["pane-border-format", " #[bold]#{pane_title}#[nobold] "],
  ]) {
    run(tmux, ["set-option", "-w", "-t", hubdPane, option, value]);
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
