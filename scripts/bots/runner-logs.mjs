/**
 * The company CI runners' logs (#2729): what `company runners logs` reads,
 * and the bounded files the supervisor and run-forever write.
 *
 * The runner supervisor pipes each launcher's stdout and stderr, a line at a
 * time, `<ISO time> [out] …` or `[err]`, into `.bots/hub/runners/<name>.log`,
 * and ends it with `<ISO time> exited <code>`. A file over 1 MiB becomes
 * `<name>.log.1`, replacing an older one, and starts again; the 20 newest
 * runners keep their logs, and a live runner's is never pruned.
 *
 * `.bots/hub/runners/` is host-only: no agent jail binds it (an agent's
 * jail sees `.bots/hub/<employee>` and `_alive`, jail-args.mjs) and no
 * runner jail binds anything of `.bots/` (runner-jail.mjs), so only the
 * supervisor writes there. Still, every file is opened `O_NOFOLLOW` and
 * must be a regular file, a `<runner>` is found among the directory's
 * entries, never joined into a path, and new files are made `O_EXCL`.
 *
 * What a runner prints is a CI job's: a branch name or a test can put
 * anything there, a token included. So every read goes through one
 * pipeline (`cleanTail`): a window of at most 256 KiB, its first partial
 * line dropped, redacted whole (so a private key block or a token is gone
 * before any cut can hide it from a pattern), the last lines, each cut at
 * 400 characters, made `visible()`, and redacted again. `redactLine` is the
 * same, a line at a time, for a tail that follows a file.
 */
import fs from "node:fs";
import path from "node:path";

import { redact } from "./peek.mjs";
import { visible } from "./protocol.mjs";

const { O_APPEND, O_CREAT, O_EXCL, O_NOFOLLOW, O_NONBLOCK, O_RDONLY, O_WRONLY } = fs.constants;

/** The runners' logs, below the hub directory. */
export const RUNNER_LOG_DIR = "runners";
/** The supervisor's own log, which run-forever writes, in the hub directory. */
export const SUPERVISOR_LOG = "runner-supervisor.log";
/** A log over this is renamed `.1` and started again. */
export const ROTATE_BYTES = 1024 * 1024;
/** The most of a log one read takes, `.log` and `.log.1` together. */
export const WINDOW_BYTES = 256 * 1024;
/** A longer line is cut, and ends in `…`. */
export const MAX_LINE = 400;
/** How many runners keep their logs. */
export const KEEP_LOGS = 20;
export const DEFAULT_LINES = 80;
export const MAX_LINES = 400;
/** A runner's name, as the supervisor gives it, and its log's base name. */
export const RUNNER_NAME = /^[a-z0-9-]{1,64}$/;

const LOG_NAME = /^([a-z0-9-]{1,64})\.log$/;
const EXITED = /^(?:\S+ )?exited (-?\d+)$/;

/**
 * @param {string} root `VIBEWARS_BOT_ROOT`
 * @returns {string} `.bots/hub/runners`
 */
export function runnerLogDir(root) {
  return path.join(root, "hub", RUNNER_LOG_DIR);
}

/* -------------------------------------------------------------------------- */
/* Redaction                                                                   */
/* -------------------------------------------------------------------------- */

/** Any PEM block, a key's or a certificate's, to its END or the text's end. */
const PEM_BLOCK = /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g;
const PEM_BEGIN = /-----BEGIN [A-Z0-9 ]+-----/;
const PEM_END = /-----END [A-Z0-9 ]*(?:KEY|CERTIFICATE)-----/;
const PEM_ANY_END = /-----END [A-Z0-9 ]+-----/;
/**
 * A runner's registration and remove tokens, a JIT config's base64, the
 * RSA parameters in it: long runs of token characters. Only here, not in
 * peek.mjs's `redact()`, whose readers need long words. A commit SHA stays.
 */
const LONG_TOKEN = /[A-Za-z0-9+/=_-]{28,}/g;
const SHA = /^[0-9a-f]{40}$/i;
// eslint-disable-next-line no-control-regex -- the escape sequences are the point
const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|[@-Z\\-_])/g;

/**
 * `redact()`, then any long token-like run, except a SHA and the names in
 * `known` (a runner's name is as long as a token).
 *
 * @param {string} text
 * @param {ReadonlySet<string>} [known]
 * @returns {string}
 */
function redactTokens(text, known = new Set()) {
  return redact(text).replace(LONG_TOKEN, (run) =>
    SHA.test(run) || known.has(run) ? run : "[redacted]",
  );
}

/**
 * The first step on a window read from a log: a PEM block goes whole, and
 * so does everything from the window's start to an END line whose BEGIN
 * was before the window; then every token.
 *
 * @param {string} text
 * @param {ReadonlySet<string>} [known] words that stay: the runners' names
 * @returns {string}
 */
