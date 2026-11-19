import {
  distancePointToSegment,
  segment,
  segmentsIntersect,
  type Segment,
  type Vec2,
} from "@vibewars/game-core";

import type { Shape } from "./schema.js";

/**
 * A wall as either side of the wire holds it: a map file's `Wall`, or the
 * read-only descriptor a client receives, which needs the same segments
 * for its line-of-sight hints (#485).
 */
export type WallShape =
  | Readonly<Extract<Shape, { kind: "rect" }>>
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

/** The corners of a shape. */
export function shapeVertices(shape: WallShape): Vec2[] {
  return wallToSegments(shape).map((side) => side.a);
}

/** Whether `point` is inside `shape`, its outline included. */
export function pointInShape(point: Vec2, shape: WallShape): boolean {
  if (shape.kind === "rect") {
    return (
      point.x >= shape.x &&
      point.y >= shape.y &&
      point.x <= shape.x + shape.width &&
      point.y <= shape.y + shape.height
    );
  }
  const sides = wallToSegments(shape);
  if (sides.some((side) => distancePointToSegment(point, side) === 0)) {
    return true;
  }
  const crossings = sides.filter(
    ({ a, b }) =>
      a.y > point.y !== b.y > point.y &&
      point.x < a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x),
  );
  return crossings.length % 2 === 1;
}

/** Whether two shapes share any point, a shared edge included. */
export function shapesOverlap(first: WallShape, second: WallShape): boolean {
  const sides = wallToSegments(second);
  return (
    wallToSegments(first).some((side) => sides.some((other) => segmentsIntersect(side, other))) ||
    shapeVertices(first).some((point) => pointInShape(point, second)) ||
    shapeVertices(second).some((point) => pointInShape(point, first))
  );
}

/** Whether two segments cross, touching at an end not counted: a ramp may run along the edge. */
export function segmentsCross(first: Segment, second: Segment): boolean {
  const side = (point: Vec2, { a, b }: Segment): number =>
    Math.sign((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x));
  return (
    side(first.a, second) * side(first.b, second) < 0 &&
    side(second.a, first) * side(second.b, first) < 0
  );
}

/** How far off an outline a point may be and still count as on it: a distance's rounding, not a reach. */
const ON_OUTLINE = 1e-6;

/** Whether `point` is inside `shape` and not on its outline. */
function pointInsideShape(point: Vec2, shape: WallShape): boolean {
  return (
    pointInShape(point, shape) &&
    wallToSegments(shape).every((side) => distancePointToSegment(point, side) > ON_OUTLINE)
  );
}

/** The points of a shape that tell whether it reaches into another: corners, mid-sides, centre. */
function probePoints(shape: WallShape): Vec2[] {
  const sides = wallToSegments(shape);
  const corners = sides.map((side) => side.a);
  const centre: Vec2 = {
    x: corners.reduce((sum, { x }) => sum + x, 0) / corners.length,
    y: corners.reduce((sum, { y }) => sum + y, 0) / corners.length,
  };
  return [
    ...corners,
    ...sides.map(({ a, b }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })),
    centre,
  ];
}

/**
 * Whether two shapes share more than an outline (#3665): a side crosses the
 * other's, or a corner, mid-side or centre of one lies strictly inside the
 * other. Shapes that only touch along an edge or at a corner do not.
 */
export function shapesOverlapInterior(first: WallShape, second: WallShape): boolean {
  const sides = wallToSegments(second);
  return (
    wallToSegments(first).some((side) => sides.some((other) => segmentsCross(side, other))) ||
    probePoints(first).some((point) => pointInsideShape(point, second)) ||
    probePoints(second).some((point) => pointInsideShape(point, first))
  );
}

/** Whether all of `shape` is inside a map of this size. */
export function shapeInBounds(shape: WallShape, width: number, height: number): boolean {
  return shapeVertices(shape).every(({ x, y }) => x >= 0 && y >= 0 && x <= width && y <= height);
}
