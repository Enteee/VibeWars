/**
 * The board's column changes, one line each (#891). hubd appends them as it
 * applies or learns a move; the KPI snapshot reads them back. History starts
 * the day the file does: nothing is reconstructed from the audit log.
 */
import { itemNumber } from "./hub-board.mjs";

/**
 * @typedef {object} Move
 * @property {number} ts epoch ms
 * @property {number} issue
 * @property {string | null} from `null` for a card new to the board
 * @property {string | null} to `null` for a card that left it
 * @property {string} by the employee, or `"github"` for a re-sync
 */

/**
 * The column each numbered card of `state` is in, `""` for none.
 *
 * @param {import("./hub-board.mjs").BoardState} state
 * @param {string} repo
 * @returns {Map<number, string>}
 */
function columnsOf(state, repo) {
  /** @type {Map<number, string>} */
  const columns = new Map();
  for (const { item } of state.cards) {
    const number = itemNumber(item, repo);
    if (number !== null) {
      columns.set(number, typeof item.status === "string" ? item.status : "");
    }
  }
  return columns;
}

/**
 * What moved between two copies of the board, in issue order.
 *
 * @param {import("./hub-board.mjs").BoardState} before
 * @param {import("./hub-board.mjs").BoardState} after
 * @param {{ repo: string, by: string, ts: number }} at
 * @returns {Move[]}
 */
export function movesBetween(before, after, { repo, by, ts }) {
  const was = columnsOf(before, repo);
  const is = columnsOf(after, repo);
  /** @type {Move[]} */
  const moves = [];
  for (const [issue, column] of is) {
    const old = was.get(issue);
    if (old !== column) {
      moves.push({
        ts,
        issue,
        from: old === undefined ? null : old || null,
        to: column || null,
        by,
      });
    }
  }
  for (const [issue, column] of was) {
    if (!is.has(issue)) {
      moves.push({ ts, issue, from: column || null, to: null, by });
    }
  }
  return moves.sort((a, b) => a.issue - b.issue);
}

/**
 * @param {readonly Move[]} moves
 * @returns {string} JSON lines, newline-terminated, `""` for none
 */
export function historyText(moves) {
  return moves.map((move) => `${JSON.stringify(move)}\n`).join("");
}

/**
 * @param {unknown} value
 * @returns {value is Move}
 */
function isMove(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const move = /** @type {Record<string, unknown>} */ (value);
  return (
    Number.isFinite(move.ts) &&
    Number.isInteger(move.issue) &&
    (move.from === null || typeof move.from === "string") &&
    (move.to === null || typeof move.to === "string") &&
    typeof move.by === "string"
  );
}

/**
 * The moves in a history file. A line that is not one is skipped.
 *
 * @param {string} text
 * @returns {Move[]}
 */
export function parseHistory(text) {
  /** @type {Move[]} */
  const moves = [];
  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(line);
      if (isMove(parsed)) {
        const { ts, issue, from, to, by } = parsed;
        moves.push({ ts, issue, from, to, by });
      }
    } catch {
      // A torn or foreign line: skipped.
    }
  }
  return moves;
}
