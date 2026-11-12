/**
 * Ad and tracker blockers match request URLs, so a source file whose name
 * looks like a tracker is refused by the browser, and the module graph
 * that imports it fails to load (#3173). Dev serves `src` and `dist`
 * modules unbundled, and a build names chunks after modules, so every
 * path under `packages/*\/src`, `apps/web/src` and `apps/web/public` is a
 * URL somewhere.
 *
 * A path is split into tokens on `/`, `-`, `_`, `.` and camelCase, and fails
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
 * The lower-case tokens of every segment of a path as the browser requests
 * it, directories included: `stats/index.js` is blocked as `/stats.js` is.
 * @param {string} url
 * @returns {string[]}
 */
export function nameTokens(url) {
  return url
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .split(/[-_./\\]+/)
    .filter((token) => token !== "")
    .map((token) => token.toLowerCase());
}

/**
 * The first blocked token in a path, if any.
 * @param {string} url
 * @returns {string | undefined}
 */
export function blockedToken(url) {
  return nameTokens(url).find((token) => BLOCKED_TOKENS.has(token));
}

/**
 * A directory the browser requests files from, and which of its files.
 * @typedef {{ dir: string, served: RegExp }} Served
 */

/**
 * Every source directory, whose code files are modules, and `apps/web/public`,
 * every file of which is fetched by name (icons, samples).
 * @param {string} root
 * @returns {Served[]}
 */
export function servedDirs(root) {
  const packages = fs
    .readdirSync(path.join(root, "packages"), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(root, "packages", entry.name, "src")),
    )
    .map((entry) => ({ dir: path.join("packages", entry.name, "src"), served: SOURCE }));
  return [
    ...packages,
    { dir: path.join("apps", "web", "src"), served: SOURCE },
    { dir: path.join("apps", "web", "public"), served: /./ },
  ];
}

/**
 * Every served file whose path a blocker would refuse, with the token. The
 * path is tokenized below its served directory: `packages/…/src` is not
 * part of any URL.
 * @param {string} root
 * @returns {{ file: string, token: string }[]}
 */
export function blockedNames(root) {
  return servedDirs(root).flatMap(({ dir, served }) =>
    fs
      .readdirSync(path.join(root, dir), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && served.test(entry.name))
      .flatMap((entry) => {
        const full = path.join(entry.parentPath, entry.name);
        const token = blockedToken(path.relative(path.join(root, dir), full));
        return token === undefined ? [] : [{ file: path.relative(root, full), token }];
      }),
  );
}
