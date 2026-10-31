import { describe, expect, it } from "vitest";

import {
  EDGES_SCHEMA_VERSION,
  KPI_SCHEMA_VERSION,
  addEdge,
  buildKpis,
  ciKpis,
  ciRunFromRest,
  cpuShare,
  employeeOfUnit,
  flowKpis,
  idleShare,
  idleWhileReady,
  median,
  p90,
  parseCiHistory,
  parseEdges,
  parseUnits,
  projectSevenDay,
  stageWaits,
  staffKpis,
  tokensByRole,
} from "./kpi.mjs";

const NOW = 1_800_000_000_000;
const H = 3_600_000;
const M = 60_000;
const D = 24 * H;

/**
 * @param {number} issue
 * @param {string | null} from
 * @param {string | null} to
 * @param {number} agoMs
 */
function move(issue, from, to, agoMs) {
  return { ts: NOW - agoMs, issue, from, to, by: "x" };
}

/** No wait logs, and nobody employed. */
const NO_WAITS = { waits: new Map(), staff: { employees: {} } };

/**
 * A wait from `startAgoMs` to `endAgoMs` before now.
 *
 * @param {number} startAgoMs
 * @param {number} endAgoMs
 * @returns {import("./waits.mjs").WaitLine}
 */
function waited(startAgoMs, endAgoMs) {
  return { start: NOW - startAgoMs, end: NOW - endAgoMs, cmd: "tg", woke: "timeout" };
}

describe("flowKpis", () => {
  it("counts Done in 24 h and 7 d, with the window edges excluded at the far end", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [],
      moves: [
        move(1, "QA", "Done", H),
        move(2, "QA", "Done", 2 * D),
        move(3, "QA", "Done", 7 * D),
        move(4, "QA", "Done", 7 * D + 1),
      ],
    });
    expect([flow.done24h, flow.done7d]).toEqual([1, 2]);
  });

  it("measures the cycle from the first Ready to the last Done", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [],
      moves: [
        move(1, "Backlog", "Ready", 5 * H),
        move(1, "Ready", "In Progress", 4 * H),
        move(1, "QA", "Done", 3 * H),
        move(1, "Done", "In Progress", 2 * H),
        move(1, "QA", "Done", H),
        move(2, "Backlog", "Ready", 3 * H),
        move(2, "QA", "Done", H),
      ],
    });
    expect(flow.done7d).toBe(3);
    // issue 1: 5h - 1h = 4h; issue 2: 2h
    expect(flow.cycleMedianMs).toBe(3 * H);
    expect(flow.cycleP90Ms).toBe(4 * H);
  });

  it("leaves a card without a Ready in history out of the cycle, and says null when empty", () => {
    const flow = flowKpis({ now: NOW, ...NO_WAITS, cards: [], moves: [move(1, "QA", "Done", H)] });
    expect(flow.done7d).toBe(1);
    expect(flow.cycleMedianMs).toBeNull();
    expect(flow.cycleP90Ms).toBeNull();
    expect(flow.reviewWaitMedianMs).toBeNull();
    expect(flow.historySince).toBe(NOW - H);
  });

  it("waits in review and QA from arrival to leaving", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [],
      moves: [
        move(1, "In Progress", "In Review", 10 * H),
        move(1, "In Review", "QA", 8 * H),
        move(1, "QA", "Done", 7 * H),
        move(2, "In Progress", "In Review", 6 * H),
        move(2, "In Review", "In Progress", 2 * H),
      ],
    });
    expect(flow.reviewWaitMedianMs).toBe(3 * H);
    expect(flow.qaWaitMedianMs).toBe(H);
  });

  it("counts only work sent back from review or QA as a bounce, over 24 h and 7 d", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [],
      moves: [
        move(1, "QA", "In Progress", 2 * H),
        move(2, "In Review", "In Progress", 30 * H),
        move(3, "Ready", "Backlog", H),
        move(4, "Blocked", "Backlog", H),
        move(5, "QA", "In Review", H),
        move(6, null, "In Progress", H),
        move(7, "QA", "In Progress", 8 * D),
        move(8, "QA", "In Progress", 7 * D),
      ],
    });
    expect(flow.bounces24h).toBe(1);
    expect(flow.bounces7d).toBe(2);
  });

  it("names up to three most-bounced cards, ties by the lower issue", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [],
      moves: [
        move(9, "QA", "In Progress", 5 * H),
        move(4, "In Review", "In Progress", 4 * H),
        move(9, "In Review", "In Progress", 3 * H),
        move(2, "QA", "In Progress", 3 * H),
        move(7, "QA", "In Progress", 2 * H),
        move(9, "QA", "In Progress", H),
      ],
    });
    expect(flow.bounces7d).toBe(6);
    expect(flow.topBounced).toEqual([
      { issue: 9, bounces: 3 },
      { issue: 2, bounces: 1 },
      { issue: 4, bounces: 1 },
    ]);
    expect(flowKpis({ now: NOW, ...NO_WAITS, cards: [], moves: [] }).topBounced).toEqual([]);
  });

  it("counts cards per column and ages the oldest Blocked from its last arrival", () => {
    const flow = flowKpis({
      now: NOW,
      ...NO_WAITS,
      cards: [
        { issue: 1, status: "Blocked" },
        { issue: 2, status: "Blocked" },
        { issue: 3, status: "Ready" },
      ],
      moves: [
        move(1, "Ready", "Blocked", 5 * H),
        move(1, "Blocked", "Ready", 4 * H),
        move(1, "Ready", "Blocked", 2 * H),
        move(2, "Ready", "Blocked", 3 * H),
      ],
    });
    expect(flow.columns).toEqual({ Blocked: 2, Ready: 1 });
    expect(flow.blocked).toBe(2);
    expect(flow.oldestBlockedMs).toBe(3 * H);
  });

  it("is all null and zero before any history", () => {
    const flow = flowKpis({ now: NOW, ...NO_WAITS, cards: [], moves: [] });
    expect(flow).toMatchObject({
      historySince: null,
      done7d: 0,
      blocked: 0,
      oldestBlockedMs: null,
    });
  });
});

