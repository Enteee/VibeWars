/**
 * What the dashboard's panes say, as plain functions of what it read
 * (#165). No files, no terminal, no clock: `dashboard.mjs` reads and
 * draws, and everything here is testable with a fixture.
 *
 * Every function returns at most `rows` lines, none wider than `width`
 * once its colour codes are left out. A line one column too wide makes
 * tmux wrap it, and the whole pane jumps.
 */
import { formatCount } from "./claude-usage.mjs";
import { visible } from "./protocol.mjs";
import { DRAIN_MS, clock } from "./reboot.mjs";

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
 * @param {ReadonlySet<string>} live the roles with an employee running right now
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
 * @property {ReadonlySet<string>} live the employees running right now
 * @property {ReadonlyMap<string, number>} stale employees whose agent died without cleaning up, to when it was last seen (#363)
 * @property {StaffFacts | null} staff null while `staff.json` is missing or malformed (#386)
 * @property {Budget | null} budget null before hubd has checked
 * @property {ReturnType<typeof import("./hub-health.mjs").hubHealth>} hub hubd, as its heartbeat and restarts say (#23)
 * @property {ClaudeUsage | null} claude null before any agent has logged (#50)
 * @property {NudgeFacts} nudges the scheduled nudges and how they are doing (#547)
 * @property {{ record: import("./reboot.mjs").Reboot, between: readonly string[], now: number } | { rebooting: string } | null} reboot
 *   the pending reboot with the roles between turns, or the reason of the one handed to the restarter (#345)
 * @property {{ line: string, stale: boolean } | null} build the build the company runs, against the checkout; null when the dashboard runs from the checkout (#557)
 */

/**
 * @typedef {object} NudgeFacts
 * @property {readonly import("./schedule.mjs").Nudge[] | string} schedule `schedule.json`, or what is wrong with it
 * @property {number | null} since when hubd began counting, null if it never wrote `nudges.json`
 * @property {ReadonlyMap<string, number>} sent when hubd last sent each nudge
 * @property {ReadonlyMap<string, readonly string[]>} unread the employees who have each nudge unread
 * @property {number} now epoch milliseconds
 */

/**
 * Who is employed, as `staff.json` says, with what the dashboard read
 * beside it (#386).
 *
 * @typedef {object} StaffFacts
 * @property {import("./staff.mjs").Staff} staff
 * @property {number | null} maxAgents `company.json`'s, or null if it has none
 * @property {number} managerRestarts the watchdog's restarts of the manager today (#384)
 * @property {number} now epoch milliseconds
 */

/**
 * The order of one role's employees: the bare seat, then `@2`, `@3`, ….
 *
 * @param {string} id
 * @returns {number}
 */
function seat(id) {
  const n = id.split("@")[1];
  return n === undefined ? 1 : Number(n);
}

/**
 * What one employee is doing when it is not simply working: being fired,
 * down, or not running at all.
 *
 * @param {string} id
 * @param {CompanyFacts} facts
 * @param {StaffFacts} staff
 * @returns {string | null} null for an employee at work
 */
function staffNote(id, { live, stale }, { staff, now }) {
  const employee = staff.employees[id];
  if (employee?.state === "firing") {
    if (employee.readyAt !== null) {
      return `${id} firing (ready)`;
    }
    // #21's drain: ten minutes from the fire, then the pane goes.
    const at = staff.recent
      .filter((change) => change.id === id && change.change === "fire")
      .at(-1)?.at;
    if (at === undefined) {
      return `${id} firing`;
    }
    const left = at + DRAIN_MS - now;
    return left <= 0
      ? `${id} firing (overdue)`
      : `${id} firing (${String(Math.ceil(left / 60_000))} min left)`;
  }
  const lastSeen = stale.get(id);
  if (lastSeen !== undefined) {
    return `${id} down since ${hhmm(lastSeen)}`;
  }
  return live.has(id) ? null : `${id} not running`;
}

/**
 * The STAFF section (#386): headcount per role in org-chart order out of
 * `maxAgents`, and every employee that is not at work. A role with nobody
 * is a dimmed 0. Read-only: hubd alone writes `staff.json`.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function staffSection(facts, width) {
  const { roles, staff } = facts;
  if (staff === null) {
    return [paint(cut("STAFF unknown (no staff.json yet: claude-llc up seeds it)", width), "1")];
  }
  const ids = Object.keys(staff.staff.employees);
  const cap = staff.maxAgents === null ? "?" : String(staff.maxAgents);
  return [
    paint(cut(`STAFF  ${String(ids.length)}/${cap}`, width), "1"),
    ...roles.map((role) => {
      const mine = ids
        .filter((id) => staff.staff.employees[id]?.role === role)
        .sort((a, b) => seat(a) - seat(b));
      const notes = mine.flatMap((id) => staffNote(id, facts, staff) ?? []);
      if (role === "manager" && staff.managerRestarts > 0) {
        notes.unshift(`restarted ${String(staff.managerRestarts)}× today`);
      }
      const row = cut(
        `  ${role.padEnd(16)}${String(mine.length).padStart(2)}   ${notes.join(", ")}`.trimEnd(),
        width,
      );
      return mine.length === 0 ? paint(row, "2") : row;
    }),
  ];
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
 * The hub line: red unless hubd is up, since every agent's GitHub goes
 * through it (#23).
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function hubSection({ hub }, width) {
  return [paint(cut(hub.line, width), hub.state === "up" ? "1;32" : "1;31")];
}

/**
 * What each role's Claude used (#50), with the clock it was read at:
 * the pane's own functions have none.
 *
 * @typedef {object} ClaudeUsage
 * @property {import("./claude-usage.mjs").UsageSummary} summary
 * @property {ReadonlySet<string>} capped roles whose counts are short: their
 *   logs hold more replies than are kept
 * @property {number} now epoch milliseconds
 */

/**
 * One row of the CLAUDE table: a name, then four counts and a model.
 *
 * @param {string} name
 * @param {readonly string[]} cells replies, output, input, cache read
 * @param {string} model
 * @returns {string}
 */
function usageRow(name, cells, model) {
  const [replies = "", output = "", input = "", cacheRead = ""] = cells;
  return `  ${name.padEnd(15)}${replies.padStart(8)}${output.padStart(9)}${input.padStart(9)}${cacheRead.padStart(10)}  ${model}`.trimEnd();
}

/**
 * Tokens per role over the plan's 5-hour window (#50), so a role stuck in
 * a loop shows before the limit hits everyone. No prices and no quota:
 * neither is in the logs.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function claudeSection({ roles, claude }, width) {
  if (claude === null) {
    return [cut("CLAUDE usage unknown (no agent logs yet)", width)];
  }
  const { summary, capped, now } = claude;
  let top = "";
  let most = 0;
  for (const [role, usage] of summary.roles) {
    if (usage.output > most) {
      top = role;
      most = usage.output;
    }
  }
  /** @param {import("./claude-usage.mjs").RoleUsage} usage */
  const counts = (usage) =>
    [usage.replies, usage.output, usage.input, usage.cacheRead].map(formatCount);
  return [
    paint(cut(`CLAUDE tokens, last 5h, as of ${hhmm(now)}`, width), "1"),
    cut(usageRow("role", ["replies", "output", "input", "cache rd"], "model"), width),
    ...roles.map((role) => {
      const usage = summary.roles.get(role);
      if (usage === undefined) {
        return cut(usageRow(role, ["—"], ""), width);
      }
      // The model is agent-written, printed into the operator's tmux: see
      // `visible`. A capped row says so instead, where no model can push it
      // out of the pane.
      const model = capped.has(role) ? "over cap" : visible(usage.model.replace(/^claude-/, ""));
      const line = cut(
        usageRow(role, counts(usage), `${model}${role === top ? "  <- top" : ""}`),
        width,
      );
      return role === top ? paint(line, "1") : line;
    }),
    cut(
      usageRow("total", counts(summary.total), `(today: ${formatCount(summary.todayOutput)} out)`),
      width,
    ),
  ];
}

/**
 * The reboot, as the COMPANY pane tells it (#345): who holds the drain up
 * is the roles in a turn that have not run `company ready`; a role between
 * turns counts as done, as in `drainStep`.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
// Reason and role names are agent-written, printed into the operator's tmux: see `visible`.
function rebootSection({ reboot, roles, live }, width) {
  if (reboot === null) {
    return [];
  }
  if ("rebooting" in reboot) {
    return [paint(cut(`REBOOTING now — ${visible(reboot.rebooting)}`, width), "1;31")];
  }
  const { record, between, now } = reboot;
  const left = record.deadline - now;
  const when =
    left <= 0
      ? `REBOOT overdue since ${clock(record.deadline)}, stopping`
      : `REBOOT by ${clock(record.deadline)} (in ${left < 60_000 ? "<1m" : `${String(Math.ceil(left / 60_000))}m`}) — ${visible(record.by)}: ${visible(record.reason)}`;
  const inOrder = (/** @type {(role: string) => boolean} */ keep) =>
    [...new Set([...roles, ...live, ...record.ready])].filter(keep);
  const notReady = (/** @type {string} */ role) => live.has(role) && !record.ready.includes(role);
  /** @type {{ label: string, names: string[] }[]} */
  const rows = [
    { label: "ready:   ", names: inOrder((role) => record.ready.includes(role)) },
    { label: "waiting: ", names: inOrder((role) => notReady(role) && !between.includes(role)) },
    { label: "idle:    ", names: inOrder((role) => notReady(role) && between.includes(role)) },
  ];
  return [
    paint(cut(when, width), "1;31"),
    ...rows
      .filter(({ names }) => names.length > 0)
      .map(({ label, names }) => cut(`  ${label}${names.map(visible).join(", ")}`, width)),
  ];
}

/**
 * The build the company runs (#557): a STALE one is red, as a reboot is,
 * because it is the company not running what the checkout says.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function buildSection({ build }, width) {
  if (build === null) {
    return [];
  }
  return [build.stale ? paint(cut(build.line, width), "1;31") : cut(build.line, width)];
}

/**
 * The scheduled nudges (#547): when each last went, when it is next due, and
 * who has not read it. No schedule is no section.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
export function nudgeLines({ nudges: { schedule, since, sent, unread, now } }, width) {
  if (typeof schedule === "string") {
    return [cut(`nudges: schedule.json: ${visible(schedule)}`, width)];
  }
  if (schedule.length === 0) {
    return [];
  }
  return [
    "nudges",
    ...schedule.flatMap((nudge) => {
      const last = sent.get(nudge.id);
      const base = last ?? since;
      const due = base === null ? null : base + nudge.everyMinutes * 60_000;
      const next = due === null ? "—" : due < now - 60_000 ? "overdue" : hhmm(due);
      const who = unread.get(nudge.id) ?? [];
      const head = [
        `${nudge.id} → ${nudge.to}`,
        `every ${String(nudge.everyMinutes)}m`,
        `last ${last === undefined ? (since === null ? "—" : "never") : hhmm(last)}`,
        `next ${next}`,
        ...(who.length > 0 ? [`unread: ${who.join(", ")}`] : []),
      ].join(" · ");
      return [cut(`  ${head}`, width), cut(`    ${visible(nudge.text)}`, width)];
    }),
  ];
}

/**
 * The COMPANY pane's sections, in order. A new one is a
 * function here rather than a pane, as #23's hub line and #50's tokens are.
 *
 * @type {readonly ((facts: CompanyFacts, width: number) => string[])[]}
 */
export const COMPANY_SECTIONS = [
  rebootSection,
  buildSection,
  staffSection,
  hubSection,
  githubSection,
  claudeSection,
  nudgeLines,
];

/**
 * The COMPANY pane: each section, a blank line between, cut with
 * `… +N lines` when they overflow.
 *
 * @param {CompanyFacts} facts
 * @param {Pane} pane
 * @returns {string[]}
 */
export function companyLines(facts, { rows, width }) {
  const lines = COMPANY_SECTIONS.map((section) => section(facts, width))
    .filter((section) => section.length > 0)
    .flatMap((section, index) => [...(index === 0 ? [] : [""]), ...section]);
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
