/**
 * How the hub is doing, and when to restart it: the pure half of the `hub`
 * tmux window (issue #23).
 *
 * hubd writes `hubd.alive` every heartbeat, and run-forever.mjs records every
 * exit in `<name>.restarts`. The dashboard, `hub` and `claude-llc status` read
 * those files and nothing else, so showing hub health never costs a GitHub
 * call. Everything that decides something lives here and is covered by
 * hub-health.test.mjs.
 *
 * Typed with JSDoc; see protocol.mjs.
 */
import { clock } from "./hub-budget.mjs";

/** How often hubd writes `hubd.alive`. */
export const HEARTBEAT_MS = 5000;

/** A heartbeat older than this means hubd is wedged or gone. */
export const STALE_MS = 3 * HEARTBEAT_MS;

/** This many exits inside CRASH_WINDOW_MS is a crash loop. */
export const CRASH_EXITS = 5;
export const CRASH_WINDOW_MS = 5 * 60_000;

/** A run this long resets the backoff: whatever was wrong, it is not now. */
export const HEALTHY_RUN_MS = 5 * 60_000;

/** The longest wait between restarts. */
export const MAX_DELAY_MS = 60_000;

/** Exits older than this are not kept in `<name>.restarts`. */
export const HISTORY_MS = 60 * 60_000;

/**
 * @typedef {object} RateLimit
 * @property {number} graphqlRemaining
 * @property {number} graphqlLimit
 * @property {number} graphqlResetAt epoch ms
 */

/**
 * The contents of `hubd.alive`. One format: anything else is not a heartbeat.
 *
 * @typedef {object} Alive
 * @property {number} pid
 * @property {number} startedAt epoch ms
 * @property {number} heartbeatAt epoch ms
 * @property {string} sha the commit hubd was started from
 * @property {number} inflight requests waiting in the spools at the heartbeat
 * @property {number} served requests carried out since start
 * @property {number} refused requests refused since start
 * @property {string | null} lastError
 * @property {RateLimit | null} rateLimit null until hubd has asked GitHub
 */

/**
 * One exit of a supervised process, as run-forever records it.
 *
 * @typedef {object} Exit
 * @property {number} startedAt epoch ms
 * @property {number} exitedAt epoch ms
 * @property {number | null} code null when it was killed by a signal
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
 * @returns {value is number}
 */
function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read `hubd.alive`.
 *
 * @param {string | null} text the file, or null if there is none
 * @returns {Alive | null} null for a missing or malformed file
 */
