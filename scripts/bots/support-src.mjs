/**
 * The support jail's source (#148, ADR-0025): main, as files, with no
 * `.git`. Exported before every support turn from hubd's mirror, which
 * fetches main by URL, never from the shared repository's refs, which any
 * jail can write (#61). Each commit gets its own directory, written beside
 * and renamed in whole, so a turn sees one main, never half of two; the
 * older ones are deleted. `<sources>` is one support seat's own
 * (`support-src/<employee>`), so no seat deletes the tree another's turn
 * runs in.
 *
 * Run with the host's hardened git (git-hardening.mjs): no system or
 * global config, so no filter driver, and no replace refs.
 *
 *     node support-src.mjs <mirror> <sources>   prints `<sha>\t<directory>`
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { GIT_ENV, GIT_HARDENING } from "./git-hardening.mjs";

const SHA = /^[0-9a-f]{40}$/;

/**
 * @param {string} mirror
 * @param {string[]} args
 * @param {string} [cwd]
 */
function git(mirror, args, cwd) {
  return spawnSync("git", [...GIT_HARDENING, `--git-dir=${mirror}`, ...args], {
    cwd,
    env: { ...process.env, ...GIT_ENV },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
}

/**
 * Export main from `mirror` into `<sources>/<sha>/`, unless it is there
 * already, and delete every other export.
 *
 * @param {string} mirror hubd's bare mirror
 * @param {string} sources the directory exports go in
 * @returns {{ sha: string, dir: string }}
 */
export function exportMain(mirror, sources) {
  const resolved = git(mirror, ["rev-parse", "--verify", "--quiet", "main^{commit}"]);
  const sha = resolved.stdout.trim();
  if (resolved.status !== 0 || !SHA.test(sha)) {
    throw new Error(`support-src: no main in ${mirror}; hubd fetches it once claude-llc is up`);
  }
  fs.mkdirSync(sources, { recursive: true, mode: 0o700 });
  const dir = path.join(sources, sha);
  if (!fs.existsSync(dir)) {
    const part = fs.mkdtempSync(path.join(sources, ".part-"));
    const tar = path.join(part, ".main.tar");
    const archived = git(mirror, ["archive", "--format=tar", `--output=${tar}`, sha]);
    const extracted =
      archived.status === 0
        ? spawnSync("tar", ["-x", "-f", tar, "-C", part, "--no-same-owner"], { encoding: "utf8" })
        : archived;
    fs.rmSync(tar, { force: true });
    if (extracted.status !== 0) {
      fs.rmSync(part, { recursive: true, force: true });
      throw new Error(`support-src: could not export main ${sha.slice(0, 7)}`);
    }
    fs.renameSync(part, dir);
  }
  for (const name of fs.readdirSync(sources)) {
    if (name !== sha) {
      fs.rmSync(path.join(sources, name), { recursive: true, force: true });
    }
  }
  return { sha, dir };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mirror, sources] = process.argv.slice(2);
  if (mirror === undefined || sources === undefined) {
    console.error("usage: support-src.mjs <mirror> <sources>");
    process.exit(2);
  }
  try {
    const { sha, dir } = exportMain(mirror, sources);
    process.stdout.write(`${sha}\t${dir}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "support-src: failed");
    process.exit(1);
  }
}