export function redactWindow(text, known) {
  let out = text;
  const end = PEM_END.exec(out);
  if (end !== null && !PEM_BEGIN.test(out.slice(0, end.index))) {
    out = `[redacted]${out.slice(end.index + end[0].length)}`;
  }
  return redactTokens(out.replace(PEM_BLOCK, "[redacted]"), known);
}

/**
 * The last step on each line: cut at 400 characters, escape sequences
 * dropped and every other control made `visible()`, then redacted again,
 * as a cut can split what the first pass saw.
 *
 * @param {string} line
 * @param {ReadonlySet<string>} [known]
 * @returns {string}
 */
export function finishLine(line, known) {
  return redactTokens(visible(cutLine(line).replace(ANSI, "")), known);
}

/**
 * @typedef {object} PemState
 * @property {boolean} inside whether a PEM block began on an earlier line
 */

/**
 * The pipeline a line at a time, for a tail that follows a file: a PEM
 * block's lines go whole, from its BEGIN line to its END line, which
 * `state` carries between lines (start with `{ inside: false }`).
 *
 * @param {string} line one line, without its newline
 * @param {PemState} state
 * @param {ReadonlySet<string>} [known]
 * @returns {string}
 */
export function redactLine(line, state, known) {
  if (state.inside) {
    if (PEM_ANY_END.test(line)) {
      state.inside = false;
    }
    return "[redacted]";
  }
  const begin = PEM_BEGIN.exec(line);
  if (begin !== null && !PEM_ANY_END.test(line.slice(begin.index))) {
    state.inside = true;
    return finishLine(`${line.slice(0, begin.index)}[redacted]`, known);
  }
  return finishLine(redactWindow(line, known), known);
}

/* -------------------------------------------------------------------------- */
/* Tails                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} line
 * @returns {string} at most 400 characters, the last of a cut one `…`
 */
function cutLine(line) {
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}

/**
 * The last `n` lines of `text`, each longer than 400 characters cut with
 * `…`. A trailing newline ends the last line; it does not add an empty one.
 * Nothing redacted: that is `cleanTail`.
 *
 * @param {string} text
 * @param {number} n
 * @returns {string[]}
 */
export function tailLines(text, n) {
  if (text === "" || n <= 0) {
    return [];
  }
  const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
  return lines.slice(-n).map(cutLine);
}

/**
 * The whole read pipeline on a window: redacted whole, the last `n` lines,
 * each cut, made visible and redacted again.
 *
 * @param {string} window a window from `readWindow`, its partial first line gone
 * @param {number} n
 * @param {ReadonlySet<string>} [known] words that stay: the runners' names
 * @returns {string[]}
 */
export function cleanTail(window, n, known) {
  return tailLines(redactWindow(window, known), n).map((line) => finishLine(line, known));
}

/**
 * Refuses anything at `file` but a regular file: a symlink, a directory, a
 * FIFO a read would hang on.
 *
 * @param {string} file
 * @returns {fs.Stats | null} null when there is nothing there
 */
function regularFile(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  if (!stat.isFile()) {
    throw new Error(`runner-logs: ${path.basename(file)} is not a regular file`);
  }
  return stat;
}

/**
 * The end of a file, at most `maxBytes`; when that is not all of it, its
 * first, partial line is dropped.
 *
 * @param {string} file
 * @param {number} [maxBytes]
 * @returns {{ text: string, whole: boolean } | null} null when there is no file
 */
export function readWindow(file, maxBytes = WINDOW_BYTES) {
  if (regularFile(file) === null) {
    return null;
  }
  const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`runner-logs: ${path.basename(file)} is not a regular file`);
    }
    const length = Math.min(stat.size, Math.max(0, maxBytes));
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, stat.size - length);
    const text = buffer.subarray(0, read).toString("utf8");
    if (length === stat.size) {
      return { text, whole: true };
    }
    const newline = text.indexOf("\n");
    return { text: newline === -1 ? "" : text.slice(newline + 1), whole: false };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The window a tail of `file` reads: `file`, topped up from `file.1` when
 * it holds fewer than `n` lines, 256 KiB in all.
 *
 * @param {string} file
 * @param {number} n
 * @returns {string | null} null when neither is there
 */
export function readLogWindow(file, n) {
  const current = readWindow(file);
  const lines = current === null ? 0 : tailLines(current.text, n + 1).length;
  if (current !== null && (lines >= n || !current.whole)) {
    return current.text;
  }
  const left = WINDOW_BYTES - Buffer.byteLength(current?.text ?? "");
  const older = left > 0 ? readWindow(`${file}.1`, left) : null;
  if (older === null) {
    return current?.text ?? null;
  }
  const join = older.text === "" || older.text.endsWith("\n") ? "" : "\n";
  return `${older.text}${join}${current?.text ?? ""}`;
}

