/**
 * The files between hubd and the runner supervisor (#1890, ADR-0045): the
 * target count hubd writes for `company runners <n>`, and the status the
 * supervisor writes back. Both live in the supervisor's state directory,
 * mode 0700, outside `.bots/` and every jail's binds, so no agent can scale
 * runners past the manager-only `company runners`, nor forge their status.
 *
 * Each is validated on read: a target that is not a whole number in
 * `0..VIBEWARS_MAX_RUNNERS` is refused and counts as 0, and a status that is
 * not the current shape counts as none.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TARGET_FILE = "target";
export const STATUS_FILE = "status.json";

/** A status file is a few hundred bytes; anything bigger is not one. */
const STATUS_FILE_BYTES = 64 * 1024;

/**
 * The supervisor's state directory: `VIBEWARS_RUNNERS_STATE`, or
 * `$XDG_STATE_HOME/vibewars/runner-supervisor`.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function runnersStateDir(env) {
  const set = env.VIBEWARS_RUNNERS_STATE;
  if (set !== undefined && set !== "") {
    return set;
  }
  const state = env.XDG_STATE_HOME ?? "";
  const base = state === "" ? path.join(env.HOME ?? os.homedir(), ".local", "state") : state;
  return path.join(base, "vibewars", "runner-supervisor");
}

/**
 * The most runners the operator allows, `VIBEWARS_MAX_RUNNERS`: 0 when it
 * is unset or not a whole number, so runners stay off until the operator
 * raises it, after ADR-0045's spike.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {number}
 */
export function maxRunners(env) {
  const value = Number(env.VIBEWARS_MAX_RUNNERS ?? "");
  return /^\d+$/.test(env.VIBEWARS_MAX_RUNNERS ?? "") && Number.isSafeInteger(value) ? value : 0;
}

/**
 * @param {string} text the target file's contents
 * @param {number} max
 * @returns {{ ok: true, n: number } | { ok: false, reason: string }}
 */
export function parseTarget(text, max) {
  const trimmed = text.trim();
  if (!/^\d{1,4}$/.test(trimmed)) {
    return { ok: false, reason: "the target is not a whole number; treated as 0" };
  }
  const n = Number(trimmed);
  if (n > max) {
    return {
      ok: false,
      reason: `the target ${String(n)} is above the max ${String(max)}; treated as 0`,
    };
  }
  return { ok: true, n };
}

/**
 * The target, as the supervisor reads it: a missing file is 0, and so is
 * one it refuses, with the reason.
 *
 * @param {string} dir the state directory
 * @param {number} max
 * @returns {{ n: number, reason: string | null }}
 */
export function readTarget(dir, max) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, TARGET_FILE), "utf8");
  } catch {
    return { n: 0, reason: null };
  }
  const parsed = parseTarget(text, max);
  return parsed.ok ? { n: parsed.n, reason: null } : { n: 0, reason: parsed.reason };
}

/**
 * Makes the state directory, closed to everyone else.
 *
 * @param {string} dir
 */
export function ensureStateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

/**
 * Write a file whole or not at all, mode 0600, so a reader never sees half
 * of one.
 *
 * @param {string} file
 * @param {string} contents
 */
export function writePrivate(file, contents) {
  const temp = `${file}.${String(process.pid)}.part`;
  fs.writeFileSync(temp, contents, { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * hubd's half of `company runners <n>`.
 *
 * @param {string} dir the state directory
 * @param {number} n already checked against the max
 */
export function writeTarget(dir, n) {
  ensureStateDir(dir);
  writePrivate(path.join(dir, TARGET_FILE), `${String(n)}\n`);
}

/**
 * @typedef {object} RunnerRow
 * @property {string} name its GitHub name, `vibewars-<host>-<seq>`
 * @property {number} started epoch milliseconds
 * @property {boolean} busy GitHub last said it is running a job
 */

/**
 * What the supervisor says it is doing, rewritten on every change.
 *
 * @typedef {object} RunnersStatus
 * @property {number} at epoch milliseconds
 * @property {number} target
 * @property {number} max
 * @property {RunnerRow[]} runners the ones alive
 * @property {boolean} variable what `COMPANY_RUNNERS` was last set to
 * @property {string | null} reason the last refusal or back-off, null when there is none
 * @property {string | null} alert what the manager must hear, once: the credential
 */

/**
 * @param {unknown} value
 * @returns {value is number}
 */
const whole = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * @param {unknown} value
 * @returns {value is string | null}
 */
const textOrNull = (value) => value === null || typeof value === "string";

/**
 * @param {string} text
 * @returns {RunnersStatus | null} null when it is not the current shape
 */
export function parseStatus(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const s = /** @type {Record<string, unknown>} */ (raw);
  if (
    !whole(s.at) ||
    !whole(s.target) ||
    !whole(s.max) ||
    typeof s.variable !== "boolean" ||
    !textOrNull(s.reason) ||
    !textOrNull(s.alert) ||
    !Array.isArray(s.runners)
  ) {
    return null;
  }
  /** @type {RunnerRow[]} */
  const runners = [];
  for (const row of /** @type {unknown[]} */ (s.runners)) {
    if (typeof row !== "object" || row === null) {
      return null;
    }
    const r = /** @type {Record<string, unknown>} */ (row);
    if (typeof r.name !== "string" || !whole(r.started) || typeof r.busy !== "boolean") {
      return null;
    }
    runners.push({ name: r.name, started: r.started, busy: r.busy });
  }
  return {
    at: s.at,
    target: s.target,
    max: s.max,
    runners,
    variable: s.variable,
    reason: s.reason,
    alert: s.alert,
  };
}

/**
 * The status, or null when the supervisor has not run yet or its file is
 * not the current shape.
 *
 * @param {string} dir the state directory
 * @returns {RunnersStatus | null}
 */
export function readStatus(dir) {
  try {
    const file = path.join(dir, STATUS_FILE);
    if (fs.statSync(file).size > STATUS_FILE_BYTES) {
      return null;
    }
    return parseStatus(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * `runners: <online>/<target> (busy <b>, max <m>)`, and the last reason on a
 * line of its own: the dashboard's and `company runners`'s.
 *
 * @param {RunnersStatus | null} status
 * @param {number} max the max as this host's config says, for a supervisor that never ran
 * @returns {string[]}
 */
export function runnersLines(status, max) {
  if (status === null) {
    return [`runners: not started (max ${String(max)})`];
  }
  const busy = status.runners.filter((runner) => runner.busy).length;
  const line = `runners: ${String(status.runners.length)}/${String(status.target)} (busy ${String(busy)}, max ${String(status.max)})`;
  return status.reason === null ? [line] : [line, `  ${status.reason}`];
}
