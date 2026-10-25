/**
 * Who is running, as the roster says (#363). Each agent's `link presence`
 * sidecar heartbeats `<bus>/roster/<role>.json` and deletes it on a clean
 * exit; an agent killed hard leaves its entry behind, going stale. This is
 * the one rule for telling the two apart, shared by `link`, `tg roster`
 * and the dashboard. No side effects at import: the dashboard reads it.
 */

import fs from "node:fs";
import path from "node:path";

import { obj } from "./protocol.mjs";

/** A roster entry older than this belongs to an agent that is gone. */
export const PRESENCE_STALE_MS = 60_000;

/**
 * Every role's roster entry, read from `<rosterDir>/<role>.json`.
 *
 * @param {string} rosterDir
 * @param {readonly string[]} roles
 * @param {number} now epoch milliseconds
 * @returns {Map<string, { lastSeen: number, fresh: boolean }>} roles with no or unreadable entry are absent
 */
export function readRoster(rosterDir, roles, now) {
  /** @type {Map<string, { lastSeen: number, fresh: boolean }>} */
  const entries = new Map();
  for (const role of roles) {
    /** @type {unknown} */
    let entry;
    try {
      entry = JSON.parse(fs.readFileSync(path.join(rosterDir, `${role}.json`), "utf8"));
    } catch {
      continue;
    }
    const { lastSeen } = obj(entry);
    if (typeof lastSeen === "number") {
      entries.set(role, { lastSeen, fresh: now - lastSeen < PRESENCE_STALE_MS });
    }
  }
  return entries;
}
