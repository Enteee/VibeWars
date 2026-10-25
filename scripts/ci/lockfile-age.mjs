/**
 * Fail a pull request that adds a package version published less than a week
 * ago to pnpm-lock.yaml (#107, operator Q48).
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
 * The `name@version` keys under the lockfile's top-level `packages:`.
 * Registry packages only; git and tarball entries have no registry date.
 * @param {string} lockfile
 * @returns {Set<string>}
 */
export const packagesOf = (lockfile) => {
  /** @type {Set<string>} */
  const keys = new Set();
  let inPackages = false;
  for (const line of lockfile.split("\n")) {
    if (/^\S/.test(line)) inPackages = line.startsWith("packages:");
    else if (inPackages) {
      const match = /^ {2}'?((?:@[^/\s]+\/)?[^@\s']+@\d[^\s':]*)'?:\s*$/.exec(line);
      if (match) keys.add(match[1]);
    }
  }
  return keys;
};

/**
 * @param {string} baseLockfile
 * @param {string} headLockfile
 * @returns {string[]}
 */
export const addedPackages = (baseLockfile, headLockfile) => {
  const base = packagesOf(baseLockfile);
  return [...packagesOf(headLockfile)].filter((key) => !base.has(key)).sort();
};

/**
 * The added versions younger than the minimum age, or unknown to the registry.
 * @param {string[]} added
 * @param {(name: string, version: string) => Promise<string | undefined>} publishedAt
 * @param {Date} now
 * @returns {Promise<string[]>}
 */
export const tooYoung = async (added, publishedAt, now) => {
  /** @type {string[]} */
  const problems = [];
  for (const key of added) {
    const at = key.lastIndexOf("@");
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
  const added = addedPackages(fs.readFileSync(baseFile, "utf8"), fs.readFileSync(headFile, "utf8"));
  console.log(`${String(added.length)} package version(s) added to the lockfile`);
  const problems = await tooYoung(added, registryPublishedAt, new Date());
  for (const problem of problems) console.error(`::error::${problem}`);
  if (problems.length > 0) {
    console.error(
      `Added versions must be at least ${String(MIN_AGE_DAYS)} days old (minimumReleaseAge).`,
    );
    process.exit(1);
  }
}
