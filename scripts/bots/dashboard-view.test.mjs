/**
 * What the dashboard's panes say (#165), without a terminal: counts for
 * the columns nobody waits on, as many cards as fit for the rest, the
 * last three done, and never a line wider than the pane.
 */
import { describe, expect, it } from "vitest";

import {
  boardLines,
  boardScreenLines,
  companyLines,
  cut,
  doneOrder,
  feedLines,
  groupFeed,
  hhmm,
  humanDuration,
  nudgeLines,
  usageBar,
} from "./dashboard-view.mjs";
import { KPI_SCHEMA_VERSION } from "./kpi.mjs";
/** @type {import("./dashboard-view.mjs").NudgeFacts} */
const noNudges = { schedule: [], since: null, sent: new Map(), unread: new Map(), now: 0 };
/** @type {import("./dashboard-view.mjs").TelegramFacts} */
const telegramUp = { down: false, lastSeen: 0, now: 0 };
/** @type {import("./dashboard-view.mjs").CompanyFacts["kpi"]} */
const noKpi = { file: null, now: 0 };
const noRunners = { status: null, max: 0 };
/** @typedef {{ state: "up" | "stale" | "down" | "crash-looping", line: string }} HubLine */

const COLUMNS = ["Backlog", "Ready", "In Progress", "In Review", "QA", "Done"];
const EVERYONE = new Set(["architect", "manager", "developer", "lead-dev", "qa-tester"]);

/**
 * Colour codes are not columns on screen.
 *
 * @param {string} line
 * @returns {string}
 */
