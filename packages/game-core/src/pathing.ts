import {
  distancePointToSegment,
  distanceSegmentToSegment,
  segment,
  type Segment,
} from "./geometry.js";
import { distance, vec2, type Vec2 } from "./vec2.js";

/**
 * Paths around walls, for the weapon attack's approach (#211, ADR-0026).
 *
 * A visibility graph over wall corners: every wall endpoint offers the
 * spots just off it, diagonally, that a body fits on, and two spots are
 * joined when a body can walk straight from one to the other. The
 * shortest path between two points then runs through some of those
 * corners. The maps are a handful of rectangles, so the graph is a few
 * dozen nodes at most and a query is cheap enough to run every tick.
 */

/** The corners a body can stand on, and which of them see each other. Built once per map. */
export interface NavGraph {
  readonly walls: readonly Segment[];
  readonly clearance: number;
  readonly nodes: readonly Vec2[];
  /** For each node, the nodes a body can walk to in a straight line. */
  readonly edges: readonly (readonly number[])[];
}

/**
 * Collision leaves a body touching a wall at about exactly `clearance`,
 * so a walk is clear a hair closer than that: a hero pressed against a
 * wall must still be able to step away from it.
 */
const CLEAR_TOLERANCE = 0.5;

/** A waypoint closer than this to where a body stands is where it already is. */
const ARRIVED = 1e-6;

function isClear(graph: Pick<NavGraph, "walls" | "clearance">, from: Vec2, to: Vec2): boolean {
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
      distanceSegmentToSegment(walk, wall) >= least,
  );
}

/**
 * The graph for `walls` in a `bounds`-sized map, for bodies of radius
 * `clearance`. Without `bounds` the field has no edge.
 */
export function buildNavGraph(
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
      const fits = walls.every((wall) => distancePointToSegment(node, wall) >= clearance);
      if (fits && inside(node)) {
        nodes.push(node);
      }
    }
  }

  const graph = { walls, clearance };
  const edges = nodes.map((node, i) =>
    nodes.flatMap((other, j) => (i !== j && isClear(graph, node, other) ? [j] : [])),
  );
  return { walls, clearance, nodes, edges };
}

/**
 * The shortest way for a body from `from` to `to`: the waypoints after
 * `from`, ending at `to`, or `undefined` if there is none. A* with the
 * straight-line distance as its estimate.
 */
export function findPath(graph: NavGraph, from: Vec2, to: Vec2): readonly Vec2[] | undefined {
  if (isClear(graph, from, to)) {
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
    if (isClear(graph, node, to)) {
      toGoal.add(i);
    }
  });
  const neighbours = (i: number): readonly number[] => {
    const next =
      i === start
        ? graph.nodes.flatMap((node, j) =>
            distance(node, from) > ARRIVED && isClear(graph, from, node) ? [j] : [],
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
