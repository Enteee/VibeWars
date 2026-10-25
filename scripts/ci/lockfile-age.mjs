/**
 * Fail a pull request that adds to pnpm-lock.yaml a package version published
 * less than a week ago, or one resolved from git, a tarball or a URL (#107,
 * operator Q48).
 *
 * `minimumReleaseAge` guards `pnpm install`, but a one-off `pnpm add` with the
 * age gate overridden on the command line is sometimes needed. This is the
 * second guard: whatever the author did locally, every `name@version` the
 * lockfile gains relative to the base branch must be at least MIN_AGE_DAYS
 * old on the npm registry. A version the registry does not know fails too.
 *
 * Usage: node scripts/ci/lockfile-age.mjs <base-lockfile> <head-lockfile>
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const MIN_AGE_DAYS = 7;

/**
 * The entries under the lockfile's top-level `packages:`, `name@spec` mapped to
 * its `resolution:` line. The spec is a version for registry packages and a URL
 * or ref for git and tarball ones. A key line this cannot parse throws: the
 * check fails closed rather than skip what it does not understand.
 * @param {string} lockfile
 * @returns {Map<string, string>}
 */
export const packagesOf = (lockfile) => {
  /** @type {Map<string, string>} */
  const entries = new Map();
  let inPackages = false;
  let current = "";
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) inPackages = line.startsWith("packages:");
    else if (inPackages) {
      if (/^ {2}\S/.test(line)) {
        const match = /^ {2}'?((?:@[^/\s]+\/)?[^@\s']+@[^\s']+?)'?:\s*$/.exec(line);
        if (!match) throw new Error(`cannot parse lockfile entry: ${line}`);
        current = match[1];
        entries.set(current, "");
      } else if (/^ {4}resolution:/.test(line) && current !== "") {
        entries.set(current, line.trim());
      }
    }
  }
  return entries;
};

/** What every registry entry's resolution looks like: an integrity hash, nothing else. */
const REGISTRY_RESOLUTION = /^resolution: \{integrity: [^,{}\s]+\}$/;

/**
 * What the head lockfile adds or rewrites relative to the base. `added` are the
 * new keys; `problems` are entries whose resolution is new or changed and is
 * anything but a bare registry integrity (git, tarball, URL), or changed at all.
 * @param {string} baseLockfile
 * @param {string} headLockfile
 * @returns {{ added: string[], problems: string[] }}
 */
export const diffPackages = (baseLockfile, headLockfile) => {
  const base = packagesOf(baseLockfile);
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const problems = [];
  for (const [key, resolution] of packagesOf(headLockfile)) {
    const before = base.get(key);
    if (before === resolution) continue;
    if (before === undefined) added.push(key);
    else problems.push(`${key}: resolution changed (${before} -> ${resolution})`);
    if (!REGISTRY_RESOLUTION.test(resolution)) {
      problems.push(`${key}: git, tarball or URL resolution (blockExoticSubdeps)`);
    }
  }
  return { added: added.sort(), problems };
};

/**
 * The added registry versions younger than the minimum age, or unknown to the
 * registry.
 * @param {string[]} added
 * @param {(name: string, version: string) => Promise<string | undefined>} publishedAt
 * @param {Date} now
 * @returns {Promise<string[]>}
 */
export const tooYoung = async (added, publishedAt, now) => {
  /** @type {string[]} */
  const problems = [];
  for (const key of added) {
    const at = key.indexOf("@", 1);
    if (!/^\d/.test(key.slice(at + 1))) continue; // reported by diffPackages
    const published = await publishedAt(key.slice(0, at), key.slice(at + 1));
    if (published === undefined) {
      problems.push(`${key}: no publish date on the registry`);
      continue;
    }
    const ageDays = (now.getTime() - new Date(published).getTime()) / 86_400_000;
    if (ageDays < MIN_AGE_DAYS) {
      problems.push(`${key}: published ${published}, ${ageDays.toFixed(1)} days ago`);
    }
  }
  return problems;
};

/** @type {(name: string, version: string) => Promise<string | undefined>} */
const registryPublishedAt = async (name, version) => {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
  if (!response.ok) return undefined;
  /** @type {unknown} */
  const parsed = await response.json();
  const body = /** @type {{ time?: Record<string, string> }} */ (parsed);
  return body.time?.[version];
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseFile, headFile] = process.argv.slice(2);
  if (!baseFile || !headFile) {
    console.error("usage: lockfile-age.mjs <base-lockfile> <head-lockfile>");
    process.exit(2);
  }
  const diff = diffPackages(fs.readFileSync(baseFile, "utf8"), fs.readFileSync(headFile, "utf8"));
  const { added } = diff;
  console.log(`${String(added.length)} package version(s) added to the lockfile`);
  const problems = [...diff.problems, ...(await tooYoung(added, registryPublishedAt, new Date()))];
  for (const problem of problems) console.error(`::error::${problem}`);
  if (problems.length > 0) {
    console.error(
      `Added versions must be at least ${String(MIN_AGE_DAYS)} days old (minimumReleaseAge).`,
    );
    process.exit(1);
  }
}
