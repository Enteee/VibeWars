/**
 * The best CONTEXT_CEILING per role from the session logs (#833): P, R
 * and g from a session, C* from the model, short sessions and subagents
 * kept out of what they would skew.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CACHE_READ_WEIGHT,
  CURRENT_CEILING,
  MAX_CEILING,
  MIN_HEADROOM,
  ORIENTATION_REPLIES,
  bestCeiling,
  costOf,
  formatReport,
  modelCost,
  parseSince,
  roleReport,
  sessionStats,
  sessionsByRole,
} from "./context-report.mjs";

/** @typedef {import("./claude-usage.mjs").LoggedReply} LoggedReply */

const T0 = Date.parse("2026-10-27T00:00:00Z");

/**
 * A reply whose context is `context`, all of it read from the cache.
 *
 * @param {number} i
 * @param {number} context
 * @param {{ sidechain?: boolean, output?: number, role?: string, session?: string }} [fields]
 * @returns {LoggedReply}
 */
function reply(
  i,
  context,
  { sidechain = false, output = 100, role = "developer", session = "developer/p/s" } = {},
) {
  return {
    id: `${role}/${session}/${sidechain ? "sub" : "main"}${String(i)}`,
    ts: T0 + i * 1000,
    model: "claude-opus-5-5",
    input: 0,
    output,
    cacheWrite: 0,
    cacheRead: context,
    sidechain,
    role,
    session,
  };
}

/**
 * A session of `n` main replies: orientation at 10k, then 40k growing by
 * 1k a reply.
 *
 * @param {number} n
 * @param {{ role?: string, session?: string }} [fields]
 * @returns {LoggedReply[]}
 */
function session(n, fields = {}) {
  return Array.from({ length: n }, (_, i) =>
    reply(i, i < ORIENTATION_REPLIES ? 10_000 : 40_000 + (i - ORIENTATION_REPLIES) * 1000, fields),
  );
}

describe("sessionStats", () => {
  it("reads P, R and g from a session", () => {
    const stats = sessionStats(session(20));
    const orientCost = ORIENTATION_REPLIES * costOf(reply(0, 10_000));
    expect(stats).toEqual({ P: 40_000, R: orientCost, g: 1000 });
  });

  it("counts a subagent's cost in R, never in P or g", () => {
    const orienting = reply(3, 90_000, { sidechain: true });
    const working = reply(12, 150_000, { sidechain: true });
    const stats = sessionStats([orienting, working, ...session(20)]);
    expect(stats?.P).toBe(40_000);
    expect(stats?.g).toBe(1000);
    expect(stats?.R).toBe(ORIENTATION_REPLIES * costOf(reply(0, 10_000)) + costOf(orienting));
  });

  it("is null for a session too short to measure its growth", () => {
    expect(sessionStats(session(ORIENTATION_REPLIES + 4))).toBeNull();
    expect(sessionStats(session(ORIENTATION_REPLIES + 5))).not.toBeNull();
  });
});

describe("bestCeiling and modelCost", () => {
  const model = { P: 40_000, R: 400_000, g: 1000, w: 0.1 };

  it("is P + sqrt(2Rg / w)", () => {
    expect(bestCeiling(model)).toBeCloseTo(40_000 + Math.sqrt(8e9), 0);
    expect(Math.round(bestCeiling(model) / 1000)).toBe(129);
  });

  it("is the cheapest ceiling in the model", () => {
    const best = bestCeiling(model);
    for (const other of [best - 10_000, best + 10_000, CURRENT_CEILING]) {
      expect(modelCost(model, best)).toBeLessThan(modelCost(model, other));
    }
  });

  it("stays MIN_HEADROOM above P, and under MAX_CEILING", () => {
    expect(bestCeiling({ ...model, R: 1 })).toBe(40_000 + MIN_HEADROOM);
    expect(bestCeiling({ ...model, g: -50 })).toBe(40_000 + MIN_HEADROOM);
    expect(bestCeiling({ ...model, R: 1e9 })).toBe(MAX_CEILING);
    expect(bestCeiling({ ...model, P: 190_000 })).toBe(MAX_CEILING);
  });

  it("costs without end when the ceiling leaves no room past orientation", () => {
    expect(modelCost(model, 40_000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("sessionsByRole and roleReport", () => {
  it("groups by session, a role's employees together, and leaves out sessions begun before since", () => {
    const records = [
      ...session(20, { session: "developer/p/a" }),
      ...session(20, { session: "developer@2/p/a" }),
      ...session(20, { role: "qa-tester", session: "qa-tester/p/b" }),
    ];
    const early = session(20, { session: "developer/p/old" }).map((r) => ({
      ...r,
      ts: r.ts - 10_000,
    }));
    const roles = sessionsByRole([...records, ...early, ...records], T0);
    expect(roles.get("developer")).toHaveLength(2);
    expect(roles.get("qa-tester")).toHaveLength(1);
  });

  it("counts short sessions but leaves them out of the model", () => {
    const report = roleReport([session(20), session(5, { session: "developer/p/short" })]);
    expect(report).toMatchObject({ sessions: 2, short: 1, callsPerSession: 12.5 });
    expect(report.model).toMatchObject({ P: 40_000, g: 1000, w: CACHE_READ_WEIGHT });
  });

  it("has no model with only short sessions", () => {
    expect(roleReport([session(5)]).model).toBeNull();
  });
});

describe("formatReport", () => {
  it("prints a row per role, says no sessions, and how many were left out", () => {
    const lines = formatReport(
      new Map([["developer", [session(20), session(5, { session: "developer/p/short" })]]]),
      ["developer", "qa-tester"],
    );
    expect(lines[1]).toMatch(/^developer\s+2\s+1\s+13\s+40\.0k\s+1\.0k\s+\S+\s+\S+\s+100% → \d+%$/);
    expect(lines[2]).toMatch(/^qa-tester\s+no sessions$/);
    expect(lines[3]).toMatch(/^all\s+2\s+1\s/);
    expect(lines).toContain("1 sessions under 13 replies left out of P, g and R.");
  });
});

describe("parseSince", () => {
  it("reads minutes, hours and days, nothing else", () => {
    expect(parseSince("90m")).toBe(90 * 60_000);
    expect(parseSince("48h")).toBe(48 * 3_600_000);
    expect(parseSince("7d")).toBe(7 * 86_400_000);
    expect(parseSince("48")).toBeNull();
    expect(parseSince("-1h")).toBeNull();
  });
});

describe("CURRENT_CEILING", () => {
  it("is agent-turn's CONTEXT_CEILING", () => {
    const source = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "agent-turn.mjs"),
      "utf8",
    );
    const match = /const CONTEXT_CEILING = ([\d_]+);/.exec(source);
    expect(Number(match?.[1]?.replaceAll("_", ""))).toBe(CURRENT_CEILING);
  });
});
