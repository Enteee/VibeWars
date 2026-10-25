/**
 * What the dashboard's panes say, as plain functions of what it read
 * (#165). No files, no terminal, no clock: `dashboard.mjs` reads and
 * draws, and everything here is testable with a fixture.
 *
 * Every function returns at most `rows` lines, none wider than `width`
 * once its colour codes are left out. A line one column too wide makes
 * tmux wrap it, and the whole pane jumps.
 */
import { visible } from "./protocol.mjs";

/**
 * Which roles each column needs before work can leave it. Used to explain a
 * stalled board rather than to enforce anything.
 *
 * @type {Record<string, string[] | undefined>}
 */
export const COLUMN_OWNERS = {
  Backlog: ["architect", "manager"],
  Ready: ["developer-1", "developer-2"],
  "In Progress": ["developer-1", "developer-2"],
  "In Review": ["lead-dev"],
  QA: ["perf-sec-qa", "qa-tester"],
};

/** Too many cards to list, and nobody waits on them: a count is enough. */
const COUNT_ONLY = new Set(["Backlog", "Ready"]);
const DONE = "Done";
const DONE_SHOWN = 3;

/** Below this, a pane shows counts and nothing else. */
const TINY_ROWS = 8;
const TINY_WIDTH = 30;

/**
 * The 16 ANSI colours only, so a dark and a light terminal both read them.
 *
 * @type {Record<string, string>}
 */
const COLUMN_COLOURS = {
  Backlog: "37",
  Ready: "34",
  "In Progress": "36",
  "In Review": "33",
  QA: "32",
  Done: "32",
};

/**
 * @param {string} text plain text, already cut to width
 * @param {string} sgr an SGR parameter list, such as "1;36"
 * @returns {string}
 */
function paint(text, sgr) {
  return `\u001B[${sgr}m${text}\u001B[0m`;
}

/**
 * `text` in at most `width` columns, ending in `…` when cut. Counts code
 * points, which is what every title on the board is made of so far.
 *
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
export function cut(text, width) {
  const chars = Array.from(text);
  if (chars.length <= width) {
    return text;
  }
  return width <= 0 ? "" : `${chars.slice(0, width - 1).join("")}…`;
}

/**
 * @param {number} at epoch milliseconds
 * @returns {string}
 */
