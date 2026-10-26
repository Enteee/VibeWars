import { describe, expect, it } from "vitest";

import { MAX_WIRE_PINGS } from "@vibewars/game-protocol";

import { PING_SECONDS, createCallBoard } from "./calls.js";

const BOUNDS = { width: 960, height: 640 };
/** b is team 0's living foe; everyone else is not. */
const foeB = (id: string): boolean => id === "b";
const alive = (): boolean => true;

describe("createCallBoard (#443)", () => {
  it("calls a living foe for the caller's team, and only that team", () => {
    const board = createCallBoard(BOUNDS);
    expect(board.call(0, "a", { kind: "target", targetId: "b" }, 0, foeB)).toBe(true);
    expect(board.view(0, 0).target).toEqual({ targetId: "b", callerId: "a" });
    expect(board.view(1, 0)).toEqual({ target: null, pings: [] });
  });

  it("refuses a call on an ally or a corpse", () => {
    const board = createCallBoard(BOUNDS);
    expect(board.call(0, "a", { kind: "target", targetId: "ally" }, 0, foeB)).toBe(false);
    expect(board.view(0, 0).target).toBeNull();
  });

  it("accepts calls and pings back to back from one player (#730)", () => {
    const board = createCallBoard(BOUNDS);
    expect(board.call(0, "a", { kind: "ping", x: 10, y: 10 }, 0, foeB)).toBe(true);
    expect(board.call(0, "a", { kind: "ping", x: 20, y: 20 }, 0, foeB)).toBe(true);
    expect(board.call(0, "a", { kind: "target", targetId: "b" }, 0, foeB)).toBe(true);
    expect(board.view(0, 0).pings.map((ping) => ping.id)).toEqual([1, 2]);
    expect(board.view(0, 0).target).toEqual({ targetId: "b", callerId: "a" });
  });

  it("expires a ping after 2.6 s, counting it down on the way", () => {
    const board = createCallBoard(BOUNDS);
    board.call(0, "a", { kind: "ping", x: 100, y: 200 }, 1, foeB);
    expect(board.view(0, 2).pings).toEqual([
      {
        id: 1,
        x: 100,
        y: 200,
        byId: "a",
        remaining: expect.closeTo(PING_SECONDS - 1, 9) as number,
      },
    ]);
    expect(board.step(1 + PING_SECONDS - 0.01, alive)).toEqual([]);
    expect(board.step(1 + PING_SECONDS, alive)).toEqual([0]);
    expect(board.view(0, 1 + PING_SECONDS).pings).toEqual([]);
  });

  it("clears a call when its target dies or leaves", () => {
    const board = createCallBoard(BOUNDS);
    board.call(1, "b", { kind: "target", targetId: "a" }, 0, (id) => id === "a");
    expect(board.step(0.05, alive)).toEqual([]);
    expect(board.step(0.1, (id) => id !== "a")).toEqual([1]);
    expect(board.view(1, 0.1).target).toBeNull();
  });

  it("pulls a ping into the arena, and drops one off the number line", () => {
    const board = createCallBoard(BOUNDS);
    board.call(0, "a", { kind: "ping", x: -50, y: 9_999 }, 0, foeB);
    expect(board.view(0, 0).pings.map(({ x, y }) => [x, y])).toEqual([[0, BOUNDS.height]]);
    expect(board.call(0, "c", { kind: "ping", x: Number.NaN, y: 0 }, 0, foeB)).toBe(false);
    expect(board.call(0, "d", { kind: "ping", x: 0, y: Infinity }, 0, foeB)).toBe(false);
  });

  it("keeps the newest 32 pings, from one player too", () => {
    const board = createCallBoard(BOUNDS);
    expect(MAX_WIRE_PINGS).toBe(32);
    for (let i = 0; i < MAX_WIRE_PINGS + 3; i += 1) {
      board.call(0, "a", { kind: "ping", x: i, y: 0 }, 0, foeB);
    }
    const { pings } = board.view(0, 0);
    expect(pings).toHaveLength(MAX_WIRE_PINGS);
    expect(pings.map((ping) => ping.x)).toEqual(
      Array.from({ length: MAX_WIRE_PINGS }, (_, i) => i + 3),
    );
  });

  it("numbers each team's pings on its own, so the gaps tell nothing of the other's", () => {
    const board = createCallBoard(BOUNDS);
    board.call(0, "a", { kind: "ping", x: 1, y: 1 }, 0, foeB);
    board.call(1, "b", { kind: "ping", x: 2, y: 2 }, 0, foeB);
    board.call(1, "d", { kind: "ping", x: 3, y: 3 }, 0, foeB);
    board.call(0, "c", { kind: "ping", x: 4, y: 4 }, 0, foeB);
    expect(board.view(0, 0).pings.map((ping) => ping.id)).toEqual([1, 2]);
    expect(board.view(1, 0).pings.map((ping) => ping.id)).toEqual([1, 2]);
  });

  it("lets the last of two calls in one tick win", () => {
    const board = createCallBoard(BOUNDS);
    const foes = (id: string): boolean => id === "b" || id === "e";
    board.call(0, "a", { kind: "target", targetId: "b" }, 0, foes);
    board.call(0, "c", { kind: "target", targetId: "e" }, 0, foes);
    expect(board.view(0, 0).target).toEqual({ targetId: "e", callerId: "c" });
  });
});
