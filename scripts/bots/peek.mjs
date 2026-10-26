#!/usr/bin/env node
/**
 * `peek` — what each employee is doing, read-only (#19).
 *
 * `agent-turn.mjs` prints every turn as readable lines, which is what an
 * employee's pane shows. It also records them here, per employee, so the
 * manager can read them from inside its jail without a tmux socket: whoever
 * holds one can `send-keys` into another agent's pane, which is typing as
 * that agent past `hub` and the jail.
 *
 *   peek                      one row per employee that has run a turn
 *   peek <employee>           its last 80 lines, newest last
 *   peek <employee> --lines N up to 500
 *
 * The directory is host-written (mode 700, files 600) and bound read-only
 * into the manager's jail only. Secrets can scroll past in a tool result, so
 * `redact` runs before anything is recorded.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Lines kept per employee. */
export const KEEP_LINES = 500;
/** A line longer than this is cut, so 500 of them stay bounded. */
export const MAX_LINE = 2000;
/** The most often a writer touches the disk. */
const THROTTLE_MS = 1000;
/** Lines `peek <employee>` prints unless told otherwise. */
const DEFAULT_LINES = 80;
/** Characters of the last line a summary row shows. */
const SUMMARY_CHARS = 100;

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ESCAPES = new RegExp(
  [
    // CSI: ESC [ params intermediates final
    `${ESC}\\[[0-?]*[ -/]*[@-~]`,
    // OSC: ESC ] … BEL or ESC \
    `${ESC}\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)`,
    // Any other two-byte escape
    `${ESC}[@-Z\\\\-_]`,
  ].join("|"),
  "g",
);

/**
 * Escape sequences removed; unicode and box drawing pass through.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return text.replace(ESCAPES, "");
}

const KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/;

/** Single-line secrets, each replaced whole by `[redacted]`. */
const SECRETS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]+/g,
];

/**
 * Secrets replaced with `[redacted]`: GitHub and Telegram tokens, `sk-ant-`
 * keys, private key blocks, and the value after `Authorization:` or
 * `Bearer`. Issue numbers and commit SHAs are left alone.
 *
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  let out = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    "[redacted]",
  );
  for (const pattern of SECRETS) {
    out = out.replace(pattern, "[redacted]");
  }
  out = out.replace(
    /(Authorization:[ \t]*)(?:(?:Bearer|Basic|token)[ \t]+)?[^\s"',]+/gi,
    "$1[redacted]",
  );
  return out.replace(/(\bBearer[ \t]+)[A-Za-z0-9._~+/=-]{8,}/g, "$1[redacted]");
}

/**
 * @typedef {"turn" | "between" | "limited"} PeekState
 * @typedef {{ employee: string, state: PeekState, lastLineAt: number, lastLine: string }} PeekRow
 */

/**
 * Records one employee's last lines for `peek`.
 *
 * Lines carry over between turns: the file is read back when the writer
 * starts. Writes are atomic (temp file, rename) and at most one a second;
 * `finish` always writes.
 *
 * @param {string} dir
 * @param {string} employee
 * @param {{ now?: () => number }} [options]
 * @returns {{ line: (text: string) => void, state: (state: PeekState) => void, finish: (state: PeekState) => void }}
 */
