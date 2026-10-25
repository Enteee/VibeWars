import {
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  CLIENT_LIMIT,
  SERVER_FULL_MESSAGE,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  ClientSeat,
  RoomSeats,
  createAddressCounts,
  createClientBudget,
  createClientLimits,
  peerAddress,
} from "./client-budget.js";

function refusal(take: () => void): Error & { code?: unknown } {
  try {
    take();
  } catch (error: unknown) {
    return error as Error & { code?: unknown };
  }
  throw new Error("expected a refusal");
}

describe("createClientBudget (#265)", () => {
  it("lends seats up to its max, refuses at it, and frees one per release", () => {
    const budget = createClientBudget(2);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(false);
    budget.release();
    expect(budget.inUse).toBe(1);
    expect(budget.tryAcquire()).toBe(true);
  });
});

describe("createAddressCounts (#265)", () => {
  it("counts each address on its own, up to its max", () => {
    const counts = createAddressCounts(2);
    expect(counts.tryAcquire("10.0.0.1")).toBe(true);
    expect(counts.tryAcquire("10.0.0.1")).toBe(true);
    expect(counts.tryAcquire("10.0.0.1")).toBe(false);
    expect(counts.tryAcquire("10.0.0.2")).toBe(true);
    expect(counts.count("10.0.0.1")).toBe(2);
  });

  it("frees one per release, and forgets an address at none", () => {
    const counts = createAddressCounts(2);
    counts.tryAcquire("10.0.0.1");
    counts.tryAcquire("10.0.0.1");
    counts.release("10.0.0.1");
    expect(counts.count("10.0.0.1")).toBe(1);
    expect(counts.size).toBe(1);
    counts.release("10.0.0.1");
    expect(counts.size).toBe(0);
    counts.release("10.0.0.1");
    expect(counts.count("10.0.0.1")).toBe(0);
  });
});

describe("ClientSeat (#265)", () => {
  it("refuses a full server with CLIENT_LIMIT and the full-server message", () => {
    const limits = createClientLimits(1, 5);
    new ClientSeat(limits).take("10.0.0.1");
    const refused = refusal(() => {
      new ClientSeat(limits).take("10.0.0.2");
    });
    expect(refused.code).toBe(CLIENT_LIMIT);
    expect(refused.message).toBe(SERVER_FULL_MESSAGE);
    expect(limits.addresses.count("10.0.0.2")).toBe(0);
  });

  it("refuses an address over its share with ADDRESS_LIMIT, holding nothing for it", () => {
    const limits = createClientLimits(5, 1);
    new ClientSeat(limits).take("10.0.0.1");
    const refused = refusal(() => {
      new ClientSeat(limits).take("10.0.0.1");
    });
    expect(refused.code).toBe(ADDRESS_LIMIT);
    expect(refused.message).toBe(ADDRESS_LIMIT_MESSAGE);
    expect(limits.clients.inUse).toBe(1);
  });

  it("gives its seat back once, however often it is released", () => {
    const limits = createClientLimits(5, 5);
    const seat = new ClientSeat(limits);
    new ClientSeat(limits).take("10.0.0.1");
    seat.take("10.0.0.1");
    seat.release();
    seat.release();
    expect(limits.clients.inUse).toBe(1);
    expect(limits.addresses.count("10.0.0.1")).toBe(1);
  });
});

describe("RoomSeats (#265)", () => {
  it("releases a session's seat once, and every seat when the room goes", () => {
    const limits = createClientLimits(5, 5);
    const seats = new RoomSeats(limits);
    seats.take("a", "10.0.0.1");
    seats.take("b", "10.0.0.1");
    seats.take("c", "10.0.0.2");
    seats.release("a");
    seats.release("a");
    expect(limits.clients.inUse).toBe(2);
    seats.releaseAll();
    expect(limits.clients.inUse).toBe(0);
    expect(limits.addresses.size).toBe(0);
  });
});

describe("peerAddress (#265)", () => {
  it("counts an IPv4 peer the same on a dual-stack listener", () => {
    expect(peerAddress("::ffff:192.168.1.7")).toBe("192.168.1.7");
    expect(peerAddress("192.168.1.7")).toBe("192.168.1.7");
    expect(peerAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(peerAddress(undefined)).toBe("unknown");
  });
});
