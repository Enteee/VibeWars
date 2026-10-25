/**
 * The hub's daemons, kept running and seen running (#23). Pure functions:
 * `run-forever.mjs` restarts with them, hubd writes the heartbeat they
 * read, and the dashboard shows the line they make.
 */

import { visible } from "./protocol.mjs";

/**
 * hubd's heartbeat, `hubd.alive`.
 *
 * @typedef {object} HubdAlive
 * @property {number} pid on the host; meaningless inside a jail
 * @property {number} startedAt epoch ms
 * @property {number} heartbeatAt epoch ms
 * @property {string | null} sha the commit the company was started from, short
 * @property {number} inflight requests queued or being served
 * @property {number} served
 * @property {number} refused
 * @property {{ at: number, message: string } | null} lastError
 */

/** How often hubd writes its heartbeat while idle. */
export const HEARTBEAT_MS = 5000;

/** Three missed heartbeats, and the hub reads as stale. */
export const STALE_MS = 3 * HEARTBEAT_MS;

/** A run this long is a recovery: the backoff starts again from 1 s. */
export const HEALTHY_RUN_MS = 5 * 60_000;

/** This many exits inside `CRASH_WINDOW_MS` is a crash loop. */
export const CRASH_EXITS = 5;
export const CRASH_WINDOW_MS = 5 * 60_000;

/** The longest wait between restarts. */
export const MAX_DELAY_MS = 60_000;

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isTime(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * `hubd.alive`'s text as a heartbeat, or `null` if it is not one. One
 * format: anything else is a hub that is not running properly.
 *
 * @param {string} text
 * @returns {HubdAlive | null}
 */
export function parseAlive(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const raw = /** @type {Record<string, unknown>} */ (parsed);
  const error = raw.lastError;
  const lastError =
    typeof error === "object" &&
    error !== null &&
    isTime(/** @type {Record<string, unknown>} */ (error).at) &&
    typeof (/** @type {Record<string, unknown>} */ (error).message) === "string"
      ? /** @type {{ at: number, message: string }} */ (error)
      : null;
  if (
    !isTime(raw.pid) ||
    !isTime(raw.startedAt) ||
    !isTime(raw.heartbeatAt) ||
    !(typeof raw.sha === "string" || raw.sha === null) ||
    !isTime(raw.inflight) ||
    !isTime(raw.served) ||
    !isTime(raw.refused) ||
    (error !== null && lastError === null)
  ) {
    return null;
  }
  return {
    pid: raw.pid,
    startedAt: raw.startedAt,
    heartbeatAt: raw.heartbeatAt,
    sha: raw.sha,
    inflight: raw.inflight,
    served: raw.served,
    refused: raw.refused,
    lastError,
  };
}

/**
 * A `<name>.restarts` file: when the daemon exited, epoch ms, oldest first.
 * Anything else reads as no exits.
 *
 * @param {string} text
 * @returns {number[]}
 */
export function parseRestarts(text) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isTime) : [];
  } catch {
    return [];
  }
}

/**
 * Whether these exits are a crash loop.
 *
 * @param {readonly number[]} exits epoch ms
 * @param {number} now
 * @returns {boolean}
 */
export function isCrashLooping(exits, now) {
  return exits.filter((at) => now - at < CRASH_WINDOW_MS).length >= CRASH_EXITS;
}

/**
 * How long to wait before the next start, after the runs so far: 1, 2, 4
 * … 60 s for each short run in a row, back to 1 s after one that lasted
 * `HEALTHY_RUN_MS`.
 *
 * @param {readonly { startedAt: number, exitedAt: number }[]} runs oldest first
 * @param {number} now
 * @returns {{ delayMs: number, crashLooping: boolean }}
 */
export function nextDelay(runs, now) {
  let short = 0;
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (run === undefined || run.exitedAt - run.startedAt >= HEALTHY_RUN_MS) {
      break;
    }
    short += 1;
  }
  const delayMs = Math.min(MAX_DELAY_MS, 1000 * 2 ** Math.max(0, short - 1));
  return {
    delayMs,
    crashLooping: isCrashLooping(
      runs.map((run) => run.exitedAt),
      now,
    ),
  };
}

/**
 * `2h14m`, `3m`, `40s`.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatUptime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  return `${String(Math.floor(minutes / 60))}h${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * The dashboard's hub line. Down: no heartbeat at all. Crash-looping: the
 * runner keeps restarting it, whatever the last heartbeat says. Stale: a
 * heartbeat too old to trust.
 *
 * @param {HubdAlive | null} alive
 * @param {readonly number[]} restarts exits, epoch ms
 * @param {number} now
 * @returns {{ state: "up" | "stale" | "down" | "crash-looping", line: string }}
 */
export function hubHealth(alive, restarts, now) {
  const lastHour = restarts.filter((at) => now - at < 60 * 60_000).length;
  const perHour = `restarts ${String(lastHour)}/h`;
  if (isCrashLooping(restarts, now)) {
    return { state: "crash-looping", line: `hub ● crash-looping · ${perHour}` };
  }
  if (alive === null) {
    return { state: "down", line: `hub ● down · ${perHour}` };
  }
  const age = now - alive.heartbeatAt;
  if (age > STALE_MS) {
    return {
      state: "stale",
      line: `hub ● stale (no heartbeat ${String(Math.round(age / 1000))} s) · ${perHour}`,
    };
  }
  const error = alive.lastError === null ? "—" : visible(alive.lastError.message);
  return {
    state: "up",
    line:
      `hub ● up ${formatUptime(now - alive.startedAt)} · ${perHour} · ` +
      `req ${String(alive.served)} ok / ${String(alive.refused)} refused · last error: ${error}`,
  };
}
