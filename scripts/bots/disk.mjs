/**
 * The disk guard (#358): cgroups do not count disk space, and every jail
 * writes to the host's disk (worktrees, node_modules, Playwright artifacts).
 * Below `HOLD_BELOW` free, the agent loop starts no new turn, and it waits
 * until `RELEASE_AT` is free. The gap is hysteresis, so a disk hovering at the
 * edge does not flap between the two.
 */

import fs from "node:fs";

const GIB = 1024 ** 3;

/** Hold turns below this many bytes free. */
export const HOLD_BELOW = 10 * GIB;

/** Once holding, resume at this many bytes free. */
export const RELEASE_AT = 12 * GIB;

/**
 * @param {{ freeBytes: number, holding: boolean }} disk
 * @returns {boolean} whether turns are on hold
 */
export function diskHold({ freeBytes, holding }) {
  return holding ? freeBytes < RELEASE_AT : freeBytes < HOLD_BELOW;
}

/**
 * Free space an unprivileged process can use on the filesystem holding `dir`.
 *
 * @param {string} dir
 * @returns {number} bytes
 */
export function freeBytes(dir) {
  const stat = fs.statfsSync(dir);
  return stat.bavail * stat.bsize;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function gib(bytes) {
  return String(Math.floor(bytes / GIB));
}
