import { describe, expect, it } from "vitest";

import {
  KPI_SCHEMA_VERSION,
  addSevenDaySample,
  buildKpis,
  cpuShare,
  employeeOfUnit,
  flowKpis,
  median,
  p90,
  parseUnits,
  projectSevenDay,
  staffKpis,
  tokensByRole,
} from "./kpi.mjs";

const NOW = 1_800_000_000_000;
const H = 3_600_000;
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

describe("flowKpis", () => {
  it("counts Done in 24 h and 7 d, with the window edges excluded at the far end", () => {
    const flow = flowKpis({
      now: NOW,
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
    const flow = flowKpis({ now: NOW, cards: [], moves: [move(1, "QA", "Done", H)] });
    expect(flow.done7d).toBe(1);
    expect(flow.cycleMedianMs).toBeNull();
    expect(flow.cycleP90Ms).toBeNull();
    expect(flow.reviewWaitMedianMs).toBeNull();
    expect(flow.historySince).toBe(NOW - H);
  });

  it("waits in review and QA from arrival to leaving", () => {
    const flow = flowKpis({
      now: NOW,
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
    expect(flowKpis({ now: NOW, cards: [], moves: [] }).topBounced).toEqual([]);
  });

  it("counts cards per column and ages the oldest Blocked from its last arrival", () => {
    const flow = flowKpis({
      now: NOW,
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
    const flow = flowKpis({ now: NOW, cards: [], moves: [] });
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
    expect(staffKpis(staff, new Set(["dev@1"]), 9)).toEqual({
      byRole: { dev: { employed: 2, live: 1 } },
      maxAgents: 9,
    });
  });
});

describe("projectSevenDay (#1313)", () => {
  const M = 60_000;
  const S = NOW / 1000;
  const RESETS = S + 2 * 24 * 3600;
  /**
   * @param {number} agoMs
   * @param {number} utilization
   * @param {number} [resetsAt]
   */
  function sample(agoMs, utilization, resetsAt = RESETS) {
    return { at: NOW - agoMs, utilization, resetsAt };
  }

  it("runs the last 2 h's burn on to 100%", () => {
    // 0.10 an hour from 0.50: 100% in another 5 h.
    expect(projectSevenDay([sample(H, 0.4), sample(30 * M, 0.45), sample(0, 0.5)], NOW)).toBe(
      S + 5 * 3600,
    );
  });

  it("is null for a flat or falling burn", () => {
    expect(projectSevenDay([sample(H, 0.5), sample(0, 0.5)], NOW)).toBeNull();
    expect(projectSevenDay([sample(H, 0.6), sample(0, 0.5)], NOW)).toBeNull();
  });

  it("is null for fewer than 2 samples or a span under 30 min", () => {
    expect(projectSevenDay([], NOW)).toBeNull();
    expect(projectSevenDay([sample(0, 0.5)], NOW)).toBeNull();
    expect(projectSevenDay([sample(29 * M, 0.4), sample(0, 0.5)], NOW)).toBeNull();
  });

  it("is null when the window resets first", () => {
    expect(projectSevenDay([sample(H, 0.4), sample(0, 0.5)], NOW)).not.toBeNull();
    expect(projectSevenDay([sample(H, 0.4), sample(0, 0.5, S + 3600)], NOW)).toBeNull();
    expect(
      projectSevenDay([sample(H, 0.4, S + 5 * 3600), sample(0, 0.5, S + 5 * 3600)], NOW),
    ).toBeNull();
  });

  it("reads only the current window's samples after a roll-over", () => {
    const old = RESETS - 7 * 24 * 3600;
    expect(
      projectSevenDay([sample(H, 0.9, old), sample(10 * M, 0.01), sample(0, 0.02)], NOW),
    ).toBeNull();
    expect(projectSevenDay([sample(2 * H, 0.9, old), sample(H, 0.0), sample(0, 0.1)], NOW)).toBe(
      S + 9 * 3600,
    );
  });

  it("is the newest sample's time at or over 100%", () => {
    expect(projectSevenDay([sample(10 * M, 1)], NOW)).toBe(S - 600);
    expect(projectSevenDay([sample(H, 0.9), sample(0, 1.02)], NOW)).toBe(S);
  });

  it("ignores samples older than 2 h", () => {
    expect(projectSevenDay([sample(3 * H, 0), sample(H, 0.4), sample(0, 0.5)], NOW)).toBe(
      S + 5 * 3600,
    );
    expect(projectSevenDay([sample(3 * H, 0.4), sample(10 * M, 0.5)], NOW)).toBeNull();
  });
});

describe("addSevenDaySample (#1313)", () => {
  const seven = { utilization: 0.01, resetsAt: NOW / 1000 + 24 * 3600 };

  it("stamps a sample with its reading's time, not the write's", () => {
    expect(addSevenDaySample([], { at: NOW - H, sevenDay: seven }, NOW)).toEqual([
      { at: NOW - H, ...seven },
    ]);
  });

  it("adds a reading it already holds only once", () => {
    const once = addSevenDaySample([], { at: NOW - H, sevenDay: seven }, NOW - H);
    expect(addSevenDaySample(once, { at: NOW - H, sevenDay: seven }, NOW)).toEqual(once);
  });

  it("drops samples older than 2 h, and adds nothing without a 7-day reading", () => {
    const old = [{ at: NOW - 3 * H, ...seven }];
    expect(addSevenDaySample(old, null, NOW)).toEqual([]);
    expect(addSevenDaySample(old, { at: NOW, sevenDay: null }, NOW)).toEqual([]);
  });
});

describe("buildKpis", () => {
  it("writes the snapshot with a failed reader's section null and its error kept", () => {
    const kpis = buildKpis(NOW, {
      flow: () => flowKpis({ now: NOW, cards: [], moves: [] }),
      claude: () => {
        throw new Error("no logs\nmore");
      },
      github: () => null,
      host: () => {
        throw new Error("systemctl missing");
      },
      staff: () => ({ byRole: {}, maxAgents: 1 }),
    });
    expect(kpis.schemaVersion).toBe(KPI_SCHEMA_VERSION);
    expect(kpis.at).toBe(NOW);
    expect(kpis.claude).toBeNull();
    expect(kpis.host).toBeNull();
    expect(kpis.flow).not.toBeNull();
    expect(kpis.errors).toEqual({ claude: "no logs", host: "systemctl missing" });
  });
});