/* -------------------------------------------------------------------------- */
/* The index                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {object} RunnerLog
 * @property {string} name the runner's
 * @property {string} file the `.log`'s absolute path
 * @property {boolean} alive false when its last line is `exited <code>`
 * @property {number | null} exitCode that code, else null
 * @property {number} size bytes, of the `.log` alone
 * @property {number} mtimeMs its last write
 * @property {number} ageMs how long ago that was, at `now`
 */

/**
 * Every runner's log in `dir`, newest first by last write. A name that is
 * not a runner's, or a log that is not a regular file, is left out. No
 * directory is no logs.
 *
 * @param {string} dir
 * @param {number} now
 * @returns {RunnerLog[]}
 */
export function runnerLogIndex(dir, now) {
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  /** @type {RunnerLog[]} */
  const logs = [];
  for (const entry of names) {
    const match = LOG_NAME.exec(entry);
    const name = match?.[1];
    if (name === undefined) {
      continue;
    }
    const file = path.resolve(dir, entry);
    try {
      const stat = regularFile(file);
      const tail = readWindow(file, 4096);
      if (stat === null || tail === null) {
        continue;
      }
      const last = tailLines(tail.text, 1)[0] ?? "";
      const exited = EXITED.exec(last);
      logs.push({
        name,
        file,
        alive: exited === null,
        exitCode: exited === null ? null : Number(exited[1]),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ageMs: Math.max(0, now - stat.mtimeMs),
      });
    } catch {
      // A symlink, or gone since the listing: not a log.
    }
  }
  return logs.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name));
}

/**
 * Keeps the `keep` newest runners' logs, each `.log` with its `.log.1`, and
 * every live runner's whatever its age; an `.log.1` without its `.log` goes.
 *
 * @param {string} dir
 * @param {ReadonlySet<string>} live the runners up now
 * @param {number} [keep]
 * @param {number} [now]
 * @returns {string[]} the runners whose logs went
 */
export function pruneRunnerLogs(dir, live, keep = KEEP_LOGS, now = Date.now()) {
  const index = runnerLogIndex(dir, now);
  const kept = new Set(index.slice(0, keep).map((log) => log.name));
  /** @type {string[]} */
  const removed = [];
  for (const log of index) {
    if (!kept.has(log.name) && !live.has(log.name)) {
      fs.rmSync(log.file, { force: true });
      fs.rmSync(`${log.file}.1`, { force: true });
      removed.push(log.name);
    }
  }
  const bases = new Set(index.map((log) => log.name));
  for (const entry of fs.readdirSync(dir)) {
    const base = /^([a-z0-9-]{1,64})\.log\.1$/.exec(entry)?.[1];
    if (base !== undefined && !bases.has(base) && !live.has(base)) {
      fs.rmSync(path.join(dir, entry), { force: true });
    }
  }
  return removed;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} file
 * @returns {number} a new file's descriptor, for appending; never an old one
 */