function plain(line) {
  return line
    .split("\u001B")
    .map((part, index) => (index === 0 ? part : part.replace(/^\[[0-9;]*m/, "")))
    .join("");
}

/**
 * @param {string} line
 * @returns {number}
 */
function columnsOf(line) {
  return Array.from(plain(line)).length;
}

/**
 * @param {Record<string, number>} counts cards per column
 * @param {(column: string, index: number) => Partial<{ number: number, title: string, rev: number }>} [shape]
 */
function snapshot(counts, shape = () => ({})) {
  let next = 1;
  const cards = Object.entries(counts).flatMap(([column, count]) =>
    Array.from({ length: count }, (_, index) => {
      const number = next++;
      const { title = `${column} card ${String(index)}`, rev = 1, ...rest } = shape(column, index);
      return {
        rev,
        item: { status: column, content: { number: rest.number ?? number, title } },
      };
    }),
  );
  return { at: 0, sweptAt: 0, cards };
}

/**
 * The STAFF facts for `staff.json` holding `employees`, each working unless
 * it says otherwise, with `maxAgents` 12 and no manager restarts.
 *
 * @param {Record<string, Partial<import("./staff.mjs").Employee>>} employees
 * @param {Partial<Omit<import("./dashboard-view.mjs").StaffFacts, "staff">> & {
 *   recent?: import("./staff.mjs").Change[],
 * }} [rest]
 * @returns {import("./dashboard-view.mjs").StaffFacts}
 */
function staffFacts(employees, { recent = [], maxAgents = 12, managerRestarts = 0, now = 0 } = {}) {
  return {
    staff: {
      employees: Object.fromEntries(
        Object.entries(employees).map(([id, employee]) => [
          id,
          {
            role: id.split("@")[0] ?? id,
            hiredAt: 0,
            by: /** @type {const} */ ("operator"),
            reason: "first boot",
            state: /** @type {const} */ ("working"),
            readyAt: null,
            ...employee,
          },
        ]),
      ),
      recent,
    },
    maxAgents,
    managerRestarts,
    now,
  };
}

describe("boardLines", () => {
  it("shows Backlog and Ready as one count line each, however tall the pane", () => {
    const lines = boardLines(snapshot({ Backlog: 17, Ready: 10 }), COLUMNS, EVERYONE, {
      rows: 200,
      width: 60,
    }).map(plain);
    expect(
      lines.filter((line) => line.includes("Backlog card") || line.includes("Ready card")),
    ).toEqual([]);
    expect(lines.find((line) => line.startsWith("Backlog"))).toMatch(/Backlog\s+17$/);
    expect(lines.find((line) => line.startsWith("Ready"))).toMatch(/Ready\s+10$/);
  });

  it("lists Blocked's cards first, under the header and the No Status count, in red (#639)", () => {
    const lines = boardLines(snapshot({ Blocked: 2, QA: 1 }), [...COLUMNS, "Blocked"], EVERYONE, {
      rows: 40,
      width: 60,
    });
    expect(lines.map(plain).slice(2, 5)).toEqual([
      "Blocked         2",
      "  #1    Blocked card 0",
      "  #2    Blocked card 1",
    ]);
    expect(lines[2]).toContain("\u001B[1;31m");
  });

  it("shows exactly the three most recently done, by rev then number, and no count", () => {
    const board = snapshot({ Done: 6 }, (_, index) => ({
      number: 100 + index,
      rev: [5, 9, 9, 2, 7, 1][index],
    }));
    const lines = boardLines(board, COLUMNS, EVERYONE, { rows: 40, width: 60 }).map(plain);
    const at = lines.indexOf("Done (last 3)");
    expect(lines.slice(at + 1).map((line) => line.trim().slice(0, 4))).toEqual([
      "#102",
      "#101",
      "#104",
    ]);
  });

  it("shows what there is when fewer than three are done", () => {
    const lines = boardLines(snapshot({ Done: 1 }), COLUMNS, EVERYONE, { rows: 40, width: 60 });
    expect(lines.map(plain).slice(-2)).toEqual(["Done (last 3)", "  #1    Done card 0"]);
  });

  it("orders done cards by rev, ties by the higher number", () => {
    const order = doneOrder([
      { number: 1, title: "", rev: 3 },
      { number: 5, title: "", rev: 3 },
      { number: 2, title: "", rev: 8 },
    ]).map((card) => card.number);
    expect(order).toEqual([2, 5, 1]);
  });

  it("fills the pane, cuts with … +N more, and keeps every column visible", () => {
    const rows = 17;
    const lines = boardLines(
      snapshot({ "In Progress": 9, "In Review": 4, QA: 3, Done: 3 }),
      COLUMNS,
      EVERYONE,
      { rows, width: 60 },
    ).map(plain);
    expect(lines).toHaveLength(rows);
    // 17 rows: a header, No Status, six column lines, three done; six
    // left. One card each, then a "more" line each, then the rest to In
    // Progress.
    for (const column of ["In Progress", "In Review", "QA"]) {
      const at = lines.findIndex((line) => line.startsWith(column));
      expect(lines[at + 1], column).toContain(`${column} card 0`);
      expect(lines[at + 2], column).toMatch(/^ {2}… \+\d+ more$/);
    }
    const more = lines
      .filter((line) => line.includes("more"))
      .map((line) => Number(/\+(\d+)/.exec(line)?.[1]));
    const cardsShown = lines.filter(
      (line) => / card \d/.test(line) && !line.includes("Done card"),
    ).length;
    expect(cardsShown + more.reduce((a, b) => a + b, 0)).toBe(9 + 4 + 3);
  });

  it("lists every card when they fit, with no more line", () => {
    const lines = boardLines(snapshot({ "In Progress": 2, QA: 1 }), COLUMNS, EVERYONE, {
      rows: 40,
      width: 60,
    }).map(plain);
    expect(lines.filter((line) => / card \d/.test(line))).toHaveLength(3);
    expect(lines.some((line) => line.includes("more"))).toBe(false);
  });

  it("never prints a line wider than the pane, however long the title", () => {
    const long = "A title that goes on and on ".repeat(10);
    for (const width of [30, 44, 80]) {
      const lines = boardLines(
        snapshot({ Backlog: 2, "In Progress": 3, QA: 2, Done: 3 }, () => ({ title: long })),
        COLUMNS,
        new Set(),
        { rows: 30, width },
      );
      for (const line of lines) {
        expect(columnsOf(line), line).toBeLessThanOrEqual(width);
      }
    }
  });

  it("neutralises control characters in a title", () => {
    const lines = boardLines(
      snapshot({ QA: 1 }, () => ({ title: "evil\u001B[2J\nline" })),
      COLUMNS,
      EVERYONE,
      { rows: 20, width: 80 },
    );
    const card = lines.find((line) => line.includes("evil")) ?? "";
    expect(card).toBe("  #1    evil␛[2J⏎line");
  });

  it("says nobody is hired to move a stuck column", () => {
    const lines = boardLines(snapshot({ "In Review": 1 }), COLUMNS, new Set(), {
      rows: 20,
      width: 80,
    });
    expect(lines.map(plain).find((line) => line.startsWith("In Review"))).toMatch(
      /<- nobody hired to move this$/,
    );
  });

  it("shows only counts in a tiny pane", () => {
    // Short: every line a count, as many as fit.
    const short = boardLines(snapshot({ "In Progress": 3, Done: 3 }), COLUMNS, EVERYONE, {
      rows: 7,
      width: 60,
    }).map(plain);
    expect(short).toHaveLength(7);
    expect(short.some((line) => / card \d/.test(line))).toBe(false);
    // Narrow: room for every count, Done's last.
    const narrow = boardLines(snapshot({ "In Progress": 3, Done: 3 }), COLUMNS, EVERYONE, {
      rows: 20,
      width: 29,
    }).map(plain);
    expect(narrow).toHaveLength(8);
    expect(narrow.some((line) => / card \d/.test(line))).toBe(false);
    expect(narrow.at(-1)).toBe("Done 3");
  });

  describe("No Status (#520)", () => {
    /**
     * `board` with cards in no column added: `issues` issues and `others`
     * pull requests, half with no status field and half with "".
     *
     * @param {ReturnType<typeof snapshot>} board
     * @param {number} issues
     * @param {number} others
     */
    function unplaced(board, issues, others) {
      const card = (/** @type {string} */ type, /** @type {number} */ index) => ({
        rev: 1,
        item: {
          ...(index % 2 === 0 ? {} : { status: "" }),
          content: { type, number: 900 + index, title: `${type} ${String(index)}` },
        },
      });
      return {
        ...board,
        cards: [
          ...board.cards,
          ...Array.from({ length: issues }, (_, i) => card("Issue", i)),
          ...Array.from({ length: others }, (_, i) => card("PullRequest", issues + i)),
        ],
      };
    }

    it("counts issues in no column, not pull requests, bold yellow before Backlog", () => {
      const lines = boardLines(unplaced(snapshot({ Backlog: 3 }), 2, 1), COLUMNS, EVERYONE, {
        rows: 40,
        width: 60,
      });
      const at = lines.map(plain).findIndex((line) => line.startsWith("Backlog"));
      expect(plain(lines[at - 1] ?? "")).toBe("No Status       2");
      expect(lines[at - 1]).toContain("\u001B[1;33m");
      // Only the count: no card lines for them.
      expect(lines.some((line) => line.includes("Issue 0"))).toBe(false);
    });

    it("is there, dim, at 0", () => {
      const lines = boardLines(snapshot({ Backlog: 3 }), COLUMNS, EVERYONE, {
        rows: 40,
        width: 60,
      });
      expect(plain(lines[1] ?? "")).toBe("No Status       0");
      expect(lines[1]).toContain("\u001B[2m");
    });

    it("takes its row from the listed columns, not the header or Done", () => {
      // Header, No Status, six columns and three done: 11 fixed, so In
      // Progress has two rows left: one card and how many more.
      const board = unplaced(snapshot({ "In Progress": 5, Done: 3 }), 1, 0);
      const lines = boardLines(board, COLUMNS, EVERYONE, { rows: 13, width: 30 }).map(plain);
      expect(lines).toHaveLength(13);
      expect(lines[0]).toMatch(/^as of /);
      expect(lines[1]).toBe("No Status       1");
      expect(lines.filter((line) => line.includes("In Progress card"))).toHaveLength(1);
      expect(lines).toContain("  … +4 more");
      expect(lines.slice(-4)[0]).toBe("Done (last 3)");
      for (const line of lines) {
        expect(columnsOf(line), line).toBeLessThanOrEqual(30);
      }
    });

    it("is shown in a tiny pane", () => {
      const lines = boardLines(unplaced(snapshot({ QA: 1 }), 3, 0), COLUMNS, EVERYONE, {
        rows: 7,
        width: 30,
      }).map(plain);
      expect(lines[1]).toBe("No Status       3");
      expect(lines.some((line) => / card \d/.test(line))).toBe(false);
    });
  });

  it("says when the board is empty, has no snapshot, or is not set up", () => {
    expect(boardLines(snapshot({}), COLUMNS, EVERYONE, { rows: 20, width: 80 }).at(-1)).toContain(
      "tell the architect",
    );
    expect(boardLines(null, COLUMNS, EVERYONE, { rows: 20, width: 80 })[0]).toContain(
      "no snapshot yet",
    );
    expect(boardLines(null, null, EVERYONE, { rows: 20, width: 80 })[0]).toContain(
      "not set up yet",
    );
  });
});

describe("boardScreenLines (#883)", () => {
  /** @param {string} id */
  const nudge = (id) => ({ id, to: "manager", everyMinutes: 30, text: `Do ${id}.` });
  /** @param {readonly string[]} ids */
  // Two hours on, so every one is overdue in any time zone.
  const scheduled = (ids) => ({ ...noNudges, schedule: ids.map(nudge), since: 0, now: 7_200_000 });
  const board = snapshot({ "In Progress": 6, QA: 2, Done: 3 });

  it("is the board, a blank line, then the nudges", () => {
    const nudges = scheduled(["groom"]);
    const pane = { rows: 30, width: 80 };
    expect(boardScreenLines(board, COLUMNS, EVERYONE, nudges, pane)).toEqual([
      ...boardLines(board, COLUMNS, EVERYONE, { rows: 26, width: 80 }),
      "",
      ...nudgeLines(nudges, 80),
    ]);
  });

  it("gives the nudges at most half the rows, and the board the rest", () => {
    const lines = boardScreenLines(board, COLUMNS, EVERYONE, scheduled(["a", "b", "c"]), {
      rows: 12,
      width: 80,
    }).map(plain);
    expect(lines).toHaveLength(12);
    expect(lines.slice(5)).toEqual([
      "",
      "nudges",
      "  a → manager · every 30m · last never · next overdue",
      "    Do a.",
      "  b → manager · every 30m · last never · next overdue",
      "    Do b.",
      "… +2 lines",
    ]);
    expect(lines.slice(0, 5)).toEqual(
      boardLines(board, COLUMNS, EVERYONE, { rows: 5, width: 80 }).map(plain),
    );
  });

  it("is the board alone, on every row, with nothing scheduled", () => {
    const pane = { rows: 20, width: 80 };
    expect(boardScreenLines(board, COLUMNS, EVERYONE, noNudges, pane)).toEqual(
      boardLines(board, COLUMNS, EVERYONE, pane),
    );
  });

  it("is the board alone in a tiny pane", () => {
    for (const pane of [
      { rows: 7, width: 80 },
      { rows: 30, width: 29 },
    ]) {
      expect(boardScreenLines(board, COLUMNS, EVERYONE, scheduled(["groom"]), pane)).toEqual(
        boardLines(board, COLUMNS, EVERYONE, pane),
      );
    }
  });

  it("shows a broken schedule under a board that is not there yet", () => {
    const broken = { ...noNudges, schedule: "schedule.nudges is not an array" };
    expect(boardScreenLines(null, COLUMNS, EVERYONE, broken, { rows: 20, width: 80 })).toEqual([
      "(no snapshot yet — hubd writes one on the first board read)",
      "",
      "nudges: schedule.json: schedule.nudges is not an array",
    ]);
  });
});

describe("companyLines", () => {
  const roles = ["manager", "architect", "developer", "lead-dev", "qa-tester"];
  /** @type {import("./dashboard-view.mjs").GithubBudget} */
  const budget = {
    remaining: 4210,
    limit: 5000,
    resetAt: 3_600_000,
    checkedAt: 0,
    spend: [],
    now: 0,
  };
  /** @type {HubLine} */
  const hub = { state: "up", line: "hub ● up 3m · restarts 0/h" };

  it("is the staff, the hub, then the GitHub budget", () => {
    const lines = companyLines(
      {
        roles,
        live: new Set(["manager", "architect"]),
        stale: new Map(),
        staff: staffFacts({ manager: {}, architect: {} }),
        budget,
        hub,
        reboot: null,
        build: null,
        claude: null,
        telegram: telegramUp,
        kpi: noKpi,
        runners: noRunners,
      },
      { rows: 30, width: 40 },
    ).map(plain);
    expect(lines[0]).toBe("STAFF  2/12");
    // On the BOARD pane now (#883).
    expect(lines.some((line) => line.startsWith("nudges"))).toBe(false);
    expect(lines.some((line) => line.startsWith("GITHUB GraphQL [###"))).toBe(true);
    expect(lines.indexOf("hub ● up 3m · restarts 0/h")).toBeGreaterThan(0);
    for (const line of lines) {
      expect(columnsOf(line)).toBeLessThanOrEqual(40);
    }
  });

  it("shows the runners online out of the target, busy and max, and the last reason (#1890)", () => {
    /** @param {import("./dashboard-view.mjs").CompanyFacts["runners"]} runners */
    const linesOf = (runners) =>
      companyLines(
        {
          roles,
          live: new Set(["manager"]),
          stale: new Map(),
          staff: staffFacts({ manager: {} }),
          budget,
          hub,
          reboot: null,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners,
        },
        { rows: 40, width: 60 },
      ).map(plain);
    expect(linesOf(noRunners)).toContain("runners: not started (max 0)");
    const lines = linesOf({
      status: {
        at: 1,
        target: 2,
        max: 3,
        runners: [{ name: "a", started: 1, busy: true }],
        variable: true,
        reason: "not starting a runner: host memory is short",
        alert: null,
      },
      max: 3,
    });
    const at = lines.indexOf("runners: 1/2 (busy 1, max 3)");
    expect(at).toBeGreaterThan(0);
    expect(lines[at + 1]).toBe("  not starting a runner: host memory is short");
  });

  it("paints the hub line red unless hubd is up (#23)", () => {
    /** @param {HubLine} health */
    const hubLine = (health) =>
      companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: null,
          budget: null,
          hub: health,
          reboot: null,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 30, width: 80 },
      ).find((line) => plain(line).startsWith("hub "));
    expect(hubLine(hub)).toContain("\x1b[1;32m");
    expect(hubLine({ state: "down", line: "hub ● down · restarts 0/h" })).toContain("\x1b[1;31m");
  });

  it("leads with TELEGRAM DOWN in red while the sidecar is down, and says nothing while it is up (#583)", () => {
    /** @param {import("./dashboard-view.mjs").TelegramFacts} telegram */
    const linesWith = (telegram) =>
      companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: null,
          budget: null,
          hub,
          reboot: null,
          build: null,
          claude: null,
          telegram,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 30, width: 80 },
      );
    const down = linesWith({ down: true, lastSeen: 1_000, now: 46_000 });
    expect(down[0]).toContain("\x1b[1;31m");
    expect(plain(down[0] ?? "")).toBe("TELEGRAM DOWN (last seen 45 s ago): claude-llc status");
    expect(plain(linesWith({ down: true, lastSeen: null, now: 0 })[0] ?? "")).toBe(
      "TELEGRAM DOWN (no heartbeat): claude-llc status",
    );
    expect(linesWith(telegramUp).some((line) => plain(line).includes("TELEGRAM"))).toBe(false);
  });

  it("says the Claude usage is unknown before any agent has logged (#50)", () => {
    const lines = companyLines(
      {
        roles,
        live: new Set(),
        stale: new Map(),
        staff: null,
        budget: null,
        hub,
        reboot: null,
        build: null,
        claude: null,
        telegram: telegramUp,
        kpi: noKpi,
        runners: noRunners,
      },
      { rows: 30, width: 72 },
    ).map(plain);
    expect(lines).toContain("CLAUDE usage unknown (no agent logs yet)");
  });

  it("shows tokens per role, most output first, — for a quiet one, and marks the top (#50, #452)", () => {
    const usage = (/** @type {number} */ output) => ({
      replies: 41,
      output,
      input: 112_000,
      cacheRead: 3_100_000,
      model: "claude-opus-5-5",
    });
    const claude = {
      now: new Date(2026, 9, 25, 16, 42).getTime(),
      capped: new Set(),
      burn: { output: 0, replies: 0, top: [] },
      limit: null,
      summary: {
        roles: new Map([
          ["manager", usage(61_000)],
          ["developer", usage(240_000)],
        ]),
        total: usage(301_000),
        todayOutput: 1_400_000,
      },
    };
    const lines = companyLines(
      {
        roles,
        live: new Set(),
        stale: new Map(),
        staff: null,
        budget: null,
        hub,
        reboot: null,
        build: null,
        claude,
        telegram: telegramUp,
        kpi: noKpi,
        runners: noRunners,
      },
      { rows: 40, width: 72 },
    ).map(plain);
    const at = lines.indexOf("CLAUDE tokens, last 5h, as of 16:42");
    expect(at).toBeGreaterThan(0);
    const table = lines.slice(at + 2);
    // Most output first; the quiet ones after, in roster order.
    expect(table.map((line) => line.trim().split(/\s+/)[0])).toEqual([
      "developer",
      "manager",
      "architect",
      "lead-dev",
      "qa-tester",
      "total",
    ]);
    expect(table[0]).toMatch(/240k .*opus-5-5 {2}<- top$/);
    expect(table[1]).toMatch(/^ {2}manager +41 +61k +112k +3\.1M {2}opus-5-5$/);
    expect(table[2]).toMatch(/^ {2}architect +—$/);
    expect(table.at(-1)).toMatch(/\(today: 1\.4M out\)$/);
    for (const line of lines) {
      expect(columnsOf(line)).toBeLessThanOrEqual(72);
    }
  });

  it("escapes the agent-written model, and shows a capped role as over cap (#50)", () => {
    const usage = (/** @type {number} */ output, /** @type {string} */ model) => ({
      replies: 20_000,
      output,
      input: 0,
      cacheRead: 0,
      model,
    });
    const claude = {
      now: new Date(2026, 9, 25, 16, 42).getTime(),
      capped: new Set(["architect"]),
      burn: { output: 0, replies: 0, top: [] },
      limit: null,
      summary: {
        roles: new Map([
          ["manager", usage(5, "\u001b]0;x\u0007\u001b[2J")],
          ["architect", usage(50, "claude-opus-5-5".padEnd(80, "x"))],
        ]),
        total: usage(55, ""),
        todayOutput: 55,
      },
    };
    const lines = companyLines(
      {
        roles,
        live: new Set(),
        stale: new Map(),
        staff: null,
        budget: null,
        hub,
        reboot: null,
        build: null,
        claude,
        telegram: telegramUp,
        kpi: noKpi,
        runners: noRunners,
      },
      { rows: 40, width: 72 },
    );
    // The manager's row is not the top one, so nothing paints it.
    const manager = lines.find((line) => line.startsWith("  manager")) ?? "";
    expect(manager).not.toContain("\u001b");
    expect(manager).toMatch(/ {2}␛\]0;x�␛\[2J$/);
    const architect = plain(lines.find((line) => line.includes("  architect")) ?? "");
    expect(architect).toMatch(/ {2}over cap {2}<- top$/);
  });

  describe("how much Claude usage is left (#452)", () => {
    const now = new Date(2026, 9, 27, 16, 42).getTime();
    /** Unix seconds, `hours` from `now`. @param {number} hours */
    const inHours = (hours) => Math.round((now + hours * 3_600_000) / 1000);

    /**
     * @param {Partial<import("./claude-usage.mjs").LimitReading> | null} limit
     * @param {import("./claude-usage.mjs").Burn} [burn]
     * @returns {string[]} the CLAUDE lines, colours and all
     */
    const claudeLines = (limit, burn = { output: 0, replies: 0, top: [] }) => {
      const lines = companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: null,
          budget: null,
          hub,
          reboot: null,
          build: null,
          claude: {
            now,
            capped: new Set(),
            summary: {
              roles: new Map(),
              total: { replies: 0, output: 0, input: 0, cacheRead: 0, model: "" },
              todayOutput: 0,
            },
            burn,
            limit:
              limit === null
                ? null
                : {
                    at: now - 60_000,
                    status: "allowed",
                    rateLimitType: "five_hour",
                    resetsAt: inHours(2),
                    utilization: 0.38,
                    fiveHour: { utilization: 0.38, resetsAt: inHours(2) },
                    sevenDay: { utilization: 0.74, resetsAt: inHours(48) },
                    ...limit,
                  },
          },
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 60, width: 120 },
      );
      return lines.filter((line) => /CLAUDE usage|^ {14}7d|^ {2}burn/.test(plain(line)));
    };

    it("draws a bar of 20 cells, full at 100 % and no fuller", () => {
      expect(usageBar(0, 20)).toBe(`[${"·".repeat(20)}]`);
      expect(usageBar(0.38, 20)).toBe(`[${"#".repeat(8)}${"·".repeat(12)}]`);
      expect(usageBar(1.04, 20)).toBe(`[${"#".repeat(20)}]`);
    });

    it("shows both windows, used, left and when each resets", () => {
      const [five, seven] = claudeLines({}).map(plain);
      expect(five).toBe(
        `CLAUDE usage  5h [${"#".repeat(8)}${"·".repeat(12)}]  38 % used, 62 % left, resets 18:42`,
      );
      expect(seven).toBe(
        `${" ".repeat(14)}7d [${"#".repeat(15)}${"·".repeat(5)}]  74 % used, 26 % left, resets Thu 16:42`,
      );
    });

    it("is plain below 75 %, yellow from 75 %, red from 90 %, and tells the truth above 100 %", () => {
      /** @param {number} utilization */
      const fiveHour = (utilization) =>
        claudeLines({ fiveHour: { utilization, resetsAt: inHours(2) } })[0] ?? "";
      expect(fiveHour(0)).not.toContain("\u001b");
      expect(plain(fiveHour(0))).toContain("0 % used, 100 % left");
      expect(fiveHour(0.38)).not.toContain("\u001b");
      expect(fiveHour(0.75).startsWith("\x1b[33m")).toBe(true);
      expect(fiveHour(0.9).startsWith("\x1b[31m")).toBe(true);
      expect(plain(fiveHour(1.04))).toContain(`[${"#".repeat(20)}]  104 % used, 0 % left`);
    });

    it("says LIMIT REACHED, in red, on the window that rejected", () => {
      const [five, seven] = claudeLines({
        status: "rejected",
        rateLimitType: "seven_day",
        sevenDay: { utilization: 1, resetsAt: inHours(48) },
      });
      expect(plain(five ?? "")).not.toContain("LIMIT REACHED");
      expect(seven?.startsWith("\x1b[31m")).toBe(true);
      expect(seven?.endsWith("LIMIT REACHED\x1b[0m")).toBe(true);
    });

    it("says how old a reading is past 10 minutes", () => {
      expect(plain(claudeLines({})[0] ?? "")).not.toContain("as of");
      const [five] = claudeLines({ at: now - 11 * 60_000 }).map(plain);
      expect(five).toMatch(/resets 18:42 \(as of 16:31\)$/);
    });

    it("draws no bar for a window that has reset since, nor for one it never read", () => {
      const [five, seven] = claudeLines({
        fiveHour: { utilization: 0.9, resetsAt: inHours(-1) },
        sevenDay: null,
      }).map(plain);
      expect(five).toBe("CLAUDE usage  5h  reset since 15:42, no newer reading");
      expect(seven).toBe(`${" ".repeat(14)}7d  unknown`);
    });

    it("says so before any agent saw a reading", () => {
      expect(plain(claudeLines(null)[0] ?? "")).toBe(
        "CLAUDE usage  unknown (no rate_limit_event seen yet)",
      );
    });

    it("shows the last hour's burn, and a quiet hour", () => {
      const burn = {
        output: 210_000,
        replies: 1_400,
        top: [
          { role: "developer", output: 80_000 },
          { role: "lead-dev", output: 50_000 },
          { role: "qa-tester", output: 30_000 },
        ],
      };
      expect(plain(claudeLines(null, burn)[1] ?? "")).toBe(
        "  burn    ~210k out/h, 1k replies  top: developer ~80k, lead-dev ~50k, qa-tester ~30k",
      );
      expect(plain(claudeLines(null)[1] ?? "")).toBe("  burn    nothing in the last hour");
    });

    it("escapes a role name in the burn line", () => {
      const burn = { output: 5, replies: 1, top: [{ role: "\u001b]0;x\u0007", output: 5 }] };
      const line = claudeLines(null, burn)[1] ?? "";
      expect(line).not.toContain("\u001b");
    });
  });

  describe("how much of the GraphQL budget is left (#963)", () => {
    const now = new Date(2026, 9, 27, 17, 20).getTime();
    const resetAt = new Date(2026, 9, 27, 18, 0).getTime();

    /**
     * @param {string} role
     * @param {string} cmd
     * @param {number | null} cost
     * @returns {import("./hub-spend.mjs").Spend}
     */
    const spend = (role, cmd, cost) => ({ at: now - 60_000, role, cmd, ms: 300, cost });

    /**
     * @param {Partial<import("./dashboard-view.mjs").GithubBudget> | null} budget
     * @returns {string[]} the GITHUB lines, colours and all
     */
    const githubLines = (budget) => {
      const lines = companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: null,
          budget:
            budget === null
              ? null
              : {
                  remaining: 4210,
                  limit: 5000,
                  resetAt,
                  checkedAt: now - 60_000,
                  spend: [],
                  now,
                  ...budget,
                },
          hub,
          reboot: null,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 60, width: 160 },
      );
      return lines.filter((line) =>
        /^(GITHUB| {2}RATE-LIMITED| {2}burn| {2}by role)/.test(plain(line)),
      );
    };
    /** @param {number} remaining */
    const barLine = (remaining) => githubLines({ remaining })[0] ?? "";

    it("draws the bar, used, left and when it resets", () => {
      expect(plain(barLine(4210))).toBe(
        `GITHUB GraphQL [${"#".repeat(3)}${"·".repeat(17)}]  16 % used, 4210/5000 left, resets 18:00`,
      );
      expect(plain(barLine(250))).toBe(
        `GITHUB GraphQL [${"#".repeat(19)}·]  95 % used, 250/5000 left, resets 18:00`,
      );
    });

    it("is coloured as Claude's bar is: yellow from 75 %, red from 90 %", () => {
      expect(barLine(4210)).not.toContain("\u001b");
      expect(barLine(1250).startsWith("\x1b[33m")).toBe(true);
      expect(barLine(500).startsWith("\x1b[31m")).toBe(true);
    });

    it("says RATE-LIMITED, in red, at 0 left, and projects nothing", () => {
      const lines = githubLines({ remaining: 0, spend: [spend("developer", "pr view", 40)] });
      expect(lines[0]?.startsWith("\x1b[31m")).toBe(true);
      expect(lines[1]).toBe("\x1b[31m  RATE-LIMITED, agents are waiting\x1b[0m");
      expect(plain(lines[2] ?? "")).toBe("  burn    ~40/h in 1 calls  top: pr view ×1 (~40)");
    });

    it("says how old a reading is past 10 minutes", () => {
      expect(plain(githubLines({})[0] ?? "")).not.toContain("as of");
      expect(plain(githubLines({ checkedAt: now - 11 * 60_000 })[0] ?? "")).toMatch(
        /resets 18:00 \(as of 17:09\)$/,
      );
    });

    it("draws no bar for a budget that has reset since", () => {
      expect(plain(githubLines({ resetAt: now - 60_000 })[0] ?? "")).toBe(
        "GITHUB GraphQL  reset since 17:19, no newer reading",
      );
    });

    it("projects when the budget runs dry at the last hour's rate", () => {
      // 3000 an hour from 17:20 empties 1000 at 17:40, before the reset.
      const dry = githubLines({
        remaining: 1000,
        spend: [spend("developer", "issue view", 3000), spend("hubd", "board snapshot", null)],
      });
      expect(plain(dry[1] ?? "")).toBe(
        "  burn    ~3000/h in 2 calls, 1 uncounted; at this rate empty ~17:40  " +
          "top: issue view ×1 (~3000), board snapshot ×1 (~0)",
      );
      const lasts = githubLines({ spend: [spend("developer", "issue view", 380)] });
      expect(plain(lasts[1] ?? "")).toBe(
        "  burn    ~380/h in 1 calls; lasts to reset  top: issue view ×1 (~380)",
      );
      const quiet = githubLines({});
      expect(quiet.map(plain).slice(1)).toEqual(["  burn    nothing in the last hour"]);
      const uncounted = githubLines({ spend: [spend("hubd", "board snapshot", null)] });
      expect(plain(uncounted[1] ?? "")).toBe(
        "  burn    ~0/h in 1 calls, 1 uncounted  top: board snapshot ×1 (~0)",
      );
    });

    it("names the five roles that spent the most, escaped", () => {
      const lines = githubLines({
        spend: [
          spend("manager", "pr view", 40),
          spend("developer", "pr view", 150),
          spend("hubd", "board snapshot", 90),
          spend("lead-dev", "pr view", 60),
          spend("qa-tester", "pr view", 20),
          spend("architect", "pr view", 10),
          spend("\u001b]0;x\u0007", "pr view", 30),
        ],
      });
      const byRole = lines.at(-1) ?? "";
      expect(byRole).not.toContain("\u001b");
      expect(plain(byRole)).toMatch(
        /^ {2}by role developer ~150, hubd ~90, lead-dev ~60, manager ~40, .+ ~30$/,
      );
    });

    it("says unknown before hubd checked, and for a malformed file", () => {
      const unknown = "GITHUB budget unknown (hubd has not checked yet)";
      expect(githubLines(null).map(plain)).toEqual([unknown]);
      expect(githubLines({ limit: 0 }).map(plain)).toEqual([unknown]);
      expect(githubLines({ remaining: 5001 }).map(plain)).toEqual([unknown]);
    });
  });

  it("cuts an overflow with … +N lines", () => {
    const lines = companyLines(
      {
        roles,
        live: new Set(),
        stale: new Map(),
        staff: null,
        budget: null,
        hub,
        reboot: null,
        build: null,
        claude: null,
        telegram: telegramUp,
        kpi: noKpi,
        runners: noRunners,
      },
      { rows: 4, width: 40 },
    );
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toMatch(/^… \+\d+ lines$/);
  });

  describe("the staff (#386)", () => {
    const everyone = ["manager", "architect", "developer", "developer@2", "lead-dev"];
    const fireAt = new Date(2026, 9, 25, 12, 0).getTime();

    /**
     * @param {import("./dashboard-view.mjs").StaffFacts | null} staff
     * @param {{ live?: readonly string[], stale?: Map<string, number>, width?: number }} [presence]
     */
    const section = (staff, { live = [], stale = new Map(), width = 80 } = {}) => {
      const raw = companyLines(
        {
          roles,
          live: new Set(live),
          stale,
          staff,
          budget: null,
          hub,
          reboot: null,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 40, width },
      );
      const end = raw.indexOf("");
      return raw.slice(0, end === -1 ? raw.length : end);
    };

    it("is one row per role in org-chart order, with total/maxAgents in the heading", () => {
      const staff = staffFacts(Object.fromEntries(everyone.map((id) => [id, {}])));
      expect(section(staff, { live: everyone }).map(plain)).toEqual([
        "STAFF  5/12",
        "  manager          1",
        "  architect        1",
        "  developer        2",
        "  lead-dev         1",
        "  qa-tester        0",
      ]);
    });

    it("counts both employees of a role, and says how long a firing one has left", () => {
      const staff = staffFacts(
        { manager: {}, "developer@2": { state: "firing" }, developer: {} },
        { recent: [{ id: "developer@2", change: "fire", at: fireAt }], now: fireAt + 4 * 60_000 },
      );
      const lines = section(staff, { live: ["manager", "developer", "developer@2"] }).map(plain);
      expect(lines[0]).toBe("STAFF  3/12");
      expect(lines[3]).toBe("  developer        2   developer@2 firing (6 min left)");
    });

    it("says a firing employee is ready, overdue, or just firing with no record of when", () => {
      const note = (/** @type {Partial<import("./staff.mjs").Employee>} */ employee, now = 0) =>
        plain(
          section(
            staffFacts(
              { architect: { state: "firing", ...employee } },
              { recent: [{ id: "architect", change: "fire", at: fireAt }], now },
            ),
            { live: ["architect"] },
          )[2] ?? "",
        );
      expect(note({ readyAt: fireAt + 60_000 }, fireAt + 2 * 60_000)).toBe(
        "  architect        1   architect firing (ready)",
      );
      expect(note({}, fireAt + 10 * 60_000)).toBe(
        "  architect        1   architect firing (overdue)",
      );
      const unrecorded = section(staffFacts({ architect: { state: "firing" } }), {
        live: ["architect"],
      });
      expect(plain(unrecorded[2] ?? "")).toBe("  architect        1   architect firing");
    });

    it("dims a role nobody is hired for, and names an employee down or not running", () => {
      const lastSeen = new Date(2026, 9, 25, 13, 30).getTime();
      const raw = section(staffFacts({ manager: {}, developer: {}, "lead-dev": {} }), {
        live: ["manager"],
        stale: new Map([["developer", lastSeen]]),
      });
      const lines = raw.map(plain);
      expect(lines[2]).toBe("  architect        0");
      expect(raw[2]).toContain("\x1b[2m");
      expect(raw[1]).not.toContain("\x1b");
      expect(lines[3]).toBe(`  developer        1   developer down since ${hhmm(lastSeen)}`);
      expect(lines[4]).toBe("  lead-dev         1   lead-dev not running");
    });

    it("shows ? for a company.json without maxAgents", () => {
      expect(
        plain(
          section(staffFacts({ manager: {} }, { maxAgents: null }), { live: ["manager"] })[0] ?? "",
        ),
      ).toBe("STAFF  1/?");
    });

    it("shows the manager's restarts today, only when there were some", () => {
      const lines = (/** @type {number} */ managerRestarts) =>
        section(staffFacts({ manager: {} }, { managerRestarts }), { live: ["manager"] }).map(plain);
      expect(lines(2)[1]).toBe("  manager          1   restarted 2× today");
      expect(lines(0)[1]).toBe("  manager          1");
    });

    it("says so when staff.json is missing or malformed", () => {
      expect(section(null).map(plain)).toEqual([
        "STAFF unknown (no staff.json yet: claude-llc up seeds it)",
      ]);
    });

    it("keeps every line within the width", () => {
      const staff = staffFacts(
        {
          manager: {},
          developer: { state: "firing" },
          "developer@2": {},
          "developer@3": {},
        },
        { managerRestarts: 3 },
      );
      for (const line of section(staff, { width: 30 })) {
        expect(columnsOf(line)).toBeLessThanOrEqual(30);
      }
    });
  });

  describe("the KPIs (#892)", () => {
    const GIB = 2 ** 30;
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const since = new Date(2026, 9, 27, 9, 0).getTime();
    const at = since + 5 * HOUR;
    /** @type {import("./kpi.mjs").Kpis} */
    const full = {
      schemaVersion: KPI_SCHEMA_VERSION,
      at,
      flow: {
        historySince: since,
        columns: {},
        done24h: 6,
        done7d: 31,
        cycleMedianMs: 5 * HOUR + 10 * MIN,
        cycleP90Ms: 19 * HOUR,
        reviewWaitMedianMs: 40 * MIN,
        qaWaitMedianMs: HOUR + 5 * MIN,
        bounces24h: 1,
        bounces7d: 4,
        topBounced: [],
        blocked: 2,
        oldestBlockedMs: 27 * HOUR,
      },
      claude: null,
      github: null,
      host: {
        employees: {
          developer: { memoryBytes: 1.4 * GIB, cpuShare: 0.6 },
          "developer@2": { memoryBytes: 2.1 * GIB, cpuShare: 0.95 },
          manager: { memoryBytes: 3 * GIB, cpuShare: null },
          "qa-tester": { memoryBytes: 1.6 * GIB, cpuShare: 0.8 },
        },
        slice: { memoryBytes: 9.8 * GIB, cpuShare: 3.4 },
        diskFreeBytes: 41 * GIB,
        diskHoldBelow: 20 * GIB,
      },
      staff: null,
      webCache: {
        entries: 812,
        bytes: 1.2 * GIB,
        limitBytes: 10 * GIB,
        hits: 83,
        misses: 17,
        evictions: 0,
        bytesSaved: 0.4 * GIB,
        hitRate: 0.83,
      },
      errors: {},
    };
    /**
     * @param {Record<string, unknown> | null} file
     * @param {{ now?: number, width?: number }} [options]
     */
    const pane = (file, { now = at + 2 * MIN, width = 120 } = {}) => {
      const lines = companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: staffFacts({}),
          budget: null,
          hub,
          reboot: null,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: { file, now },
          runners: noRunners,
        },
        { rows: 60, width },
      );
      const from = lines.findIndex((line) => plain(line).startsWith("KPI"));
      const to = lines.findIndex((line, index) => index > from && line === "");
      return lines.slice(from, to);
    };

    it("follows the staff with flow, blocked, host, the top three and the web cache", () => {
      const lines = pane(full);
      expect(lines.map(plain)).toEqual([
        "KPI (since 27 Oct, 7 d window)  updated 2 min ago",
        "flow    done 24h 6 · 7d 31 · cycle med 5h10 p90 19h · review wait 40m · QA wait 1h05 · bounces 24h 1 · 7d 4",
        "blocked 2, oldest 1d3h",
        "host    jails 9.8 GiB · cpu 340% · disk free 41 GiB",
        "top     developer@2 2.1 GiB 95% · qa-tester 1.6 GiB 80% · developer 1.4 GiB 60%",
        "web cache 1.2 GiB / 10 GiB, 83% hits",
      ]);
      expect(lines[0]).toContain("\x1b[1m");
    });

    it("names the most-bounced cards after the 7 d bounces", () => {
      const lines = pane(
        {
          ...full,
          flow: {
            ...full.flow,
            topBounced: [
              { issue: 12, bounces: 3 },
              { issue: 7, bounces: 1 },
            ],
          },
        },
        { width: 160 },
      );
      expect(plain(lines[1] ?? "")).toMatch(/· bounces 24h 1 · 7d 4 \(#12 ×3, #7 ×1\)$/);
    });

    it("paints blocked over 24 h and disk free under 1.5 × the hold", () => {
      const lines = pane(full);
      expect(lines[2]).toContain(`\x1b[33m`);
      expect(lines[3]).not.toContain(`\x1b[33m`);
      const low = pane({ ...full, host: { ...full.host, diskFreeBytes: 29 * GIB } });
      expect(low[3]).toContain("\x1b[33mdisk free 29 GiB\x1b[0m");
      const fresh = pane({ ...full, flow: { ...full.flow, oldestBlockedMs: 23 * HOUR } });
      expect(fresh[2]).toBe("blocked 2, oldest 23h");
    });

    it("says stale once the file is over 15 minutes old", () => {
      expect(plain(pane(full, { now: at + 16 * MIN })[0] ?? "")).toBe(
        "KPI (since 27 Oct, 7 d window)  stale (16 min)",
      );
    });

    it("is one line when the file is missing or another schemaVersion", () => {
      expect(pane(null)).toEqual(["KPI: none yet"]);
      expect(pane({ ...full, schemaVersion: KPI_SCHEMA_VERSION + 1 })).toEqual(["KPI: none yet"]);
      expect(pane({})).toEqual(["KPI: none yet"]);
    });

    it("shows a null section's error, cut to the width", () => {
      const lines = pane(
        { ...full, host: null, errors: { host: "systemctl: unit vibewars.slice not found" } },
        { width: 30 },
      ).map(plain);
      expect(lines.at(-2)).toBe("host    systemctl: unit vibew…");
      expect(lines.some((line) => line.startsWith("top"))).toBe(false);
    });

    it("says why the web cache is unread, and – hits before the first request", () => {
      const failed = pane({ ...full, webCache: null, errors: { webCache: "EACCES" } }).map(plain);
      expect(failed.at(-1)).toBe("web cache EACCES");
      const empty = pane({
        ...full,
        webCache: { ...full.webCache, bytes: 0, hits: 0, misses: 0, hitRate: null },
      }).map(plain);
      expect(empty.at(-1)).toBe("web cache 0.0 GiB / 10 GiB, – hits");
    });

    it("never wraps a narrow pane", () => {
      for (const line of pane(full, { width: 24 })) {
        expect(columnsOf(line)).toBeLessThanOrEqual(24);
      }
    });

    it("humanises durations", () => {
      expect(
        [null, 0, 40 * MIN, 5 * HOUR + 10 * MIN, 19 * HOUR, 27 * HOUR].map(humanDuration),
      ).toEqual(["–", "0m", "40m", "5h10", "19h", "1d3h"]);
    });
  });

  describe("the build (#557)", () => {
    /** @param {import("./dashboard-view.mjs").CompanyFacts["build"]} build */
    const pane = (build) =>
      companyLines(
        {
          roles,
          live: new Set(),
          stale: new Map(),
          staff: null,
          budget: null,
          hub,
          reboot: null,
          build,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 30, width: 80 },
      );

    it("is the first line, plain when current and red when STALE", () => {
      const current = pane({ line: "build: 0123abcd (current)", stale: false });
      expect(current[0]).toBe("build: 0123abcd (current)");
      const stale = pane({
        line: "build: 0123abcd STALE: differs in nix/claude-llc.nix (HEAD 89abcdef)",
        stale: true,
      });
      expect(stale[0]).toContain("\x1b[1;31m");
      expect(plain(stale[0] ?? "")).toBe(
        "build: 0123abcd STALE: differs in nix/claude-llc.nix (HEAD 89abcdef)",
      );
    });

    it("is not there when the dashboard runs from the checkout", () => {
      expect(pane(null).map(plain)[0]).not.toMatch(/^build:/);
    });
  });

  describe("the reboot (#345)", () => {
    const deadline = new Date(2026, 9, 25, 12, 41).getTime();
    const record = {
      requestedAt: 0,
      reason: "load #345",
      by: "manager",
      deadline,
      bootSha: "abc",
      targetSha: "a".repeat(40),
      proposalId: "0123456789abcdef0123456789abcdef",
      ready: ["manager", "lead-dev"],
    };
    const live = new Set(["manager", "architect", "developer", "developer@2", "lead-dev"]);

    /**
     * @param {import("./dashboard-view.mjs").CompanyFacts["reboot"]} reboot
     * @param {{ rows?: number, width?: number }} [pane]
     */
    const pane = (reboot, { rows = 30, width = 80 } = {}) =>
      companyLines(
        {
          roles,
          live,
          stale: new Map(),
          staff: null,
          budget: null,
          hub,
          reboot,
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows, width },
      ).map(plain);

    it("says a proposal awaits the operator, onto which commit, since when (#960)", () => {
      const lines = pane(
        {
          proposed: {
            id: "fedcba9876543210fedcba9876543210",
            proposedAt: deadline,
            by: "manager",
            kind: "request",
            reason: "load #960",
            bootSha: "b".repeat(40),
            targetSha: "a".repeat(40),
            commits: [],
            allCommits: 0,
            stat: { files: 0, insertions: 0, deletions: 0, top: [] },
          },
        },
        { width: 120 },
      );
      expect(lines[0]).toBe(
        "REBOOT PROPOSED Rfedcba onto aaaaaaaa, awaiting the operator since 12:41: load #960",
      );
    });

    it("is first: the deadline, then ready, waiting and idle in org-chart order", () => {
      const lines = pane({
        record,
        between: ["developer@2"],
        now: deadline - 6.5 * 60_000,
      });
      expect(lines.slice(0, 5)).toEqual([
        "REBOOT by 12:41 (in 7m) — manager: load #345",
        "  ready:   manager, lead-dev",
        "  waiting: architect, developer",
        "  idle:    developer@2",
        "",
      ]);
      expect(lines[5]).toMatch(/^STAFF unknown/);
    });

    it("omits an empty row, says <1m under a minute, and paints the header red", () => {
      const raw = companyLines(
        {
          roles,
          live,
          stale: new Map(),
          staff: null,
          budget: null,
          hub,
          reboot: { record: { ...record, ready: [] }, between: [], now: deadline - 30_000 },
          build: null,
          claude: null,
          telegram: telegramUp,
          kpi: noKpi,
          runners: noRunners,
        },
        { rows: 30, width: 80 },
      );
      const lines = raw.map(plain);
      expect(lines[0]).toBe("REBOOT by 12:41 (in <1m) — manager: load #345");
      expect(lines[1]).toBe("  waiting: manager, architect, developer, lead-dev, developer@2");
      expect(lines[2]).toBe("");
      expect(raw[0]).toContain("\x1b[1;31m");
    });

    it("is overdue and stopping after the deadline", () => {
      expect(pane({ record, between: [], now: deadline + 1 })[0]).toBe(
        "REBOOT overdue since 12:41, stopping",
      );
    });

    it("is one line once the restarter has it", () => {
      const lines = pane({ rebooting: "load #345" });
      expect(lines.slice(0, 2)).toEqual(["REBOOTING now — load #345", ""]);
      expect(lines[2]).toMatch(/^STAFF unknown/);
    });

    it("never prints a control sequence from the reason or the roles", () => {
      const evil = "x\u001B]52;c;AAAA\u0007\u001B[2J\nstolen";
      const reboots = [
        { record: { ...record, reason: evil, by: evil, ready: [evil] }, between: [], now: 0 },
        { rebooting: evil },
      ];
      for (const reboot of reboots) {
        const lines = companyLines(
          {
            roles,
            live,
            stale: new Map(),
            staff: null,
            budget: null,
            hub,
            reboot,
            build: null,
            claude: null,
            telegram: telegramUp,
            kpi: noKpi,
            runners: noRunners,
          },
          { rows: 30, width: 200 },
        ).map(plain);
        for (const line of lines) {
          expect(
            Array.from(line).every((char) => char.charCodeAt(0) >= 32 && char !== "\u007F"),
          ).toBe(true);
        }
      }
    });

    it("is no section, and no blank line, without a reboot", () => {
      expect(pane(null)[0]).toMatch(/^STAFF unknown/);
    });

    it("keeps every line within the width and wins over the rest on a short pane", () => {
      const lines = pane(
        { record, between: [], now: deadline - 60_000 * 7 },
        { rows: 3, width: 30 },
      );
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatch(/^REBOOT by 12:41/);
      for (const line of lines) {
        expect(columnsOf(line)).toBeLessThanOrEqual(30);
      }
    });
  });
});

