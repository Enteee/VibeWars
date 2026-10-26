#!/usr/bin/env node
/**
 * PATH without what nix shells put on it.
 *
 * `devenv shell` does not replace PATH, it prepends a `/nix/store/...` entry
 * for every package to whatever PATH it is started with. A devenv shell
 * started from inside another one therefore carries both shells' entries,
 * and every company reboot started one more from inside the last: about
 * 4 KB more PATH each time. The hub window hands PATH to tmux as an
 * argument, and tmux refuses any command over 16 KB ("command too long"),
 * so after a few reboots the company could no longer come up.
 *
 * `hostPath` drops every `/nix/store/` entry and every repeat, which leaves
 * the PATH a fresh terminal has: the host's profiles, never a store path.
 * Whatever devenv starts with it gets exactly one shell's entries.
 * `uniquePath` only drops repeats, for a PATH that must keep the shell's.
 *
 *   host-path.mjs    print hostPath(PATH), for claude-llc's rebuild
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/**
 * @param {string} value a PATH
 * @returns {string} it, each entry once, in first-seen order, no empty entries
 */
export function uniquePath(value) {
  const entries = value.split(path.delimiter).filter((entry) => entry !== "");
  return [...new Set(entries)].join(path.delimiter);
}

/**
 * @param {string} value a PATH
 * @returns {string} it without `/nix/store/` entries, each entry once
 */
export function hostPath(value) {
  return uniquePath(
    value
      .split(path.delimiter)
      .filter((entry) => !entry.startsWith("/nix/store/"))
      .join(path.delimiter),
  );
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(`${hostPath(process.env.PATH ?? "")}\n`);
}
