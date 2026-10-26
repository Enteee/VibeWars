import { describe, expect, it } from "vitest";

import { loadLines } from "./company-load.mjs";
import { hhmm } from "./dashboard-view.mjs";

const NOW = new Date(2026, 9, 26, 23, 10).getTime();
const MIN = 60_000;

/**
 * @param {string} role
 * @param {Partial<import("./staff.mjs").Employee>} [change]
 * @returns {import("./staff.mjs").Employee}
 */
const employee = (role, change = {}) => ({
  role,
  hiredAt: 0,
  by: "manager",
  reason: "x",
  state: "working",
  readyAt: null,
  ...change,
});

/** @param {string} status */
const card = (status) => ({ item: { status, content: { number: 1 } } });

/** @returns {import("./company-load.mjs").LoadFacts} */
const facts = () => ({
  now: NOW,
  roles: ["manager", "developer-1", "qa-tester", "asset-designer"],
  board: {
    cards: [
      card("Ready"),
      card("Ready"),
      card("In Progress"),
      card("QA"),
      card("Backlog"),
      card("Done"),
    ],
  },
  staff: {
    employees: {
      manager: employee("manager"),
      "developer-1": employee("developer-1"),
      "developer-1@2": employee("developer-1"),
      "qa-tester": employee("qa-tester", { state: "firing", readyAt: NOW - MIN }),
    },
    recent: [],
  },
  maxAgents: 12,
  live: new Set(["manager", "developer-1", "developer-1@2", "qa-tester"]),
  stale: new Map(),
  peek: [
    { employee: "manager", state: "turn", lastLineAt: NOW - 30_000, lastLine: "x" },
    { employee: "developer-1", state: "turn", lastLineAt: NOW - MIN, lastLine: "x" },
    { employee: "developer-1@2", state: "between", lastLineAt: NOW - 130 * MIN, lastLine: "x" },
  ],
  usage: {
    roles: new Map([
      ["manager", { replies: 1, output: 40_000, input: 0, cacheRead: 0, model: "m" }],
      ["developer-1", { replies: 1, output: 1_200_000, input: 0, cacheRead: 0, model: "m" }],
    ]),
    total: { replies: 2, output: 1_240_000, input: 0, cacheRead: 0, model: "" },
    todayOutput: 0,
  },
});

describe("loadLines (#747)", () => {
  it("prints the board's queues, each employee's activity and each role's tokens", () => {
    expect(loadLines(facts())).toEqual([
      `LOAD  as of ${hhmm(NOW)}   staff 4/12`,
      "board   Ready 2  In Progress 1  In Review 0  QA 1  Blocked 0",
      "role             n  employees (state, last activity)                     tokens out 5h",
      "manager          1  manager in turn 0m                                     40k",
      "developer-1      2  developer-1 in turn 1m; developer-1@2 between 2h10m   1.2M",
      "qa-tester        1  qa-tester firing (ready)                                 0",
      "asset-designer   0  -                                                        0",
    ]);
  });

  it("says no turn yet for an employee with no peek record, and down or not running as the dashboard does", () => {
    const base = facts();
    const lines = loadLines({
      ...base,
      live: new Set(["manager"]),
      stale: new Map([["developer-1", new Date(2026, 9, 26, 22, 5).getTime()]]),
      peek: [],
    });
    expect(lines[3]).toContain("manager no turn yet");
    expect(lines[4]).toContain("developer-1 down since 22:05; developer-1@2 not running");
  });

  it("prints the rest when the board, the usage logs, staff.json or maxAgents are unknown", () => {
    const lines = loadLines({ ...facts(), board: null, usage: null, maxAgents: null });
    expect(lines[0]).toMatch(/staff 4\/\?$/);
    expect(lines[1]).toBe("board   unknown (hubd has no copy of the board yet)");
    expect(lines[3]).toMatch(/manager in turn 0m\s+\?$/);
    expect(lines.at(-1)).toBe("tokens  unknown (no usage logs)");

    const nobody = loadLines({ ...facts(), staff: null });
    expect(nobody[0]).toMatch(/staff unknown \(no staff\.json\)$/);
    expect(nobody[3]).toMatch(/^manager\s+\? {2}unknown\s+40k$/);
  });

  it("makes every line visible: nothing read from a file can fake a header", () => {
    const base = facts();
    const lines = loadLines({
      ...base,
      board: { cards: [card("Ready\n12:00:00*Ente: hi")] },
    });
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  });
});
