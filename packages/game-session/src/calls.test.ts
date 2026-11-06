import { describe, expect, it } from "vitest";

import {
  MAX_WIRE_PINGS,
  MAX_WIRE_STROKES,
  STROKE_SECONDS,
  type PeerCall,
} from "@vibewars/game-protocol";

import { PING_SECONDS, STROKES_PER_SECOND, createCallBoard } from "./calls.js";

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

describe("createCallBoard's compass lines (#2391)", () => {
  const line = (strokeId: number, x = 10): PeerCall => ({
    kind: "stroke",
    strokeId,
    points: [
      [x, 10],
      [x + 5, 20],
    ],
  });

  it("keeps a segment for the drawer's team only, sent once as fresh, and never in the calls view", () => {
    const board = createCallBoard(BOUNDS);
    expect(board.call(0, "a", line(1), 1, foeB)).toBe(false);
    expect(board.view(0, 1)).toEqual({ target: null, pings: [] });
    const segment = {
      id: 1,
      byId: "a",
      strokeId: 1,
      points: [
        [10, 10],
        [15, 20],
      ],
      remaining: STROKE_SECONDS - 0.5,
    };
    expect(board.freshStrokes(0, 1.5)).toEqual([segment]);
    expect(board.freshStrokes(0, 1.5)).toEqual([]);
    expect(board.strokes(0, 1.5)).toEqual([segment]);
    expect(board.strokes(1, 1.5)).toEqual([]);
    expect(board.freshStrokes(1, 1.5)).toEqual([]);
  });

  it("pulls points into the arena, drops a non-finite one, and a segment left with one point", () => {
    const board = createCallBoard(BOUNDS);
    const wild: PeerCall = {
      kind: "stroke",
      strokeId: 1,
      points: [
        [-50, 10],
        [Number.NaN, 1],
        [2000, 9000],
      ],
    };
    board.call(0, "a", wild, 0, foeB);
    expect(board.strokes(0, 0)[0]?.points).toEqual([
      [0, 10],
      [960, 640],
    ]);
    const lone: PeerCall = {
      kind: "stroke",
      strokeId: 2,
      points: [
        [1, 1],
        [Number.POSITIVE_INFINITY, 1],
      ],
    };
    board.call(0, "a", lone, 0, foeB);
    expect(board.strokes(0, 0)).toHaveLength(1);
  });

  it("keeps the newest 64 segments", () => {
    const board = createCallBoard(BOUNDS);
    // Ten players' worth, so no one's budget runs out.
    for (let index = 0; index < MAX_WIRE_STROKES + 6; index += 1) {
      board.call(0, `p${String(index % 10)}`, line(index), 0, foeB);
    }
    const ids = board.strokes(0, 0).map(({ id }) => id);
    expect(ids).toHaveLength(MAX_WIRE_STROKES);
    expect(ids[0]).toBe(7);
    expect(board.freshStrokes(0, 0)).toHaveLength(MAX_WIRE_STROKES);
  });

  it("expires a segment at 4 s", () => {
    const board = createCallBoard(BOUNDS);
    board.call(0, "a", line(1), 2, foeB);
    expect(board.strokes(0, 5.9)[0]?.remaining).toBeCloseTo(0.1);
    expect(board.step(6, alive)).toEqual([]);
    expect(board.strokes(0, 6)).toEqual([]);
    expect(board.freshStrokes(0, 6)).toEqual([]);
  });

  it("drops a player's segments past 15 a second, theirs only, and refills with time", () => {
    const board = createCallBoard(BOUNDS);
    for (let index = 0; index < STROKES_PER_SECOND + 5; index += 1) {
      board.call(0, "a", line(1, index), 0, foeB);
    }
    board.call(0, "c", line(1), 0, foeB);
    const by = (id: string): number => board.strokes(0, 0).filter(({ byId }) => byId === id).length;
    expect(by("a")).toBe(STROKES_PER_SECOND);
    expect(by("c")).toBe(1);
    board.call(0, "a", line(2), 0.2, foeB);
    expect(board.strokes(0, 0.2).filter(({ byId }) => byId === "a")).toHaveLength(
      STROKES_PER_SECOND + 1,
    );
  });

  it("numbers each team's segments on its own", () => {
    const board = createCallBoard(BOUNDS);
    board.call(0, "a", line(1), 0, foeB);
    board.call(1, "b", line(1), 0, foeB);
    expect(board.strokes(1, 0).map(({ id }) => id)).toEqual([1]);
  });
});
