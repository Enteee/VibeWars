import { ROOM_LIMIT, SERVER_FULL_MESSAGE } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { RoomSlot, createRoomBudget } from "./room-budget.js";

describe("createRoomBudget (#114)", () => {
  it("lends slots up to its max, then refuses", () => {
    const budget = createRoomBudget(2);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(false);
    expect(budget.inUse).toBe(2);
  });

  it("frees one slot per release, and never goes below none", () => {
    const budget = createRoomBudget(1);
    budget.tryAcquire();
    budget.release();
    expect(budget.inUse).toBe(0);
    budget.release();
    expect(budget.inUse).toBe(0);
    expect(budget.tryAcquire()).toBe(true);
  });
});

describe("RoomSlot", () => {
  it("refuses a room past the budget with ROOM_LIMIT and the full-server message", () => {
    const budget = createRoomBudget(0);
    let refused: unknown;
    try {
      new RoomSlot(budget).take();
    } catch (error: unknown) {
      refused = error;
    }
    expect((refused as Error & { code?: unknown }).code).toBe(ROOM_LIMIT);
    expect((refused as Error).message).toBe(SERVER_FULL_MESSAGE);
  });

  it("gives its slot back once, however often it is released", () => {
    const budget = createRoomBudget(2);
    budget.tryAcquire();
    const slot = new RoomSlot(budget);
    slot.take();
    slot.release();
    slot.release();
    expect(budget.inUse).toBe(1);
  });

  it("gives nothing back when it never took a slot", () => {
    const budget = createRoomBudget(1);
    budget.tryAcquire();
    new RoomSlot(budget).release();
    expect(budget.inUse).toBe(1);
  });
});
