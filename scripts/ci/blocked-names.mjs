/**
 * Ad and tracker blockers match request URLs, so a source file whose name
 * looks like a tracker is refused by the browser, and the module graph
 * that imports it fails to load (#3173). Dev serves `src` and `dist`
 * modules unbundled, and a build names chunks after modules, so every
 * file name under `packages/*\/src` and `apps/web/src` is a URL somewhere.
 *
 * A name is split into tokens on `-`, `_`, `.` and camelCase, and fails
 * when one of them is in BLOCKED_TOKENS exactly: `adrenaline`, `shared`
 * and `tracks` pass. A name flagged wrongly is renamed, not allowed.
 */

import fs from "node:fs";
import path from "node:path";

export const BLOCKED_TOKENS = new Set([
  "beacon",
  "beacons",
  "analytics",
  "telemetry",
  "track",
  "tracker",
  "tracking",
  "pixel",
  "ads",
  "ad",
  "advert",
  "adverts",
  "banner",
  "banners",
  "stats",
  "metrics",
  "collect",
  "fingerprint",
  "sponsor",
  "sponsors",
  "doubleclick",
]);

const SOURCE = /\.(?:ts|js|mjs)$/;

/**
 * The lower-case tokens of a file's base name.
 * @param {string} file
 * @returns {string[]}
 */
export function nameTokens(file) {
  return path
    .basename(file)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[-_.]+/)
    .filter((token) => token !== "")
    .map((token) => token.toLowerCase());
}

/**
 * The first blocked token in a file's name, if any.
 * @param {string} file
 * @returns {string | undefined}
 */
export function blockedToken(file) {
  return nameTokens(file).find((token) => BLOCKED_TOKENS.has(token));
}

/**
 * Every `.ts`, `.js` and `.mjs` file under `dir`, relative to `root`.
 * @param {string} root
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(root, dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && SOURCE.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

/**
 * The source directories whose files the browser requests by name.
 * @param {string} root
 * @returns {string[]}
 */
export function sourceDirs(root) {
  const packages = fs
    .readdirSync(path.join(root, "packages"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(root, "packages", entry.name, "src")),
    )
    .map((entry) => path.join("packages", entry.name, "src"));
  return [...packages, path.join("apps", "web", "src")];
}

/**
 * Every source file whose name a blocker would refuse, with the token.
 * @param {string} root
 * @returns {{ file: string, token: string }[]}
 */
export function blockedNames(root) {
  return sourceDirs(root)
    .flatMap((dir) => sourceFiles(root, dir))
    .flatMap((file) => {
      const token = blockedToken(file);
      return token === undefined ? [] : [{ file, token }];
    });
}
