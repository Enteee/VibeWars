import { describe, expect, it } from "vitest";

import { MESSAGE_BURST, MESSAGES_PER_SECOND, MessageBudget } from "./intent-budget.js";

interface Report {
  readonly sessionId: string;
  readonly dropped: number;
}

function budget(reports: Report[] = []): MessageBudget {
  return new MessageBudget(MESSAGES_PER_SECOND, MESSAGE_BURST, (sessionId, dropped) => {
    reports.push({ sessionId, dropped });
  });
}

function takeMany(of: MessageBudget, count: number, nowMs: number, sessionId = "a"): number {
  let taken = 0;
  for (let i = 0; i < count; i += 1) {
    if (of.take(sessionId, nowMs)) {
      taken += 1;
    }
  }
  return taken;
}

describe("MessageBudget", () => {
  it("accepts a burst of 300 at once, and drops the 301st", () => {
    const of = budget();
    expect(takeMany(of, 300, 0)).toBe(300);
    expect(of.take("a", 0)).toBe(false);
  });

  it("never drops a client sending 60 a second, however long", () => {
    const of = budget();
    let taken = 0;
    for (let i = 0; i < 60 * 60; i += 1) {
      taken += of.take("a", (i * 1000) / 60) ? 1 : 0;
    }
    expect(taken).toBe(60 * 60);
  });

  it("refills at the sustained rate, never past the burst", () => {
    const of = budget();
    takeMany(of, 300, 0);
    expect(takeMany(of, 100, 1000)).toBe(60);
    expect(takeMany(of, 400, 60_000)).toBe(300);
  });

  it("keeps one client's budget apart from another's", () => {
    const of = budget();
    takeMany(of, 300, 0);
    expect(of.take("b", 0)).toBe(true);
  });

  it("starts a forgotten client afresh", () => {
    const of = budget();
    takeMany(of, 300, 0);
    of.forget("a");
    expect(takeMany(of, 300, 0)).toBe(300);
  });

  it("forgets the buckets that have refilled, reporting their drops first", () => {
    const reports: Report[] = [];
    const of = budget(reports);
    takeMany(of, 302, 0, "a");
    takeMany(of, 1, 4000, "b");
    // `b` refilled its one in 1/60 s; `a` needs 5 s for its 300.
    of.forgetRefilled(4900);
    expect(of.size).toBe(1);
    of.forgetRefilled(5000);
    expect(of.size).toBe(0);
    expect(reports).toEqual([
      { sessionId: "a", dropped: 1 },
      { sessionId: "a", dropped: 1 },
    ]);
  });

  it("does not refill when the clock steps back", () => {
    const of = budget();
    takeMany(of, 300, 5000);
    expect(of.take("a", 4000)).toBe(false);
  });

  it("reports drops once a second at most, with how many", () => {
    const reports: Report[] = [];
    const of = budget(reports);
    takeMany(of, 300 + 500, 0);
    // The first drop is reported at once; the rest wait for the next second.
    expect(reports).toEqual([{ sessionId: "a", dropped: 1 }]);

    // 1 s later: 60 refilled and spent, then one more dropped and reported
    // with the 499 that waited.
    takeMany(of, 61, 1000);
    expect(reports).toEqual([
      { sessionId: "a", dropped: 1 },
      { sessionId: "a", dropped: 500 },
    ]);
  });
});
