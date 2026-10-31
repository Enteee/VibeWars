/**
 * The wait log (#1615): `tg wait` and `board wait` each append one line to
 * `bus/<employee>/waits.jsonl` when a wait returns, and hubd reads every
 * employee's for the idle KPIs. A wait killed mid-way writes nothing.
 */
import fs from "node:fs";
import path from "node:path";

/** The log's name in an employee's bus directory. */
export const WAITS_FILE = "waits.jsonl";

/** How far back the log keeps its lines, in ms: its writer trims it. */
export const WAITS_KEEP_MS = 8 * 24 * 3_600_000;

/**
 * @typedef {{ start: number, end: number, cmd: "tg" | "board",
 *   woke: "message" | "card" | "timeout" | "ceiling" | "down" }} WaitLine
 * ms timestamps; `woke` is what ended it
 */

const CMDS = new Set(["tg", "board"]);
const WOKE = new Set(["message", "card", "timeout", "ceiling", "down"]);

/**
 * @param {unknown} value
 * @returns {value is WaitLine}
 */
function isWaitLine(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { start, end, cmd, woke } = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= end &&
    typeof cmd === "string" &&
    CMDS.has(cmd) &&
    typeof woke === "string" &&
    WOKE.has(woke)
  );
}

/**
 * The lines of a wait log; one that does not parse as a `WaitLine`, a torn
 * last line say, is skipped.
 *
 * @param {string} text
 * @returns {WaitLine[]}
 */
export function parseWaits(text) {
  return text.split("\n").flatMap((raw) => {
    if (raw.trim() === "") {
      return [];
    }
    try {
      /** @type {unknown} */
      const line = JSON.parse(raw);
      return isWaitLine(line) ? [line] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Append `line` to the log in `dir`. If its first line ended over
 * `WAITS_KEEP_MS` before `line`, the log is rewritten first with only the
 * lines since. A failure is ignored: it never fails the wait.
 *
 * @param {string} dir the employee's bus directory
 * @param {WaitLine} line
 * @returns {void}
 */
export function appendWait(dir, line) {
  const file = path.join(dir, WAITS_FILE);
  try {
    let text = "";
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      // No log yet.
    }
    const since = line.end - WAITS_KEEP_MS;
    const lines = parseWaits(text);
    if ((lines[0]?.end ?? since) < since) {
      const kept = lines.filter((old) => old.end >= since);
      fs.writeFileSync(file, kept.map((old) => `${JSON.stringify(old)}\n`).join(""));
    }
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
  } catch {
    // The log is a measurement; the wait it measures matters more.
  }
}