export function hhmm(at) {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @typedef {object} ShownCard
 * @property {number} number
 * @property {string} title agent-written; not yet through `visible`
 * @property {number} rev the board revision that last changed it
 */

/**
 * Done cards, most recently done first.
 *
 * The board copy has no timestamp per card, but each carries the revision
 * that last changed it, and moving a card to Done is such a change. Ties,
 * as after a cold sweep where every card shares one revision, go to the
 * higher issue number. A title edit to a Done card also bumps it; that is
 * accepted rather than adding a field to the board format.
 *
 * @param {readonly ShownCard[]} cards
 * @returns {ShownCard[]}
 */
export function doneOrder(cards) {
  return [...cards].sort((a, b) => b.rev - a.rev || b.number - a.number);
}

/**
 * @typedef {object} Pane
 * @property {number} rows
 * @property {number} width
 */

/**
 * The cards of a board snapshot, by column.
 *
 * @param {{ cards: readonly { rev: number, item: unknown }[] }} snapshot
 * @returns {Map<string, ShownCard[]>}
 */
function byColumn(snapshot) {
  /** @type {Map<string, ShownCard[]>} */
  const columns = new Map();
  for (const { rev, item } of snapshot.cards) {
    const row = obj(item);
    const content = obj(row.content);
    const column = typeof row.status === "string" && row.status !== "" ? row.status : "(none)";
    const cards = columns.get(column) ?? [];
    cards.push({
      number: typeof content.number === "number" ? content.number : 0,
      title: typeof content.title === "string" ? content.title : "",
      rev,
    });
    columns.set(column, cards);
  }
  return columns;
}

/**
 * How many card rows each listed column gets out of `spare`.
 *
 * Fair first: every column with cards gets one row, in board order, while
 * rows last; then one more for each that would be cut, so it can say how
 * many it hid. Whatever is left goes to columns in board order, In
 * Progress first, until each shows all its cards.
 *
 * @param {readonly number[]} counts cards per listed column, in board order
 * @param {number} spare
 * @returns {number[]}
 */
function shareRows(counts, spare) {
  const rows = counts.map(() => 0);
  let left = spare;
  for (const [index, count] of counts.entries()) {
    if (count > 0 && left > 0) {
      rows[index] = 1;
      left -= 1;
    }
  }
  for (const [index, count] of counts.entries()) {
    if (count > 1 && left > 0) {
      rows[index] = 2;
      left -= 1;
    }
  }
  for (const [index, count] of counts.entries()) {
    const more = Math.min(left, count - (rows[index] ?? 0));
    if (more > 0) {
      rows[index] = (rows[index] ?? 0) + more;
      left -= more;
    }
  }
  return rows;
}

/**
 * @param {ShownCard} card
 * @param {number} width
 * @returns {string}
 */
function cardLine(card, width) {
  // Titles are agent-written, printed into the operator's tmux: see `visible`.
  return cut(`  #${String(card.number).padEnd(4)} ${visible(card.title)}`, width);
}

/**
 * The BOARD pane.
 *
 * Backlog and Ready are a count each. In Progress, In Review and QA list
 * as many cards as fit, ending in `… +N more` when they do not. Done is
 * always the three most recently done, with no count.
 *
 * @param {{ at: number, sweptAt: number, cards: readonly { rev: number, item: unknown }[] } | null} snapshot
 *   hubd's board copy, or null before its first sweep
 * @param {readonly string[] | null} columns the board's columns, or null before claude-llc-init
 * @param {ReadonlySet<string>} live the roles hired right now
 * @param {Pane} pane
 * @returns {string[]}
 */
export function boardLines(snapshot, columns, live, { rows, width }) {
  if (columns === null) {
    return [cut("board: not set up yet — run claude-llc-init", width)].slice(0, rows);
  }
  if (snapshot === null) {
    return [cut("(no snapshot yet — hubd writes one on the first board read)", width)].slice(
      0,
      rows,
    );
  }

  const cards = byColumn(snapshot);
  const tiny = rows < TINY_ROWS || width < TINY_WIDTH;
  const listed = columns.filter((column) => !COUNT_ONLY.has(column) && column !== DONE);
  const done = doneOrder(cards.get(DONE) ?? []).slice(0, DONE_SHOWN);
  const total = columns.reduce((sum, column) => sum + (cards.get(column)?.length ?? 0), 0);

  // The header, a line per column, Done's cards and the empty note are
  // fixed; the rest is shared between the listed columns.
  const fixed =
    1 + columns.length + (tiny || !columns.includes(DONE) ? 0 : done.length) + (total ? 0 : 1);
  const share = shareRows(
    listed.map((column) => (tiny ? 0 : (cards.get(column)?.length ?? 0))),
    Math.max(0, rows - fixed),
  );

  // The copy is only swept when someone reads the board, so an old sweep
  // means a quiet company, not a broken dashboard.
  const lines = [cut(`as of ${hhmm(snapshot.at)} (swept ${hhmm(snapshot.sweptAt)})`, width)];
  for (const column of columns) {
    const here = cards.get(column) ?? [];
    const owners = COLUMN_OWNERS[column] ?? [];
    const blocked = owners.length > 0 && owners.every((role) => !live.has(role));
    const note = here.length > 0 && blocked ? "  <- nobody hired to move this" : "";
    const colour = COLUMN_COLOURS[column] ?? "39";

    if (column === DONE) {
      lines.push(
        paint(cut(tiny ? `Done ${String(here.length)}` : "Done (last 3)", width), `1;${colour}`),
      );
      if (!tiny) {
        lines.push(...done.map((card) => cardLine(card, width)));
      }
      continue;
    }

    const name = cut(`${column.padEnd(13)} ${String(here.length).padStart(3)}`, width);
    lines.push(paint(name, `1;${colour}`) + cut(note, width - Array.from(name).length));

    const allowed = share[listed.indexOf(column)] ?? 0;
    if (allowed >= here.length) {
      lines.push(...here.map((card) => cardLine(card, width)));
    } else if (allowed === 1) {
      lines.push(cardLine(here[0] ?? { number: 0, title: "", rev: 0 }, width));
    } else if (allowed > 1) {
      lines.push(...here.slice(0, allowed - 1).map((card) => cardLine(card, width)));
      lines.push(cut(`  … +${String(here.length - allowed + 1)} more`, width));
    }
  }
  if (total === 0) {
    lines.push(cut("  (empty — tell the architect what you want built)", width));
  }
  return lines.slice(0, rows);
}

/**
 * @typedef {object} Budget
 * @property {number} remaining
 * @property {number} limit
 * @property {number} resetAt epoch milliseconds
 * @property {string} spend `formatSpend`'s one line on where it went
 */

/**
 * @typedef {object} CompanyFacts
 * @property {readonly string[]} roles every role, in org-chart order
 * @property {ReadonlySet<string>} live the roles hired right now
 * @property {Budget | null} budget null before hubd has checked
 */

/**
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function rosterSection({ roles, live }, width) {
  const absent = roles.filter((role) => !live.has(role));
  const lines = [
    paint(cut(`ROSTER ${String(live.size)}/${String(roles.length)} hired`, width), "1"),
  ];
  // As many roles a row as the pane is wide.
  const cell = Math.max(...roles.map((role) => role.length)) + 3;
  const perRow = Math.max(1, Math.floor((width - 2) / cell));
  for (let i = 0; i < roles.length; i += perRow) {
    const row = roles
      .slice(i, i + perRow)
      .map((role) => `${live.has(role) ? "+" : "-"} ${role}`.padEnd(cell))
      .join("");
    lines.push(cut(`  ${row}`.trimEnd(), width));
  }
  if (absent.length > 0) {
    lines.push(cut(`  not hired yet: ${absent.join(", ")}`, width));
    lines.push(cut("  (rate-limited? provision the rest later: claude-bot <role>)", width));
  }
  return lines;
}

/**
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function githubSection({ budget }, width) {
  if (budget === null) {
    return [cut("GITHUB budget unknown (hubd has not checked yet)", width)];
  }
  const empty = budget.remaining === 0;
  const line = cut(
    `GITHUB GraphQL ${String(budget.remaining)}/${String(budget.limit)}, resets ${hhmm(budget.resetAt)}`,
    width,
  );
  return [
    paint(line, empty ? "1;31" : "1"),
    ...(empty ? [paint(cut("  RATE-LIMITED, agents are waiting", width), "31")] : []),
    cut(budget.spend, width),
  ];
}

/**
 * The COMPANY pane's sections, in order. #23 (hub health) and #50 (tokens
 * per role) each add a function here rather than a pane.
 *
 * @type {readonly ((facts: CompanyFacts, width: number) => string[])[]}
 */
export const COMPANY_SECTIONS = [rosterSection, githubSection];

/**
 * The COMPANY pane: each section, a blank line between, cut with
 * `… +N lines` when they overflow.
 *
 * @param {CompanyFacts} facts
 * @param {Pane} pane
 * @returns {string[]}
 */
export function companyLines(facts, { rows, width }) {
  const lines = COMPANY_SECTIONS.flatMap((section, index) => [
    ...(index === 0 ? [] : [""]),
    ...section(facts, width),
  ]);
  if (lines.length <= rows) {
    return lines;
  }
  const kept = Math.max(0, rows - 1);
  return [...lines.slice(0, kept), cut(`… +${String(lines.length - kept)} lines`, width)].slice(
    0,
    rows,
  );
}

/**
 * @typedef {object} FeedLine
 * @property {number} ts epoch milliseconds, 0 when unknown
 * @property {string} from
 * @property {string} to
 * @property {string} text
 */

/**
 * @typedef {object} InboxRow
 * @property {number} ts
 * @property {string} to the inbox it was read from
 * @property {string} from
 * @property {string} kind
 * @property {string} text
 */

/**
 * One row per message, not one per inbox it reached (#189). A broadcast,
 * or the operator writing in General, lands the same line in every inbox;
 * those copies (same time, sender, kind and text) become one row to
 * `all`. `tg send` has one recipient, so two or more can only be that.
 *
 * @param {readonly InboxRow[]} rows in any order
 * @returns {FeedLine[]} oldest first
 */
export function groupFeed(rows) {
  /** @type {Map<string, { ts: number, from: string, text: string, to: Set<string> }>} */
  const messages = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.ts, row.from, row.kind, row.text]);
    const message = messages.get(key);
    if (message === undefined) {
      messages.set(key, { ts: row.ts, from: row.from, text: row.text, to: new Set([row.to]) });
    } else {
      message.to.add(row.to);
    }
  }
  return [...messages.values()]
    .map(({ ts, from, text, to }) => ({
      ts,
      from,
      to: to.size >= 2 ? "all" : ([...to][0] ?? "?"),
      text,
    }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * The TELEGRAM pane: the newest messages that fit, oldest at the top,
 * each on one line cut to the pane's full width.
 *
 * @param {readonly FeedLine[]} feed oldest first
 * @param {Pane} pane
 * @returns {string[]}
 */
export function feedLines(feed, { rows, width }) {
  if (feed.length === 0) {
    return [cut("(nothing said yet)", width)].slice(0, rows);
  }
  return feed.slice(-Math.max(0, rows)).map((line) => {
    const when = line.ts === 0 ? "--:--" : hhmm(line.ts);
    // Agent-written text, printed into the operator's tmux; see `visible`.
    const who = `${visible(line.from)} -> ${visible(line.to)}`;
    return paint(when, "2") + " " + cut(`${who}: ${visible(line.text)}`, width - when.length - 1);
  });
}
