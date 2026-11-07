#!/usr/bin/env node
/**
 * `runner-tail.mjs <log>`: follow one runner's log in its pane of the
 * CI-RUNNERS window (#2729). runner-panes.mjs starts one per runner, and
 * one for the runner supervisor's own log.
 *
 * It prints the end of the file, then every line as it is written, and
 * follows the file across its 1 MiB rotation: when `<log>` is renamed to
 * `<log>.1` and restarted, the rest of the old file is read first, then the
 * new one from its start. A log cut shorter is read again from its start.
 *
 * Runner log text is data: job and branch names come from PRs. So every
 * line goes through runner-logs.mjs's `redactLine` before it reaches the
 * terminal: secrets and long tokens redacted, a PEM block whole, cut to 400
 * characters, control and escape characters made visible (a line cannot
 * move the cursor or retitle the pane), redacted again. A log that is a symlink, or anything but a regular file, is
 * refused: `.bots/hub/runners/` is host-only, but this does not trust that.
 *
 * Read-only: nothing here writes the log, and no input reaches a runner.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  MAX_LINE,
  RUNNER_LOG_DIR,
  SUPERVISOR_LOG,
  WINDOW_BYTES,
  redactLine,
  runnerLogIndex,
} from "./runner-logs.mjs";

export { MAX_LINE };
/** How much of the end of the file is shown when the pane opens. */
export const BACKLOG_BYTES = WINDOW_BYTES;
/** Of which at most this many lines. */
export const BACKLOG_LINES = 500;
/** A "line" with no newline this long is printed as one, not held forever. */
const MAX_PARTIAL = 64 * 1024;
const POLL_MS = 500;

const { O_NOFOLLOW, O_RDONLY } = fs.constants;

// As runner-logs.mjs reads a window: an END with no BEGIN before it.
const PEM_BEGIN = /-----BEGIN [A-Z0-9 ]+-----/;
const PEM_END = /-----END [A-Z0-9 ]*(?:KEY|CERTIFICATE)-----/;

/** @typedef {import("./runner-logs.mjs").PemState} PemState */

/**
 * Opens `file` for reading, never through a symlink.
 *
 * @param {string} file
 * @returns {{ fd: number, ino: number } | { refused: string } | null} null while it does not exist
 */
export function openLog(file) {
  /** @type {fs.Stats} */
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return { refused: stat.isSymbolicLink() ? "it is a symlink" : "it is not a regular file" };
  }
  try {
    const fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW);
    const opened = fs.fstatSync(fd);
    if (!opened.isFile()) {
      fs.closeSync(fd);
      return { refused: "it is not a regular file" };
    }
    return { fd, ino: opened.ino };
  } catch (error) {
    // Gone between lstat and open, or swapped for a symlink (ELOOP).
    return /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT"
      ? null
      : { refused: "it could not be opened safely" };
  }
}

/**
 * The backlog, as the pane shows it: the window's first partial line
 * dropped, and every line through `redactLine` in order, `pem` carrying a
 * block across lines, before the last few are kept. An END line with no
 * BEGIN before it ends a block the window cut: all before it is redacted.
 *
 * @param {Buffer} window
 * @param {boolean} fromStart whether the window starts at the file's start
 * @param {PemState} pem
 * @param {ReadonlySet<string>} known
 * @returns {string[]}
 */
function backlogLines(window, fromStart, pem, known) {
  let text = window.toString("utf8");
  if (!fromStart) {
    const newline = text.indexOf("\n");
    text = newline === -1 ? "" : text.slice(newline + 1);
  }
  const end = PEM_END.exec(text);
  if (end !== null && !PEM_BEGIN.test(text.slice(0, end.index))) {
    pem.inside = true;
  }
  const lines = text.split("\n");
  lines.pop(); // the last line is not finished yet
  return lines.map((line) => redactLine(line, pem, known)).slice(-BACKLOG_LINES);
}

/**
 * Follows `file`, handing each finished line, scrubbed, to `write`.
 * `poll()` reads what is new; the caller decides how often.
 *
 * @param {string} file
 * @param {(line: string) => void} write
 * @param {() => ReadonlySet<string>} [known] words that stay: the runners' names
 */
