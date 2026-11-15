import { describe, expect, it } from "vitest";

import { HeavyLeases, TTL_MS } from "./heavy-lease.mjs";

describe("HeavyLeases", () => {
  it("grants the first asker and queues the second", () => {
    const leases = new HeavyLeases();
    expect(leases.acquire("a", "bench", 0).granted).toBe(true);
    const second = leases.acquire("b", "pw", 1000);
    expect(second).toMatchObject({ granted: false, ahead: 1 });
  });

  it("grants the queue head on release, first in first out", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", 0);
    leases.acquire("b", "x", 1);
    leases.acquire("c", "x", 2);
    if (!first.granted) throw new Error("not granted");
    expect(leases.release("a", first.leaseId, 3)).toBe(true);
    expect(leases.acquire("c", "x", 4).granted).toBe(false);
    expect(leases.acquire("b", "x", 5).granted).toBe(true);
  });

  it("frees a holder that stops renewing", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", 0);
    leases.acquire("b", "x", 1);
    expect(leases.acquire("b", "x", TTL_MS - 1).granted).toBe(false);
    expect(leases.acquire("b", "x", TTL_MS + 1).granted).toBe(true);
  });

  it("keeps a holder that renews", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", 0);
    if (!first.granted) throw new Error("not granted");
    expect(leases.renew("a", first.leaseId, 60_000)).toBe(true);
    expect(leases.acquire("b", "x", 100_000).granted).toBe(false);
  });

  it("drops a queue entry that stops polling", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", 0);
    leases.acquire("b", "x", 1);
    leases.acquire("c", "x", 2);
    leases.acquire("c", "x", TTL_MS - 1);
    expect(leases.status(TTL_MS + 5).queue).toEqual(["c x"]);
  });

  it("gives an employee one queue entry", () => {
    const leases = new HeavyLeases();
    leases.acquire("a", "x", 0);
    leases.acquire("b", "x", 1);
    leases.acquire("b", "x", 2);
    expect(leases.status(3).queue).toHaveLength(1);
  });

  it("refuses to renew or release another employee's lease", () => {
    const leases = new HeavyLeases();
    const first = leases.acquire("a", "x", 0);
    if (!first.granted) throw new Error("not granted");
    expect(leases.renew("b", first.leaseId, 1)).toBe(false);
    expect(leases.release("b", first.leaseId, 1)).toBe(false);
    expect(leases.release("a", first.leaseId, 1)).toBe(true);
    expect(leases.renew("a", first.leaseId, 2)).toBe(false);
  });
});
