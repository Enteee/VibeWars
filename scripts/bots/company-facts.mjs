/**
 * The company's state as the host's files say it: who is employed, who is
 * running, and the tokens each role spent. The dashboard draws it, and
 * hubd answers `company load` (#747) from it, so the manager decides its
 * staffing review on the operator's numbers. Read-only, and no GitHub call.
 */
import fs from "node:fs";
import path from "node:path";

import { WINDOW_MS, createUsageReader, summarize } from "./claude-usage.mjs";
import { ROLES } from "./hub-policy.mjs";
import { readRoster } from "./presence.mjs";
import { parseStaff } from "./staff.mjs";

/**
 * `staff.json`, or null while it is missing or not the current shape:
 * hubd is its only writer, and no reader repairs it (#386).
 *
 * @param {string} root the company's `.bots` directory
 * @returns {import("./staff.mjs").Staff | null}
 */
export function readStaffFile(root) {
  try {
    return parseStaff(fs.readFileSync(path.join(root, "staff.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * The roster as it stands (#363): which employees are running, and which
 * died without cleaning up, with when they were last seen.
 *
 * @param {string} root the company's `.bots` directory
 * @param {import("./staff.mjs").Staff | null} staff
 * @param {number} now
 * @returns {{ live: Set<string>, stale: Map<string, number> }}
 */
export function readPresence(root, staff, now) {
  /** @type {Set<string>} */
  const live = new Set();
  /** @type {Map<string, number>} */
  const stale = new Map();
  const employees = Object.keys(staff?.employees ?? {});
  for (const [id, entry] of readRoster(path.join(root, "bus", "roster"), employees, now)) {
    if (entry.fresh) {
      live.add(id);
    } else {
      stale.set(id, entry.lastSeen);
    }
  }
  return { live, stale };
}

/**
 * Each agent's Claude config dir is `<boxes>/<role>/config`, and its logs
 * are under that; `claude-llc` says where `<boxes>` is (#50). Null when it
 * did not say.
 *
 * @param {string | undefined} boxes
 * @returns {ReturnType<typeof createUsageReader> | null}
 */
export function usageReader(boxes) {
  return boxes === undefined ? null : createUsageReader(boxes, ROLES);
}

/**
 * Tokens per role over the last 5 hours, and today's output (#50): read
 * from the agents' own logs, never an API.
 *
 * @param {ReturnType<typeof createUsageReader> | null} reader
 * @param {number} now
 * @returns {import("./dashboard-view.mjs").ClaudeUsage | null}
 */
export function readUsage(reader, now) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();
  const read = reader?.read(Math.min(dayStart, now - WINDOW_MS), now) ?? null;
  if (read === null) {
    return null;
  }
  return {
    summary: summarize(read.records, { now, windowMs: WINDOW_MS, dayStart }),
    capped: read.capped,
    now,
  };
}
