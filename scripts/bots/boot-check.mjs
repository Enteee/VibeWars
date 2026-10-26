#!/usr/bin/env node
/**
 * `boot-check.mjs <running>` — does the company about to start run the
 * checkout's code?
 *
 * claude-llc runs this at every boot with `<running>`, the store copy of
 * `scripts/bots` its own evaluation staged, which holds the build's
 * `build-manifest.json` (fingerprint.mjs). claude-llc has already rebuilt
 * itself once if that manifest was stale; what is still stale now is a file
 * nix cannot see, and a reboot onto new company code would otherwise record
 * that code as loaded when it is not.
 *
 * When the two differ, it says so on stderr (the operator's terminal, or the
 * reboot log when the restarter started it), and in `.bots/boot.json`'s
 * note, which reaches the manager's first prompt. It does not refuse to
 * start: a company on old code still beats no company. The note is
 * reboot.mjs's `bootNote`.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { diff, manifest, readManifest } from "./fingerprint.mjs";
import { obj } from "./protocol.mjs";
import { bootNote } from "./reboot.mjs";

const running = process.argv[2];
const repo = process.env.DEVENV_ROOT;
const root = process.env.VIBEWARS_BOT_ROOT;
if (running === undefined || repo === undefined || root === undefined) {
  throw new Error("usage: boot-check.mjs <running scripts dir>; claude-llc starts this");
}

const drift = diff(manifest(repo), readManifest(running));
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
