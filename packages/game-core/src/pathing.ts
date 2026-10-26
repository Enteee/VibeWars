import {
  closestPointOnSegment,
  distancePointToSegment,
  distanceSegmentToSegmentXY,
  type Segment,
} from "./geometry.js";
import { add, distance, scale, sub, vec2, type Vec2 } from "./vec2.js";

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
  /** The map's size; `undefined` for a field with no edge. */
  readonly bounds: { readonly width: number; readonly height: number } | undefined;
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

/**
 * The side of a wall grid's square cell, in world units (#542). On the
 * tick bench (252 walls on 4000², 8v8 walking across), p95 per tick
 * under plain Node was 1.7 ms at 50, 1.5 at 100 and 150, 1.6 at 200, and
 * 1.8 to 4.5 at 300: smaller cells cost more cells per walk, bigger ones
 * more walls per cell. 100 is a body and a half across: a pillar or two.
 */
const WALL_CELL = 100;

/**
 * The walls bucketed by a uniform grid of `WALL_CELL` squares (#542): a
 * broad phase, so a query tests only the walls in the cells it touches,
 * not all of them. A cell is [k·WALL_CELL, (k + 1)·WALL_CELL) on each
 * axis. A wall is in every cell its bounding box has a point in, and a
 * query reads every cell its own region has a point in, so a wall and a
 * query that share a point, on a cell edge or a corner too, share the
 * cell that point is in. The grid may hand a query an extra wall, never
 * drop one, and every answer is the one a scan of all walls gives.
 */
interface WallGrid {
  readonly walls: readonly Segment[];
  readonly clearance: number;
  /** The walls' bounding box's top left; outside the box there are no walls. */
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
  /** Row by row, each cell's walls, by index, ascending. */
  readonly cells: readonly (readonly number[])[];
  /** Per wall, the query that last read it, so a wall in several cells is tested once. */
  readonly stamp: Uint32Array;
  query: number;
}

function buildWallGrid(walls: readonly Segment[], clearance: number): WallGrid {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const { a, b } of walls) {
    x0 = Math.min(x0, a.x, b.x);
    y0 = Math.min(y0, a.y, b.y);
    x1 = Math.max(x1, a.x, b.x);
    y1 = Math.max(y1, a.y, b.y);
  }
  const cols = walls.length === 0 ? 0 : Math.floor((x1 - x0) / WALL_CELL) + 1;
  const rows = walls.length === 0 ? 0 : Math.floor((y1 - y0) / WALL_CELL) + 1;
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  const grid: WallGrid = {
    walls,
    clearance,
    x0,
    y0,
    cols,
    rows,
    cells,
    stamp: new Uint32Array(walls.length),
    query: 0,
  };
  walls.forEach((wall, index) => {
    const c0 = firstCell(Math.min(wall.a.x, wall.b.x), x0);
    const c1 = lastCell(Math.max(wall.a.x, wall.b.x), x0, cols);
    const r0 = firstCell(Math.min(wall.a.y, wall.b.y), y0);
    const r1 = lastCell(Math.max(wall.a.y, wall.b.y), y0, rows);
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        cells[row * cols + col]?.push(index);
      }
    }
  });
  return grid;
}

/**
 * The first and last cell `low … high` touches on one axis, clamped to
 * the grid; first past last when it misses the grid. Two numbers, not a
 * pair, so a query allocates nothing. Not a number reads to the grid's
 * end, so a NaN query sees every wall, as a scan would.
 */
function firstCell(low: number, origin: number): number {
  return Number.isNaN(low) ? 0 : Math.max(0, Math.floor((low - origin) / WALL_CELL));
}

function lastCell(high: number, origin: number, count: number): number {
  return Number.isNaN(high)
    ? count - 1
    : Math.min(count - 1, Math.floor((high - origin) / WALL_CELL));
}

/** A new query on `grid`: every wall unread by it. */
function nextQuery(grid: WallGrid): number {
  if (grid.query === 0xffffffff) {
    grid.stamp.fill(0);
    grid.query = 0;
  }
  grid.query += 1;
  return grid.query;
}

/** Each graph's grid, built once with it; kept off the graph, which stays plain data. */
const GRIDS = new WeakMap<NavGraph, WallGrid>();

function gridOf(graph: NavGraph): WallGrid {
  let grid = GRIDS.get(graph);
  if (grid === undefined) {
    grid = buildWallGrid(graph.walls, graph.clearance);
    GRIDS.set(graph, grid);
  }
  return grid;
}

