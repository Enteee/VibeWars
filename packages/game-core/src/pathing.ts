import { distancePointToSegment, distanceSegmentToSegmentAt, type Segment } from "./geometry.js";
import { distance, vec2, type Vec2 } from "./vec2.js";

/**
 * Paths around walls, for the weapon attack's approach (#211, ADR-0026).
 *
 * A visibility graph over wall corners: every wall endpoint offers the
 * spots just off it, diagonally, that a body fits on, and two spots are
 * joined when a body can walk straight from one to the other. The
 * shortest path between two points then runs through some of those
 * corners. The maps are a handful of rectangles, so the graph is a few
 * dozen nodes at most and a query is cheap enough to run every tick, for
 * every approaching attacker, as long as it allocates nothing (#267).
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

/** Can a body walk straight from `from` to `to`? Allocates nothing. */
function isClear(graph: Pick<NavGraph, "walls" | "clearance">, from: Vec2, to: Vec2): boolean {
  const least = graph.clearance - CLEAR_TOLERANCE;
  const left = Math.min(from.x, to.x) - least;
  const right = Math.max(from.x, to.x) + least;
  const top = Math.min(from.y, to.y) - least;
  const bottom = Math.max(from.y, to.y) + least;
  for (const wall of graph.walls) {
    // Nowhere near: the cheap test first, as it settles most walls.
    if (
      Math.max(wall.a.x, wall.b.x) < left ||
      Math.min(wall.a.x, wall.b.x) > right ||
      Math.max(wall.a.y, wall.b.y) < top ||
      Math.min(wall.a.y, wall.b.y) > bottom
    ) {
      continue;
    }
    const gap = distanceSegmentToSegmentAt(
      from.x,
      from.y,
      to.x,
      to.y,
      wall.a.x,
      wall.a.y,
      wall.b.x,
      wall.b.y,
    );
    if (gap < least) {
      return false;
    }
  }
  return true;
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

/** Finds paths on one graph, reusing its scratch from one query to the next. */
export interface PathFinder {
  /**
   * The shortest way for a body from `from` to `to`: the waypoints after
   * `from`, ending at `to`, or `undefined` if there is none. The array
   * is the caller's to keep.
   */
  find(from: Vec2, to: Vec2): readonly Vec2[] | undefined;
}

/** A node's place in the search. */
const UNSEEN = 0;
const OPEN = 1;
const CLOSED = 2;

/** Whether a node can walk straight to the goal; asked once per query, when it is expanded. */
const UNKNOWN = 0;
const SEES_GOAL = 1;
const BLIND = 2;

/**
 * A path finder for `graph`: A* with the straight-line distance as its
 * estimate, over the graph's nodes plus the query's start and goal.
 *
 * Its arrays are allocated once, here, and reset on every query, so the
 * only allocation a query makes is the path it returns. A tie between two
 * equally good open nodes goes to the one opened first: the open list
 * keeps insertion order and the scan takes the first strictly lower
 * estimate, so every attacker takes the same path, tick for tick, as the
 * Map-and-Set search this replaced.
 */
export function createPathFinder(graph: NavGraph): PathFinder {
  // The graph's nodes, then the start, then the goal.
  const count = graph.nodes.length;
  const start = count;
  const goal = count + 1;
  const size = count + 2;
  const cost = new Float64Array(size);
  const estimate = new Float64Array(size);
  const cameFrom = new Int32Array(size);
  const state = new Uint8Array(size);
  const toGoal = new Uint8Array(count);
  const open = new Int32Array(size);
  let opened = 0;
  // The query in progress: set by `find`, read by the helpers below, which
  // are made once rather than per query.
  let from: Vec2 = vec2(0, 0);
  let to: Vec2 = from;

  const point = (i: number): Vec2 =>
    i === start ? from : i === goal ? to : (graph.nodes[i] ?? to);

  /** Reach `next` from `current`, which is `here` from the start. */
  const relax = (current: number, here: number, next: number): void => {
    if (state[next] === CLOSED) {
      return;
    }
    const through = here + distance(point(current), point(next));
    if (through < (cost[next] ?? Number.POSITIVE_INFINITY)) {
      cost[next] = through;
      cameFrom[next] = current;
      if (state[next] === UNSEEN) {
        state[next] = OPEN;
        estimate[next] = distance(point(next), to);
        open[opened] = next;
        opened += 1;
      }
    }
  };

  return {
    find(queryFrom, queryTo) {
      if (isClear(graph, queryFrom, queryTo)) {
        return [queryTo];
      }
      from = queryFrom;
      to = queryTo;
      cost.fill(Number.POSITIVE_INFINITY);
      cameFrom.fill(-1);
      state.fill(UNSEEN);
      toGoal.fill(UNKNOWN);

      cost[start] = 0;
      state[start] = OPEN;
      estimate[start] = distance(from, to);
      open[0] = start;
      opened = 1;
      while (opened > 0) {
        let at = 0;
        let best = Number.POSITIVE_INFINITY;
        for (let k = 0; k < opened; k += 1) {
          const i = open[k] ?? start;
          const guess = (cost[i] ?? Number.POSITIVE_INFINITY) + (estimate[i] ?? 0);
          if (guess < best) {
            best = guess;
            at = k;
          }
        }
        const current = open[at] ?? start;
        if (current === goal) {
          const path: Vec2[] = [];
          for (let i = goal; i !== start && i !== -1; i = cameFrom[i] ?? -1) {
            path.push(point(i));
          }
          return path.reverse();
        }
        // An ordered removal keeps the open list in insertion order.
        open.copyWithin(at, at + 1, opened);
        opened -= 1;
        state[current] = CLOSED;

        const here = cost[current] ?? Number.POSITIVE_INFINITY;
        if (current === start) {
          for (let j = 0; j < count; j += 1) {
            const node = graph.nodes[j];
            if (
              node !== undefined &&
              distance(node, from) > ARRIVED &&
              isClear(graph, from, node)
            ) {
              relax(current, here, j);
            }
          }
        } else {
          for (const next of graph.edges[current] ?? []) {
            relax(current, here, next);
          }
          if (toGoal[current] === UNKNOWN) {
            toGoal[current] = isClear(graph, point(current), to) ? SEES_GOAL : BLIND;
          }
          if (toGoal[current] === SEES_GOAL) {
            relax(current, here, goal);
          }
        }
      }
      return undefined;
    },
  };
}
