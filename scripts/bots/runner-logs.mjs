/**
 * What the company CI runners print (#2729): the supervisor pipes each
 * launcher's stdout and stderr into `<dir>/<name>.log`, and
 * `company runners logs` reads them back. Pure helpers plus a few file
 * operations on a host-only directory, so the supervisor, hubd and the
 * tests share one definition of the format.
 *
 * A line is `<ISO time> [out|err] <text>`; the last one a runner writes is
 * `<ISO time> exited <code>`, which is how a log says the runner is gone.
 */
import fs from "node:fs";
import path from "node:path";

import { redact } from "./peek.mjs";

/** A log over this is renamed to `.1` and restarted. */
export const MAX_LOG_BYTES = 1024 * 1024;
/** Most of a file ever read: the tail is all anyone wants. */
export const READ_BYTES = 256 * 1024;
export const KEEP_LOGS = 20;
export const LINE_MAX = 400;
export const DEFAULT_LINES = 80;
export const MAX_LINES = 400;
/** What a runner name may look like in `company runners logs <runner>`. */
export const RUNNER_NAME = /^[a-z0-9-]{1,64}$/;

/**
 * The last `n` lines of `text`, each cut to {@link LINE_MAX} with `…`.
 *
 * @param {string} text
 * @param {number} n
 * @returns {string[]}
 */
export function tailLines(text, n) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines
    .slice(-n)
    .map((line) => (line.length > LINE_MAX ? `${line.slice(0, LINE_MAX)}…` : line));
}

/**
 * The last {@link READ_BYTES} of a file, without a half line at the front
 * when it had to cut. A missing file reads as `null`.
 *
 * @param {string} file
 * @returns {string | null}
 */
export function readTail(file) {
  let fd;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return null;
  }
  try {
    const { size } = fs.fstatSync(fd);
    const length = Math.min(size, READ_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    const text = buffer.toString("utf8");
    return size > length ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The last `n` lines of a runner's log: `.log`, topped up from `.log.1`
 * (the file before the last rotation) when it is short. `null` when
 * neither exists.
 *
 * @param {string} file the `.log` path
 * @param {number} n
 * @returns {string[] | null}
 */
export function readLogLines(file, n) {
  const current = readTail(file);
  const older = readTail(`${file}.1`);
  if (current === null && older === null) {
    return null;
  }
  const lines = tailLines(current ?? "", n);
  if (lines.length < n && older !== null) {
    return [...tailLines(older, n - lines.length), ...lines];
  }
  return lines;
}

/**
 * Rename a log that has grown past `max` to `.1`, replacing the old one.
 *
 * @param {string} file
 * @param {number} [max]
 * @returns {boolean} whether it rotated
 */
export function rotateIfLarge(file, max = MAX_LOG_BYTES) {
  try {
    if (fs.statSync(file).size <= max) {
      return false;
    }
    fs.renameSync(file, `${file}.1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * One runner's log as lines are appended: partial lines wait for their
 * newline, each stream apart, and every line gets the time and the stream.
 *
 * @param {string} file
 * @param {() => number} now
 * @returns {{ chunk: (stream: "out" | "err", data: string) => void, exited: (code: number) => void }}
 */
export function runnerLogWriter(file, now) {
  /** @type {Record<string, string>} */
  const pending = { out: "", err: "" };
  /** @param {string} text */
  const append = (text) => {
    try {
      rotateIfLarge(file);
      fs.appendFileSync(file, text, { mode: 0o600 });
    } catch {
      // A log that cannot be written is not worth a runner.
    }
  };
  const stamp = () => new Date(now()).toISOString();
  return {
    chunk(stream, data) {
      const lines = `${pending[stream] ?? ""}${data}`.split("\n");
      pending[stream] = lines.pop() ?? "";
      if (lines.length > 0) {
        append(lines.map((line) => `${stamp()} [${stream}] ${line}\n`).join(""));
      }
    },
    exited(code) {
      const rest = /** @type {const} */ (["out", "err"]).flatMap((stream) =>
        pending[stream] === "" ? [] : [`${stamp()} [${stream}] ${pending[stream] ?? ""}\n`],
      );
      pending.out = "";
      pending.err = "";
      append(`${rest.join("")}${stamp()} exited ${String(code)}\n`);
    },
  };
}

/**
 * @typedef {object} LogEntry
 * @property {string} name
 * @property {number} size bytes of `.log`
 * @property {number} mtimeMs
 * @property {number | null} exitCode null while it runs
 */

/**
 * The runner logs on disk, newest write first.
 *
 * @param {string} dir
 * @returns {LogEntry[]}
 */
export function runnerLogIndex(dir) {
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((file) => file.endsWith(".log"))
    .flatMap((file) => {
      try {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        const last = tailLines(readTail(full) ?? "", 1)[0] ?? "";
        const code = /^\S+ exited (-?\d+)$/.exec(last);
        return [
          {
            name: file.slice(0, -".log".length),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            exitCode: code === null ? null : Number(code[1]),
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Keep the newest `keep` runner logs (`.1` goes with its base); delete the rest.
 *
 * @param {string} dir
 * @param {number} [keep]
 * @returns {string[]} the names removed
 */
export function pruneRunnerLogs(dir, keep = KEEP_LOGS) {
  const doomed = runnerLogIndex(dir).slice(keep);
  for (const { name } of doomed) {
    for (const suffix of [".log", ".log.1"]) {
      fs.rmSync(path.join(dir, `${name}${suffix}`), { force: true });
    }
  }
  return doomed.map((entry) => entry.name);
}

/**
 * The text `company runners logs` prints, redacted last, after the cutting.
 *
 * @param {object} input
 * @param {string[] | null} input.supervisor the supervisor log's tail; null when it has none
 * @param {LogEntry[]} input.index
 * @param {number} input.now
 * @returns {string}
 */
export function formatRunnerLogs({ supervisor, index, now }) {
  const out = [
    "── supervisor log ──",
    ...(supervisor ?? ["no supervisor log"]),
    "── runner logs ──",
    ...(index.length === 0
      ? ["no runner logs"]
      : index.map((entry) => {
          const state = entry.exitCode === null ? "alive" : `exited ${String(entry.exitCode)}`;
          const ago = Math.max(0, Math.round((now - entry.mtimeMs) / 1000));
          return `${entry.name}  ${state}  ${String(entry.size)} B  last write ${new Date(entry.mtimeMs).toISOString()} (${String(ago)} s ago)`;
        })),
  ];
  return redact(`${out.join("\n")}\n`);
}
