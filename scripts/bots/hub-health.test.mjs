/**
 * The hub window's decisions: how healthy the hub is, and how long the
 * runner waits before restarting something that died (issue #23).
 */
import { describe, expect, it } from "vitest";

import {
  CRASH_EXITS,
  HEALTHY_RUN_MS,
  MAX_DELAY_MS,
  STALE_MS,
  hubHealth,
  nextDelay,
  parseAlive,
  parseExits,
  recentExits,
} from "./hub-health.mjs";

const NOW = 10_000_000_000;

/** @param {Partial<import("./hub-health.mjs").Alive>} [over] */
function alive(over = {}) {
  return {
    pid: 123,
    startedAt: NOW - (2 * 3600 + 14 * 60) * 1000,
    heartbeatAt: NOW - 1000,
    sha: "4319174",
    inflight: 0,
    served: 178,
    refused: 12,
    lastError: null,
    rateLimit: { graphqlRemaining: 3120, graphqlLimit: 5000, graphqlResetAt: NOW + 600_000 },
    ...over,
  };
}

/**
 * @param {number} ago how long ago it exited, ms
 * @param {number} ran how long it had run, ms
 * @returns {import("./hub-health.mjs").Exit}
 */
const exit = (ago, ran) => ({ startedAt: NOW - ago - ran, exitedAt: NOW - ago, code: 1 });

describe("parseAlive", () => {
  it("reads the heartbeat", () => {
    expect(parseAlive(JSON.stringify(alive()))).toEqual(alive());
  });

  it("accepts a heartbeat from before hubd has asked GitHub", () => {
    expect(parseAlive(JSON.stringify(alive({ rateLimit: null })))?.rateLimit).toBeNull();
  });

  it.each([
    ["no file", null],
    ["a bare timestamp, the old format", "1767225600000\n"],
    ["corrupt JSON", "{"],
    ["a missing field", JSON.stringify({ ...alive(), served: undefined })],
    ["a malformed rate limit", JSON.stringify(alive({ rateLimit: /** @type {never} */ ({}) }))],
  ])("refuses %s", (_, text) => {
    expect(parseAlive(text)).toBeNull();
  });
});

describe("hubHealth", () => {
  it("is up, with every number on one line", () => {
    const health = hubHealth(alive(), [], NOW);
    expect(health.state).toBe("up");
    expect(health.line).toMatch(
      /^hub ● up 2h14m · restarts 0\/h · req 178 ok \/ 12 refused · gh graphql 3120\/5000 \(resets \d\d:\d\d\) · last error: —$/,
    );
  });

  it("is stale once the heartbeat stops being written", () => {
    const health = hubHealth(alive({ heartbeatAt: NOW - 40_000 }), [], NOW);
    expect(health.state).toBe("stale");
    expect(health.line).toMatch(/^hub ● stale \(no heartbeat 40 s\)/);
  });

  it("is still up just inside the staleness window", () => {
    expect(hubHealth(alive({ heartbeatAt: NOW - STALE_MS }), [], NOW).state).toBe("up");
  });

  it("is down with no heartbeat at all, missing or corrupt", () => {
    expect(hubHealth(null, [], NOW)).toEqual({ state: "down", line: "hub ● down · restarts 0/h" });
    expect(hubHealth(parseAlive("{"), [], NOW).state).toBe("down");
  });

  it("is crash-looping, whatever the heartbeat says, and counts restarts", () => {
    const exits = Array.from({ length: CRASH_EXITS }, (_, i) => exit(i * 10_000, 2000));
    expect(hubHealth(alive(), exits, NOW)).toEqual({
      state: "crash-looping",
      line: `hub ● crash-looping · restarts ${String(CRASH_EXITS)}/h`,
    });
  });

  it("shows the last error and an unknown budget", () => {
    const line = hubHealth(alive({ lastError: "gh: boom", rateLimit: null }), [], NOW).line;
    expect(line).toContain("gh graphql unknown");
    expect(line).toContain("last error: gh: boom");
  });
});

describe("nextDelay", () => {
  it("backs off 1, 2, 4 … seconds, up to a minute", () => {
    /** @type {import("./hub-health.mjs").Exit[]} */
    const history = [];
    const delays = [];
    for (let i = 0; i < 9; i += 1) {
      // Spread out, so this is backoff alone, not a crash loop.
      history.unshift(exit((i + 1) * 120_000, 1000));
      delays.push(nextDelay(history, NOW).delayMs);
    }
    expect(delays.slice(0, 3)).toEqual([1000, 2000, 4000]);
    expect(Math.max(...delays)).toBe(MAX_DELAY_MS);
  });

  it("starts over after a run of five minutes", () => {
    const history = [exit(900_000, 1000), exit(800_000, 1000), exit(10_000, HEALTHY_RUN_MS)];
    expect(nextDelay(history, NOW)).toEqual({ delayMs: 1000, crashLooping: false });
  });

  it("calls five exits in five minutes a crash loop, and waits the full minute", () => {
    const history = Array.from({ length: CRASH_EXITS }, (_, i) =>
      exit((CRASH_EXITS - i) * 20_000, 500),
    );
    expect(nextDelay(history, NOW)).toEqual({ delayMs: MAX_DELAY_MS, crashLooping: true });
    expect(nextDelay(history.slice(1), NOW).crashLooping).toBe(false);
  });
});

describe("the restart history", () => {
  it("keeps the last hour and survives a corrupt file", () => {
    const history = [exit(2 * 3600_000, 1000), exit(60_000, 1000)];
    expect(recentExits(history, NOW)).toEqual([exit(60_000, 1000)]);
    expect(parseExits(JSON.stringify(history))).toEqual(history);
    expect(parseExits("nonsense")).toEqual([]);
    expect(parseExits(null)).toEqual([]);
  });
});
