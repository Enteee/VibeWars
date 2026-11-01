/**
 * The company's state as the host's files say it: who is employed, who is
 * running, and the tokens each role spent. The dashboard draws it, and
 * hubd answers `company load` (#747) from it, so the manager decides its
 * staffing review on the operator's numbers. Read-only, and no GitHub call.
 */
import fs from "node:fs";
import path from "node:path";

import {
  WINDOW_MS,
  burnOf,
  createUsageReader,
  newestLimit,
  parseLimitFile,
  summarize,
} from "./claude-usage.mjs";
import { ROLES } from "./hub-policy.mjs";
import { withJailDir } from "./jail-fs.mjs";
import { readRoster } from "./presence.mjs";
import { maxRunners, readStatus, runnersStateDir } from "./runners-state.mjs";
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
 * Each employee's Claude config dir is `<boxes>/<employee>/config`, and its logs
 * are under that; `claude-llc` says where `<boxes>` is (#50). Null when it
 * did not say.
 *
 * @param {string | undefined} boxes
 * @returns {ReturnType<typeof createUsageReader> | null}
 */
export function usageReader(boxes) {
  return boxes === undefined ? null : createUsageReader(boxes, ROLES);
}

/** A limit file is a few hundred bytes; anything bigger is not one. */
const LIMIT_FILE_BYTES = 4096;

/**
 * The newest `rate_limit_event` any employee's turn saw (#452), from
 * each one's `bus/<employee>/limit.json`. A missing or malformed file
 * counts as none.
 *
 * @param {string} root the company's `.bots` directory
 * @param {import("./staff.mjs").Staff | null} staff
 * @param {number} now
 * @returns {import("./claude-usage.mjs").LimitReading | null}
 */
export function readLimit(root, staff, now) {
  const readings = Object.keys(staff?.employees ?? {}).map((employee) => {
    try {
      return withJailDir(path.join(root, "bus", employee), "", {}, (dir) =>
        parseLimitFile(dir.readSmall("limit.json", LIMIT_FILE_BYTES)),
      );
    } catch {
      return null;
    }
  });
  return newestLimit(readings, now);
}

/**
 * Tokens per role over the last 5 hours, the last hour's burn, and
 * today's output (#50): read from the agents' own logs, never an API.
 * `limit` is `readLimit`'s, passed through.
 *
 * @param {ReturnType<typeof createUsageReader> | null} reader
 * @param {number} now
 * @param {import("./claude-usage.mjs").LimitReading | null} limit
 * @returns {import("./dashboard-view.mjs").ClaudeUsage | null}
 */
export function readUsage(reader, now, limit) {
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
    burn: burnOf(read.records, now),
    limit,
    now,
  };
}

/**
 * The runner supervisor's status (#1890), from its host-only state dir,
 * and the operator's max for when it has not run yet.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ status: import("./runners-state.mjs").RunnersStatus | null, max: number }}
 */
export function readRunners(env) {
  return { status: readStatus(runnersStateDir(env)), max: maxRunners(env) };
}
