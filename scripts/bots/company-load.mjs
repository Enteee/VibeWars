/**
 * `company load` (#747): what the manager's two-hourly staffing review is
 * decided on, as plain text. The manager cannot see the dashboard, which
 * runs on the host, so hubd answers with the dashboard's own numbers: the
 * board's queues, who is employed and what each is doing, and the tokens
 * each role spent. Pure: hubd gathers the facts (company-facts.mjs).
 */
import { formatCount } from "./claude-usage.mjs";
import { hhmm, staffNote } from "./dashboard-view.mjs";
import { visible } from "./protocol.mjs";

/** The columns a staffing review weighs; Backlog and Done are not load. */
export const LOAD_COLUMNS = ["Ready", "In Progress", "In Review", "QA", "Blocked"];

/** @type {Record<import("./peek.mjs").PeekState, string>} */
const STATE_TEXT = { turn: "in turn", between: "between", limited: "usage limit" };

/**
 * @typedef {object} LoadFacts
 * @property {number} now epoch milliseconds
 * @property {readonly string[]} roles every role, in org-chart order
 * @property {{ cards: readonly { item: unknown }[] } | null} board hubd's copy, null before it has one
 * @property {import("./staff.mjs").Staff | null} staff null while `staff.json` is missing or malformed
 * @property {number | null} maxAgents null when `company.json` has none
 * @property {ReadonlySet<string>} live employees whose roster entry is fresh
 * @property {ReadonlyMap<string, number>} stale employees whose roster entry went stale, last seen
 * @property {readonly import("./peek.mjs").PeekRow[]} peek every employee's last turn state
 * @property {import("./claude-usage.mjs").UsageSummary | null} usage null with no usage logs
 */

/**
 * A duration as `0m`, `34m` or `2h10m`.
 *
 * @param {number} ms
 * @returns {string}
 */
function since(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  return `${String(Math.floor(minutes / 60))}h${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Cards per load column.
 *
 * @param {{ cards: readonly { item: unknown }[] }} board
 * @returns {Map<string, number>}
 */
function counts(board) {
  const found = new Map(LOAD_COLUMNS.map((column) => [column, 0]));
  for (const { item } of board.cards) {
    const status =
      typeof item === "object" && item !== null && "status" in item ? item.status : null;
    const count = typeof status === "string" ? found.get(status) : undefined;
    if (typeof status === "string" && count !== undefined) {
      found.set(status, count + 1);
    }
  }
  return found;
}

/**
 * What one employee is doing: fired, down or not running as the dashboard
 * says it, otherwise its last turn's state and how long since its last line.
 *
 * @param {string} id
 * @param {LoadFacts} facts
 * @param {import("./staff.mjs").Staff} staff
 * @returns {string}
 */
function activity(id, facts, staff) {
  const note = staffNote(id, facts, { staff, now: facts.now });
  if (note !== null) {
    return note;
  }
  const row = facts.peek.find((candidate) => candidate.employee === id);
  return row === undefined
    ? `${id} no turn yet`
    : `${id} ${STATE_TEXT[row.state]} ${since(facts.now - row.lastLineAt)}`;
}

/**
 * The `company load` table, one string per line.
 *
 * @param {LoadFacts} facts
 * @returns {string[]}
 */
export function loadLines(facts) {
  const { staff, usage } = facts;
  const headcount =
    staff === null
      ? "staff unknown (no staff.json)"
      : `staff ${String(Object.keys(staff.employees).length)}/${facts.maxAgents === null ? "?" : String(facts.maxAgents)}`;
  const board =
    facts.board === null
      ? "board   unknown (hubd has no copy of the board yet)"
      : `board   ${[...counts(facts.board)].map(([column, n]) => `${column} ${String(n)}`).join("  ")}`;

  const rows = facts.roles.map((role) => {
    const mine =
      staff === null
        ? null
        : Object.keys(staff.employees)
            .filter((id) => staff.employees[id]?.role === role)
            .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    return {
      role,
      n: mine === null ? "?" : String(mine.length),
      employees:
        mine === null || staff === null
          ? "unknown"
          : mine.length === 0
            ? "-"
            : mine.map((id) => activity(id, facts, staff)).join("; "),
      tokens: usage === null ? "?" : formatCount(usage.roles.get(role)?.output ?? 0),
    };
  });
  const header = "employees (state, last activity)";
  const width = Math.max(header.length, ...rows.map((row) => row.employees.length));
  return [
    `LOAD  as of ${hhmm(facts.now)}   ${headcount}`,
    board,
    `${"role".padEnd(16)} n  ${header.padEnd(width)}  tokens out 5h`,
    ...rows.map(({ role, n, employees, tokens }) =>
      `${role.padEnd(16)}${n.padStart(2)}  ${employees.padEnd(width)}  ${tokens.padStart(5)}`.trimEnd(),
    ),
    ...(usage === null ? ["tokens  unknown (no usage logs)"] : []),
  ].map(visible);
}
