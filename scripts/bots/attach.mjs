#!/usr/bin/env node
/**
 * Hands the terminal claude-llc ran in over to the company's session (#740).
 *
 *   attach.mjs <session>
 *
 * Inside tmux (byobu included) an attach would refuse to nest, so the client
 * already there switches to the session. Outside tmux it attaches, but only
 * with a terminal to attach: run without one, say from a Claude Code prompt,
 * the company is up all the same, so it says how to get there and succeeds.
 *
 * claude-llc runs it with VIBEWARS_TMUX set to the tmux the session runs on.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const NO_TTY_MESSAGE = "claude-llc: the company is up; attach with claude-llc";

/**
 * @param {{ insideTmux: boolean, hasTty: boolean }} where
 * @returns {"switch-client" | "attach-session" | "none"}
 */
export function attachPlan({ insideTmux, hasTty }) {
  if (insideTmux) {
    // The client is tmux's, so this needs no terminal of its own.
    return "switch-client";
  }
  return hasTty ? "attach-session" : "none";
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const tmux = process.env.VIBEWARS_TMUX;
  const session = process.argv[2];
  if (tmux === undefined || tmux === "" || session === undefined || session === "") {
    console.error("usage: VIBEWARS_TMUX=<tmux> attach.mjs <session>");
    process.exit(2);
  }
  const plan = attachPlan({
    insideTmux: (process.env.TMUX ?? "") !== "",
    hasTty: process.stdin.isTTY && process.stdout.isTTY,
  });
  if (plan === "none") {
    console.log(NO_TTY_MESSAGE);
    process.exit(0);
  }
  const result = spawnSync(tmux, [plan, "-t", session], { stdio: "inherit" });
  if (result.error !== undefined) {
    console.error(`attach: ${tmux} ${plan}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