describe("statistics", () => {
  it("takes the median of an even count as the mean of the middle two", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("takes the nearest-rank p90", () => {
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(p90([5])).toBe(5);
  });
});

describe("host readers", () => {
  it("parses systemctl show of several units, treating unset values as absent", () => {
    const text = [
      "Id=vibewars-jail-qa-tester-1.service\nMemoryCurrent=1048576\nCPUUsageNSec=2000000000",
      "Id=vibewars-jails.slice\nMemoryCurrent=[not set]\nCPUUsageNSec=18446744073709551615\n",
    ].join("\n\n");
    expect(parseUnits(text)).toEqual(
      new Map([
        ["vibewars-jail-qa-tester-1.service", { memoryBytes: 1048576, cpuNSec: 2e9 }],
        ["vibewars-jails.slice", { memoryBytes: null, cpuNSec: null }],
      ]),
    );
  });

  it("measures CPU in cores, null without a previous sample", () => {
    expect(cpuShare(null, 5, 1000)).toBeNull();
    expect(cpuShare(0, 5e8, 1000)).toBe(0.5);
    expect(cpuShare(9, 5, 1000)).toBeNull();
  });

  it("names the employee a unit is for", () => {
    expect(employeeOfUnit("vibewars-jail-qa-tester-2-4242.service")).toBe("qa-tester-2");
    expect(employeeOfUnit("other.service")).toBeNull();
  });
});

describe("claude and staff", () => {
  it("sums fresh input and output per role", () => {
    expect(tokensByRole(new Map([["dev", { output: 5, input: 7 }]]))).toEqual({ dev: 12 });
  });

  it("counts employed and live per role", () => {
    const staff = { employees: { "dev@1": { role: "dev" }, "dev@2": { role: "dev" } } };
    expect(staffKpis(staff, new Set(["dev@1"]), 9, NOW, new Map())).toEqual({
      byRole: { dev: { employed: 2, live: 1 } },
      maxAgents: 9,
      idleShare24h: {},
    });
  });
});

describe("stage waits and idle (#1615)", () => {
  const staff = {
    employees: {
      developer: { role: "developer" },
      "developer@2": { role: "developer" },
      "qa-tester": { role: "qa-tester" },
    },
  };

  it("measures each column's stays that ended in 24 h, a bounce twice, however long ago they began", () => {
    const wait = stageWaits(NOW, [
      move(1, "Backlog", "Ready", 30 * H),
      move(1, "Ready", "In Progress", 20 * H),
      move(1, "In Progress", "In Review", 10 * H),
      move(1, "In Review", "In Progress", 9 * H),
      move(1, "In Progress", "In Review", 8 * H),
      move(1, "In Review", "QA", 6 * H),
      // Ended before the window: not counted.
      move(2, "Backlog", "Ready", 40 * H),
      move(2, "Ready", "In Progress", 25 * H),
    ]);
    expect(wait.ready).toEqual({ medianMs: 10 * H, p90Ms: 10 * H, n: 1 });
    expect(wait.inProgress).toEqual({ medianMs: 5.5 * H, p90Ms: 10 * H, n: 2 });
    expect(wait.inReview).toEqual({ medianMs: 1.5 * H, p90Ms: 2 * H, n: 2 });
    // Still in QA: no stay has ended.
    expect(wait.qa).toEqual({ medianMs: null, p90Ms: null, n: 0 });
  });

  it("shares a role's waits over the time each employee was there, from its first wait in the day", () => {
    const share = idleShare(
      NOW,
      new Map([
        // There for 10 h, of which 5 h waiting.
        ["developer", [waited(10 * H, 8 * H), waited(4 * H, H)]],
        // From before the window: all 24 h observed, 4 h of them waiting, the overlap once.
        ["developer@2", [waited(26 * H, 20 * H), waited(21 * H, 20 * H)]],
        // Ended before the window: absent.
        ["qa-tester", [waited(30 * H, 25 * H)]],
      ]),
      staff,
    );
    expect(share).toEqual({ developer: (5 * H + 4 * H) / (10 * H + 24 * H) });
  });

  it("counts the idle sleep after a tg wait that timed out, not only the tg wait", () => {
    const share = idleShare(
      NOW,
      new Map([
        [
          "developer",
          [
            // 9 min in tg wait, then 50 min asleep in agent-loop's idle, of a 2 h day.
            waited(2 * H, 2 * H - 9 * M),
            { start: NOW - 2 * H + 9 * M, end: NOW - H - M, cmd: "idle", woke: "timeout" },
            waited(H, H - M),
          ],
        ],
      ]),
      staff,
    );
    expect(share).toEqual({ developer: (9 * M + 50 * M + M) / (2 * H) });
  });

  it("counts Ready occupied while a developer waits, not while a qa-tester does", () => {
    const moves = [move(1, "Backlog", "Ready", 3 * H), move(1, "Ready", "In Progress", 2 * H)];
    expect(
      idleWhileReady(
        NOW,
        moves,
        new Map([
          ["developer", [waited(2.5 * H, H)]],
          ["qa-tester", [waited(3 * H, 0)]],
        ]),
        staff,
      ),
    ).toBe(0.5 * H);
  });

  it("runs a card still in Ready to now", () => {
    expect(
      idleWhileReady(
        NOW,
        [move(1, "Backlog", "Ready", 30 * H)],
        new Map([["developer", [waited(2 * H, H), waited(1.5 * H, 0.5 * H)]]]),
        staff,
      ),
    ).toBe(1.5 * H);
  });
});

describe("addEdge and projectSevenDay (#1313)", () => {
  const S = NOW / 1000;
  const RESETS = S + 2 * 24 * 3600;
  /**
   * A reading `agoS` seconds before now.
   *
   * @param {number} agoS
   * @param {number} utilization
   * @param {number} [resetsAt]
   */
  function reading(agoS, utilization, resetsAt = RESETS) {
    return { at: (S - agoS) * 1000, sevenDay: { utilization, resetsAt } };
  }
  /** @param {ReturnType<typeof reading>[]} readings oldest first */
  function edgesOf(readings) {
    return readings.reduce(
      (edges, next) => addEdge(edges, next),
      /** @type {import("./kpi.mjs").SevenDayEdge[]} */ ([]),
    );
  }
  /**
   * A steady 1% each 100 min, from `from`, a reading every 5 min.
   *
   * @param {number} hours
   * @param {number} from
   */
  function steady(hours, from) {
    const readings = [];
    for (let ago = hours * 3600; ago >= 0; ago -= 300) {
      const steps = Math.floor((hours * 3600 - ago) / 6000);
      readings.push(reading(ago, Math.round((from + steps / 100) * 100) / 100, S + 7 * 24 * 3600));
    }
    return readings;
  }

  it("runs a steady 1%-per-100-min burn over 10 h on to 100%, from the last edge", () => {
    const edges = edgesOf(steady(10, 0.5));
    // Edges at 0.50 ... 0.56, the last 600 min after the first.
    expect(edges.map(({ utilization }) => utilization)).toEqual([
      0.5, 0.51, 0.52, 0.53, 0.54, 0.55, 0.56,
    ]);
    const last = edges.at(-1);
    expect(last?.at).toBe(S);
    // 44 steps to go at one each 6000 s.
    expect(projectSevenDay(edges)).toBeCloseTo(S + 44 * 6000, -1);
  });

  it("stamps an edge with the reading's own time, and records an equal reading never", () => {
    const edges = edgesOf([reading(3600, 0.1), reading(1800, 0.1), reading(0, 0.1)]);
    expect(edges).toEqual([{ at: S - 3600, utilization: 0.1, resetsAt: RESETS }]);
  });

  it("is null for 2 edges, or 3 spanning under 2 h", () => {
    expect(projectSevenDay(edgesOf([reading(5 * 3600, 0.1), reading(0, 0.2)]))).toBeNull();
    expect(
      projectSevenDay(edgesOf([reading(7000, 0.1), reading(3600, 0.15), reading(0, 0.2)])),
    ).toBeNull();
    expect(projectSevenDay([])).toBeNull();
  });

  it("is null when the window resets first", () => {
    const soon = S + 3600;
    expect(
      projectSevenDay(
        edgesOf([
          reading(4 * 3600, 0.1, soon),
          reading(2 * 3600, 0.11, soon),
          reading(0, 0.12, soon),
        ]),
      ),
    ).toBeNull();
  });

  it("drops the edges of an older window when resetsAt changes", () => {
    const old = RESETS - 7 * 24 * 3600;
    const edges = edgesOf([
      reading(5 * 3600, 0.9, old),
      reading(4 * 3600, 0.95, old),
      reading(0, 0.01),
    ]);
    expect(edges).toEqual([{ at: S, utilization: 0.01, resetsAt: RESETS }]);
    expect(projectSevenDay(edges)).toBeNull();
  });

  it("drops edges older than 24 h before the reading", () => {
    const edges = edgesOf([reading(25 * 3600, 0.1), reading(3 * 3600, 0.2), reading(0, 0.3)]);
    expect(edges.map(({ utilization }) => utilization)).toEqual([0.2, 0.3]);
  });

  it("is the edge's time at or over 100%", () => {
    expect(projectSevenDay(edgesOf([reading(600, 1)]))).toBe(S - 600);
  });

  it("is null when utilization falls, the rolling window shedding old use", () => {
    expect(
      projectSevenDay(edgesOf([reading(4 * 3600, 0.3), reading(2 * 3600, 0.31), reading(0, 0.28)])),
    ).toBeNull();
  });

  it("records nothing and drops nothing without a 7-day reading", () => {
    const edges = edgesOf([reading(0, 0.1)]);
    expect(addEdge(edges, null)).toEqual(edges);
    expect(addEdge(edges, { at: NOW, sevenDay: null })).toEqual(edges);
  });
});

describe("parseEdges (#1313)", () => {
  const edge = { at: 1, utilization: 0.1, resetsAt: 2 };

  it("reads the edges of a file of this schema version", () => {
    expect(
      parseEdges(JSON.stringify({ schemaVersion: EDGES_SCHEMA_VERSION, edges: [edge] })),
    ).toEqual([edge]);
  });

  it("discards one that does not parse, has another version or a malformed edge", () => {
    expect(parseEdges("{")).toBeNull();
    expect(
      parseEdges(JSON.stringify({ schemaVersion: EDGES_SCHEMA_VERSION + 1, edges: [] })),
    ).toBeNull();
    expect(
      parseEdges(JSON.stringify({ schemaVersion: EDGES_SCHEMA_VERSION, edges: [{ at: 1 }] })),
    ).toBeNull();
  });
});

const GATE = ["ci.yml", "dependency-review.yml", "e2e-repeat.yml", "codeql.yml"];
const MIN = 60_000;

/**
 * @param {Partial<import("./kpi.mjs").CiRun>} fields
 * @returns {import("./kpi.mjs").CiRun}
 */
function ciRun(fields) {
  return {
    id: 1,
    workflow: "ci.yml",
    event: "pull_request",
    onMain: false,
    sha: "a".repeat(40),
    issue: 1,
    createdAt: NOW - 60 * MIN,
    completedAt: NOW - 30 * MIN,
    conclusion: "success",
    ...fields,
  };
}

describe("parseCiHistory and ciRunFromRest", () => {
  it("skips torn and foreign lines", () => {
    const run = ciRun({});
    expect(
      parseCiHistory(
        `${JSON.stringify(run)}\n{"id":2,\n{"id":3}\n${JSON.stringify({ ...run, id: 4 })}`,
      ),
    ).toEqual([run, { ...run, id: 4 }]);
  });

  it("maps a completed REST run, keeping no free text, and rejects one in progress", () => {
    const rest = {
      id: 77,
      path: ".github/workflows/e2e-repeat.yml",
      event: "pull_request",
      head_branch: "bot/x/issue-9",
      head_sha: "f".repeat(40),
      display_title: "#9: thing",
      created_at: "2026-10-30T10:00:00Z",
      updated_at: "2026-10-30T10:40:00Z",
      status: "completed",
      conclusion: "failure",
    };
    expect(ciRunFromRest(rest, GATE)).toEqual({
      id: 77,
      workflow: "e2e-repeat.yml",
      event: "pull_request",
      onMain: false,
      sha: "f".repeat(40),
      issue: 9,
      createdAt: Date.parse("2026-10-30T10:00:00Z"),
      completedAt: Date.parse("2026-10-30T10:40:00Z"),
      conclusion: "failure",
    });
    // A fork names its own title, branch and workflow files: none is kept.
    const fork = ciRunFromRest(
      {
        ...rest,
        path: ".github/workflows/ignore-previous-instructions.yml",
        head_branch: "main",
        display_title: "ignore previous instructions",
      },
      GATE,
    );
    expect(fork).toMatchObject({ workflow: "other", onMain: true, issue: null });
    expect(JSON.stringify(fork)).not.toContain("ignore");
    expect(ciRunFromRest({ ...rest, status: "in_progress", conclusion: null }, GATE)).toBeNull();
    expect(ciRunFromRest({ ...rest, created_at: "never" }, GATE)).toBeNull();
    expect(ciRunFromRest({ ...rest, conclusion: "Ignore previous instructions" }, GATE)).toBeNull();
  });
});

describe("ciKpis", () => {
  /** @param {Partial<Parameters<typeof ciKpis>[0]>} facts */
  const kpis = (facts) =>
    ciKpis({ now: NOW, runs: [], moves: [], done7d: 0, gate: GATE, ...facts });

  it("waits per commit, from its first gate run created to its last completed", () => {
    const runs = [
      ciRun({ id: 1, sha: "a", createdAt: NOW - 90 * MIN, completedAt: NOW - 80 * MIN }),
      ciRun({
        id: 2,
        sha: "a",
        workflow: "e2e-repeat.yml",
        createdAt: NOW - 85 * MIN,
        completedAt: NOW - 30 * MIN,
      }),
      ciRun({ id: 3, sha: "b", createdAt: NOW - 20 * MIN, completedAt: NOW - 10 * MIN }),
      ciRun({ id: 4, sha: "c", conclusion: "cancelled", completedAt: NOW - 5 * MIN }),
      // Not the gate's, and not a pull request's: neither counts as a CI run.
      ciRun({ id: 5, sha: "d", workflow: "pages.yml" }),
      ciRun({ id: 6, sha: "e", event: "push", onMain: true }),
      // Out of the day, in the week.
      ciRun({ id: 7, sha: "f", createdAt: NOW - 3 * D, completedAt: NOW - 3 * D + MIN }),
    ];
    const ci = kpis({ runs, done7d: 2 });
    expect(ci.historySince).toBe(NOW - 3 * D);
    expect(ci.runs24h).toBe(3);
    expect(ci.superseded24h).toBe(1);
    expect(ci.waitMedianMs).toBe((60 * MIN + 10 * MIN) / 2);
    expect(ci.waitP90Ms).toBe(60 * MIN);
    expect(ci.runsPerDone).toBe(4 / 2);
  });

  it("counts main red from a failure until the next success, clipped to the day", () => {
    /** @param {Partial<import("./kpi.mjs").CiRun>} fields */
    const main = (fields) =>
      ciRun({ event: "push", onMain: true, sha: "m", issue: null, ...fields });
    expect(
      kpis({
        runs: [
          main({
            id: 1,
            conclusion: "failure",
            createdAt: NOW - 200 * MIN,
            completedAt: NOW - 100 * MIN,
          }),
          main({
            id: 2,
            conclusion: "cancelled",
            createdAt: NOW - 90 * MIN,
            completedAt: NOW - 70 * MIN,
          }),
          main({ id: 3, createdAt: NOW - 80 * MIN, completedAt: NOW - 40 * MIN }),
        ],
      }).mainRedMinutes24h,
    ).toBe(60);
    // An older slow run failing after a newer success leaves main green.
    expect(
      kpis({
        runs: [
          main({
            id: 1,
            conclusion: "failure",
            createdAt: NOW - 200 * MIN,
            completedAt: NOW - 10 * MIN,
          }),
          main({ id: 2, createdAt: NOW - 100 * MIN, completedAt: NOW - 50 * MIN }),
        ],
      }).mainRedMinutes24h,
    ).toBe(0);
    // Red since before the window, and still red.
    expect(
      kpis({
        runs: [
          main({ id: 1, conclusion: "failure", createdAt: NOW - 2 * D, completedAt: NOW - 2 * D }),
        ],
      }).mainRedMinutes24h,
    ).toBe(24 * 60);
  });

  it("splits a Done card's cycle between its columns and its CI", () => {
    const t0 = NOW - D;
    /** @type {import("./board-history.mjs").Move[]} */
    const moves = [
      { ts: t0, issue: 1, from: "Backlog", to: "Ready", by: "architect" },
      { ts: t0 + 10 * MIN, issue: 1, from: "Ready", to: "In Progress", by: "developer" },
      { ts: t0 + 70 * MIN, issue: 1, from: "In Progress", to: "In Review", by: "developer" },
      { ts: t0 + 90 * MIN, issue: 1, from: "In Review", to: "QA", by: "lead-dev" },
      { ts: t0 + 110 * MIN, issue: 1, from: "QA", to: "Done", by: "qa-tester" },
    ];
    const runs = [
      ciRun({ id: 1, createdAt: t0 + 30 * MIN, completedAt: t0 + 45 * MIN }),
      ciRun({
        id: 2,
        workflow: "e2e-repeat.yml",
        createdAt: t0 + 35 * MIN,
        completedAt: t0 + 50 * MIN,
      }),
      // No #N title: unattributed.
      ciRun({ id: 3, issue: null, createdAt: t0 + 80 * MIN, completedAt: t0 + 85 * MIN }),
    ];
    const share = kpis({ runs, moves, done7d: 1 }).cycleShare;
    expect(share?.inProgress).toBeCloseTo(0.4);
    expect(share?.ci).toBeCloseTo(0.2);
    expect(share?.review).toBeCloseTo(0.2);
    expect(share?.qa).toBeCloseTo(0.2);
  });

  it("has no share without a Done card, and no runsPerDone without Done", () => {
    const ci = kpis({ runs: [ciRun({})] });
    expect(ci.cycleShare).toBeNull();
    expect(ci.runsPerDone).toBeNull();
  });
});

describe("buildKpis", () => {
  it("writes the snapshot with a failed reader's section null and its error kept", () => {
    const kpis = buildKpis(NOW, {
      flow: () => flowKpis({ now: NOW, ...NO_WAITS, cards: [], moves: [] }),
      claude: () => {
        throw new Error("no logs\nmore");
      },
      github: () => null,
      host: () => {
        throw new Error("systemctl missing");
      },
      staff: () => ({ byRole: {}, maxAgents: 1 }),
      webCache: () => null,
      ci: () => ciKpis({ now: NOW, runs: [], moves: [], done7d: 0, gate: GATE }),
    });
    expect(kpis.schemaVersion).toBe(6);
    expect(kpis.schemaVersion).toBe(KPI_SCHEMA_VERSION);
    expect(kpis.ci).toEqual({
      historySince: null,
      runs24h: 0,
      superseded24h: 0,
      waitMedianMs: null,
      waitP90Ms: null,
      runsPerDone: null,
      mainRedMinutes24h: 0,
      cycleShare: null,
    });
    expect(kpis.at).toBe(NOW);
    expect(kpis.claude).toBeNull();
    expect(kpis.host).toBeNull();
    expect(kpis.flow).not.toBeNull();
    expect(kpis.errors).toEqual({ claude: "no logs", host: "systemctl missing" });
  });

  it("nulls the CI section and keeps its error when its reader throws", () => {
    const kpis = buildKpis(NOW, {
      flow: () => null,
      claude: () => null,
      github: () => null,
      host: () => null,
      staff: () => null,
      webCache: () => null,
      ci: () => {
        throw new Error("no CI history yet");
      },
    });
    expect(kpis.ci).toBeNull();
    expect(kpis.errors).toEqual({ ci: "no CI history yet" });
  });

  it("carries the web cache's stats, and nulls only that section when it cannot be read", () => {
    const stats = {
      entries: 3,
      bytes: 1_200,
      limitBytes: 10 * 2 ** 30,
      hits: 5,
      misses: 1,
      evictions: 0,
      bytesSaved: 2_000,
      hitRate: 5 / 6,
    };
    const readers = {
      flow: () => null,
      claude: () => null,
      github: () => null,
      host: () => null,
      staff: () => null,
      webCache: () => stats,
      ci: () => null,
    };
    expect(buildKpis(NOW, readers).webCache).toEqual(stats);
    const failed = buildKpis(NOW, {
      ...readers,
      webCache: () => {
        throw new Error("EACCES: permission denied, mkdir '.bots/web-cache'");
      },
    });
    expect(failed.webCache).toBeNull();
    expect(failed.errors).toEqual({
      webCache: "EACCES: permission denied, mkdir '.bots/web-cache'",
    });
  });
});
