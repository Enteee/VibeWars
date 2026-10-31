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
  roles: ["manager", "developer", "qa-tester", "asset-designer"],
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
      developer: employee("developer"),
      "developer@2": employee("developer"),
      "qa-tester": employee("qa-tester", { state: "firing", readyAt: NOW - MIN }),
    },
    recent: [],
  },
  maxAgents: 12,
  live: new Set(["manager", "developer", "developer@2", "qa-tester"]),
  stale: new Map(),
  peek: [
    { employee: "manager", state: "turn", lastLineAt: NOW - 30_000, lastLine: "x" },
    { employee: "developer", state: "turn", lastLineAt: NOW - MIN, lastLine: "x" },
    { employee: "developer@2", state: "between", lastLineAt: NOW - 130 * MIN, lastLine: "x" },
  ],
  usage: {
    roles: new Map([
      ["manager", { replies: 1, output: 40_000, input: 0, cacheRead: 0, model: "m" }],
      ["developer", { replies: 1, output: 1_200_000, input: 0, cacheRead: 0, model: "m" }],
    ]),
    total: { replies: 2, output: 1_240_000, input: 0, cacheRead: 0, model: "" },
    todayOutput: 0,
  },
  kpis: null,
});

/** @type {import("./kpi.mjs").JobStats} */
const stats = { count: 0, waitP50S: null, waitP90S: null, durationP50S: null, durationP90S: null };

describe("loadLines (#747)", () => {
  it("prints the board's queues, each employee's activity and each role's tokens", () => {
    expect(loadLines(facts())).toEqual([
      `LOAD  as of ${hhmm(NOW)}   staff 4/12`,
      "board   Ready 2  In Progress 1  In Review 0  QA 1  Blocked 0",
      "role             n  employees (state, last activity)                 tokens out 5h",
      "manager          1  manager in turn 0m                                 40k",
      "developer        2  developer in turn 1m; developer@2 between 2h10m   1.2M",
      "qa-tester        1  qa-tester firing (ready)                             0",
      "asset-designer   0  -                                                    0",
      "CI      unknown (no KPI snapshot yet)",
    ]);
  });

  it("says no turn yet for an employee with no peek record, and down or not running as the dashboard does", () => {
    const base = facts();
    const lines = loadLines({
      ...base,
      live: new Set(["manager"]),
      stale: new Map([["developer", new Date(2026, 9, 26, 22, 5).getTime()]]),
      peek: [],
    });
    expect(lines[3]).toContain("manager no turn yet");
    expect(lines[4]).toContain("developer down since 22:05; developer@2 not running");
  });

  it("prints the rest when the board, the usage logs, staff.json or maxAgents are unknown", () => {
    const lines = loadLines({ ...facts(), board: null, usage: null, maxAgents: null });
    expect(lines[0]).toMatch(/staff 4\/\?$/);
    expect(lines[1]).toBe("board   unknown (hubd has no copy of the board yet)");
    expect(lines[3]).toMatch(/manager in turn 0m\s+\?$/);
    expect(lines.at(-2)).toBe("tokens  unknown (no usage logs)");

    const nobody = loadLines({ ...facts(), staff: null });
    expect(nobody[0]).toMatch(/staff unknown \(no staff\.json\)$/);
    expect(nobody[3]).toMatch(/^manager\s+\? {2}unknown\s+40k$/);
  });

  it("prints the CI block: each workflow's wait and run over 24 h, then the host (#1892)", () => {
    const wall = { count: 0, p50S: null, p90S: null };
    const window = {
      malformed: 0,
      workflows: [
        {
          workflow: "ci.yml",
          runner: /** @type {const} */ ("company"),
          ...stats,
          count: 12,
          waitP50S: 4,
          waitP90S: 75,
          durationP50S: 250,
          durationP90S: 4000,
        },
        { workflow: "e2e-repeat.yml", runner: /** @type {const} */ ("hosted"), ...stats, count: 3 },
      ],
      jobs: [],
      wall: { push: wall, pull_request: wall },
    };
    const lines = loadLines({
      ...facts(),
      kpis: {
        schemaVersion: 7,
        at: NOW,
        flow: null,
        claude: null,
        github: null,
        host: null,
        staff: null,
        webCache: null,
        ci: null,
        ciJobs: { "24h": window, "7d": window },
        machine: {
          cpus: 16,
          load1: 3.5,
          load5: 2,
          load15: 1.25,
          memTotalBytes: 32 * 2 ** 30,
          memAvailableBytes: 12.5 * 2 ** 30,
          hubDiskFreeBytes: 0,
        },
        errors: {},
      },
    });
    expect(lines.slice(-4)).toEqual([
      "CI 24h  workflow                      wait p50/p90    run p50/p90  jobs",
      "        ci.yml (company)                  4s/1m15s    4m10s/1h06m    12",
      "        e2e-repeat.yml (hosted)                -/-            -/-     3",
      "host    16 CPUs  load 3.50 2.00 1.25  mem free 12.5/32.0 GiB",
    ]);
  });

  it("says why the CI block or the host is unknown (#1892)", () => {
    const kpis = /** @type {import("./kpi.mjs").Kpis} */ ({
      ...{ schemaVersion: 7, at: NOW, flow: null, claude: null, github: null, host: null },
      ...{ staff: null, webCache: null, ci: null, ciJobs: null, machine: null },
      errors: { ciJobs: "no history" },
    });
    expect(loadLines({ ...facts(), kpis }).slice(-2)).toEqual([
      "CI      unknown (no history)",
      "host    unknown (not read)",
    ]);
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