export function parseAlive(text) {
  if (text === null) {
    return null;
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const record = obj(parsed);
  const numbers = ["pid", "startedAt", "heartbeatAt", "inflight", "served", "refused"];
  if (
    !numbers.every((key) => isNumber(record[key])) ||
    typeof record.sha !== "string" ||
    !(typeof record.lastError === "string" || record.lastError === null)
  ) {
    return null;
  }
  /** @type {RateLimit | null} */
  let rateLimit = null;
  if (record.rateLimit !== null) {
    const limit = obj(record.rateLimit);
    if (
      !isNumber(limit.graphqlRemaining) ||
      !isNumber(limit.graphqlLimit) ||
      !isNumber(limit.graphqlResetAt)
    ) {
      return null;
    }
    rateLimit = {
      graphqlRemaining: limit.graphqlRemaining,
      graphqlLimit: limit.graphqlLimit,
      graphqlResetAt: limit.graphqlResetAt,
    };
  }
  return /** @type {Alive} */ ({ ...record, rateLimit });
}

/**
 * Read `<name>.restarts`. A malformed file is treated as no history: it only
 * feeds a counter and the backoff, and starting those over is harmless.
 *
 * @param {string | null} text
 * @returns {Exit[]}
 */
export function parseExits(text) {
  if (text === null) {
    return [];
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map(obj)
    .filter(
      (exit) =>
        isNumber(exit.startedAt) &&
        isNumber(exit.exitedAt) &&
        (isNumber(exit.code) || exit.code === null),
    )
    .map((exit) => /** @type {Exit} */ (exit));
}

/**
 * The exits worth keeping: the last hour's.
 *
 * @param {readonly Exit[]} history
 * @param {number} now
 * @returns {Exit[]}
 */
export function recentExits(history, now) {
  return history.filter((exit) => now - exit.exitedAt < HISTORY_MS);
}

/**
 * Whether the process is crash-looping: CRASH_EXITS exits inside
 * CRASH_WINDOW_MS.
 *
 * @param {readonly Exit[]} history
 * @param {number} now
 * @returns {boolean}
 */
export function isCrashLooping(history, now) {
  return history.filter((exit) => now - exit.exitedAt < CRASH_WINDOW_MS).length >= CRASH_EXITS;
}

/**
 * How long to wait before the next restart, given every exit so far, newest
 * last. 1 s after the first quick exit, doubling with each further one, up to
 * a minute; a run of HEALTHY_RUN_MS or more starts the count over. A crash
 * loop waits the full minute, so a bad merge retries quietly rather than
 * spinning.
 *
 * @param {readonly Exit[]} history
 * @param {number} now
 * @returns {{ delayMs: number, crashLooping: boolean }}
 */
export function nextDelay(history, now) {
  let quick = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const exit = /** @type {Exit} */ (history[i]);
    if (exit.exitedAt - exit.startedAt >= HEALTHY_RUN_MS) {
      break;
    }
    quick += 1;
  }
  const crashLooping = isCrashLooping(history, now);
  if (crashLooping) {
    return { delayMs: MAX_DELAY_MS, crashLooping };
  }
  const delayMs = quick === 0 ? 1000 : Math.min(MAX_DELAY_MS, 1000 * 2 ** (quick - 1));
  return { delayMs, crashLooping };
}

/**
 * `2h14m`, `3m`, `40 s`: short enough for a status line.
 *
 * @param {number} ms
 * @returns {string}
 */
export function duration(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${String(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  return `${String(Math.floor(minutes / 60))}h${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * The hub's state, and the dashboard's line for it:
 *
 *     hub ● up 2h14m · restarts 0/h · req 178 ok / 12 refused · gh graphql 3120/5000 (resets 14:31) · last error: —
 *
 * `crash-looping` wins over everything, because then the other numbers
 * describe a process that keeps dying. `down` is no heartbeat file at all;
 * `stale` is one that has stopped being written.
 *
 * @param {Alive | null} alive
 * @param {readonly Exit[]} restarts hubd's exits, newest last
 * @param {number} now
 * @returns {{ state: "up" | "stale" | "down" | "crash-looping", line: string }}
 */
export function hubHealth(alive, restarts, now) {
  const perHour = restarts.filter((exit) => now - exit.exitedAt < HISTORY_MS).length;
  const restartsPart = `restarts ${String(perHour)}/h`;
  if (isCrashLooping(restarts, now)) {
    return { state: "crash-looping", line: `hub ● crash-looping · ${restartsPart}` };
  }
  if (alive === null) {
    return { state: "down", line: `hub ● down · ${restartsPart}` };
  }
  const silent = now - alive.heartbeatAt;
  const parts = [
    `req ${String(alive.served)} ok / ${String(alive.refused)} refused`,
    alive.rateLimit === null
      ? "gh graphql unknown"
      : `gh graphql ${String(alive.rateLimit.graphqlRemaining)}/${String(alive.rateLimit.graphqlLimit)} (resets ${clock(alive.rateLimit.graphqlResetAt)})`,
    `last error: ${alive.lastError ?? "—"}`,
  ];
  if (silent > STALE_MS) {
    return {
      state: "stale",
      line: [`hub ● stale (no heartbeat ${duration(silent)})`, restartsPart, ...parts].join(" · "),
    };
  }
  return {
    state: "up",
    line: [`hub ● up ${duration(now - alive.startedAt)}`, restartsPart, ...parts].join(" · "),
  };
}
