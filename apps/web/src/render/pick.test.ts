import { describe, expect, it } from "vitest";

import { pickAt, type ClickableKind, type DrawnClickable } from "./pick.js";

/** One pick path (#3634): what is drawn on top at a point is what a click picks. */

function circle(kind: ClickableKind, id: string, x: number, depth: number, r = 10): DrawnClickable {
  return { kind, id, hit: { circle: { x, y: 0, r } }, depth };
}

describe("pickAt (#3634)", () => {
  it("picks the one drawn on top where two overlap, whatever its kind", () => {
    const body = circle("body", "foe", 0, 3);
    const lever = circle("switch", "switch-west", 5, 9);
    expect(pickAt([body, lever], { x: 3, y: 0 })?.id).toBe("switch-west");
    expect(pickAt([{ ...body, depth: 12 }, lever], { x: 3, y: 0 })?.id).toBe("foe");
  });

  it("breaks a tie of depth by kind: body, flag, stand, switch, wall", () => {
    const order: readonly ClickableKind[] = ["body", "flag", "stand", "switch", "breakable"];
    for (const [at, kind] of order.entries()) {
      const below = order.slice(at).map((other) => circle(other, other, 0, 1));
      expect(pickAt([...below].reverse(), { x: 0, y: 0 })?.kind).toBe(kind);
    }
  });

  it("among two circles of one kind and depth, picks the nearer centre", () => {
    const drawn = [circle("body", "left", 0, 1), circle("body", "right", 8, 1)];
    expect(pickAt(drawn, { x: 3, y: 0 })?.id).toBe("left");
    expect(pickAt(drawn, { x: 5, y: 0 })?.id).toBe("right");
  });

  it("skips what `accept` refuses, for the one under it", () => {
    const drawn = [circle("body", "corpse", 0, 5), circle("switch", "lever", 0, 1)];
    expect(pickAt(drawn, { x: 0, y: 0 }, (c) => c.id !== "corpse")?.id).toBe("lever");
    expect(pickAt(drawn, { x: 0, y: 0 }, () => false)).toBeUndefined();
  });

  it("hits a circle within its radius, a polygon inside it, and nothing beside either", () => {
    const square: DrawnClickable = {
      kind: "breakable",
      id: "square",
      hit: {
        polygon: [
          { x: 100, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: 20 },
          { x: 100, y: 20 },
        ],
      },
      depth: 1,
    };
    const drawn = [circle("body", "a", 0, 1), square];
    expect(pickAt(drawn, { x: 0, y: 10 })?.id).toBe("a");
    expect(pickAt(drawn, { x: 0, y: 11 })).toBeUndefined();
    expect(pickAt(drawn, { x: 110, y: 10 })?.id).toBe("square");
    expect(pickAt(drawn, { x: 125, y: 10 })).toBeUndefined();
  });

  it("hits a wall's column on its top, its foot or its face between", () => {
    // A 20 x 10 footprint at y 100..110, drawn 30 up from its foot.
    const wall: DrawnClickable = {
      kind: "breakable",
      id: "wall",
      hit: {
        column: {
          outline: [
            { x: 0, y: 100 },
            { x: 20, y: 100 },
            { x: 20, y: 110 },
            { x: 0, y: 110 },
          ],
          low: 0,
          high: 30,
        },
      },
      depth: 1,
    };
    expect(pickAt([wall], { x: 10, y: 105 })?.id).toBe("wall");
    expect(pickAt([wall], { x: 10, y: 75 })?.id).toBe("wall");
    expect(pickAt([wall], { x: 10, y: 90 })?.id).toBe("wall");
    expect(pickAt([wall], { x: 10, y: 60 })).toBeUndefined();
    expect(pickAt([wall], { x: 30, y: 90 })).toBeUndefined();
  });

  it("picks nothing from an empty frame: before the first, a click falls to the ground", () => {
    expect(pickAt([], { x: 0, y: 0 })).toBeUndefined();
  });
});