/**
 * Whether a body can walk straight from `from` to `to`. Allocates
 * nothing: it runs per node, per attacker, per tick (#267).
 *
 * It reads only the cells the walk passes within `least` of (#542): for
 * each row, the stretch of the walk inside that row's band, grown by
 * `least` and a unit more against rounding. A wall that comes within
 * `least` of the walk has its nearest point in such a cell, and so is
 * read. The box of a long diagonal walk would be most of the field.
 * A walk off the number line reads every wall, as a scan would.
 */
function isClear(grid: WallGrid, from: Vec2, to: Vec2): boolean {
  const least = grid.clearance - CLEAR_TOLERANCE;
  const left = Math.min(from.x, to.x) - least;
  const right = Math.max(from.x, to.x) + least;
  const top = Math.min(from.y, to.y) - least;
  const bottom = Math.max(from.y, to.y) + least;
  if (
    !Number.isFinite(from.x) ||
    !Number.isFinite(from.y) ||
    !Number.isFinite(to.x) ||
    !Number.isFinite(to.y)
  ) {
    return grid.walls.every((wall) => clearOf(wall, from, to, least, left, right, top, bottom));
  }
  const reach = least + 1;
  const r0 = firstCell(top - 1, grid.y0);
  const r1 = lastCell(bottom + 1, grid.y0, grid.rows);
  const dy = to.y - from.y;
  const query = nextQuery(grid);
  for (let row = r0; row <= r1; row += 1) {
    // The part of the walk within `reach` of this row's band, as t along it.
    const low = grid.y0 + row * WALL_CELL - reach;
    const high = low + WALL_CELL + 2 * reach;
    let t0 = 0;
    let t1 = 1;
    if (dy !== 0) {
      const a = (low - from.y) / dy;
      const b = (high - from.y) / dy;
      t0 = Math.max(0, Math.min(a, b));
      t1 = Math.min(1, Math.max(a, b));
    } else if (from.y < low || from.y > high) {
      continue;
    }
    if (t0 > t1) {
      continue;
    }
    const xa = from.x + (to.x - from.x) * t0;
    const xb = from.x + (to.x - from.x) * t1;
    const c0 = firstCell(Math.min(xa, xb) - reach, grid.x0);
    const c1 = lastCell(Math.max(xa, xb) + reach, grid.x0, grid.cols);
    for (let col = c0; col <= c1; col += 1) {
      for (const index of grid.cells[row * grid.cols + col] ?? NO_WALLS) {
        if (grid.stamp[index] === query) {
          continue;
        }
        grid.stamp[index] = query;
        const wall = grid.walls[index];
        if (wall !== undefined && !clearOf(wall, from, to, least, left, right, top, bottom)) {
          return false;
        }
      }
    }
  }
  return true;
}

/** Whether a body can walk straight from `from` to `to` on `graph`'s map. */
export function walkIsClear(graph: NavGraph, from: Vec2, to: Vec2): boolean {
  return isClear(gridOf(graph), from, to);
}

const NO_WALLS: readonly number[] = [];