describe("feedLines", () => {
  it("is the newest that fit, one line each, cut to the width", () => {
    const feed = Array.from({ length: 10 }, (_, i) => ({
      ts: 0,
      from: "manager",
      to: "developer",
      text: `message ${String(i)} ${"x".repeat(100)}`,
    }));
    const lines = feedLines(feed, { rows: 3, width: 50 }).map(plain);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^--:-- manager -> developer: message 7 x+…$/);
    for (const line of lines) {
      expect(columnsOf(line)).toBe(50);
    }
  });

  it("neutralises agent text, and says when nothing was said", () => {
    const [line] = feedLines([{ ts: 0, from: "a\u001B", to: "b", text: "x\ny" }], {
      rows: 5,
      width: 80,
    });
    expect(plain(line ?? "")).toBe("--:-- a␛ -> b: x⏎y");
    expect(feedLines([], { rows: 5, width: 80 })).toEqual(["(nothing said yet)"]);
  });
});

describe("cut", () => {
  it("ends a cut line in …, and leaves a short one alone", () => {
    expect(cut("abcdef", 4)).toBe("abc…");
    expect(cut("abc", 4)).toBe("abc");
    expect(cut("abc", 0)).toBe("");
  });
});

describe("groupFeed (#189)", () => {
  /**
   * @param {number} ts
   * @param {string} to
   * @param {string} [from]
   * @param {string} [kind]
   * @param {string} [text]
   */
  const row = (ts, to, from = "manager", kind = "peer", text = "standup") => ({
    ts,
    to,
    from,
    kind,
    text,
  });
  const ROLES = ["architect", "developer", "developer@2", "lead-dev", "qa-tester"];

  it("makes one broadcast, copied into every inbox, one row to all", () => {
    expect(groupFeed(ROLES.map((role) => row(10, role)))).toEqual([
      { ts: 10, from: "manager", to: "all", text: "standup" },
    ]);
  });

  it("keeps the same words at a different time as two messages", () => {
    expect(groupFeed([row(10, "architect"), row(11, "architect")])).toHaveLength(2);
  });

  it("keeps a message to one role addressed to that role", () => {
    expect(groupFeed([row(10, "lead-dev")])).toEqual([
      { ts: 10, from: "manager", to: "lead-dev", text: "standup" },
    ]);
  });

  it("never merges a link notice into a broadcast at the same moment", () => {
    const rows = [
      ...ROLES.map((role) => row(10, role)),
      row(10, "qa-tester", "link", "link", "delivered, but qa-tester is not running"),
    ];
    expect(groupFeed(rows).map((line) => line.to)).toEqual(["all", "qa-tester"]);
  });

  it("puts rows in time order whatever order the inboxes were read in", () => {
    const rows = [row(30, "architect", "a"), row(10, "lead-dev", "b"), row(20, "qa-tester", "c")];
    expect(groupFeed(rows).map((line) => line.ts)).toEqual([10, 20, 30]);
  });
});

