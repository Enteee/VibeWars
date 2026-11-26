/**
 * The files between hubd and the runner supervisor (#1890, ADR-0045): the
 * target count hubd writes for `company runners <n>`, and the status the
 * supervisor writes back. Both live in the supervisor's state directory,
 * mode 0700, outside `.bots/` and every jail's binds, so no agent can scale
 * runners past the manager-only `company runners`, nor forge their status.
 *
 * Each is validated on read: a target that is not a whole number in
 * `0..maxRunners` is refused and counts as 0, and a status that is
 * not the current shape counts as none.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const TARGET_FILE = "target";
export const STATUS_FILE = "status.json";
/** The alert hubd last told the manager, so a restart does not repeat it. */
export const ALERT_TOLD_FILE = "alert-told";

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
 * The most runners the operator allows (#2764): `company.json`'s
 * `maxRunners`, which `claude-llc-init` asks for beside `maxAgents`. A
 * whole number ≥ 0, or null when it is missing or anything else: the
 * caller refuses a malformed cap, never reads it as 0.
 *
 * @param {unknown} config the parsed `company.json`
 * @returns {number | null}
 */
export function maxRunners(config) {
  const value =
    typeof config === "object" && config !== null
      ? /** @type {Record<string, unknown>} */ (config).maxRunners
      : undefined;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** @typedef {{ ok: true, max: number } | { ok: false, reason: string }} RunnerCap */

/** @type {RunnerCap} */
const CAP_REFUSED = { ok: false, reason: "company.json refused: run claude-llc-init" };

/**
 * The runner cap as `claude-llc auth` and `doctor` see it (#2765), from
 * `<botRoot>/company.json`: 0 before `claude-llc-init` has written the
 * file, refused when the file is not JSON or its `maxRunners` is not one
 * `maxRunners` accepts.
 *
 * @param {string} botRoot
 * @returns {RunnerCap}
 */
export function readRunnerCap(botRoot) {
  let text;
  try {
    text = fs.readFileSync(path.join(botRoot, "company.json"), "utf8");
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT"
      ? { ok: true, max: 0 }
      : CAP_REFUSED;
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return CAP_REFUSED;
  }
  const max = maxRunners(parsed);
  return max === null ? CAP_REFUSED : { ok: true, max };
}

/**
 * Why the runners token is not wanted, or null when the cap allows runners:
 * the doctor's row says this rather than `not set up` (#2765).
 *
 * @param {RunnerCap} cap
 * @returns {string | null}
 */
export function runnersOff(cap) {
  if (!cap.ok) {
    return cap.reason;
  }
  return cap.max === 0 ? "runners off" : null;
}

/**
 * An answer to `claude-llc-init`'s runner cap: Enter is 0, a whole number
 * ≥ 0 is itself, anything else is null and asked again.
 *
 * @param {string} answer
 * @returns {number | null}
 */
export function parseMaxRunners(answer) {
  const trimmed = answer.trim();
  if (trimmed === "") {
    return 0;
  }
  const value = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(value) ? value : null;
}

/**
 * `claude-llc-init`'s runner cap: the stored one when `company.json` has a
 * valid one, otherwise asked until the answer is a whole number ≥ 0. A cap
 * asked for above 0 is warned about. A cap above 0, kept or asked for, gets
 * a hint when the runners token is not set up (#2765), and is kept: it is
 * only a ceiling.
 *
 * @param {{
 *   stored: unknown,
 *   ask: (question: string) => Promise<string>,
 *   runnersSetUp: () => boolean,
 *   say: (line: string) => void,
 * }} deps `stored` is the previous `company.json`, or null on a first run
 * @returns {Promise<number>}
 */
export async function askMaxRunners({ stored, ask, runnersSetUp, say }) {
  let cap = maxRunners(stored);
  while (cap === null) {
    cap = parseMaxRunners(await ask("  Most CI runners the company may run on this machine [0]: "));
    if (cap === null) {
      say("  A whole number, 0 or more, please.");
    } else if (cap > 0) {
      say("  Company runners run any branch's code on this machine: see ADR-0045.");
    }
  }
  if (cap > 0 && !runnersSetUp()) {
    say("  github runners: not set up. Run claude-llc auth before raising the target.");
  }
  return cap;
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
 * The alert hubd last told the manager, or null.
 *
 * @param {string} dir the state directory
 * @returns {string | null}
 */
export function readAlertTold(dir) {
  try {
    return fs.readFileSync(path.join(dir, ALERT_TOLD_FILE), "utf8");
  } catch {
    return null;
  }
}

/**
 * Records the alert hubd told, or that none stands.
 *
 * @param {string} dir the state directory
 * @param {string | null} alert
 */
export function writeAlertTold(dir, alert) {
  if (alert === null) {
    fs.rmSync(path.join(dir, ALERT_TOLD_FILE), { force: true });
    return;
  }
  ensureStateDir(dir);
  writePrivate(path.join(dir, ALERT_TOLD_FILE), alert);
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

/** What a runner added by `company runners <n>` needs free on the host (#3466). */
export const RUNNER_ROOM_BYTES = 8 * 1024 ** 3;
export const RUNNER_ROOM_CPUS = 4;

/**
 * Why the host cannot carry the runners `company runners <n>` would add, or
 * null when it can (#3466). Runners already alive are paid for in free memory
 * and load, so only the added ones are counted; lowering the target, or
 * keeping it, is never refused.
 *
 * @param {object} request
 * @param {number} request.n the target asked for
 * @param {number} request.target the target now
 * @param {number} request.alive runners the supervisor reports alive
 * @param {number} request.freeBytes the host's free memory
 * @param {number} request.load1 the host's one-minute load average
 * @param {number} request.cpus the host's available parallelism
 * @returns {string | null}
 */
export function hostRoomRefusal({ n, target, alive, freeBytes, load1, cpus }) {
  const add = n - alive;
  if (n <= target || add <= 0) {
    return null;
  }
  const freeCpus = cpus - load1;
  const byRam = Math.max(0, Math.floor(freeBytes / RUNNER_ROOM_BYTES));
  const byCpus = Math.max(0, Math.floor(freeCpus / RUNNER_ROOM_CPUS));
  const fits = alive + Math.min(byRam, byCpus);
  if (n <= fits) {
    return null;
  }
  const short = [];
  if (byRam < add) {
    short.push(
      `${(freeBytes / 1024 ** 3).toFixed(1)} GiB RAM free (${String(RUNNER_ROOM_BYTES / 1024 ** 3)} GiB per runner)`,
    );
  }
  if (byCpus < add) {
    short.push(`${freeCpus.toFixed(1)} CPUs free (${String(RUNNER_ROOM_CPUS)} per runner)`);
  }
  return `${String(n)} is more than the host carries now: ${short.join(", ")}; ${String(fits)} fit, ${String(alive)} running`;
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
 * @param {number | null} max `company.json`'s, for a supervisor that never ran; null when it has none
 * @returns {string[]}
 */
export function runnersLines(status, max) {
  if (status === null) {
    return [`runners: not started (max ${max === null ? "?" : String(max)})`];
  }
  const busy = status.runners.filter((runner) => runner.busy).length;
  const line = `runners: ${String(status.runners.length)}/${String(status.target)} (busy ${String(busy)}, max ${String(status.max)})`;
  return status.reason === null ? [line] : [line, `  ${status.reason}`];
}
