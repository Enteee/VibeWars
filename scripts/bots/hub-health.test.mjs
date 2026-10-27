import { describe, expect, it } from "vitest";

import {
  MAX_DELAY_MS,
  STALE_MS,
  formatUptime,
  hubHealth,
  nextDelay,
  parseAlive,
  parseRestarts,
} from "./hub-health.mjs";

const NOW = 10_000_000;

/** @type {import("./hub-health.mjs").HubdAlive} */
const ALIVE = {
  pid: 42,
  startedAt: NOW - (2 * 3600 + 14 * 60) * 1000,
  heartbeatAt: NOW - 1000,
  sha: "4319174",
  inflight: 0,
  current: null,
  served: 178,
  refused: 12,
  lastError: null,
};

describe("parseAlive", () => {
  it("reads hubd's heartbeat", () => {
    expect(parseAlive(JSON.stringify(ALIVE))).toEqual(ALIVE);
    const failing = { ...ALIVE, lastError: { at: 5, message: "gh: boom" } };
    expect(parseAlive(JSON.stringify(failing))).toEqual(failing);
    const busy = {
      ...ALIVE,
      inflight: 1,
      current: { employee: "developer@2", command: "gh pr checks", startedAt: NOW - 5000 },
    };
    expect(parseAlive(JSON.stringify(busy))).toEqual(busy);
  });

  it("rejects a heartbeat whose current is missing or malformed (#496)", () => {
    const { current: _, ...missing } = ALIVE;
    expect(parseAlive(JSON.stringify(missing))).toBeNull();
    expect(parseAlive(JSON.stringify({ ...ALIVE, current: "gh" }))).toBeNull();
    expect(parseAlive(JSON.stringify({ ...ALIVE, current: { employee: "x" } }))).toBeNull();
  });

  it("is null for anything else: corrupt, another shape, a field missing", () => {
    expect(parseAlive("")).toBeNull();
    expect(parseAlive("{ not json")).toBeNull();
    expect(parseAlive(JSON.stringify({ ts: NOW, inFlight: 0 }))).toBeNull();
    const { served: _, ...missing } = ALIVE;
    expect(parseAlive(JSON.stringify(missing))).toBeNull();
    expect(parseAlive(JSON.stringify({ ...ALIVE, lastError: "boom" }))).toBeNull();
  });
});

describe("parseRestarts", () => {
  it("reads exit times, and nothing from a broken file", () => {
    expect(parseRestarts("[1, 2, 3]")).toEqual([1, 2, 3]);
    expect(parseRestarts("garbage")).toEqual([]);
    expect(parseRestarts('{"a": 1}')).toEqual([]);
  });
});

describe("nextDelay", () => {
  /** @param {number[]} uptimesS */
  function runs(uptimesS) {
    let at = NOW - 3_600_000;
    return uptimesS.map((uptime) => {
      const run = { startedAt: at, exitedAt: at + uptime * 1000 };
      at = run.exitedAt + 1;
      return run;
    });
  }

  it("backs off 1, 2, 4 … 60 s while runs stay short", () => {
    const delays = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(
      (n) => nextDelay(runs(Array.from({ length: n }, () => 1)), NOW).delayMs,
    );
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
    expect(Math.max(...delays)).toBe(MAX_DELAY_MS);
  });

  it("starts again from 1 s after a run of five minutes", () => {
    expect(nextDelay(runs([1, 1, 1, 300]), NOW).delayMs).toBe(1000);
    expect(nextDelay(runs([1, 1, 1, 300, 1, 1]), NOW).delayMs).toBe(2000);
  });

  it("calls five exits in five minutes a crash loop, and four not", () => {
    /** @param {number} count */
    const recent = (count) =>
      Array.from({ length: count }, (_, i) => ({
        startedAt: NOW - 60_000 + i,
        exitedAt: NOW - 1000 + i,
      }));
    expect(nextDelay(recent(5), NOW).crashLooping).toBe(true);
    expect(nextDelay(recent(4), NOW).crashLooping).toBe(false);
    expect(nextDelay(runs([1, 1, 1, 1, 1]), NOW).crashLooping).toBe(false);
  });
});

describe("hubHealth", () => {
  it("is up, with uptime, restarts, requests and the last error", () => {
    expect(hubHealth(ALIVE, [NOW - 7_200_000, NOW - 1_800_000], NOW)).toEqual({
      state: "up",
      line: "hub ● up 2h14m · restarts 1/h · req 178 ok / 12 refused · last error: —",
    });
    const failing = { ...ALIVE, lastError: { at: NOW, message: "gh:\nboom" } };
    expect(hubHealth(failing, [], NOW).line).toContain("last error: gh:⏎boom");
  });

  it("is down with no heartbeat, a missing or corrupt file alike", () => {
    expect(hubHealth(parseAlive("{ corrupt"), [], NOW)).toEqual({
      state: "down",
      line: "hub ● down · restarts 0/h",
    });
  });

  it("is stale when the heartbeat is older than three intervals", () => {
    const old = { ...ALIVE, heartbeatAt: NOW - 40_000 };
    expect(STALE_MS).toBeLessThan(40_000);
    expect(hubHealth(old, [], NOW)).toEqual({
      state: "stale",
      line: "hub ● stale (no heartbeat 40 s) · restarts 0/h",
    });
  });

  it("is crash-looping when the runner keeps restarting it, heartbeat or not", () => {
    const exits = [5, 4, 3, 2, 1].map((s) => NOW - s * 1000);
    expect(hubHealth(ALIVE, exits, NOW).state).toBe("crash-looping");
    expect(hubHealth(null, exits, NOW).line).toBe("hub ● crash-looping · restarts 5/h");
  });
});

describe("formatUptime", () => {
  it("reads seconds, minutes, then hours and minutes", () => {
    expect(formatUptime(40_000)).toBe("40s");
    expect(formatUptime(3 * 60_000)).toBe("3m");
    expect(formatUptime((2 * 3600 + 4 * 60) * 1000)).toBe("2h04m");
  });
});
