#!/usr/bin/env node
/**
 * What a claude-llc build was built from (#557).
 *
 * devenv's evaluation cache does not track `scripts/bots` (ADR-0014), and a
 * shell keeps the store paths it was entered with: a `git pull` or a merged
 * reboot changes neither. So a `claude-llc` typed in an old terminal builds
 * a whole company from old code, and says nothing.
 *
 * nix/claude-llc.nix runs `manifest` over a copy of the files it built from
 * and stores the result as `build-manifest.json` next to the staged scripts.
 * Every claude-llc then runs `check` against the checkout, and rebuilds
 * itself when the two differ. One function, over one layout, at both ends.
 *
 *   fingerprint.mjs manifest <root>          the manifest, as JSON on stdout
 *   fingerprint.mjs check <build> <root>     exit 0 if current, 3 if stale;
 *                                            the differing paths on stderr
 *   fingerprint.mjs status <build> <root>    one `build: ...` line; exit 3 if stale
 *
 * `<build>` is a directory holding `build-manifest.json`, the store copy;
 * `<root>` is a checkout.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** The exit code of `check` for a stale build. */
export const STALE = 3;

/** @typedef {Record<string, string>} Manifest relative path to the sha256 of its contents */

/**
 * Does a change to this file make a build stale? The company's scripts, as
 * nix stages them (not the tests, not `fixtures/`), and every file that
 * decides how nix builds them.
 *
 * @param {string} file a path relative to the checkout, with `/`
 * @returns {boolean}
 */
export function isBuildInput(file) {
  if (["devenv.nix", "devenv.yaml", "devenv.lock"].includes(file)) {
    return true;
  }
  if (/^scripts\/bots\/[^/]+\.mjs$/.test(file)) {
    return !file.endsWith(".test.mjs");
  }
  return /^nix\/[^/]+\.nix$/.test(file);
}

/**
 * @param {string} root
 * @param {string} dir relative to `root`
 * @returns {string[]} the files directly in `dir`, relative to `root`
 */
function filesIn(root, dir) {
  try {
    return fs
      .readdirSync(path.join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => (dir === "" ? entry.name : `${dir}/${entry.name}`));
  } catch {
    return [];
  }
}

/**
 * @param {string} root a checkout, or the build's copy of one
 * @returns {Manifest}
 */
export function manifest(root) {
  /** @type {Manifest} */
  const out = {};
  const files = [...filesIn(root, ""), ...filesIn(root, "nix"), ...filesIn(root, "scripts/bots")];
  for (const file of files.filter(isBuildInput).sort()) {
    out[file] = createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
  }
  return out;
}

/**
 * @param {Manifest} files
 * @returns {string} one sha256 over the sorted entries
 */
export function fingerprint(files) {
  const hash = createHash("sha256");
  for (const file of Object.keys(files).sort()) {
    hash.update(`${file}\0${files[file] ?? ""}\n`);
  }
  return hash.digest("hex");
}

/**
 * @param {Manifest} a
 * @param {Manifest} b
 * @returns {string[]} the paths changed, added or removed between the two, sorted
 */
export function diff(a, b) {
  const files = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...files].filter((file) => a[file] !== b[file]).sort();
}

/** How many differing paths a line names before it says "and N more". */
const NAMED = 5;

/**
 * @param {string[]} paths
 * @returns {string}
 */
export function named(paths) {
  const more = paths.length > NAMED ? ` and ${String(paths.length - NAMED)} more` : "";
  return `${paths.slice(0, NAMED).join(", ")}${more}`;
}

/**
 * What `claude-llc status` and the dashboard say about the running build.
 *
 * @param {{ build: Manifest, checkout: Manifest, head: string }} input
 *   `head` is the checkout's HEAD
 * @returns {{ line: string, stale: boolean }}
 */
export function buildLine({ build, checkout, head }) {
  const id = fingerprint(build).slice(0, 8);
  const differ = diff(build, checkout);
  if (differ.length === 0) {
    return { line: `build: ${id} (current)`, stale: false };
  }
  return {
    line: `build: ${id} STALE: differs in ${named(differ)} (HEAD ${head.slice(0, 8)})`,
    stale: true,
  };
}

/**
 * @param {string} build a directory holding `build-manifest.json`
 * @returns {Manifest}
 */
export function readManifest(build) {
  /** @type {unknown} */
  const raw = JSON.parse(fs.readFileSync(path.join(build, "build-manifest.json"), "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${build}/build-manifest.json is not a manifest`);
  }
  /** @type {Manifest} */
  const out = {};
  for (const [file, hash] of Object.entries(raw)) {
    if (typeof hash !== "string") {
      throw new Error(`${build}/build-manifest.json: ${file} has no hash`);
    }
    out[file] = hash;
  }
  return out;
}

/**
 * @param {string} root
 * @returns {string} the checkout's HEAD, or `?`
 */
export function head(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "?";
}

// Only run when invoked directly.
if (process.argv[1]?.endsWith("fingerprint.mjs") === true) {
  const [command, a, b] = process.argv.slice(2);
  if (command === "manifest" && a !== undefined) {
    process.stdout.write(`${JSON.stringify(manifest(a), null, 2)}\n`);
  } else if (command === "check" && a !== undefined && b !== undefined) {
    const differ = diff(readManifest(a), manifest(b));
    if (differ.length > 0) {
      process.stderr.write(differ.map((file) => `${file}\n`).join(""));
      process.exitCode = STALE;
    }
  } else if (command === "status" && a !== undefined && b !== undefined) {
    const { line, stale } = buildLine({
      build: readManifest(a),
      checkout: manifest(b),
      head: head(b),
    });
    process.stdout.write(`${line}\n`);
    if (stale) {
      process.exitCode = STALE;
    }
  } else {
    process.stderr.write(
      "usage: fingerprint.mjs manifest <root> | check <build> <root> | status <build> <root>\n",
    );
    process.exitCode = 2;
  }
}
