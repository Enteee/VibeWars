/**
 * The best `CONTEXT_CEILING` per role (#833), computed from the session
 * logs `claude-usage.mjs` already reads. Run on the host, where every
 * role's box is visible:
 *
 *     node scripts/bots/context-report.mjs [--since 48h] [--boxes <dir>]
 *
 * The model: a fresh session pays `R` to orient itself (kickoff,
 * briefing, inbox, board), starts working at a context of `P`, grows by
 * `g` per reply and restarts at the ceiling `C`. Each reply re-reads its
 * context from the cache at `w` per token, so per working reply it costs
 * `R × g / (C − P) + w × (P + C) / 2`, least at `C* = P + sqrt(2Rg / w)`.
 *
 * As in `claude-usage.mjs`, only usage fields are parsed and no log line,
 * nor any part of one, is ever printed.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { createUsageReader, formatCount } from "./claude-usage.mjs";
import { ROLES } from "./hub-policy.mjs";

/** @typedef {import("./claude-usage.mjs").UsageRecord} UsageRecord */
/** @typedef {import("./claude-usage.mjs").LoggedReply} LoggedReply */

/**
 * What a token costs, relative to a fresh input token: the API's price
 * ratios. A proxy, as the plan's 5-hour allowance is not published in
 * tokens.
 */
export const INPUT_WEIGHT = 1;
export const CACHE_WRITE_WEIGHT = 1.25;
export const CACHE_READ_WEIGHT = 0.1;
export const OUTPUT_WEIGHT = 5;

/** The replies a fresh session spends orienting itself. */
export const ORIENTATION_REPLIES = 8;

/** A session needs this many replies past orientation to measure its growth. */
export const MIN_WORKING_REPLIES = 5;

/** `CONTEXT_CEILING` in agent-turn.mjs, the ceiling the report compares to. */
export const CURRENT_CEILING = 120_000;

/** C* is never closer to P than this, nor above the context window. */
export const MIN_HEADROOM = 20_000;
export const MAX_CEILING = 200_000;

/**
 * Logs are read from this long before `--since`, so a session that started
 * before it shows that it did and is left out, not cut in half.
 */
export const LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Refreshes of the reader at most: a jail's huge sparse log must not stall the report. */
const MAX_REFRESHES = 256;

/**
 * @param {UsageRecord} reply
 * @returns {number}
 */
export function costOf(reply) {
  return (
    INPUT_WEIGHT * reply.input +
    CACHE_WRITE_WEIGHT * reply.cacheWrite +
    CACHE_READ_WEIGHT * reply.cacheRead +
    OUTPUT_WEIGHT * reply.output
  );
}

/**
 * Everything the model read for this reply, as agent-turn's `contextOf`.
 *
 * @param {UsageRecord} reply
 * @returns {number}
 */
export function contextSize(reply) {
  return reply.input + reply.cacheRead + reply.cacheWrite;
}

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * The least-squares slope of `ys` against their index.
 *
 * @param {readonly number[]} ys
 * @returns {number}
 */