function createLog(file) {
  return fs.openSync(file, O_WRONLY | O_APPEND | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
}

/**
 * Renames `file` to `file.1`, replacing an older one, when it is over
 * `maxBytes`, and starts a new, empty one in its place.
 *
 * @param {string} file
 * @param {number} [maxBytes]
 * @returns {boolean} whether it did
 */
export function rotateIfLarge(file, maxBytes = ROTATE_BYTES) {
  const stat = regularFile(file);
  if (stat === null || stat.size <= maxBytes) {
    return false;
  }
  fs.renameSync(file, `${file}.1`);
  fs.closeSync(createLog(file));
  return true;
}

/**
 * Appends to a log, never through a symlink; makes it when missing.
 *
 * @param {string} file
 * @param {string} text
 * @returns {void}
 */
export function appendLog(file, text) {
  const fd = fs.openSync(file, O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW, 0o600);
  try {
    fs.writeSync(fd, text);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @typedef {object} RunnerLogWriter
 * @property {(stream: "out" | "err", chunk: string) => void} write
 * @property {(code: number) => void} end appends `exited <code>`; later output is dropped
 */

/**
 * A runner's log: a new file, each whole line of either stream prefixed
 * with the time and `[out]` or `[err]`, rotated past `maxBytes`. A write
 * that fails is told to `onError` once and stops the log, never the runner.
 *
 * @param {string} file
 * @param {{ now?: () => number, maxBytes?: number, onError?: (error: unknown) => void }} [options]
 * @returns {RunnerLogWriter}
 */
export function openRunnerLog(file, options = {}) {
  const now = options.now ?? Date.now;
  const maxBytes = options.maxBytes ?? ROTATE_BYTES;
  /** @type {number | null} */
  let fd = null;
  let size = 0;
  let closed = false;
  const partial = { out: "", err: "" };
  /** @param {unknown} error */
  const broken = (error) => {
    closed = true;
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Already the failure being told.
      }
      fd = null;
    }
    options.onError?.(error);
  };
  /** @param {string} text */
  const put = (text) => {
    if (closed || text === "") {
      return;
    }
    try {
      const bytes = Buffer.byteLength(text);
      if (fd !== null && size > 0 && size + bytes > maxBytes) {
        fs.closeSync(fd);
        fd = null;
        fs.renameSync(file, `${file}.1`);
        fd = createLog(file);
        size = 0;
      }
      fd ??= createLog(file);
      fs.writeSync(fd, text);
      size += bytes;
    } catch (error) {
      broken(error);
    }
  };
  const stamp = () => new Date(now()).toISOString();
  // Made now, so a runner that prints nothing still has its log.
  try {
    fd = createLog(file);
  } catch (error) {
    broken(error);
  }
  return {
    write(stream, chunk) {
      if (closed) {
        return;
      }
      const lines = `${partial[stream]}${chunk}`.split("\n");
      partial[stream] = lines.pop() ?? "";
      if (lines.length > 0) {
        const at = stamp();
        put(lines.map((line) => `${at} [${stream}] ${line.replace(/\r$/, "")}\n`).join(""));
      }
    },
    end(code) {
      if (closed) {
        return;
      }
      const at = stamp();
      const rest = /** @type {const} */ (["out", "err"])
        .filter((stream) => partial[stream] !== "")
        .map((stream) => `${at} [${stream}] ${partial[stream]}\n`)
        .join("");
      put(`${rest}${at} exited ${String(code)}\n`);
      closed = true;
      if (fd !== null) {
        fs.closeSync(fd);
        fd = null;
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* company runners logs                                                        */
/* -------------------------------------------------------------------------- */

/**
 * @param {number} bytes
 * @returns {string}
 */
function sizeOf(bytes) {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

/**
 * @param {number} ms
 * @returns {string}
 */
function agoOf(ms) {
  const s = Math.round(ms / 1000);
  if (s < 120) {
    return `${String(s)} s ago`;
  }
  const m = Math.round(s / 60);
  return m < 120 ? `${String(m)} min ago` : `${String(Math.round(m / 60))} h ago`;
}

/**
 * What `company runners logs` prints, from what was read, every line
 * already through `cleanTail`.
 *
 * @param {object} view
 * @param {string | null} view.runner the one asked for, or null for the overview
 * @param {number} view.n
 * @param {RunnerLog[]} view.index
 * @param {string[] | null} view.lines the runner's, or the supervisor's for the overview; null when its log is missing
 * @returns {string}
 */
export function formatRunnerLogs({ runner, n, index, lines }) {
  if (runner !== null) {
    if (lines === null) {
      const names = index.map((log) => log.name).join(", ");
      return `no log for ${runner}; runners with logs: ${names === "" ? "none" : names}\n`;
    }
    return lines.length === 0 ? `${runner}: its log is empty\n` : `${lines.join("\n")}\n`;
  }
  const out = [
    lines === null
      ? `no supervisor log (.bots/hub/${SUPERVISOR_LOG})`
      : `supervisor log, last ${String(n)} lines:`,
    ...(lines ?? []),
    "",
  ];
  if (index.length === 0) {
    out.push("no runner logs");
  } else {
    out.push("runner logs:");
    for (const log of index) {
      const state = log.alive ? "alive" : `exited ${String(log.exitCode)}`;
      out.push(`  ${log.name}  ${state}  ${sizeOf(log.size)}  written ${agoOf(log.ageMs)}`);
    }
  }
  return `${out.join("\n")}\n`;
}

/**
 * Reads and formats `company runners logs [<runner>]`: the supervisor's
 * tail and the index, or the runner's tail. `runner` is found among the
 * index's entries; it never becomes a path.
 *
 * @param {string} hub the hub directory
 * @param {string | null} runner
 * @param {number} n
 * @param {number} now
 * @returns {string}
 */
export function readRunnerLogs(hub, runner, n, now) {
  const index = runnerLogIndex(path.join(hub, RUNNER_LOG_DIR), now);
  const known = new Set(index.map((log) => log.name));
  if (runner !== null) {
    const log = index.find((entry) => entry.name === runner);
    const window = log === undefined ? null : readLogWindow(log.file, n);
    return formatRunnerLogs({
      runner,
      n,
      index,
      lines: window === null ? null : cleanTail(window, n, known),
    });
  }
  const window = readLogWindow(path.join(hub, SUPERVISOR_LOG), n);
  return formatRunnerLogs({
    runner,
    n,
    index,
    lines: window === null ? null : cleanTail(window, n, known),
  });
}
