#!/usr/bin/env node
/**
 * `supervisor` — keeps nine autonomous agents working.
 *
 * This is the least elegant part of the company, so here is the honest
 * reasoning rather than a clean-sounding story.
 *
 * Each pane runs the *interactive* Claude TUI, not `claude -p`, because the
 * architect's window has to accept the operator typing a feature request into
 * it. An interactive session ends its turn and waits. An agent with work to do
 * therefore stops having work to do, silently, and the company stalls.
 *
 * Two things keep it moving. The first is in the agents' own hands: a role
 * with nothing to do runs `tg wait --timeout 900`, which blocks, extending its
 * current turn so it resumes the moment a colleague or the operator speaks.
 * That covers idleness but not turn *end*.
 *
 * The second is this process: it samples each pane, and when one has sat
 * unchanged at an input prompt across several samples, it types a short nudge
 * into it. That is as crude as it sounds. What makes it tolerable is that it
 * is conservative — it would rather leave an agent idle than interrupt one —
 * and that it never touches the pane the operator is looking at, so a nudge
 * cannot land in the middle of something you are typing.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { ROLES } from "./hub-policy.mjs";

const SESSION = process.env.VIBEWARS_LLC_SESSION ?? "vibewars-llc";

/** How often to sample each pane. */
const SAMPLE_MS = 30_000;

/** Consecutive unchanged samples before a pane counts as genuinely stuck. */
const IDLE_SAMPLES = 3;

/** Never nudge the same window more often than this. */
const NUDGE_COOLDOWN_MS = 300_000;

const NUDGE =
  "Check `tg inbox` and `board ls`, then continue with the most valuable thing you can finish.";

/**
 * @param {string[]} args
 * @returns {string}
 */
function tmux(args) {
  const result = spawnSync("tmux", args, { encoding: "utf8" });
  return typeof result.stdout === "string" ? result.stdout : "";
}

/**
 * Does this pane look like it is sitting at a prompt waiting for input,
 * rather than working?
 *
 * Deliberately a pure function of two snapshots so it can be tested, because
 * getting it wrong is costly in both directions: too eager and it interrupts
 * an agent mid-thought, too lax and the company quietly stops.
 *
 * Two signals have to agree. The pane must not have changed at all since the
 * last sample — a working agent emits output constantly — and its tail must
 * not look like Claude still being busy. The second test is what stops a
 * long-running tool call, which produces no output while it waits, from being
 * mistaken for an idle prompt.
 *
 * @param {string} previous
 * @param {string} current
 * @returns {boolean}
 */
export function looksIdle(previous, current) {
  if (previous === "" || current === "" || previous !== current) {
    return false;
  }
  const tail = current.trimEnd().split("\n").slice(-6).join("\n");

  // Claude Code prints a spinner line and an "esc to interrupt" hint while a
  // turn is in flight. Either means it is working, however still the pane is.
  if (/esc to interrupt|Thinking|tokens|·\s*$/i.test(tail)) {
    return false;
  }

  // A blocking `tg wait` is the agent idling on purpose, which is exactly the
  // behaviour we asked for. Leave it alone; it will come back by itself.
  if (/tg wait|waiting for|\(nothing new in/i.test(tail)) {
    return false;
  }

  // The input box is the positive signal that it is our turn to speak.
  return /│\s*>|^\s*>\s*$|Try "/m.test(tail);
}

/* -------------------------------------------------------------------------- */

/** @type {Map<string, { snapshot: string, idle: number, nudgedAt: number }>} */
const state = new Map();

/**
 * @returns {string | null} The window the operator is currently looking at.
 */
function focusedWindow() {
  // Nobody attached means nobody is typing, so every pane is fair game.
  if (tmux(["list-clients", "-t", SESSION, "-F", "#{client_session}"]).trim() === "") {
    return null;
  }
  const active = tmux(["display-message", "-p", "-t", SESSION, "-F", "#{window_name}"]).trim();
  return active === "" ? null : active;
}

async function main() {
  console.error(`supervisor: watching ${String(ROLES.length)} panes in ${SESSION}`);

  for (;;) {
    const focused = focusedWindow();

    for (const role of ROLES) {
      const target = `${SESSION}:${role}`;
      const snapshot = tmux(["capture-pane", "-p", "-t", target]);
      if (snapshot === "") {
        // No such window — the company may be partly up, which is fine.
        continue;
      }

      const previous = state.get(role) ?? { snapshot: "", idle: 0, nudgedAt: 0 };
      const idle = looksIdle(previous.snapshot, snapshot) ? previous.idle + 1 : 0;
      let nudgedAt = previous.nudgedAt;

      const dueANudge =
        idle >= IDLE_SAMPLES && Date.now() - nudgedAt > NUDGE_COOLDOWN_MS && role !== focused;

      if (dueANudge) {
        // Typed as text then Enter separately, so a pane that is NOT actually
        // at a prompt gets a stray line of text rather than an executed
        // command.
        tmux(["send-keys", "-t", target, NUDGE]);
        tmux(["send-keys", "-t", target, "Enter"]);
        nudgedAt = Date.now();
        console.error(`supervisor: nudged ${role}`);
      }

      state.set(role, { snapshot, idle: dueANudge ? 0 : idle, nudgedAt });
    }

    await sleep(SAMPLE_MS);
  }
}

// Only run when invoked directly; the test imports looksIdle.
if (process.argv[1]?.endsWith("supervisor.mjs") === true) {
  await main();
}
