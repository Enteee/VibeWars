import { describe, expect, it } from "vitest";

import { distanceSegmentToSegment, segment, type Segment } from "./geometry.js";
import { buildNavGraph, findPath } from "./pathing.js";
import { distance, vec2, type Vec2 } from "./vec2.js";

const CLEARANCE = 14;

/** A rectangle's four sides, as a map's rect wall becomes. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** Arena Alpha's three walls (packages/game-maps/maps/arena-alpha). */
const ARENA_ALPHA = [
  ...rect(440, 0, 24, 260),
  ...rect(440, 380, 24, 260),
  ...rect(300, 300, 120, 24),
];
const ARENA_BOUNDS = { width: 960, height: 640 };

function length(from: Vec2, path: readonly Vec2[]): number {
  let total = 0;
  let at = from;
  for (const next of path) {
    total += distance(at, next);
    at = next;
  }
  return total;
}

function everyLegClear(walls: readonly Segment[], from: Vec2, path: readonly Vec2[]): boolean {
  let at = from;
  for (const next of path) {
    const leg = segment(at, next);
    if (walls.some((wall) => distanceSegmentToSegment(leg, wall) < CLEARANCE - 0.5)) {
      return false;
    }
    at = next;
  }
  return true;
}

describe("findPath", () => {
  it("goes straight when nothing is in the way", () => {
    const graph = buildNavGraph([], undefined, CLEARANCE);
    expect(findPath(graph, vec2(0, 0), vec2(300, 40))).toEqual([vec2(300, 40)]);
  });

  it("goes round a wall by its two outward corners, on the shorter side", () => {
    const walls = rect(200, 100, 40, 200);
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    // 180 is nearer the top (100) than the bottom (300).
    expect(findPath(graph, vec2(100, 180), vec2(340, 180))).toEqual([
      vec2(185, 85),
      vec2(255, 85),
      vec2(340, 180),
    ]);
  });

  it("crosses Arena Alpha from spawn to spawn, round the low wall and through the gap", () => {
    const graph = buildNavGraph(ARENA_ALPHA, ARENA_BOUNDS, CLEARANCE);
    const from = vec2(80, 320);
    const to = vec2(880, 320);
    const path = findPath(graph, from, to);
    expect(path).toBeDefined();
    const found = path ?? [];
    expect(everyLegClear(ARENA_ALPHA, from, found)).toBe(true);
    // By hand: under the low wall's corners (285, 339) and (435, 339),
    // then through the gap to the far spawn.
    const shortest = Math.hypot(205, 19) + 150 + Math.hypot(445, 19);
    expect(length(from, found)).toBeGreaterThanOrEqual(shortest * 0.99);
    expect(length(from, found)).toBeLessThanOrEqual(shortest * 1.01);
  });

  it("never routes outside the map's edge", () => {
    const graph = buildNavGraph(ARENA_ALPHA, ARENA_BOUNDS, CLEARANCE);
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(CLEARANCE);
      expect(node.y).toBeGreaterThanOrEqual(CLEARANCE);
      expect(node.x).toBeLessThanOrEqual(ARENA_BOUNDS.width - CLEARANCE);
      expect(node.y).toBeLessThanOrEqual(ARENA_BOUNDS.height - CLEARANCE);
    }
  });

  it("finds nothing when the goal is walled in", () => {
    const walls = rect(400, 400, 200, 200);
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    expect(findPath(graph, vec2(100, 100), vec2(500, 500))).toBeUndefined();
  });

  it("lets a body pressed against a wall step away round it", () => {
    const walls = [segment(vec2(100, 0), vec2(100, 200))];
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    const from = vec2(100 + CLEARANCE, 100);
    const path = findPath(graph, from, vec2(40, 100));
    expect(path).toBeDefined();
    expect(everyLegClear(walls, from, path ?? [])).toBe(true);
  });

  it("does not hand back the spot a body already stands on", () => {
    const walls = rect(200, 100, 40, 200);
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    const corner = vec2(185, 85);
    const path = findPath(graph, corner, vec2(340, 280)) ?? [];
    expect(path.length).toBeGreaterThan(0);
    expect(distance(path[0] ?? corner, corner)).toBeGreaterThan(1);
  });
});
