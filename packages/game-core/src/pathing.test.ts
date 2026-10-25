import { describe, expect, it } from "vitest";

import { distanceSegmentToSegment, segment, type Segment } from "./geometry.js";
import { buildNavGraph, createPathFinder, type NavGraph } from "./pathing.js";
import { createRng, type SimulationRng } from "./rng.js";
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

// ---------------------------------------------------------------------------
// The reference (#267): `findPath`, its `isClear` and `buildNavGraph`, and
// the geometry they ran on, exactly as they were on main before the path
// finder replaced them, renamed only. The finder must take the same path,
// tie-breaks included, and the graph must have the same edges, because the
// simulation is deterministic. It lives only here.
// ---------------------------------------------------------------------------

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
/**
 * Classic orientation-based segment intersection test (does `p1->p2` cross
 * `p3->p4`), including shared-endpoint and collinear-overlap cases.
 */
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

/**
 * The shortest distance between two segments: 0 if they touch or cross,
 * otherwise the nearest of their four endpoints to the other segment.
 */
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

/** Whether `point` lies on the closed segment `[a, b]`, given they are collinear. */
function refIsOnSegment(a: Vec2, b: Vec2, point: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}
/**
 * Collision leaves a body touching a wall at about exactly `clearance`,
 * so a walk is clear a hair closer than that: a hero pressed against a
 * wall must still be able to step away from it.
 */
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

/** Every map the server ships (packages/game-maps/maps), as their walls become segments. */
const SERVER_MAPS: readonly {
  readonly name: string;
  readonly walls: readonly Segment[];
  readonly bounds: { readonly width: number; readonly height: number };
}[] = [
  { name: "arena-alpha", walls: ARENA_ALPHA, bounds: ARENA_BOUNDS },
  { name: "arena-open", walls: rect(420, 250, 60, 100), bounds: { width: 900, height: 600 } },
  {
    name: "arena-pillars",
    walls: [
      ...rect(280, 160, 60, 60),
      ...rect(620, 160, 60, 60),
      ...rect(280, 420, 60, 60),
      ...rect(620, 420, 60, 60),
      ...rect(440, 290, 80, 60),
    ],
    bounds: { width: 960, height: 640 },
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
];

/** The hand-built maps above, which have no edge. */
const TEST_MAPS: readonly { readonly name: string; readonly walls: readonly Segment[] }[] = [
  { name: "one block", walls: rect(200, 100, 40, 200) },
  { name: "one wall", walls: [segment(vec2(100, 0), vec2(100, 200))] },
  { name: "a walled-in box", walls: rect(400, 400, 200, 200) },
  { name: "no walls", walls: [] },
];

const MAPS = [
  ...SERVER_MAPS,
  ...TEST_MAPS.map((map) => ({ ...map, bounds: { width: 800, height: 800 }, edgeless: true })),
];

/**
 * A point to path from or to: anywhere on the map, often inside a wall
 * (so unreachable); on a node; or just off a wall, inside clearance.
 */
function samplePoint(
  rng: SimulationRng,
  graph: NavGraph,
  walls: readonly Segment[],
  bounds: { readonly width: number; readonly height: number },
): Vec2 {
  const kind = rng.nextInt(0, 4);
  const node = graph.nodes[rng.nextInt(0, Math.max(1, graph.nodes.length))];
  const wall = walls[rng.nextInt(0, Math.max(1, walls.length))];
  if (kind === 1 && node !== undefined) {
    return node;
  }
  if (kind === 2 && wall !== undefined) {
    const along = add(wall.a, scale(sub(wall.b, wall.a), rng.nextFloat()));
    const direction = sub(wall.b, wall.a);
    const normal = scale(vec2(-direction.y, direction.x), 1 / Math.hypot(direction.x, direction.y));
    const side = rng.nextFloat() < 0.5 ? -1 : 1;
    return add(along, scale(normal, side * rng.nextFloat() * (CLEARANCE + 2)));
  }
  return vec2(rng.nextFloat() * bounds.width, rng.nextFloat() * bounds.height);
}

describe("the path finder against the reference (#267)", () => {
  it("builds the same graph, nodes and edges, as the reference", () => {
    for (const map of MAPS) {
      const bounds = "edgeless" in map ? undefined : map.bounds;
      expect(buildNavGraph(map.walls, bounds, CLEARANCE), map.name).toEqual(
        referenceBuildNavGraph(map.walls, bounds, CLEARANCE),
      );
    }
  });

  it("finds exactly the reference's path, or its none, for 400 random queries a map", () => {
    let unreachable = 0;
    let routed = 0;
    for (const map of MAPS) {
      const bounds = "edgeless" in map ? undefined : map.bounds;
      const graph = buildNavGraph(map.walls, bounds, CLEARANCE);
      const reference = referenceBuildNavGraph(map.walls, bounds, CLEARANCE);
      const finder = createPathFinder(graph);
      const rng = createRng(0x267 + map.name.length);
      for (let query = 0; query < 400; query += 1) {
        const from = samplePoint(rng, graph, map.walls, map.bounds);
        const to = samplePoint(rng, graph, map.walls, map.bounds);
        const expected = referenceFindPath(reference, from, to);
        expect(finder.find(from, to), `${map.name} #${String(query)}`).toEqual(expected);
        unreachable += expected === undefined ? 1 : 0;
        routed += expected !== undefined && expected.length > 1 ? 1 : 0;
      }
    }
    // The sample reaches every case: no path at all, and a way round walls.
    expect(unreachable).toBeGreaterThan(100);
    expect(routed).toBeGreaterThan(100);
  });

  it("keeps nothing from one query to the next, and two finders agree", () => {
    const graph = buildNavGraph(ARENA_ALPHA, ARENA_BOUNDS, CLEARANCE);
    const finder = createPathFinder(graph);
    const a = [vec2(80, 320), vec2(880, 320)] as const;
    const b = [vec2(450, 100), vec2(450, 500)] as const;
    const first = finder.find(...a);
    expect(finder.find(...b)).toEqual(createPathFinder(graph).find(...b));
    expect(finder.find(...a)).toEqual(first);
    expect(first).toEqual(referenceFindPath(graph, ...a));
  });
});
