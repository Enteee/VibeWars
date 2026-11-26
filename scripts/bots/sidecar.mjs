/**
 * Whether the Telegram sidecar is alive (#583), for whoever has to say so
 * when it is not: `tg` in a jail, and the dashboard and `claude-llc status`
 * on the host.
 *
 * A jail can see neither host processes nor `link/serve.pid`, so
 * `link.mjs serve` writes a heartbeat under the bus root, which every jail
 * mounts read-only: `<bus>/_alive/sidecar.json`, `{ "lastSeen": <ms> }`, every
 * `HEARTBEAT_MS`, removed when it stops cleanly. A sidecar that died
 * without cleaning up, or hung, stops writing it, so an old one counts as
 * down too. A jail cannot write the bus root, but nothing here relies on
 * that: a forged heartbeat would only silence the jail's own warning.
 *
 * In a directory of its own, because the file is replaced by rename: a
 * jail that may not see the bus root, support's (#148), binds `_alive/`,
 * and a bind of the file would pin the first one it saw.
 *
 *   node sidecar.mjs fresh <bus>   exit 0 if the heartbeat is fresh, 1 if not
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { withJailDir } from "./jail-fs.mjs";
import { obj } from "./protocol.mjs";

/** Under the bus root; `_`, so it is never taken for an employee's. */
export const SIDECAR_DIR = "_alive";
export const SIDECAR_FILE = "sidecar.json";
/** How often the sidecar writes its heartbeat. */
export const HEARTBEAT_MS = 10_000;
/** Three heartbeats missed: down. */
export const SIDECAR_STALE_MS = 30_000;

/** @typedef {{ lastSeen: number }} SidecarRecord */

/**
 * @param {string} text the heartbeat file's contents
 * @returns {SidecarRecord | null} null for anything that is not one
 */
export function parseSidecar(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const { lastSeen } = obj(parsed);
  return typeof lastSeen === "number" && Number.isFinite(lastSeen) ? { lastSeen } : null;
}

/**
 * @param {number} now epoch milliseconds
 * @param {SidecarRecord | null} record null when the file is missing or malformed
 * @returns {boolean}
 */
export function sidecarDown(now, record) {
  return record === null || now - record.lastSeen > SIDECAR_STALE_MS;
}

/**
 * The heartbeat, read as the host reads what is under the bus: never
 * following a link, never more than a line.
 *
 * @param {string} bus
 * @returns {SidecarRecord | null}
 */
export function readSidecar(bus) {
  try {
    return parseSidecar(
      withJailDir(bus, SIDECAR_DIR, {}, (dir) => dir.readSmall(SIDECAR_FILE, 4096)),
    );
  } catch {
    return null;
  }
}

/**
 * Write the heartbeat, atomically: a reader never sees half of one.
 *
 * @param {string} bus
 * @param {number} now
 * @returns {void}
 */
export function writeSidecar(bus, now) {
  fs.mkdirSync(path.join(bus, SIDECAR_DIR), { recursive: true });
  const file = path.join(bus, SIDECAR_DIR, SIDECAR_FILE);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ lastSeen: now })}\n`);
  fs.renameSync(tmp, file);
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, bus] = process.argv.slice(2);
  if (command !== "fresh" || bus === undefined) {
    console.error("usage: sidecar.mjs fresh <bus>");
    process.exit(2);
  }
  process.exit(sidecarDown(Date.now(), readSidecar(bus)) ? 1 : 0);
}