export function peekWriter(dir, employee, options = {}) {
  if (!/^[a-z][a-z0-9-]*(@\d+)?$/.test(employee)) {
    throw new Error(`peek: refused employee ${JSON.stringify(employee)}`);
  }
  const now = options.now ?? Date.now;
  const text = path.join(dir, `${employee}.txt`);
  const meta = path.join(dir, `${employee}.json`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

  /** @type {string[]} */
  let lines = [];
  try {
    lines = fs.readFileSync(text, "utf8").split("\n").slice(0, -1).slice(-KEEP_LINES);
  } catch {
    // The first turn of this employee.
  }
  /** @type {PeekState} */
  let state = "turn";
  let lastLineAt = now();
  let lastWrite = Number.NEGATIVE_INFINITY;
  let dirty = false;
  let inKey = false;
  /** @type {NodeJS.Timeout | undefined} */
  let timer;

  /**
   * @param {string} file
   * @param {string} contents
   */
  const atomically = (file, contents) => {
    const part = `${file}.part`;
    fs.writeFileSync(part, contents, { mode: 0o600 });
    fs.renameSync(part, file);
  };
  const write = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    dirty = false;
    lastWrite = now();
    atomically(text, lines.map((line) => `${line}\n`).join(""));
    /** @type {PeekRow} */
    const row = { employee, state, lastLineAt, lastLine: lines.at(-1) ?? "" };
    atomically(meta, `${JSON.stringify(row)}\n`);
  };
  const touch = () => {
    dirty = true;
    const wait = lastWrite + THROTTLE_MS - now();
    if (wait <= 0) {
      write();
    } else if (timer === undefined) {
      timer = setTimeout(() => {
        if (dirty) {
          write();
        }
      }, wait);
      timer.unref();
    }
  };

  return {
    line(raw) {
      for (const piece of stripAnsi(raw).split("\n")) {
        // A key block can span lines; everything inside it goes.
        let kept = piece;
        if (inKey) {
          const end = KEY_END.exec(kept);
          kept = "[redacted]";
          inKey = end === null;
        } else if (KEY_BEGIN.test(kept)) {
          inKey = !KEY_END.test(kept);
        }
        const clean = redact(kept);
        lines.push(clean.length > MAX_LINE ? clean.slice(0, MAX_LINE) : clean);
      }
      lines = lines.slice(-KEEP_LINES);
      lastLineAt = now();
      touch();
    },
    state(next) {
      state = next;
      touch();
    },
    finish(next) {
      state = next;
      write();
    },
  };
}

/**
 * @param {number} ms
 * @returns {string}
 */
function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 90) {
    return `${String(s)}s ago`;
  }
  if (s < 90 * 60) {
    return `${String(Math.round(s / 60))}m ago`;
  }
  return `${String(Math.round(s / 3600))}h ago`;
}

/** @type {Record<PeekState, string>} */
const STATE_TEXT = { turn: "in turn", between: "between turns", limited: "usage limit" };

/**
 * @param {string} dir
 * @returns {PeekRow[]} one per employee that has run a turn, by id
 */
function rows(dir) {
  /** @type {PeekRow[]} */
  const found = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      const row = /** @type {PeekRow} */ (parsed);
      if (typeof row.employee === "string") {
        found.push(row);
      }
    } catch {
      // Half-written or foreign: not a row.
    }
  }
  return found.sort((a, b) => (a.employee < b.employee ? -1 : a.employee > b.employee ? 1 : 0));
}

/**
 * The CLI: what `peek` prints, and its exit code.
 *
 * @param {string[]} argv
 * @param {string} dir
 * @param {number} at
 * @returns {{ code: number, out: string }}
 */
export function peek(argv, dir, at) {
  const known = rows(dir);
  const [who, flag, count] = argv;
  if (who === undefined) {
    if (known.length === 0) {
      return { code: 0, out: "peek: no employee has run a turn yet\n" };
    }
    const width = Math.max(...known.map((row) => row.employee.length));
    return {
      code: 0,
      out: known
        .map(
          (row) =>
            `${row.employee.padEnd(width)}  ${STATE_TEXT[row.state].padEnd(13)}  ${ago(at - row.lastLineAt).padEnd(8)}  ${row.lastLine.slice(0, SUMMARY_CHARS)}\n`,
        )
        .join(""),
    };
  }
  const row = known.find((candidate) => candidate.employee === who);
  if (row === undefined) {
    return {
      code: 1,
      out: `peek: no output from ${who}; known: ${known.map((r) => r.employee).join(", ")}\n`,
    };
  }
  let lines = DEFAULT_LINES;
  if (flag !== undefined) {
    const n = Number(count);
    if (flag !== "--lines" || !Number.isInteger(n) || n < 1) {
      return { code: 2, out: "usage: peek [employee [--lines N]]\n" };
    }
    lines = Math.min(n, KEEP_LINES);
  }
  const all = fs
    .readFileSync(path.join(dir, `${row.employee}.txt`), "utf8")
    .split("\n")
    .slice(0, -1);
  return {
    code: 0,
    out: all
      .slice(-lines)
      .map((line) => `${line}\n`)
      .join(""),
  };
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = process.env.VIBEWARS_PEEK_DIR;
  if (dir === undefined || dir === "") {
    process.stderr.write("peek: VIBEWARS_PEEK_DIR is not set; only the manager has peek\n");
    process.exit(2);
  }
  const result = peek(process.argv.slice(2), dir, Date.now());
  process.stdout.write(result.out);
  process.exit(result.code);
}
