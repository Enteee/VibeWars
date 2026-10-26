import { segment, type Segment, type Vec2 } from "@vibewars/game-core";

import type { Wall } from "./schema.js";

/**
 * A wall as either side of the wire holds it: a map file's `Wall`, or the
 * read-only descriptor a client receives, which needs the same segments
 * for its line-of-sight hints (#485).
 */
export type WallShape =
  | Readonly<Extract<Wall, { kind: "rect" }>>
  | { readonly kind: "polygon"; readonly points: readonly Vec2[] };

/**
 * Reduce any wall shape to the segment list the collision/LOS engine in
 * `@vibewars/game-core` actually consumes (see that package's
 * `geometry.ts` for why segments are the one shared primitive).
 */
export function wallToSegments(wall: WallShape): Segment[] {
  if (wall.kind === "rect") {
    const { x, y, width, height } = wall;
    const topLeft: Vec2 = { x, y };
    const topRight: Vec2 = { x: x + width, y };
    const bottomRight: Vec2 = { x: x + width, y: y + height };
    const bottomLeft: Vec2 = { x, y: y + height };
    return [
      segment(topLeft, topRight),
      segment(topRight, bottomRight),
      segment(bottomRight, bottomLeft),
      segment(bottomLeft, topLeft),
    ];
  }

  // Polygon: segments connecting each point to the next, closed back to
  // the first point.
  const segments: Segment[] = [];
  for (let i = 0; i < wall.points.length; i += 1) {
    const a = wall.points[i];
    const b = wall.points[(i + 1) % wall.points.length];
    if (a === undefined || b === undefined) {
      // Unreachable given the schema's `.min(3)`, but keeps this function
      // total under `noUncheckedIndexedAccess` without a non-null assertion.
      continue;
    }
    segments.push(segment(a, b));
  }
  return segments;
}

export function allWallSegments(walls: readonly WallShape[]): Segment[] {
  return walls.flatMap(wallToSegments);
}
