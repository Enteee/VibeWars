import { describe, expect, it } from "vitest";

import { allWallSegments, wallToSegments } from "./geometry.js";
import type { Wall } from "./schema.js";

describe("wallToSegments", () => {
  it("turns a rect into 4 segments forming its perimeter", () => {
    const wall: Wall = { kind: "rect", x: 0, y: 0, width: 10, height: 5 };
    const segments = wallToSegments(wall);
    expect(segments).toHaveLength(4);

    // Every corner should appear as an endpoint of exactly two segments.
    const corners = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ];
    for (const corner of corners) {
      const touching = segments.filter(
        (s) =>
          (s.a.x === corner.x && s.a.y === corner.y) || (s.b.x === corner.x && s.b.y === corner.y),
      );
      expect(touching).toHaveLength(2);
    }
  });

  it("turns a polygon into N segments closed back to the first point", () => {
    const wall: Wall = {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    };
    const segments = wallToSegments(wall);
    expect(segments).toHaveLength(3);
    // The closing segment connects the last point back to the first.
    const closing = segments[2];
    expect(closing).toEqual({ a: { x: 5, y: 10 }, b: { x: 0, y: 0 } });
  });

  it("handles a larger polygon without losing or duplicating an edge", () => {
    const wall: Wall = {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 5, y: 15 },
        { x: 0, y: 10 },
      ],
    };
    expect(wallToSegments(wall)).toHaveLength(5);
  });
});

describe("allWallSegments", () => {
  it("flattens multiple walls into one segment list", () => {
    const walls: Wall[] = [
      { kind: "rect", x: 0, y: 0, width: 10, height: 10 },
      { kind: "rect", x: 20, y: 20, width: 5, height: 5 },
    ];
    expect(allWallSegments(walls)).toHaveLength(8);
  });

  it("returns an empty list for no walls", () => {
    expect(allWallSegments([])).toEqual([]);
  });
});
