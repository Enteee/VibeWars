#!/usr/bin/env node
/**
 * `boot-check.mjs <running>` — does the company about to start run the
 * checkout's scripts?
 *
 * claude-llc runs this at every boot with `<running>`, the store copy of
 * `scripts/bots` its own evaluation staged. devenv's evaluation cache does
 * not track `scripts/bots` (ADR-0014), so a shell can hand claude-llc an
 * older checkout's copy, and a reboot onto new company code would then
 * record that code as loaded when it is not.
 *
 * When the two differ, it says so on stderr (the operator's terminal, or the
 * reboot log when the restarter started it), and in `.bots/boot.json`'s
 * note, which reaches the manager's first prompt. It does not refuse to
 * start: a company on old code still beats no company. The decisions are in
 * reboot.mjs (`scriptDrift`, `bootNote`).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { obj } from "./protocol.mjs";
import { bootNote, isStagedScript, scriptDrift } from "./reboot.mjs";

/**
 * @param {string} dir
 * @returns {Record<string, string>} the staged scripts in `dir`, by name
 */
function scripts(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && isStagedScript(entry.name)) {
      out[entry.name] = fs.readFileSync(path.join(dir, entry.name), "utf8");
    }
  }
  return out;
}

const running = process.argv[2];
const repo = process.env.DEVENV_ROOT;
const root = process.env.VIBEWARS_BOT_ROOT;
if (running === undefined || repo === undefined || root === undefined) {
  throw new Error("usage: boot-check.mjs <running scripts dir>; claude-llc starts this");
}

const drift = scriptDrift(scripts(path.join(repo, "scripts", "bots")), scripts(running));
if (drift.length > 0) {
  const file = path.join(root, "boot.json");
  const boot = obj(JSON.parse(fs.readFileSync(file, "utf8")));
  const note = bootNote({
    note: typeof boot.note === "string" ? boot.note : null,
    sha: typeof boot.sha === "string" ? boot.sha : "",
    drift,
    running,
  });
  fs.writeFileSync(file, `${JSON.stringify({ ...boot, updated: false, note })}\n`);
  process.stderr.write(`claude-llc: ${note ?? ""}\n`);
}
