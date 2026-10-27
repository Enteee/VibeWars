/**
 * How much Claude each role uses (#50), read from the session logs each
 * agent's Claude writes under `<boxes>/<employee>/config/projects/`. The
 * dashboard runs on the host, outside every jail, so it can read them all;
 * nothing here calls an API.
 *
 * The logs hold prompts, code and maybe secrets. Only the usage fields are
 * ever parsed out of a line, and no line, nor any part of one, is ever
 * printed, error messages included.
 *
 * How much is left (#452) is not in the logs. The plan publishes no limit
 * in tokens, only how much of its 5-hour and 7-day windows is used: the
 * percentages `/usage` and the statusline show. Claude Code reports them
 * to every `-p` run as a `rate_limit_event`, which agent-turn.mjs keeps in
 * each employee's `bus/<employee>/limit.json`; the newest one is the
 * account's. With every agent idle it grows old, and the pane says so.
 */
import fs from "node:fs";
import path from "node:path";

import { openJailDir } from "./jail-fs.mjs";
import { roleOf } from "./staff.mjs";
import { LIMIT_STATUSES, LIMIT_TYPES, oneOf } from "./stream-format.mjs";

/** @typedef {import("./jail-fs.mjs").JailDir} JailDir */

/** The plan's rolling window, which the main figures cover. */
export const WINDOW_MS = 5 * 60 * 60 * 1000;

/**
 * One API reply, as the log records it.
 *
 * @typedef {object} UsageRecord
 * @property {string} id `message.id`: one reply is logged on several lines
 * @property {number} ts epoch milliseconds
 * @property {string} model
 * @property {number} input `input_tokens`
 * @property {number} output `output_tokens`
 * @property {number} cacheWrite `cache_creation_input_tokens`
 * @property {number} cacheRead `cache_read_input_tokens`
 */

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function count(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The usage in one log line, or `null` for anything that is not an
 * assistant reply with usage, malformed JSON included.
 *
 * @param {string} line
 * @returns {UsageRecord | null}
 */
export function parseUsageLine(line) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const entry = obj(raw);
  const message = obj(entry.message);
  const usage = obj(message.usage);
  const ts = typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Number.NaN;
  if (
    entry.type !== "assistant" ||
    typeof message.id !== "string" ||
    message.usage === undefined ||
    Number.isNaN(ts)
  ) {
    return null;
  }
  return {
    id: message.id,
    ts,
    model: typeof message.model === "string" ? message.model : "",
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
  };
}

/**
 * One role's replies in the window.
 *
 * @typedef {object} RoleUsage
 * @property {number} replies distinct replies
 * @property {number} output
 * @property {number} input fresh input: `input` plus `cacheWrite`
 * @property {number} cacheRead
 * @property {string} model the latest reply's, `""` with none
 */

/**
 * @typedef {object} UsageSummary
 * @property {Map<string, RoleUsage>} roles only roles with a reply in the window
 * @property {RoleUsage} total
 * @property {number} todayOutput output since `dayStart`, every role
 */

/** @returns {RoleUsage} */
function none() {
  return { replies: 0, output: 0, input: 0, cacheRead: 0, model: "" };
}

/**
 * Each role's totals over the window, each reply counted once however many
 * lines logged it; the last line for an id wins.
 *
 * @param {readonly (UsageRecord & { role: string })[]} records
 * @param {{ now: number, windowMs: number, dayStart: number }} at
 * @returns {UsageSummary}
 */
