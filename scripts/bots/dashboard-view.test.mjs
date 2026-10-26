/**
 * What the dashboard's panes say (#165), without a terminal: counts for
 * the columns nobody waits on, as many cards as fit for the rest, the
 * last three done, and never a line wider than the pane.
 */
import { describe, expect, it } from "vitest";

import {
  boardLines,
  companyLines,
  cut,
  doneOrder,
  feedLines,
  groupFeed,
  hhmm,
  nudgeLines,
} from "./dashboard-view.mjs";
/** @type {import("./dashboard-view.mjs").NudgeFacts} */
const noNudges = { schedule: [], since: null, sent: new Map(), unread: new Map(), now: 0 };
/** @typedef {{ state: "up" | "stale" | "down" | "crash-looping", line: string }} HubLine */

const COLUMNS = ["Backlog", "Ready", "In Progress", "In Review", "QA", "Done"];
const EVERYONE = new Set(["architect", "manager", "developer-1", "lead-dev", "qa-tester"]);

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
    const rows = 16;
    const lines = boardLines(
      snapshot({ "In Progress": 9, "In Review": 4, QA: 3, Done: 3 }),
      COLUMNS,
      EVERYONE,
      { rows, width: 60 },
    ).map(plain);
    expect(lines).toHaveLength(rows);
    // 16 rows: a header, six column lines, three done; six left. One card
    // each, then a "more" line each, then the rest to In Progress.
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
    const lines = boardLines(snapshot({ "In Progress": 3, Done: 3 }), COLUMNS, EVERYONE, {
      rows: 7,
      width: 60,
    }).map(plain);
    expect(lines).toHaveLength(7);
    expect(lines.some((line) => / card \d/.test(line))).toBe(false);
    expect(lines.at(-1)).toBe("Done 3");
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

describe("companyLines", () => {
  const roles = ["manager", "architect", "developer-1", "developer-2", "lead-dev"];
  const budget = { remaining: 4210, limit: 5000, resetAt: 0, spend: "GRAPHQL  ~380/h" };
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
        nudges: noNudges,
      },
      { rows: 30, width: 40 },
    ).map(plain);
    expect(lines[0]).toBe("STAFF  2/12");
    expect(lines.some((line) => line.startsWith("GITHUB GraphQL 4210/5000"))).toBe(true);
    expect(lines.indexOf("hub ● up 3m · restarts 0/h")).toBeGreaterThan(0);
    for (const line of lines) {
      expect(columnsOf(line)).toBeLessThanOrEqual(40);
    }
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
          nudges: noNudges,
        },
        { rows: 30, width: 80 },
      ).find((line) => plain(line).startsWith("hub "));
    expect(hubLine(hub)).toContain("\x1b[1;32m");
    expect(hubLine({ state: "down", line: "hub ● down · restarts 0/h" })).toContain("\x1b[1;31m");
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
        nudges: noNudges,
      },
      { rows: 30, width: 72 },
    ).map(plain);
    expect(lines).toContain("CLAUDE usage unknown (no agent logs yet)");
  });

  it("shows tokens per role, — for a quiet one, and marks the top (#50)", () => {
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
      summary: {
        roles: new Map([
          ["manager", usage(61_000)],
          ["developer-1", usage(240_000)],
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
        nudges: noNudges,
      },
      { rows: 40, width: 72 },
    ).map(plain);
    const at = lines.indexOf("CLAUDE tokens, last 5h, as of 16:42");
    expect(at).toBeGreaterThan(0);
    const table = lines.slice(at + 2);
    expect(table.map((line) => line.trim().split(/\s+/)[0])).toEqual([...roles, "total"]);
    expect(table[0]).toMatch(/^ {2}manager +41 +61k +112k +3\.1M {2}opus-5-5$/);
    expect(table[1]).toMatch(/^ {2}architect +—$/);
    expect(table[2]).toMatch(/240k .*opus-5-5 {2}<- top$/);
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
        nudges: noNudges,
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
        nudges: noNudges,
      },
      { rows: 4, width: 40 },
    );
    expect(lines).toHaveLength(4);
    expect(lines.at(-1)).toMatch(/^… \+\d+ lines$/);
  });

  describe("the staff (#386)", () => {
    const everyone = ["manager", "architect", "developer-1", "developer-2", "lead-dev"];
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
          nudges: noNudges,
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
        "  developer-1      1",
        "  developer-2      1",
        "  lead-dev         1",
      ]);
    });

    it("counts both employees of a role, and says how long a firing one has left", () => {
      const staff = staffFacts(
        { manager: {}, "developer-1@2": { state: "firing" }, "developer-1": {} },
        { recent: [{ id: "developer-1@2", change: "fire", at: fireAt }], now: fireAt + 4 * 60_000 },
      );
      const lines = section(staff, { live: ["manager", "developer-1", "developer-1@2"] }).map(
        plain,
      );
      expect(lines[0]).toBe("STAFF  3/12");
      expect(lines[3]).toBe("  developer-1      2   developer-1@2 firing (6 min left)");
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
      const raw = section(staffFacts({ manager: {}, "developer-1": {}, "developer-2": {} }), {
        live: ["manager"],
        stale: new Map([["developer-1", lastSeen]]),
      });
      const lines = raw.map(plain);
      expect(lines[2]).toBe("  architect        0");
      expect(raw[2]).toContain("\x1b[2m");
      expect(raw[1]).not.toContain("\x1b");
      expect(lines[3]).toBe(`  developer-1      1   developer-1 down since ${hhmm(lastSeen)}`);
      expect(lines[4]).toBe("  developer-2      1   developer-2 not running");
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
          "developer-1": { state: "firing" },
          "developer-1@2": {},
          "developer-1@3": {},
        },
        { managerRestarts: 3 },
      );
      for (const line of section(staff, { width: 30 })) {
        expect(columnsOf(line)).toBeLessThanOrEqual(30);
      }
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
          nudges: noNudges,
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
      ready: ["manager", "lead-dev"],
    };
    const live = new Set(["manager", "architect", "developer-1", "developer-2", "lead-dev"]);

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
          nudges: noNudges,
        },
        { rows, width },
      ).map(plain);

    it("is first: the deadline, then ready, waiting and idle in org-chart order", () => {
      const lines = pane({
        record,
        between: ["developer-2"],
        now: deadline - 6.5 * 60_000,
      });
      expect(lines.slice(0, 5)).toEqual([
        "REBOOT by 12:41 (in 7m) — manager: load #345",
        "  ready:   manager, lead-dev",
        "  waiting: architect, developer-1",
        "  idle:    developer-2",
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
          nudges: noNudges,
        },
        { rows: 30, width: 80 },
      );
      const lines = raw.map(plain);
      expect(lines[0]).toBe("REBOOT by 12:41 (in <1m) — manager: load #345");
      expect(lines[1]).toBe("  waiting: manager, architect, developer-1, developer-2, lead-dev");
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
            nudges: noNudges,
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
      to: "developer-1",
      text: `message ${String(i)} ${"x".repeat(100)}`,
    }));
    const lines = feedLines(feed, { rows: 3, width: 50 }).map(plain);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^--:-- manager -> developer-1: message 7 x+…$/);
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
  const ROLES = ["architect", "developer-1", "developer-2", "lead-dev", "qa-tester"];

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
    nudgeLines({ nudges: { ...noNudges, now: at("23:40"), ...over } }, width).map(plain);

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