function slope(ys) {
  const meanX = (ys.length - 1) / 2;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

/**
 * @typedef {object} SessionStats
 * @property {number} P the context of the first reply after orientation
 * @property {number} R what orientation cost, subagents' replies included
 * @property {number} g context added per reply after orientation
 */

/**
 * One session's numbers, or `null` when it is too short to measure.
 * Subagents' replies count toward what orientation cost, never toward
 * the context or its growth: theirs is their own.
 *
 * @param {readonly UsageRecord[]} records one session's replies, each once
 * @returns {SessionStats | null}
 */
export function sessionStats(records) {
  const byTime = [...records].sort((a, b) => a.ts - b.ts);
  const main = byTime.filter((reply) => !reply.sidechain);
  const working = main[ORIENTATION_REPLIES];
  if (main.length < ORIENTATION_REPLIES + MIN_WORKING_REPLIES || working === undefined) {
    return null;
  }
  const R = byTime
    .filter((reply) => reply.ts < working.ts)
    .reduce((sum, reply) => sum + costOf(reply), 0);
  return {
    P: contextSize(working),
    R,
    g: slope(main.slice(ORIENTATION_REPLIES).map(contextSize)),
  };
}

/**
 * @typedef {object} Model
 * @property {number} P
 * @property {number} R
 * @property {number} g
 * @property {number} w the cost of one token of context per reply
 */

/**
 * The ceiling with the least cost per working reply, kept within
 * `[P + MIN_HEADROOM, MAX_CEILING]`.
 *
 * @param {Model} model
 * @returns {number}
 */
export function bestCeiling({ P, R, g, w }) {
  const best = P + Math.sqrt((2 * R * Math.max(0, g)) / w);
  return Math.min(MAX_CEILING, Math.max(P + MIN_HEADROOM, best));
}

/**
 * What one working reply costs on average with the ceiling at `ceiling`;
 * `Infinity` when the ceiling leaves no room past orientation.
 *
 * @param {Model} model
 * @param {number} ceiling
 * @returns {number}
 */
export function modelCost({ P, R, g, w }, ceiling) {
  if (ceiling <= P) {
    return Number.POSITIVE_INFINITY;
  }
  return (R * Math.max(0, g)) / (ceiling - P) + (w * (P + ceiling)) / 2;
}

/**
 * Each role's sessions that started at or after `since`, each reply once.
 * A role's employees (`developer`, `developer@2`) are one role, as the
 * reader counts them.
 *
 * @param {readonly LoggedReply[]} records
 * @param {number} since epoch milliseconds
 * @returns {Map<string, LoggedReply[][]>}
 */
export function sessionsByRole(records, since) {
  /** @type {Map<string, LoggedReply>} */
  const replies = new Map();
  for (const record of records) {
    replies.set(record.id, record);
  }
  /** @type {Map<string, { role: string, replies: LoggedReply[] }>} */
  const sessions = new Map();
  for (const reply of replies.values()) {
    const session = sessions.get(reply.session) ?? { role: reply.role, replies: [] };
    session.replies.push(reply);
    sessions.set(reply.session, session);
  }
  /** @type {Map<string, LoggedReply[][]>} */
  const roles = new Map();
  for (const { role, replies: list } of sessions.values()) {
    if (list.every((reply) => reply.ts >= since)) {
      roles.set(role, [...(roles.get(role) ?? []), list]);
    }
  }
  return roles;
}

/**
 * @typedef {object} RoleReport
 * @property {number} sessions
 * @property {number} short sessions too short to measure, left out of the model
 * @property {number} callsPerSession main replies per session, on average
 * @property {(Model & { best: number, now: number, atBest: number }) | null} model
 *   medians over the measured sessions; `now` and `atBest` are the cost per
 *   working reply at `CURRENT_CEILING` and at `best`
 */

/**
 * @param {readonly (readonly UsageRecord[])[]} sessions
 * @returns {RoleReport}
 */
export function roleReport(sessions) {
  const stats = sessions.map(sessionStats).filter((s) => s !== null);
  const calls = sessions.reduce((sum, s) => sum + s.filter((r) => !r.sidechain).length, 0);
  const base = {
    sessions: sessions.length,
    short: sessions.length - stats.length,
    callsPerSession: sessions.length === 0 ? 0 : calls / sessions.length,
  };
  if (stats.length === 0) {
    return { ...base, model: null };
  }
  /** @type {Model} */
  const model = {
    P: median(stats.map((s) => s.P)),
    R: median(stats.map((s) => s.R)),
    g: median(stats.map((s) => s.g)),
    w: CACHE_READ_WEIGHT,
  };
  const best = bestCeiling(model);
  return {
    ...base,
    model: {
      ...model,
      best,
      now: modelCost(model, CURRENT_CEILING),
      atBest: modelCost(model, best),
    },
  };
}

/**
 * @param {number} n
 * @returns {string}
 */
function kilo(n) {
  return n < 1000 ? String(Math.round(n)) : `${(n / 1000).toFixed(1)}k`;
}

/** @type {readonly { name: string, width: number }[]} */
const COLUMNS = [
  { name: "role", width: 14 },
  { name: "sessions", width: 9 },
  { name: "short", width: 6 },
  { name: "calls/session", width: 14 },
  { name: "P (floor)", width: 10 },
  { name: "g (/call)", width: 10 },
  { name: "R (orient)", width: 11 },
  { name: "C* (ceiling)", width: 13 },
];

/**
 * @param {readonly string[]} cells
 * @returns {string}
 */
function row(cells) {
  return cells
    .map((cell, i) => {
      const width = COLUMNS[i]?.width ?? 0;
      return i === 0 ? cell.padEnd(width) : cell.padStart(width);
    })
    .join("  ")
    .trimEnd();
}

/**
 * The report's lines: a row per role, in roster order, and one for all
 * roles together.
 *
 * @param {Map<string, readonly (readonly UsageRecord[])[]>} sessions by role
 * @param {readonly string[]} roles
 * @returns {string[]}
 */
export function formatReport(sessions, roles) {
  const lines = [row([...COLUMNS.map(({ name }) => name), "cost now → at C*"])];
  const all = [...sessions.values()].flat();
  /** @type {[string, readonly (readonly UsageRecord[])[]][]} */
  const rows = [...roles.map((role) => [role, sessions.get(role) ?? []]), ["all", all]];
  let short = 0;
  for (const [role, list] of rows) {
    if (list.length === 0) {
      lines.push(row([role, "no sessions"]));
      continue;
    }
    const report = roleReport(list);
    if (role !== "all") {
      short += report.short;
    }
    const { model } = report;
    const head = [
      role,
      String(report.sessions),
      String(report.short),
      String(Math.round(report.callsPerSession)),
    ];
    if (model === null) {
      lines.push(row([...head, "too short"]));
      continue;
    }
    const change = Number.isFinite(model.now)
      ? `100% → ${String(Math.round((100 * model.atBest) / model.now))}%`
      : "—";
    lines.push(
      row([
        ...head,
        kilo(model.P),
        kilo(model.g),
        formatCount(model.R),
        formatCount(model.best),
        `   ${change}`,
      ]),
    );
  }
  lines.push(
    "",
    `${String(short)} sessions under ${String(ORIENTATION_REPLIES + MIN_WORKING_REPLIES)} replies left out of P, g and R.`,
    `Now: CONTEXT_CEILING ${formatCount(CURRENT_CEILING)} (scripts/bots/agent-turn.mjs).`,
  );
  return lines;
}

/**
 * `48h`, `2d` or `90m` in milliseconds, or `null` for anything else.
 *
 * @param {string} text
 * @returns {number | null}
 */
export function parseSince(text) {
  const match = /^(\d+)([mhd])$/.exec(text);
  if (match === null) {
    return null;
  }
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] ?? "h"] ?? 0;
  return Number(match[1]) * unit;
}