describe("nudgeLines (#547)", () => {
  const at = (/** @type {string} */ time) => new Date(`2026-10-26T${time}:00`).getTime();
  const groom = {
    id: "groom-backlog",
    to: "manager",
    everyMinutes: 30,
    text: "Groom the Backlog: re-rank by value, finish started features first.",
  };
  /** @param {Partial<import("./dashboard-view.mjs").NudgeFacts>} over */
  const lines = (over, width = 200) =>
    nudgeLines({ ...noNudges, now: at("23:40"), ...over }, width).map(plain);

  it("shows when it last went and when it is next due", () => {
    expect(
      lines({
        schedule: [groom],
        since: at("22:00"),
        sent: new Map([["groom-backlog", at("23:31")]]),
      }),
    ).toEqual([
      "nudges",
      "  groom-backlog → manager · every 30m · last 23:31 · next 00:01",
      "    " + groom.text,
    ]);
  });

  it("marks an own schedule with its role", () => {
    const own = {
      id: "own-architect-check-qa",
      to: "architect",
      everyMinutes: 120,
      text: "(your schedule check-qa) Look.",
    };
    const shown = lines({ schedule: [groom, own], since: at("23:30") });
    expect(shown[1]).toMatch(/^ {2}groom-backlog → manager · /);
    expect(shown[3]).toMatch(
      /^ {2}own-architect-check-qa → architect \(own, architect\) · every 120m/,
    );
  });

  it("counts a nudge never sent from hubd's start", () => {
    expect(lines({ schedule: [groom], since: at("23:30") })[1]).toBe(
      "  groom-backlog → manager · every 30m · last never · next 00:00",
    );
  });

  it("says overdue when the next one is more than a minute late", () => {
    expect(lines({ schedule: [groom], since: at("22:00") })[1]).toContain("next overdue");
    expect(lines({ schedule: [groom], since: at("23:10") })[1]).toContain("next 23:40");
  });

  it("names who has it unread", () => {
    const unread = new Map([["groom-backlog", ["manager", "manager@2"]]]);
    expect(lines({ schedule: [groom], since: at("23:30"), unread })[1]).toMatch(
      / · unread: manager, manager@2$/,
    );
  });

  it("shows dashes when hubd never wrote its clock", () => {
    expect(lines({ schedule: [groom] })[1]).toContain("last — · next —");
  });

  it("is one problem line for a bad schedule, and nothing for an empty one", () => {
    expect(lines({ schedule: "schedule.nudges is not an array" })).toEqual([
      "nudges: schedule.json: schedule.nudges is not an array",
    ]);
    expect(lines({ schedule: [] })).toEqual([]);
  });

  it("cuts the text to the pane width", () => {
    const [, , text] = lines({ schedule: [groom], since: at("23:30") }, 20);
    expect(Array.from(text ?? "")).toHaveLength(20);
    expect(text).toMatch(/…$/);
  });
});