export function follower(file, write, known = () => new Set()) {
  /** @type {{ fd: number, ino: number, offset: number } | null} */
  let open = null;
  let partial = Buffer.alloc(0);
  /** @type {PemState} */
  const pem = { inside: false };
  let first = true;
  /** @type {string | null} */
  let refused = null;

  /** @param {Buffer} chunk */
  function lines(chunk) {
    partial = Buffer.concat([partial, chunk]);
    for (;;) {
      const newline = partial.indexOf(10);
      if (newline === -1) {
        break;
      }
      write(redactLine(partial.subarray(0, newline).toString("utf8"), pem, known()));
      partial = partial.subarray(newline + 1);
    }
    if (partial.length > MAX_PARTIAL) {
      write(redactLine(partial.toString("utf8"), pem, known()));
      partial = Buffer.alloc(0);
    }
  }

  /** Reads the open file from its offset to its end. */
  function drain() {
    if (open === null) {
      return;
    }
    const size = fs.fstatSync(open.fd).size;
    if (size < open.offset) {
      // Cut shorter in place: read it again from its start.
      open.offset = 0;
      partial = Buffer.alloc(0);
    }
    while (open.offset < size) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, size - open.offset));
      const read = fs.readSync(open.fd, buffer, 0, buffer.length, open.offset);
      if (read === 0) {
        break;
      }
      open.offset += read;
      lines(buffer.subarray(0, read));
    }
  }

  function reopen() {
    const opened = openLog(file);
    if (opened === null) {
      return;
    }
    if ("refused" in opened) {
      if (refused !== opened.refused) {
        refused = opened.refused;
        write(`runner-tail: refusing ${file}: ${opened.refused}`);
      }
      return;
    }
    refused = null;
    open = { fd: opened.fd, ino: opened.ino, offset: 0 };
    if (first) {
      first = false;
      const size = fs.fstatSync(opened.fd).size;
      const start = Math.max(0, size - BACKLOG_BYTES);
      const window = Buffer.alloc(size - start);
      const read = fs.readSync(opened.fd, window, 0, window.length, start);
      const backlog = window.subarray(0, read);
      for (const line of backlogLines(backlog, start === 0, pem, known())) {
        write(line);
      }
      // The unfinished last line is read again with what follows it.
      const lastNewline = backlog.lastIndexOf(10);
      open.offset = lastNewline === -1 ? start : start + lastNewline + 1;
    }
  }

  return {
    poll() {
      if (open === null) {
        reopen();
      }
      drain();
      if (open === null) {
        return;
      }
      /** @type {number | null} */
      let ino = null;
      try {
        ino = fs.lstatSync(file).ino;
      } catch {
        // Renamed and not restarted yet: the next poll looks again.
      }
      if (ino !== open.ino) {
        // Rotated: the old file is read to its end above, now the new one.
        if (partial.length > 0) {
          write(redactLine(partial.toString("utf8"), pem, known()));
          partial = Buffer.alloc(0);
        }
        fs.closeSync(open.fd);
        open = null;
        reopen();
        drain();
      }
    },
    close() {
      if (open !== null) {
        fs.closeSync(open.fd);
        open = null;
      }
    },
  };
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const file = process.argv[2];
  if (file === undefined || process.argv.length !== 3) {
    console.error("usage: runner-tail.mjs <log>");
    process.exit(2);
  }
  // The runners' names are as long as a token, and stay: read again every
  // few seconds, as runners come and go.
  const dir = path.dirname(file);
  const runners = path.basename(file) === SUPERVISOR_LOG ? path.join(dir, RUNNER_LOG_DIR) : dir;
  /** @type {ReadonlySet<string>} */
  let names = new Set();
  let namesAt = 0;
  const known = () => {
    if (Date.now() - namesAt > 5_000) {
      namesAt = Date.now();
      names = new Set(runnerLogIndex(runners, namesAt).map((runner) => runner.name));
    }
    return names;
  };
  const tail = follower(
    file,
    (line) => {
      process.stdout.write(`${line}\n`);
    },
    known,
  );
  for (;;) {
    tail.poll();
    await sleep(POLL_MS);
  }
}