/**
 * @param {readonly string[]} argv
 * @returns {number} the exit code
 */
function main(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i] ?? "", argv[i + 1]];
    if (!["--since", "--boxes"].includes(flag) || value === undefined) {
      process.stderr.write("usage: context-report.mjs [--since 48h] [--boxes <dir>]\n");
      return 2;
    }
    flags[flag] = value;
  }
  const sinceMs = parseSince(flags["--since"] ?? "48h");
  const boxes = flags["--boxes"] ?? process.env.VIBEWARS_CLAUDE_BOXES;
  if (sinceMs === null || boxes === undefined) {
    process.stderr.write(
      sinceMs === null
        ? "context-report: --since takes 90m, 48h or 7d\n"
        : "context-report: give --boxes or set VIBEWARS_CLAUDE_BOXES\n",
    );
    return 2;
  }
  const now = Date.now();
  const since = now - sinceMs;
  const reader = createUsageReader(boxes, ROLES);
  let read = reader.read(since - LOOKBACK_MS, now);
  for (let i = 1; read?.pending === true && i < MAX_REFRESHES; i++) {
    read = reader.read(since - LOOKBACK_MS, now);
  }
  if (read === null) {
    process.stderr.write(`context-report: no boxes at ${boxes}\n`);
    return 1;
  }
  const lines = formatReport(sessionsByRole(read.records, since), ROLES);
  if (read.pending) {
    lines.push("Some logs were too big to read in full.");
  }
  if (read.capped.size > 0) {
    lines.push(`Over the reader's cap, so short: ${[...read.capped].join(", ")}.`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
