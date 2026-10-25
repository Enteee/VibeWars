import { distancePointToSegment, distanceSegmentToSegmentXY, type Segment } from "./geometry.js";
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

/** Whether a body can walk straight from `from` to `to`. Allocates nothing: it runs per wall, per node, per attacker, per tick (#267). */
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
    const near = distanceSegmentToSegmentXY(
      from.x,
      from.y,
      to.x,
      to.y,
      wall.a.x,
      wall.a.y,
      wall.b.x,
      wall.b.y,
    );
    if (!(near >= least)) {
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

/** Finds paths on one graph, reusing its own scratch from one query to the next. */
export interface PathFinder {
  /**
   * The shortest way for a body from `from` to `to`: the waypoints after
   * `from`, ending at `to`, or `undefined` if there is none. A fresh
   * array the caller may keep.
   */
  find(from: Vec2, to: Vec2): readonly Vec2[] | undefined;
}

/**
 * A path finder for `graph`: A* with the straight-line distance as its
 * estimate (#211). It runs for every approaching attacker on every tick,
 * so it allocates its state once, here, and only the path it returns per
 * query (#267).
 */
export function createPathFinder(graph: NavGraph): PathFinder {
  return new AStar(graph);
}

/** Where a vertex stands in one search. */
const UNSEEN = 0;
const OPEN = 1;
const CLOSED = 2;

/** Whether a node sees the goal, asked once per search, when it is expanded. */
const GOAL_UNKNOWN = 0;
const GOAL_CLEAR = 1;
const GOAL_BLOCKED = 2;

const NO_EDGES: readonly number[] = [];

class AStar implements PathFinder {
  readonly #graph: NavGraph;
  /** Vertices are the graph's nodes, then `from`, then `to`. */
  readonly #start: number;
  readonly #goal: number;
  readonly #cost: Float64Array;
  /** The vertex each was reached from, or -1. */
  readonly #cameFrom: Int32Array;
  readonly #state: Uint8Array;
  readonly #seesGoal: Uint8Array;
  /**
   * The open vertices, in the order they were first opened: on a tie the
   * earliest wins, as it did when this was a `Set`, so every path stays
   * the same (#267).
   */
  readonly #open: Int32Array;
  #openCount = 0;
  #from: Vec2 = { x: 0, y: 0 };
  #to: Vec2 = { x: 0, y: 0 };

  public constructor(graph: NavGraph) {
    this.#graph = graph;
    const count = graph.nodes.length;
    this.#start = count;
    this.#goal = count + 1;
    this.#cost = new Float64Array(count + 2);
    this.#cameFrom = new Int32Array(count + 2);
    this.#state = new Uint8Array(count + 2);
    this.#seesGoal = new Uint8Array(count);
    this.#open = new Int32Array(count + 2);
  }

  public find(from: Vec2, to: Vec2): readonly Vec2[] | undefined {
    const graph = this.#graph;
    if (isClear(graph, from, to)) {
      return [to];
    }

    this.#from = from;
    this.#to = to;
    this.#cost.fill(Number.POSITIVE_INFINITY);
    this.#cameFrom.fill(-1);
    this.#state.fill(UNSEEN);
    this.#seesGoal.fill(GOAL_UNKNOWN);
    this.#openCount = 0;

    const start = this.#start;
    const goal = this.#goal;
    this.#cost[start] = 0;
    this.#opened(start);
    while (this.#openCount > 0) {
      let current = start;
      let at = -1;
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < this.#openCount; k += 1) {
        const i = this.#open[k] ?? start;
        const estimate = (this.#cost[i] ?? Number.POSITIVE_INFINITY) + distance(this.#point(i), to);
        if (estimate < best) {
          best = estimate;
          current = i;
          at = k;
        }
      }
      if (current === goal) {
        return this.#path();
      }
      if (at >= 0) {
        // Ordered removal, so the rest keep the order they were opened in.
        this.#open.copyWithin(at, at + 1, this.#openCount);
        this.#openCount -= 1;
      }
      this.#state[current] = CLOSED;

      const here = this.#cost[current] ?? Number.POSITIVE_INFINITY;
      if (current === start) {
        // The nodes `from` sees, in node order, skipping one it stands on.
        for (let j = 0; j < graph.nodes.length; j += 1) {
          const node = graph.nodes[j];
          if (node !== undefined && distance(node, from) > ARRIVED && isClear(graph, from, node)) {
            this.#relax(current, j, here);
          }
        }
      } else {
        for (const next of graph.edges[current] ?? NO_EDGES) {
          this.#relax(current, next, here);
        }
        if (this.#nodeSeesGoal(current)) {
          this.#relax(current, goal, here);
        }
      }
    }
    return undefined;
  }

  #point(i: number): Vec2 {
    return i === this.#start
      ? this.#from
      : i === this.#goal
        ? this.#to
        : (this.#graph.nodes[i] ?? this.#to);
  }

  #opened(i: number): void {
    this.#state[i] = OPEN;
    this.#open[this.#openCount] = i;
    this.#openCount += 1;
  }

  #relax(current: number, next: number, here: number): void {
    if (this.#state[next] === CLOSED) {
      return;
    }
    const through = here + distance(this.#point(current), this.#point(next));
    if (through < (this.#cost[next] ?? Number.POSITIVE_INFINITY)) {
      this.#cost[next] = through;
      this.#cameFrom[next] = current;
      if (this.#state[next] === UNSEEN) {
        this.#opened(next);
      }
    }
  }

  /** Whether node `i` sees the goal: tested the first time `i` is expanded, then remembered. */
  #nodeSeesGoal(i: number): boolean {
    if (this.#seesGoal[i] === GOAL_UNKNOWN) {
      const node = this.#graph.nodes[i];
      this.#seesGoal[i] =
        node !== undefined && isClear(this.#graph, node, this.#to) ? GOAL_CLEAR : GOAL_BLOCKED;
    }
    return this.#seesGoal[i] === GOAL_CLEAR;
  }

  /** The waypoints from `from` to the goal, as `cameFrom` records them. */
  #path(): Vec2[] {
    const path: Vec2[] = [];
    for (let at = this.#goal; at !== -1 && at !== this.#start; at = this.#cameFrom[at] ?? -1) {
      path.push(this.#point(at));
    }
    return path.reverse();
  }
}
