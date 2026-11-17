import { describe, expect, it } from "vitest";

import { HeavyLeases, TTL_MS, SHORT_KILL_MS, SHORT_RUN_MAX } from "./heavy-lease.mjs";

describe("HeavyLeases", () => {
  it("grants the first asker and queues the second", () => {
    const leases = new HeavyLeases();
    expect(leases.acquire("a", "bench", false, 0).granted).toBe(true);
    const second = leases.acquire("b", "pw", false, 1000);
    expect(second).toMatchObject({ granted: false, ahead: 1 });
  });

  it("grants the queue head on release, first in first out", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", false, 0);
    leases.acquire("b", "x", false, 1);
    leases.acquire("c", "x", false, 2);
    if (!first.granted) throw new Error("not granted");
    expect(leases.release("a", first.leaseId, 3)).toBe(true);
    expect(leases.acquire("c", "x", false, 4).granted).toBe(false);
    expect(leases.acquire("b", "x", false, 5).granted).toBe(true);
  });

  it("frees a holder that stops renewing", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", false, 0);
    leases.acquire("b", "x", false, 1);
    expect(leases.acquire("b", "x", TTL_MS - 1).granted).toBe(false);
    expect(leases.acquire("b", "x", false, TTL_MS + 1).granted).toBe(true);
  });

  it("keeps a holder that renews", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", false, 0);
    if (!first.granted) throw new Error("not granted");
    expect(leases.renew("a", first.leaseId, 60_000)).toBe(true);
    expect(leases.acquire("b", "x", 100_000).granted).toBe(false);
  });

  it("drops a queue entry that stops polling", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", false, 0);
    leases.acquire("b", "x", false, 1);
    leases.acquire("c", "x", false, 2);
    leases.acquire("c", "x", false, TTL_MS - 1);
    expect(leases.status(TTL_MS + 5).queue).toEqual(["c x"]);
  });

  it("gives an employee one queue entry", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", false, 0);
    leases.acquire("b", "x", false, 1);
    leases.acquire("b", "x", false, 2);
    expect(leases.status(3).queue).toHaveLength(1);
  });

  it("refuses to renew or release another employee's lease", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", false, 0);
    if (!first.granted) throw new Error("not granted");
    expect(leases.renew("b", first.leaseId, 1)).toBe(false);
    expect(leases.release("b", first.leaseId, 1)).toBe(false);
    expect(leases.release("a", first.leaseId, 1)).toBe(true);
    expect(leases.renew("a", first.leaseId, 2)).toBe(false);
  });
});

describe("short jobs (#3582)", () => {
  /** Frees the slot and grants whoever is next, by asking for each in turn. */
  function drain(/** @type {HeavyLeases} */ leases, /** @type {[string, boolean][]} */ asking) {
    /** @type {string[]} */
    const order = [];
    let now = 1000;
    for (let guard = 0; guard < 20 && order.length < asking.length; guard += 1) {
      for (const [name, short] of asking) {
        if (order.includes(name)) continue;
        const got = leases.acquire(name, name, short, now);
        if (got.granted) {
          order.push(name);
          leases.release(name, got.leaseId, now);
        }
      }
      now += 1;
    }
    return order;
  }

  it("grants a short job ahead of an earlier long one", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("h", "x", false, 0);
    expect(first.granted).toBe(true);
    leases.acquire("L", "x", false, 1);
    const s = leases.acquire("S", "x", true, 2);
    expect(s).toMatchObject({ granted: false, ahead: 1 });
    expect(leases.acquire("L", "x", false, 3)).toMatchObject({ granted: false, ahead: 2 });
    if (first.granted) leases.release("h", first.leaseId, 4);
    expect(leases.acquire("L", "x", false, 5).granted).toBe(false);
    expect(leases.acquire("S", "x", true, 5).granted).toBe(true);
  });

  it("grants at most SHORT_RUN_MAX shorts in a row while a long one waits", () => {
    const leases = new HeavyLeases();
    const holder = leases.acquire("h", "x", false, 0);
    leases.acquire("L", "x", false, 1);
    for (const name of ["S1", "S2", "S3", "S4"]) leases.acquire(name, "x", true, 2);
    if (holder.granted) leases.release("h", holder.leaseId, 3);
    expect(SHORT_RUN_MAX).toBe(3);
    expect(
      drain(leases, [
        ["L", false],
        ["S1", true],
        ["S2", true],
        ["S3", true],
        ["S4", true],
      ]),
    ).toEqual(["S1", "S2", "S3", "L", "S4"]);
  });

  it("goes first in first out among shorts when no long job waits", () => {
    const leases = new HeavyLeases();
    expect(
      drain(new HeavyLeases(), [
        ["a", true],
        ["b", true],
        ["c", true],
        ["d", true],
      ]),
    ).toEqual(["a", "b", "c", "d"]);
    expect(leases.shortRun).toBe(0);
  });

  it("resets the run after a long grant", () => {
    const leases = new HeavyLeases();
    const holder = leases.acquire("h", "x", false, 0);
    leases.acquire("L", "x", false, 1);
    leases.acquire("S1", "x", true, 1);
    if (holder.granted) leases.release("h", holder.leaseId, 2);
    const s1 = leases.acquire("S1", "x", true, 3);
    expect(leases.shortRun).toBe(1);
    if (s1.granted) leases.release("S1", s1.leaseId, 4);
    expect(leases.acquire("L", "x", false, 5).granted).toBe(true);
    expect(leases.shortRun).toBe(0);
  });

  it("keeps a queue place when the flag changes on refresh", () => {
    const leases = new HeavyLeases();
    leases.acquire("h", "x", false, 0);
    leases.acquire("a", "x", false, 1);
    leases.acquire("b", "x", false, 2);
    leases.acquire("a", "x", true, 3);
    expect(leases.queue.map((entry) => [entry.employee, entry.short])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("marks short entries in the status", () => {
    const leases = new HeavyLeases();
    leases.acquire("h", "x", false, 0);
    leases.acquire("a", "shot", true, 1);
    expect(leases.status(2).queue).toEqual(["a [short] shot"]);
  });

  it("refuses to renew a short lease past the kill time and a grace", () => {
    const leases = new HeavyLeases();
    const got = leases.acquire("a", "x", true, 0);
    if (!got.granted) throw new Error("expected a grant");
    // Renewed every minute, as a live client does, up to the backstop.
    for (let t = 60_000; t <= SHORT_KILL_MS + TTL_MS; t += 60_000) {
      expect(leases.renew("a", got.leaseId, t), String(t)).toBe(true);
    }
    expect(leases.renew("a", got.leaseId, SHORT_KILL_MS + TTL_MS + 30_000)).toBe(false);
  });
});
