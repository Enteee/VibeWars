import { describe, expect, it } from "vitest";

import { distanceSegmentToSegment, segment, type Segment } from "./geometry.js";
import { buildNavGraph, createPathFinder, type NavGraph } from "./pathing.js";
import { createRng } from "./rng.js";
import { add, distance, dot, scale, sub, vec2, type Vec2 } from "./vec2.js";

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

describe("createPathFinder", () => {
  it("goes straight when nothing is in the way", () => {
    const graph = buildNavGraph([], undefined, CLEARANCE);
    expect(createPathFinder(graph).find(vec2(0, 0), vec2(300, 40))).toEqual([vec2(300, 40)]);
  });

  it("goes round a wall by its two outward corners, on the shorter side", () => {
    const walls = rect(200, 100, 40, 200);
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    // 180 is nearer the top (100) than the bottom (300).
    expect(createPathFinder(graph).find(vec2(100, 180), vec2(340, 180))).toEqual([
      vec2(185, 85),
      vec2(255, 85),
      vec2(340, 180),
    ]);
  });

  it("crosses Arena Alpha from spawn to spawn, round the low wall and through the gap", () => {
    const graph = buildNavGraph(ARENA_ALPHA, ARENA_BOUNDS, CLEARANCE);
    const from = vec2(80, 320);
    const to = vec2(880, 320);
    const path = createPathFinder(graph).find(from, to);
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
    expect(createPathFinder(graph).find(vec2(100, 100), vec2(500, 500))).toBeUndefined();
  });

  it("lets a body pressed against a wall step away round it", () => {
    const walls = [segment(vec2(100, 0), vec2(100, 200))];
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    const from = vec2(100 + CLEARANCE, 100);
    const path = createPathFinder(graph).find(from, vec2(40, 100));
    expect(path).toBeDefined();
    expect(everyLegClear(walls, from, path ?? [])).toBe(true);
  });

  it("does not hand back the spot a body already stands on", () => {
    const walls = rect(200, 100, 40, 200);
    const graph = buildNavGraph(walls, undefined, CLEARANCE);
    const corner = vec2(185, 85);
    const path = createPathFinder(graph).find(corner, vec2(340, 280)) ?? [];
    expect(path.length).toBeGreaterThan(0);
    expect(distance(path[0] ?? corner, corner)).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The reference (#267)                                                        */
/* -------------------------------------------------------------------------- */

/*
 * The path finder and the wall test as they were before #267, verbatim but
 * renamed, geometry included: a Map-and-Set A* with a Segment per wall test.
 * The finder that replaced them must give exactly the same graph and the
 * same paths, tick for tick, ties included, because the simulation is
 * deterministic and an attacker's route is part of what it decides. These
 * copies live only here.
 */

/** The point on `seg` closest to `point`. */
function refClosestPointOnSegment(point: Vec2, seg: Segment): Vec2 {
  const ab = sub(seg.b, seg.a);
  const abLengthSquared = dot(ab, ab);
  if (abLengthSquared < 1e-12) {
    // Degenerate (zero-length) segment: both endpoints are the same point.
    return seg.a;
  }
  const t = dot(sub(point, seg.a), ab) / abLengthSquared;
  const clampedT = Math.max(0, Math.min(1, t));
  return add(seg.a, scale(ab, clampedT));
}

function refDistancePointToSegment(point: Vec2, seg: Segment): number {
  return distance(point, refClosestPointOnSegment(point, seg));
}

function refSegmentsIntersect(s1: Segment, s2: Segment): boolean {
  const { a: p1, b: p2 } = s1;
  const { a: p3, b: p4 } = s2;

  const d1 = refCross(sub(p4, p3), sub(p1, p3));
  const d2 = refCross(sub(p4, p3), sub(p2, p3));
  const d3 = refCross(sub(p2, p1), sub(p3, p1));
  const d4 = refCross(sub(p2, p1), sub(p4, p1));

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && refIsOnSegment(p3, p4, p1)) return true;
  if (d2 === 0 && refIsOnSegment(p3, p4, p2)) return true;
  if (d3 === 0 && refIsOnSegment(p1, p2, p3)) return true;
  if (d4 === 0 && refIsOnSegment(p1, p2, p4)) return true;

  return false;
}

function refDistanceSegmentToSegment(s: Segment, t: Segment): number {
  if (refSegmentsIntersect(s, t)) {
    return 0;
  }
  return Math.min(
    refDistancePointToSegment(s.a, t),
    refDistancePointToSegment(s.b, t),
    refDistancePointToSegment(t.a, s),
    refDistancePointToSegment(t.b, s),
  );
}

function refCross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function refIsOnSegment(a: Vec2, b: Vec2, point: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

const CLEAR_TOLERANCE = 0.5;

/** A waypoint closer than this to where a body stands is where it already is. */
const ARRIVED = 1e-6;

function refIsClear(graph: Pick<NavGraph, "walls" | "clearance">, from: Vec2, to: Vec2): boolean {
  const walk = segment(from, to);
  const least = graph.clearance - CLEAR_TOLERANCE;
  const left = Math.min(from.x, to.x) - least;
  const right = Math.max(from.x, to.x) + least;
  const top = Math.min(from.y, to.y) - least;
  const bottom = Math.max(from.y, to.y) + least;
  return graph.walls.every(
    (wall) =>
      // Nowhere near: the cheap test first, as it settles most walls.
      Math.max(wall.a.x, wall.b.x) < left ||
      Math.min(wall.a.x, wall.b.x) > right ||
      Math.max(wall.a.y, wall.b.y) < top ||
      Math.min(wall.a.y, wall.b.y) > bottom ||
      refDistanceSegmentToSegment(walk, wall) >= least,
  );
}

/**
 * The graph for `walls` in a `bounds`-sized map, for bodies of radius
 * `clearance`. Without `bounds` the field has no edge.
 */
function referenceBuildNavGraph(
  walls: readonly Segment[],
  bounds: { readonly width: number; readonly height: number } | undefined,
  clearance: number,
): NavGraph {
  const offset = clearance + 1;
  const inside = (point: Vec2): boolean =>
    bounds === undefined ||
    (point.x >= clearance &&
      point.y >= clearance &&
      point.x <= bounds.width - clearance &&
      point.y <= bounds.height - clearance);

  const corners = new Map<string, Vec2>();
  for (const wall of walls) {
    for (const end of [wall.a, wall.b]) {
      corners.set(`${String(end.x)},${String(end.y)}`, end);
    }
  }
  const nodes: Vec2[] = [];
  for (const corner of corners.values()) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const node = vec2(corner.x + dx * offset, corner.y + dy * offset);
      const fits = walls.every((wall) => refDistancePointToSegment(node, wall) >= clearance);
      if (fits && inside(node)) {
        nodes.push(node);
      }
    }
  }

  const graph = { walls, clearance };
  const edges = nodes.map((node, i) =>
    nodes.flatMap((other, j) => (i !== j && refIsClear(graph, node, other) ? [j] : [])),
  );
  return { walls, clearance, nodes, edges };
}

/**
 * The shortest way for a body from `from` to `to`: the waypoints after
 * `from`, ending at `to`, or `undefined` if there is none. A* with the
 * straight-line distance as its estimate.
 */
function referenceFindPath(graph: NavGraph, from: Vec2, to: Vec2): readonly Vec2[] | undefined {
  if (refIsClear(graph, from, to)) {
    return [to];
  }

  // The graph's nodes, then `from`, then `to`.
  const count = graph.nodes.length;
  const start = count;
  const goal = count + 1;
  const point = (i: number): Vec2 =>
    i === start ? from : i === goal ? to : (graph.nodes[i] ?? to);
  const toGoal = new Set<number>();
  graph.nodes.forEach((node, i) => {
    if (refIsClear(graph, node, to)) {
      toGoal.add(i);
    }
  });
  const neighbours = (i: number): readonly number[] => {
    const next =
      i === start
        ? graph.nodes.flatMap((node, j) =>
            distance(node, from) > ARRIVED && refIsClear(graph, from, node) ? [j] : [],
          )
        : (graph.edges[i] ?? []);
    return toGoal.has(i) ? [...next, goal] : next;
  };

  const cost = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const open = new Set<number>([start]);
  const closed = new Set<number>();
  while (open.size > 0) {
    let current = start;
    let best = Number.POSITIVE_INFINITY;
    for (const i of open) {
      const estimate = (cost.get(i) ?? Number.POSITIVE_INFINITY) + distance(point(i), to);
      if (estimate < best) {
        best = estimate;
        current = i;
      }
    }
    if (current === goal) {
      const path: Vec2[] = [];
      for (
        let at: number | undefined = goal;
        at !== undefined && at !== start;
        at = cameFrom.get(at)
      ) {
        path.push(point(at));
      }
      return path.reverse();
    }
    open.delete(current);
    closed.add(current);
    const here = cost.get(current) ?? Number.POSITIVE_INFINITY;
    for (const next of neighbours(current)) {
      if (closed.has(next)) {
        continue;
      }
      const through = here + distance(point(current), point(next));
      if (through < (cost.get(next) ?? Number.POSITIVE_INFINITY)) {
        cost.set(next, through);
        cameFrom.set(next, current);
        open.add(next);
      }
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */

/** A polygon's sides, closed, as a map's polygon wall becomes. */
function polygon(...points: Vec2[]): Segment[] {
  return points.map((point, i) => segment(point, points[(i + 1) % points.length] ?? point));
}

/** The four arenas (packages/game-maps/maps), and the hand-built maps above. */
const MAPS: readonly {
  name: string;
  walls: readonly Segment[];
  bounds: { width: number; height: number } | undefined;
}[] = [
  { name: "arena-alpha", walls: ARENA_ALPHA, bounds: ARENA_BOUNDS },
  { name: "arena-open", walls: rect(420, 250, 60, 100), bounds: { width: 900, height: 600 } },
  {
    name: "arena-pillars",
    walls: [
      ...polygon(vec2(280, 160), vec2(340, 160), vec2(340, 220), vec2(280, 220)),
      ...polygon(vec2(620, 160), vec2(680, 160), vec2(680, 220), vec2(620, 220)),
      ...polygon(vec2(280, 420), vec2(340, 420), vec2(340, 480), vec2(280, 480)),
      ...polygon(vec2(620, 420), vec2(680, 420), vec2(680, 480), vec2(620, 480)),
      ...polygon(vec2(440, 290), vec2(520, 290), vec2(520, 350), vec2(440, 350)),
    ],
    bounds: ARENA_BOUNDS,
  },
  {
    name: "arena-split",
    walls: [
      ...rect(300, 0, 30, 260),
      ...rect(300, 440, 30, 260),
      ...rect(670, 0, 30, 260),
      ...rect(670, 440, 30, 260),
      ...rect(440, 300, 120, 100),
    ],
    bounds: { width: 1000, height: 700 },
  },
  { name: "one block", walls: rect(200, 100, 40, 200), bounds: undefined },
  { name: "one wall", walls: [segment(vec2(100, 0), vec2(100, 200))], bounds: undefined },
  { name: "walled in", walls: rect(400, 400, 200, 200), bounds: undefined },
  { name: "no walls", walls: [], bounds: undefined },
];

/**
 * Seeded queries on a map: anywhere in it (inside walls too, so some
 * targets are unreachable), on the graph's nodes, and pressed against a
 * wall at about the clearance, where the wall test is closest to its edge.
 */
function queries(graph: NavGraph, bounds: { width: number; height: number } | undefined): Vec2[] {
  const rng = createRng(267);
  const width = bounds?.width ?? 700;
  const height = bounds?.height ?? 700;
  const points: Vec2[] = [];
  for (let k = 0; k < 600; k += 1) {
    const kind = k % 3;
    const wall = graph.walls[rng.nextUint32() % Math.max(1, graph.walls.length)];
    if (kind === 1 && graph.nodes.length > 0) {
      points.push(graph.nodes[rng.nextUint32() % graph.nodes.length] ?? vec2(0, 0));
    } else if (kind === 2 && wall !== undefined) {
      const along = add(wall.a, scale(sub(wall.b, wall.a), rng.nextFloat()));
      const side = sub(wall.b, wall.a);
      const normal = scale(vec2(-side.y, side.x), 1 / Math.sqrt(dot(side, side)));
      const gap = CLEARANCE - 0.6 + rng.nextFloat() * 1.2;
      points.push(add(along, scale(normal, rng.nextFloat() < 0.5 ? gap : -gap)));
    } else {
      points.push(vec2(rng.nextFloat() * width, rng.nextFloat() * height));
    }
  }
  return points;
}

describe("createPathFinder against the reference", () => {
  for (const map of MAPS) {
    it(`builds the same graph on ${map.name}`, () => {
      expect(buildNavGraph(map.walls, map.bounds, CLEARANCE)).toEqual(
        referenceBuildNavGraph(map.walls, map.bounds, CLEARANCE),
      );
    });

    it(`finds exactly the reference's paths on ${map.name}`, () => {
      const graph = buildNavGraph(map.walls, map.bounds, CLEARANCE);
      const finder = createPathFinder(graph);
      const points = queries(graph, map.bounds);
      let found = 0;
      let none = 0;
      for (let k = 0; k + 1 < points.length; k += 2) {
        const from = points[k] ?? vec2(0, 0);
        const to = points[k + 1] ?? vec2(0, 0);
        const expected = referenceFindPath(graph, from, to);
        expect(finder.find(from, to), `${map.name} query ${String(k / 2)}`).toEqual(expected);
        if (expected === undefined) {
          none += 1;
        } else if (expected.length > 1) {
          found += 1;
        }
      }
      // The sample has to exercise the search, not only the straight line.
      if (map.walls.length > 0) {
        expect(found).toBeGreaterThan(0);
      }
      if (map.name === "walled in") {
        expect(none).toBeGreaterThan(0);
      }
    });
  }

  it("keeps nothing from one query to the next", () => {
    const graph = buildNavGraph(ARENA_ALPHA, ARENA_BOUNDS, CLEARANCE);
    const finder = createPathFinder(graph);
    const a = [vec2(80, 320), vec2(880, 320)] as const;
    const b = [vec2(452, 100), vec2(80, 600)] as const;
    const first = finder.find(...a);
    finder.find(...b);
    expect(finder.find(...a)).toEqual(first);
    expect(createPathFinder(graph).find(...b)).toEqual(finder.find(...b));
  });
});