/** Whether the walk from `from` to `to` keeps `least` from `wall`; the box is the walk's, grown by `least`. */
function clearOf(
  wall: Segment,
  from: Vec2,
  to: Vec2,
  least: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
): boolean {
  // Nowhere near: the cheap test first, as it settles most walls.
  if (
    Math.max(wall.a.x, wall.b.x) < left ||
    Math.min(wall.a.x, wall.b.x) > right ||
    Math.max(wall.a.y, wall.b.y) < top ||
    Math.min(wall.a.y, wall.b.y) > bottom
  ) {
    return true;
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
  return near >= least;
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

  const grid = buildWallGrid(walls, clearance);
  const edges = nodes.map((node, i) =>
    nodes.flatMap((other, j) => (i !== j && isClear(grid, node, other) ? [j] : [])),
  );
  const graph: NavGraph = { walls, bounds, clearance, nodes, edges };
  GRIDS.set(graph, grid);
  return graph;
}

/**
 * Whether a body can stand at `point`: on the map, clear of every wall,
 * and not inside one. Every wall is a closed outline (a map's rectangle
 * or polygon), so a ray to the right that crosses an odd number of sides
 * starts inside one, however far away its sides are.
 *
 * On the grid (#542): the walls within the clearance are those in the
 * cells round the point, and every side the ray crosses is in the
 * point's row of cells, from its column to the grid's edge, since the
 * crossing lies in that side's box. The ray walks that row.
 */
function isStandable(graph: NavGraph, point: Vec2): boolean {
  const { bounds, clearance } = graph;
  if (
    bounds !== undefined &&
    (point.x < clearance ||
      point.y < clearance ||
      point.x > bounds.width - clearance ||
      point.y > bounds.height - clearance)
  ) {
    return false;
  }
  const grid = gridOf(graph);
  const c0 = firstCell(point.x - clearance, grid.x0);
  const c1 = lastCell(point.x + clearance, grid.x0, grid.cols);
  const r0 = firstCell(point.y - clearance, grid.y0);
  const r1 = lastCell(point.y + clearance, grid.y0, grid.rows);
  const near = nextQuery(grid);
  for (let row = r0; row <= r1; row += 1) {
    for (let col = c0; col <= c1; col += 1) {
      for (const index of grid.cells[row * grid.cols + col] ?? NO_WALLS) {
        if (grid.stamp[index] === near) {
          continue;
        }
        grid.stamp[index] = near;
        const wall = grid.walls[index];
        if (wall !== undefined && distancePointToSegment(point, wall) < clearance) {
          return false;
        }
      }
    }
  }

  let crossings = 0;
  // A point off the grid's rows has no side crossing its ray, nor does a NaN one.
  const row = Math.floor((point.y - grid.y0) / WALL_CELL);
  const first = Math.max(0, Math.floor((point.x - grid.x0) / WALL_CELL));
  const ray = nextQuery(grid);
  if (row >= 0 && row < grid.rows) {
    for (let col = first; col < grid.cols; col += 1) {
      for (const index of grid.cells[row * grid.cols + col] ?? NO_WALLS) {
        if (grid.stamp[index] === ray) {
          continue;
        }
        grid.stamp[index] = ray;
        const wall = grid.walls[index];
        if (wall === undefined) {
          continue;
        }
        const { a, b } = wall;
        if (a.y > point.y !== b.y > point.y) {
          const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
          if (x > point.x) {
            crossings += 1;
          }
        }
      }
    }
  }
  return crossings % 2 === 0;
}

/**
 * The nearest spot to `point` a body fits on, for a walk to aim at (#310).
 * That is `point` itself if a body fits there, once pulled onto the map.
 * A point inside a wall, or too close to one, is pushed straight out of
 * the nearest side, clear of it by the clearance and a unit, as corner
 * nodes are. If that lands too close to another wall, the nearest
 * corner node is used instead. On a map with no such spot, `point` comes
 * back pulled onto the map, for the path finder to refuse.
 */
export function nearestStandable(graph: NavGraph, point: Vec2): Vec2 {
  const { bounds, clearance } = graph;
  const onMap =
    bounds === undefined
      ? point
      : vec2(
          Math.min(Math.max(point.x, clearance), bounds.width - clearance),
          Math.min(Math.max(point.y, clearance), bounds.height - clearance),
        );
  if (isStandable(graph, onMap)) {
    return onMap;
  }
  let best = onMap;
  let bestDistance = Number.POSITIVE_INFINITY;
  const consider = (candidate: Vec2): void => {
    const away = distance(onMap, candidate);
    if (away < bestDistance && isStandable(graph, candidate)) {
      best = candidate;
      bestDistance = away;
    }
  };
  const offset = clearance + 1;
  for (const wall of graph.walls) {
    const along = sub(wall.b, wall.a);
    const span = Math.hypot(along.x, along.y);
    if (span === 0) {
      continue;
    }
    const normal = vec2(-along.y / span, along.x / span);
    const foot = closestPointOnSegment(onMap, wall);
    consider(add(foot, scale(normal, offset)));
    consider(add(foot, scale(normal, -offset)));
  }
  for (const node of graph.nodes) {
    consider(node);
  }
  return best;
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
  readonly #grid: WallGrid;
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
    this.#grid = gridOf(graph);
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
    if (isClear(this.#grid, from, to)) {
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
          if (
            node !== undefined &&
            distance(node, from) > ARRIVED &&
            isClear(this.#grid, from, node)
          ) {
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
        node !== undefined && isClear(this.#grid, node, this.#to) ? GOAL_CLEAR : GOAL_BLOCKED;
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