export function summarize(records, { now, windowMs, dayStart }) {
  /** @type {Map<string, UsageRecord & { role: string }>} */
  const replies = new Map();
  for (const record of records) {
    replies.set(record.id, record);
  }
  /** @type {Map<string, RoleUsage>} */
  const roles = new Map();
  /** @type {Map<string, number>} */
  const latest = new Map();
  const total = none();
  let todayOutput = 0;
  for (const reply of replies.values()) {
    if (reply.ts >= dayStart && reply.ts <= now) {
      todayOutput += reply.output;
    }
    if (reply.ts < now - windowMs || reply.ts > now) {
      continue;
    }
    const role = roles.get(reply.role) ?? none();
    for (const sum of [role, total]) {
      sum.replies += 1;
      sum.output += reply.output;
      sum.input += reply.input + reply.cacheWrite;
      sum.cacheRead += reply.cacheRead;
    }
    if (reply.ts >= (latest.get(reply.role) ?? Number.NEGATIVE_INFINITY)) {
      latest.set(reply.role, reply.ts);
      role.model = reply.model;
    }
    roles.set(reply.role, role);
  }
  return { roles, total, todayOutput };
}

/**
 * A token count in at most five characters: `950`, `38k`, `1.1M`.
 *
 * @param {number} n
 * @returns {string}
 */
