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
import { SPEND_WINDOW_MS, summarizeSpend } from "./hub-spend.mjs";
import { KPI_SCHEMA_VERSION } from "./kpi.mjs";
import { visible } from "./protocol.mjs";
import { DRAIN_MS, clock } from "./reboot.mjs";

/**
 * Which roles each column needs before work can leave it. Used to explain a
 * stalled board rather than to enforce anything.
 *
 * @type {Record<string, string[] | undefined>}
 */
export const COLUMN_OWNERS = {
  Blocked: ["manager"],
  Backlog: ["architect", "manager"],
  Ready: ["developer"],
  "In Progress": ["developer"],
  "In Review": ["lead-dev"],
  QA: ["perf-sec-qa", "qa-tester"],
};

/** Too many cards to list, and nobody waits on them: a count is enough. */
const COUNT_ONLY = new Set(["Backlog", "Ready"]);
const BLOCKED = "Blocked";
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
  Blocked: "31",
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
 * How many issues on the board sit in no column, "No Status" on GitHub
 * (#520). Pull requests and drafts are not counted: the manager places
 * those. The copy does not know whether an issue is closed, so a closed
 * one with no column counts too; GitHub's "closed → Done" workflow makes
 * that rare.
 *
 * @param {{ cards: readonly { item: unknown }[] }} snapshot
 * @returns {number}
 */
function noStatusIssues(snapshot) {
  return snapshot.cards.filter(({ item }) => {
    const row = obj(item);
    return (
      (typeof row.status !== "string" || row.status === "") && obj(row.content).type === "Issue"
    );
  }).length;
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
 * The board, at the top of the BOARD pane (`boardScreenLines`).
 *
 * Backlog and Ready are a count each. In Progress, In Review and QA list
 * as many cards as fit, ending in `… +N more` when they do not. Done is
 * always the three most recently done, with no count.
 *
 * @param {{ at: number, sweptAt: number, cards: readonly { rev: number, item: unknown }[] } | null} snapshot
 *   hubd's board copy, or null before its first sweep
 * @param {readonly string[] | null} boardColumns the board's columns, or null before claude-llc-init;
 *   Blocked, last on the board, is shown first
 * @param {ReadonlySet<string>} live the roles with an employee running right now
 * @param {Pane} pane
 * @returns {string[]}
 */
export function boardLines(snapshot, boardColumns, live, { rows, width }) {
  const columns = boardColumns === null ? null : blockedFirst(boardColumns);
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

  // The header, the No Status count, a line per column, Done's cards and
  // the empty note are fixed; the rest is shared between the listed columns.
  const fixed =
    2 + columns.length + (tiny || !columns.includes(DONE) ? 0 : done.length) + (total ? 0 : 1);
  const share = shareRows(
    listed.map((column) => (tiny ? 0 : (cards.get(column)?.length ?? 0))),
    Math.max(0, rows - fixed),
  );

  // The copy is only swept when someone reads the board, so an old sweep
  // means a quiet company, not a broken dashboard.
  const lines = [cut(`as of ${hhmm(snapshot.at)} (swept ${hhmm(snapshot.sweptAt)})`, width)];
  // Always there, so the pane does not jump when one arrives; loud only
  // when there is something to go and look at.
  const unplaced = noStatusIssues(snapshot);
  lines.push(
    paint(
      cut(`${"No Status".padEnd(13)} ${String(unplaced).padStart(3)}`, width),
      unplaced > 0 ? "1;33" : "2",
    ),
  );
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
 * The BOARD screen (#883): the board, a blank line, then the nudges. The
 * board comes first: the nudges get at most half the rows, cut with
 * `… +N lines`, and the board fits itself into the rest. No nudges, or a
 * tiny pane, is the board alone.
 *
 * @param {Parameters<typeof boardLines>[0]} snapshot
 * @param {readonly string[] | null} boardColumns
 * @param {ReadonlySet<string>} live
 * @param {NudgeFacts} nudgeFacts the scheduled nudges and how they are doing (#547)
 * @param {Pane} pane
 * @returns {string[]}
 */
export function boardScreenLines(snapshot, boardColumns, live, nudgeFacts, { rows, width }) {
  const all = rows < TINY_ROWS || width < TINY_WIDTH ? [] : nudgeLines(nudgeFacts, width);
  if (all.length === 0) {
    return boardLines(snapshot, boardColumns, live, { rows, width });
  }
  const most = Math.floor(rows / 2);
  const nudges =
    all.length <= most
      ? all
      : [...all.slice(0, most - 1), cut(`… +${String(all.length - most + 1)} lines`, width)];
  return [
    ...boardLines(snapshot, boardColumns, live, { rows: rows - nudges.length - 1, width }),
    "",
    ...nudges,
  ];
}

/**
 * `ratelimit.json`, raw (#963): the view formats all of it.
 *
 * @typedef {object} GithubBudget
 * @property {number} remaining
 * @property {number} limit
 * @property {number} resetAt epoch milliseconds
 * @property {number} checkedAt epoch milliseconds, when hubd read it
 * @property {readonly import("./hub-spend.mjs").Spend[]} spend the last hour
 * @property {number} now epoch milliseconds
 */

/**
 * @typedef {object} CompanyFacts
 * @property {readonly string[]} roles every role, in org-chart order
 * @property {ReadonlySet<string>} live the employees running right now
 * @property {ReadonlyMap<string, number>} stale employees whose agent died without cleaning up, to when it was last seen (#363)
 * @property {StaffFacts | null} staff null while `staff.json` is missing or malformed (#386)
 * @property {GithubBudget | null} budget null before hubd has checked
 * @property {ReturnType<typeof import("./hub-health.mjs").hubHealth>} hub hubd, as its heartbeat and restarts say (#23)
 * @property {ClaudeUsage | null} claude null before any agent has logged (#50)
 * @property {TelegramFacts} telegram whether the Telegram sidecar is up (#583)
 * @property {{ record: import("./reboot.mjs").Reboot, between: readonly string[], now: number } | { rebooting: string } | null} reboot
 *   the pending reboot with the roles between turns, or the reason of the one handed to the restarter (#345)
 * @property {{ line: string, stale: boolean } | null} build the build the company runs, against the checkout; null when the dashboard runs from the checkout (#557)
 * @property {{ file: Record<string, unknown> | null, now: number }} kpi `kpis.json` as read, null when missing or unreadable (#892)
 */

/**
 * @typedef {object} TelegramFacts
 * @property {boolean} down no `link.mjs serve` running, or its heartbeat too old
 * @property {number | null} lastSeen its last heartbeat, epoch ms; null if there is none
 * @property {number} now epoch milliseconds
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
 * down, or not running at all. `company load` (#747) says it too.
 *
 * @param {string} id
 * @param {Pick<CompanyFacts, "live" | "stale">} facts
 * @param {Pick<StaffFacts, "staff" | "now">} staff
 * @returns {string | null} null for an employee at work
 */
export function staffNote(id, { live, stale }, { staff, now }) {
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
 * The GraphQL budget as a bar, like Claude's (#963), then where the last
 * hour of it went: by command, with when it runs dry at that rate, and by
 * role.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function githubSection({ budget }, width) {
  // A malformed file draws no bar of NaN.
  if (budget === null || budget.limit <= 0 || budget.remaining > budget.limit) {
    return [cut("GITHUB budget unknown (hubd has not checked yet)", width)];
  }
  const { remaining, limit, resetAt, checkedAt, now } = budget;
  const head = "GITHUB GraphQL";
  const summary = summarizeSpend(budget.spend);
  const burn = (/** @type {string} */ projection) => githubBurnLine(summary, projection, width);
  const byRole = githubRoleLines(summary, width);
  if (resetAt <= now) {
    return [
      cut(`${head}  reset since ${hhmm(resetAt)}, no newer reading`, width),
      burn(""),
      ...byRole,
    ];
  }
  const used = 1 - remaining / limit;
  const empty = remaining === 0;
  const stale = now - checkedAt > LIMIT_STALE_MS ? ` (as of ${hhmm(checkedAt)})` : "";
  const line = cut(
    `${head} ${usageBar(used, BAR_CELLS)}  ${String(Math.round(used * 100))} % used, ${String(remaining)}/${String(limit)} left, resets ${dayClock(resetAt, now)}${stale}`,
    width,
  );
  // Spent per ms over the last hour, run on from now.
  const emptyAt = now + remaining / (summary.spent / SPEND_WINDOW_MS);
  const projection =
    empty || summary.spent === 0
      ? ""
      : emptyAt < resetAt
        ? `; at this rate empty ~${hhmm(emptyAt)}`
        : "; lasts to reset";
  return [
    tint(line, usageColour(used, empty)),
    ...(empty ? [paint(cut("  RATE-LIMITED, agents are waiting", width), "31")] : []),
    burn(projection),
    ...byRole,
  ];
}

/**
 * Points, calls and the three costliest commands of the last hour (#97),
 * headed as Claude's burn line is (#963).
 *
 * @param {import("./hub-spend.mjs").SpendSummary} summary
 * @param {string} projection
 * @param {number} width
 * @returns {string}
 */
function githubBurnLine({ spent, calls, unknown, top }, projection, width) {
  if (calls === 0) {
    return cut("  burn    nothing in the last hour", width);
  }
  const leaders = top
    .slice(0, 3)
    .map((row) => `${visible(row.cmd)} ×${String(row.count)} (~${String(row.cost)})`)
    .join(", ");
  const blind = unknown === 0 ? "" : `, ${String(unknown)} uncounted`;
  return cut(
    `  burn    ~${String(spent)}/h in ${String(calls)} calls${blind}${projection}  top: ${leaders}`,
    width,
  );
}

/**
 * The five roles that spent the most counted points in the last hour
 * (#963), none when nothing was counted.
 *
 * @param {import("./hub-spend.mjs").SpendSummary} summary
 * @param {number} width
 * @returns {string[]}
 */
function githubRoleLines({ byRole }, width) {
  if (byRole.length === 0) {
    return [];
  }
  // Role names are printed into the operator's tmux: see `visible`.
  const roles = byRole
    .slice(0, 5)
    .map(({ role, points }) => `${visible(role)} ~${String(points)}`)
    .join(", ");
  return [cut(`  by role ${roles}`, width)];
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
 * @property {import("./claude-usage.mjs").Burn} burn the last hour (#452)
 * @property {import("./claude-usage.mjs").LimitReading | null} limit the
 *   newest `rate_limit_event` any agent saw (#452), null before one
 * @property {number} now epoch milliseconds
 */

/** Past this, a usage reading says how old it is (#452). */
const LIMIT_STALE_MS = 10 * 60 * 1000;

/** The cells of a usage bar (#452). */
const BAR_CELLS = 20;

/**
 * `[####····]`: `utilization` of `width` cells filled, at most all of them.
 *
 * @param {number} utilization the fraction used, which may exceed 1
 * @param {number} width
 * @returns {string}
 */
export function usageBar(utilization, width) {
  const filled = Math.round(width * Math.min(Math.max(utilization, 0), 1));
  return `[${"#".repeat(filled)}${"·".repeat(width - filled)}]`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * `hh:mm` if `at` is today, else `Ddd hh:mm`.
 *
 * @param {number} at epoch milliseconds
 * @param {number} now epoch milliseconds
 * @returns {string}
 */
function dayClock(at, now) {
  const day = new Date(at);
  return day.toDateString() === new Date(now).toDateString()
    ? hhmm(at)
    : `${WEEKDAYS[day.getDay()] ?? ""} ${hhmm(at)}`;
}

/**
 * The 5-hour and 7-day windows as bars (#452): the percentages `/usage`
 * shows, from the newest `rate_limit_event`. The plan publishes no
 * limit in tokens, so what is left is a share of each window.
 *
 * @param {import("./claude-usage.mjs").LimitReading | null} limit
 * @param {number} now
 * @param {number} width
 * @returns {string[]}
 */
function limitLines(limit, now, width) {
  if (limit === null) {
    return [cut("CLAUDE usage  unknown (no rate_limit_event seen yet)", width)];
  }
  const stale = now - limit.at > LIMIT_STALE_MS ? ` (as of ${hhmm(limit.at)})` : "";
  /** @type {[string, import("./stream-format.mjs").LimitWindow | null, string][]} */
  const windows = [
    ["5h", limit.fiveHour, "five_hour"],
    ["7d", limit.sevenDay, "seven_day"],
  ];
  return windows.map(([label, window, type], i) => {
    const head = `${(i === 0 ? "CLAUDE usage" : "").padEnd(14)}${label}`;
    if (window === null) {
      return cut(`${head}  unknown`, width);
    }
    const resetAt = window.resetsAt * 1000;
    if (resetAt <= now) {
      return cut(`${head}  reset since ${hhmm(resetAt)}, no newer reading`, width);
    }
    const used = Math.round(window.utilization * 100);
    const left = Math.max(0, 100 - used);
    const rejected = limit.status === "rejected" && limit.rateLimitType === type;
    const line = cut(
      `${head} ${usageBar(window.utilization, BAR_CELLS)}  ${String(used)} % used, ${String(left)} % left, resets ${dayClock(resetAt, now)}${stale}${rejected ? "  LIMIT REACHED" : ""}`,
      width,
    );
    return tint(line, usageColour(window.utilization, rejected));
  });
}

/**
 * A usage bar's colour, Claude's and GitHub's alike (#452, #963): red
 * from 90 % or once `limited`, yellow from 75 %, else none.
 *
 * @param {number} used the fraction used
 * @param {boolean} limited the limit is reached, whatever the fraction says
 * @returns {string | null} an SGR code
 */
function usageColour(used, limited) {
  if (limited || used >= 0.9) {
    return "31";
  }
  return used >= 0.75 ? "33" : null;
}

/**
 * @param {string} text
 * @param {string | null} sgr
 * @returns {string}
 */
function tint(text, sgr) {
  return sgr === null ? text : paint(text, sgr);
}

/**
 * The last hour's output, shaped like hubd's GraphQL line (#452).
 *
 * @param {import("./claude-usage.mjs").Burn} burn
 * @param {number} width
 * @returns {string}
 */
function burnLine(burn, width) {
  if (burn.replies === 0) {
    return cut("  burn    nothing in the last hour", width);
  }
  // Role names are printed into the operator's tmux: see `visible`.
  const top = burn.top
    .map(({ role, output }) => `${visible(role)} ~${formatCount(output)}`)
    .join(", ");
  return cut(
    `  burn    ~${formatCount(burn.output)} out/h, ${formatCount(burn.replies)} replies  top: ${top}`,
    width,
  );
}

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
 * How much of Claude's usage is left (#452), then tokens per role over the
 * plan's 5-hour window (#50), most output first, so a role stuck in a loop
 * shows before the limit hits everyone. No prices: none are in the logs.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function claudeSection({ roles, claude }, width) {
  if (claude === null) {
    return [cut("CLAUDE usage unknown (no agent logs yet)", width)];
  }
  const { summary, capped, burn, limit, now } = claude;
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
  // Most output first, ties and quiet roles in roster order: sort is stable.
  const ranked = [...roles].sort(
    (a, b) => (summary.roles.get(b)?.output ?? -1) - (summary.roles.get(a)?.output ?? -1),
  );
  return [
    ...limitLines(limit, now, width),
    burnLine(burn, width),
    paint(cut(`CLAUDE tokens, last 5h, as of ${hhmm(now)}`, width), "1"),
    cut(usageRow("role", ["replies", "output", "input", "cache rd"], "model"), width),
    ...ranked.map((role) => {
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
 * @param {NudgeFacts} nudges
 * @param {number} width
 * @returns {string[]}
 */
export function nudgeLines({ schedule, since, sent, unread, now }, width) {
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
        `${nudge.id} → ${nudge.to}${nudge.id.startsWith("own-") ? ` (own, ${nudge.to})` : ""}`,
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
 * The Telegram sidecar, only when it is down, and first (#583): every
 * agent's messages wait on it, and nothing else in the pane says so.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function telegramSection({ telegram: { down, lastSeen, now } }, width) {
  if (!down) {
    return [];
  }
  const seen =
    lastSeen === null
      ? "no heartbeat"
      : `last seen ${String(Math.round((now - lastSeen) / 1000))} s ago`;
  return [paint(cut(`TELEGRAM DOWN (${seen}): claude-llc status`, width), "1;31")];
}

/** `kpis.json` older than this says so in its header (#892). */
const KPI_STALE_MS = 15 * 60_000;
/** The warning colour: yellow reads on a dark and a light terminal. */
const WARN = "33";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A duration as the KPI line says it: `40m`, `5h10`, `19h`, `1d3h`; null is `–`.
 *
 * @param {number | null} ms
 * @returns {string}
 */
export function humanDuration(ms) {
  if (ms === null) {
    return "–";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return `${String(minutes)}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return minutes % 60 === 0
      ? `${String(hours)}h`
      : `${String(hours)}h${String(minutes % 60).padStart(2, "0")}`;
  }
  return `${String(Math.floor(hours / 24))}d${String(hours % 24)}h`;
}

/**
 * @param {readonly { issue: number, bounces: number }[]} top
 * @returns {string} ` (#12 ×3, #7 ×2)`, empty for none
 */
function topBounced(top) {
  return top.length === 0
    ? ""
    : ` (${top.map(({ issue, bounces }) => `#${String(issue)} ×${String(bounces)}`).join(", ")})`;
}

/**
 * @param {number} bytes
 * @returns {string} `9.8 GiB`, whole from 10 GiB up
 */
function gib(bytes) {
  const value = bytes / 2 ** 30;
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} GiB`;
}

/**
 * @param {number | null} share cores' worth of CPU
 * @returns {string}
 */
function percent(share) {
  return share === null ? "–" : `${String(Math.round(share * 100))}%`;
}

/**
 * The KPI section (#892): what `kpis.json` (#891) says that no other
 * section does. The Claude and GitHub budgets have theirs. Read-only:
 * hubd alone computes KPIs, so this and the analyst quote the same
 * numbers.
 *
 * @param {CompanyFacts} facts
 * @param {number} width
 * @returns {string[]}
 */
function kpiSection({ kpi: { file, now } }, width) {
  if (file?.schemaVersion !== KPI_SCHEMA_VERSION || typeof file.at !== "number") {
    return [cut("KPI: none yet", width)];
  }
  const kpis = /** @type {import("./kpi.mjs").Kpis} */ (/** @type {unknown} */ (file));
  const age = Math.max(0, Math.floor((now - kpis.at) / 60_000));
  const since = kpis.flow?.historySince ?? null;
  const from =
    since === null
      ? "7 d window"
      : `since ${String(new Date(since).getDate())} ${MONTHS[new Date(since).getMonth()] ?? ""}, 7 d window`;
  const updated =
    now - kpis.at > KPI_STALE_MS ? `stale (${String(age)} min)` : `updated ${String(age)} min ago`;
  /** @param {string} name */
  const failed = (name) => {
    const reason = obj(kpis.errors)[name];
    return cut(
      `${name.padEnd(8)}${visible(typeof reason === "string" ? reason : "unavailable")}`,
      width,
    );
  };

  const lines = [paint(cut(`KPI (${from})  ${updated}`, width), "1")];
  const { flow, host } = kpis;
  if (flow === null) {
    lines.push(failed("flow"));
  } else {
    lines.push(
      cut(
        [
          `flow    done 24h ${String(flow.done24h)}`,
          `7d ${String(flow.done7d)}`,
          `cycle med ${humanDuration(flow.cycleMedianMs)} p90 ${humanDuration(flow.cycleP90Ms)}`,
          `review wait ${humanDuration(flow.reviewWaitMedianMs)}`,
          `QA wait ${humanDuration(flow.qaWaitMedianMs)}`,
          `bounces 24h ${String(flow.bounces24h)}`,
          `7d ${String(flow.bounces7d)}${topBounced(flow.topBounced)}`,
        ].join(" · "),
        width,
      ),
    );
    const blocked = cut(
      `blocked ${String(flow.blocked)}${flow.oldestBlockedMs === null ? "" : `, oldest ${humanDuration(flow.oldestBlockedMs)}`}`,
      width,
    );
    lines.push((flow.oldestBlockedMs ?? 0) > 24 * 3_600_000 ? paint(blocked, WARN) : blocked);
  }
  if (host === null) {
    lines.push(failed("host"));
  } else {
    const disk = `disk free ${gib(host.diskFreeBytes)}`;
    const line = cut(
      `host    jails ${gib(host.slice.memoryBytes)} · cpu ${percent(host.slice.cpuShare)} · ${disk}`,
      width,
    );
    // Only a disk figure that survived the cut is painted; a cut one is plain.
    lines.push(
      host.diskFreeBytes < host.diskHoldBelow * 1.5 ? line.replace(disk, paint(disk, WARN)) : line,
    );
    const top = Object.entries(host.employees)
      .sort(
        ([, a], [, b]) => (b.cpuShare ?? -1) - (a.cpuShare ?? -1) || b.memoryBytes - a.memoryBytes,
      )
      .slice(0, 3)
      .map(([id, use]) => `${visible(id)} ${gib(use.memoryBytes)} ${percent(use.cpuShare)}`);
    if (top.length > 0) {
      lines.push(cut(`top     ${top.join(" · ")}`, width));
    }
  }
  return lines;
}

/**
 * The COMPANY pane's sections, in order. A new one is a
 * function here rather than a pane, as #23's hub line and #50's tokens are.
 * The nudges are on the BOARD pane, under the board (#883).
 *
 * @type {readonly ((facts: CompanyFacts, width: number) => string[])[]}
 */
export const COMPANY_SECTIONS = [
  telegramSection,
  rebootSection,
  buildSection,
  staffSection,
  kpiSection,
  hubSection,
  githubSection,
  claudeSection,
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

/**
 * Blocked is the last option on GitHub's board, but the first thing the
 * operator should see (#639).
 *
 * @param {readonly string[]} columns
 * @returns {string[]}
 */
function blockedFirst(columns) {
  return [...columns.filter((c) => c === BLOCKED), ...columns.filter((c) => c !== BLOCKED)];
}
