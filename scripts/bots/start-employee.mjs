#!/usr/bin/env node
/**
 * One employee's pane (#383, #722), the only way an agent starts. A role's
 * employees share a window named for the role, tiled, each pane titled with
 * the employee id; the window opens with the role's first employee and
 * closes with its last. The pane's `@employee` option is what the
 * supervisor identifies it by, since a program may retitle a pane.
 *
 *   node start-employee.mjs <employee>
 *
 * claude-llc's boot loop and `claude-llc start-employee` run it; the
 * supervisor imports `startEmployee`. It needs VIBEWARS_TMUX (the tmux the
 * session runs on), VIBEWARS_LLC_SESSION, VIBEWARS_BOT_ROOT and DEVENV_ROOT
 * (where the pane starts); VIBEWARS_KICKOFF_NOTE, if set, is handed to the
 * agent as the reboot note.
 *
 * One at a time and never twice: the boot loop and the supervisor may both
 * start the same employee, and two agents must not share a worktree. So it
 * takes a lock, and does nothing for an employee that has a pane.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { roleOf, withStaffLock } from "./staff.mjs";

/**
 * @typedef {{
 *   tmux: string, session: string, root: string, cwd: string, note?: string,
 * }} Where `root` is the company's state directory, `cwd` where the pane starts
 */

/**
 * @param {string} tmux
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
function run(tmux, args) {
  const result = spawnSync(tmux, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: result.error === undefined ? result.stdout : "",
    stderr: result.error === undefined ? result.stderr : result.error.message,
  };
}

/**
 * Start `employee` in its role's window, unless it has a pane.
 *
 * @param {string} employee
 * @param {Where} where
 * @returns {"started" | "already"} `already` if it has a pane
 * @throws {Error} on an id that is not an employee's, and when tmux cannot
 *   open the pane
 */
export function startEmployee(employee, { tmux, session, root, cwd, note }) {
  const role = roleOf(employee);
  if (role === null) {
    throw new Error(`not an employee id: ${employee}`);
  }
  return withStaffLock(path.join(root, "start-pane"), () => {
    const panes = run(tmux, ["list-panes", "-s", "-t", `=${session}`, "-F", "#{@employee}"]);
    if (panes.stdout.split("\n").includes(employee)) {
      return "already";
    }
    const env = note === undefined || note === "" ? [] : ["-e", `VIBEWARS_KICKOFF_NOTE=${note}`];
    const command = `claude-llc-agent ${employee}`;
    const windows = run(tmux, ["list-windows", "-t", `=${session}`, "-F", "#{window_name}"]);
    const window = `=${session}:=${role}`;
    const joining = windows.stdout.split("\n").includes(role);
    const opened = joining
      ? run(tmux, [
          "split-window",
          "-d",
          "-P",
          "-F",
          "#{pane_id}",
          "-t",
          window,
          "-c",
          cwd,
          ...env,
          command,
        ])
      : run(tmux, [
          "new-window",
          "-d",
          "-P",
          "-F",
          "#{pane_id}",
          "-t",
          `${session}:`,
          "-n",
          role,
          "-c",
          cwd,
          ...env,
          command,
        ]);
    const pane = opened.stdout.trim();
    // An empty pane id would make the next commands act on the current pane.
    if (!opened.ok || pane === "") {
      throw new Error(`could not open a pane for ${employee}: ${opened.stderr.trim()}`);
    }
    if (joining) {
      run(tmux, ["select-layout", "-t", window, "tiled"]);
    } else {
      for (const [option, value] of [
        ["automatic-rename", "off"],
        ["allow-rename", "off"],
        ["pane-border-status", "top"],
        ["pane-border-format", " #[bold]#{@employee}#[nobold] "],
      ]) {
        run(tmux, ["set-option", "-w", "-t", window, option ?? "", value ?? ""]);
      }
    }
    run(tmux, ["set-option", "-p", "-t", pane, "@employee", employee]);
    run(tmux, ["select-pane", "-t", pane, "-T", employee]);
    return "started";
  });
}

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

// Only run when invoked directly; the test imports startEmployee.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const employee = process.argv[2];
  if (employee === undefined) {
    console.error("usage: start-employee.mjs <employee>");
    process.exit(2);
  }
  try {
    const outcome = startEmployee(employee, {
      tmux: required("VIBEWARS_TMUX"),
      session: required("VIBEWARS_LLC_SESSION"),
      root: required("VIBEWARS_BOT_ROOT"),
      cwd: required("DEVENV_ROOT"),
      note: process.env.VIBEWARS_KICKOFF_NOTE,
    });
    if (outcome === "already") {
      console.error(`claude-llc: ${employee} already has a pane`);
    }
  } catch (error) {
    console.error(`claude-llc: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