export function formatCount(n) {
  if (n < 1000) {
    return String(Math.round(n));
  }
  if (Math.round(n / 1000) < 1000) {
    return `${String(Math.round(n / 1000))}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/**
 * The last `rate_limit_event` an agent's turn saw (#452), as agent-turn
 * writes it to `$VIBEWARS_LIMIT_FILE`, with when it saw it.
 *
 * @typedef {import("./stream-format.mjs").RateLimitInfo & { at: number }} LimitReading
 */

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFinite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {unknown} value
 * @returns {boolean} a `LimitWindow`, or null
 */
function isWindowOrNull(value) {
  if (value === null) {
    return true;
  }
  const fields = obj(value);
  return (
    Object.keys(fields).length === 2 && isFinite(fields.utilization) && isFinite(fields.resetsAt)
  );
}

/** The keys of a limit file, each exactly once. */
const LIMIT_KEYS = [
  "at",
  "status",
  "rateLimitType",
  "resetsAt",
  "utilization",
  "fiveHour",
  "sevenDay",
].sort();

/**
 * A limit file, or `null` for anything not exactly its shape: the file is
 * in the agent's own bus directory, which its jail can write.
 *
 * @param {string} text
 * @returns {LimitReading | null}
 */
export function parseLimitFile(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const fields = obj(raw);
  const keys = Object.keys(fields).sort();
  const shaped =
    keys.length === LIMIT_KEYS.length &&
    keys.every((key, i) => key === LIMIT_KEYS[i]) &&
    isFinite(fields.at) &&
    (fields.status === null || oneOf(LIMIT_STATUSES, fields.status) !== null) &&
    (fields.rateLimitType === null || oneOf(LIMIT_TYPES, fields.rateLimitType) !== null) &&
    (fields.resetsAt === null || isFinite(fields.resetsAt)) &&
    (fields.utilization === null || isFinite(fields.utilization)) &&
    isWindowOrNull(fields.fiveHour) &&
    isWindowOrNull(fields.sevenDay);
  return shaped ? /** @type {LimitReading} */ (fields) : null;
}

/**
 * The newest reading: the limit is the account's, so whichever agent saw
 * it last saw it best. One dated past `now`, give or take, is forged.
 *
 * @param {readonly (LimitReading | null)[]} readings
 * @param {number} now epoch milliseconds
 * @returns {LimitReading | null}
 */
export function newestLimit(readings, now) {
  /** @type {LimitReading | null} */
  let newest = null;
  for (const reading of readings) {
    if (reading !== null && reading.at <= now + MAX_SKEW_MS && reading.at > (newest?.at ?? -1)) {
      newest = reading;
    }
  }
  return newest;
}

/** The burn rate's window (#452). */
export const BURN_MS = 60 * 60 * 1000;

/**
 * The last hour's output (#452), as hubd's GraphQL line shows its spend.
 *
 * @typedef {object} Burn
 * @property {number} output
 * @property {number} replies
 * @property {{ role: string, output: number }[]} top the three roles that
 *   wrote the most, most first
 */

/**
 * Each reply counted once however many lines logged it, as `summarize`.
 *
 * @param {readonly (UsageRecord & { role: string })[]} records
 * @param {number} now epoch milliseconds
 * @returns {Burn}
 */
export function burnOf(records, now) {
  /** @type {Map<string, UsageRecord & { role: string }>} */
  const replies = new Map();
  for (const record of records) {
    replies.set(record.id, record);
  }
  /** @type {Map<string, number>} */
  const byRole = new Map();
  let output = 0;
  let replyCount = 0;
  for (const reply of replies.values()) {
    if (reply.ts < now - BURN_MS || reply.ts > now) {
      continue;
    }
    replyCount += 1;
    output += reply.output;
    byRole.set(reply.role, (byRole.get(reply.role) ?? 0) + reply.output);
  }
  const top = [...byRole]
    .map(([role, out]) => ({ role, output: out }))
    .sort((a, b) => b.output - a.output)
    .slice(0, 3);
  return { output, replies: replyCount, top };
}

/**
 * The most bytes read from one log in one refresh, so a log the jail made
 * huge, even a sparse 64 GiB one, never stalls the pane; the rest is read on
 * the refreshes after.
 */
export const CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * The most bytes read from one employee's logs in one refresh, however many
 * it has. The logs least recently read go first, so a jail planting
 * thousands of logs slows only itself, and its real log still gets its
 * turn; a busy employee never starves another of the same role.
 */
export const BOX_BYTES = 16 * 1024 * 1024;

/** A line longer than this is no reply worth counting; it is skipped. */
export const MAX_LINE_BYTES = 1024 * 1024;

/** Deep enough for `<project>/<session>/subagents/<agent>.jsonl`. */
const MAX_DEPTH = 4;

/** Entries looked at per employee and refresh, so a million empty dirs cost little. */
const MAX_ENTRIES = 20_000;

/**
 * The most replies kept per role, well above a real day's. A jail writing
 * fake replies fills its own row up to this and is shown as over it; real
 * replies already kept are never dropped to make room.
 */
export const MAX_KEPT = 20_000;

/** A reply dated further ahead than this is not believed, so never kept. */
const MAX_SKEW_MS = 60_000;

const { O_NOFOLLOW, O_NONBLOCK, O_RDONLY } = fs.constants;

/**
 * Where one log file has been read up to. An unfinished last line is not
 * kept: it is read again, whole, once its writer ends it.
 *
 * @typedef {object} Cursor
 * @property {number} ino
 * @property {number} offset the start of the first line not yet read
 * @property {boolean} skipping inside a line over `MAX_LINE_BYTES`, skipped
 *   up to its end
 * @property {number} served the refresh that last read it
 */

/**
 * Every `.jsonl` below `<boxes>/<employee>/config/projects`, at most
 * `MAX_DEPTH` deep, so subagents' logs count too. That tree is the jail's
 * (#329): each directory is opened refusing a symlink and pinned by its
 * descriptor, and one that cannot be opened or listed is skipped, not the
 * employee.
 *
 * @param {string} config the employee's `config`, which the jail cannot replace
 * @param {(dir: JailDir, name: string, rel: string) => void} visit called
 *   with each log's directory, name, and path below `projects`
 */
function walkLogs(config, visit) {
  let entries = 0;
  /**
   * @param {JailDir} dir
   * @param {string} rel
   * @param {number} depth
   */
  function walk(dir, rel, depth) {
    /** @type {fs.Dirent[]} */
    let listed;
    try {
      listed = fs.readdirSync(`/proc/self/fd/${String(dir.fd)}`, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of listed) {
      if (++entries > MAX_ENTRIES) {
        return;
      }
      const at = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory() && depth < MAX_DEPTH) {
        /** @type {JailDir} */
        let sub;
        try {
          sub = openJailDir(`/proc/self/fd/${String(dir.fd)}`, entry.name);
        } catch {
          continue;
        }
        try {
          walk(sub, at, depth + 1);
        } finally {
          sub.close();
        }
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        visit(dir, entry.name, at);
      }
    }
  }
  /** @type {JailDir} */
  let projects;
  try {
    projects = openJailDir(config, "projects");
  } catch {
    return;
  }
  try {
    walk(projects, "", 0);
  } finally {
    projects.close();
  }
}

/**
 * The employees with a box: each directory in `boxes` named for an
 * employee of one of `roles`, sorted. Read from the directory, not from
 * staff, so an employee fired today still counts what they spent.
 *
 * @param {string} boxes
 * @param {ReadonlySet<string>} roles
 * @returns {{ employee: string, role: string }[]}
 */
function employeesIn(boxes, roles) {
  /** @type {fs.Dirent[]} */
  let entries;
  try {
    entries = fs.readdirSync(boxes, { withFileTypes: true });
  } catch {
    return [];
  }
  /** @type {{ employee: string, role: string }[]} */
  const employees = [];
  for (const entry of entries) {
    // A Dirent of a symlink is no directory: only real ones count.
    const role = entry.isDirectory() ? roleOf(entry.name) : null;
    if (role !== null && roles.has(role)) {
      employees.push({ employee: entry.name, role });
    }
  }
  return employees.sort((a, b) => (a.employee < b.employee ? -1 : 1));
}

/**
 * Reads each employee's logs as they grow, counted under their role: only
 * the bytes appended since the last read, and only replies new enough to
 * matter, so a refresh stays cheap however long the company has run.
 *
 * @param {string} boxes the directory holding each employee's
 *   `<employee>/config`
 * @param {readonly string[]} roles
 */
export function createUsageReader(boxes, roles) {
  const wanted = new Set(roles);
  /** @type {Map<string, Cursor>} */
  const cursors = new Map();
  /** @type {Map<string, UsageRecord & { role: string }>} */
  const kept = new Map();
  /** @type {Map<string, number>} replies kept per role */
  const keptBy = new Map();
  /** @type {Map<string, number>} the newest reply each role had refused at `MAX_KEPT` */
  const refused = new Map();
  let refresh = 0;

  /**
   * @param {UsageRecord} record
   * @param {string} role
   */
  function keep(record, role) {
    const old = kept.get(record.id);
    if (old?.role !== role) {
      if ((keptBy.get(role) ?? 0) >= MAX_KEPT) {
        refused.set(role, Math.max(refused.get(role) ?? record.ts, record.ts));
        return;
      }
      if (old !== undefined) {
        keptBy.set(old.role, (keptBy.get(old.role) ?? 1) - 1);
      }
      keptBy.set(role, (keptBy.get(role) ?? 0) + 1);
    }
    kept.set(record.id, { ...record, role });
  }

  /**
   * How many bytes `name` has that were not read yet, by `lstat`: a guess
   * for choosing what to read, which `readFile` checks on the descriptor.
   *
   * @param {JailDir} dir
   * @param {string} name
   * @param {string} key the file's cursor
   * @param {number} since
   * @returns {number}
   */
  function unread(dir, name, key, since) {
    /** @type {fs.Stats} */
    let stat;
    try {
      stat = fs.lstatSync(dir.at(name));
    } catch {
      return 0;
    }
    const cursor = cursors.get(key);
    if (!stat.isFile() || (cursor === undefined && stat.mtimeMs < since)) {
      return 0;
    }
    return cursor?.ino !== stat.ino || stat.size < cursor.offset
      ? stat.size
      : stat.size - cursor.offset;
  }

  /**
   * Read at most `allowance` bytes of what was appended to `name` since
   * last time.
   *
   * @param {JailDir} dir
   * @param {string} name
   * @param {string} key the file's cursor
   * @param {string} role
   * @param {number} since replies before this are not kept
   * @param {number} now replies dated past this, give or take, are not kept
   * @param {number} allowance
   */
  function readFile(dir, name, key, role, since, now, allowance) {
    /** @type {number} */
    let fd;
    try {
      // O_NONBLOCK: a FIFO the jail swapped in must not hang the host.
      fd = fs.openSync(dir.at(name), O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    } catch {
      return;
    }
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) {
        return;
      }
      let cursor = cursors.get(key);
      if (cursor === undefined && stat.mtimeMs < since) {
        // Nothing in it is new enough, and a write would change its mtime.
        return;
      }
      if (cursor?.ino !== stat.ino || stat.size < cursor.offset) {
        // New, replaced or cut short: read it from the start.
        cursor = { ino: stat.ino, offset: 0, skipping: false, served: refresh };
      }
      cursors.set(key, cursor);
      cursor.served = refresh;
      const chunk = Buffer.alloc(Math.max(0, Math.min(stat.size - cursor.offset, allowance)));
      const bytes = chunk.subarray(0, fs.readSync(fd, chunk, 0, chunk.length, cursor.offset));
      let used = 0;
      if (cursor.skipping) {
        const lineEnd = bytes.indexOf(0x0a);
        if (lineEnd === -1) {
          cursor.offset += bytes.length;
          return;
        }
        cursor.skipping = false;
        used = lineEnd + 1;
      }
      // Split on the byte, not the decoded text, so a character cut in two
      // by the writer is decoded whole next time.
      const end = bytes.lastIndexOf(0x0a);
      if (end >= used) {
        for (const line of bytes
          .subarray(used, end + 1)
          .toString("utf8")
          .split("\n")) {
          const record = line === "" ? null : parseUsageLine(line);
          if (record !== null && record.ts >= since && record.ts <= now + MAX_SKEW_MS) {
            keep(record, role);
          }
        }
        used = end + 1;
      }
      if (bytes.length - used > MAX_LINE_BYTES) {
        cursor.skipping = true;
        used = bytes.length;
      }
      cursor.offset += used;
    } catch {
      // Unreadable now; tried again next refresh.
    } finally {
      fs.closeSync(fd);
    }
  }

  return {
    /**
     * Every reply since `since`, after reading what is new, and the roles
     * that had one refused at `MAX_KEPT` since then, so their counts are
     * short.
     *
     * @param {number} since epoch milliseconds
     * @param {number} now epoch milliseconds
     * @returns {{ records: (UsageRecord & { role: string })[], capped: Set<string> } | null}
     *   null when `boxes` does not exist, so no agent has run yet
     */
    read(since, now) {
      if (!fs.existsSync(boxes)) {
        return null;
      }
      refresh += 1;
      /** @type {Set<string>} */
      const seen = new Set();
      for (const { employee, role } of employeesIn(boxes, wanted)) {
        const config = path.join(boxes, employee, "config");
        // Once to see what each log has unread, once to read the logs
        // whose turn it is: the walk keeps no descriptor between them.
        /** @type {{ key: string, bytes: number, served: number }[]} */
        const pending = [];
        walkLogs(config, (dir, name, rel) => {
          const key = `${employee}/${rel}`;
          seen.add(key);
          const bytes = Math.min(unread(dir, name, key, since), CHUNK_BYTES);
          if (bytes > 0) {
            pending.push({ key, bytes, served: cursors.get(key)?.served ?? 0 });
          }
        });
        /** @type {Map<string, number>} */
        const allowed = new Map();
        let budget = BOX_BYTES;
        for (const { key, bytes } of pending.sort((a, b) => a.served - b.served)) {
          if (bytes > budget) {
            break;
          }
          allowed.set(key, bytes);
          budget -= bytes;
        }
        if (allowed.size > 0) {
          walkLogs(config, (dir, name, rel) => {
            const key = `${employee}/${rel}`;
            const allowance = allowed.get(key);
            if (allowance !== undefined) {
              readFile(dir, name, key, role, since, now, allowance);
            }
          });
        }
      }
      for (const key of cursors.keys()) {
        if (!seen.has(key)) {
          cursors.delete(key);
        }
      }
      for (const [id, record] of kept) {
        if (record.ts < since) {
          kept.delete(id);
          keptBy.set(record.role, (keptBy.get(record.role) ?? 1) - 1);
        }
      }
      /** @type {Set<string>} */
      const capped = new Set();
      for (const [role, newest] of refused) {
        if (newest < since) {
          refused.delete(role);
        } else {
          capped.add(role);
        }
      }
      return { records: [...kept.values()], capped };
    },
  };
}
