import {
  closestPointOnPolygon,
  closestPointOnSegment,
  distancePointToSegment,
  distanceSegmentToSegmentXY,
  lengthInPolygon,
  pointInPolygon,
  pointAlong,
  polygonCentre,
  type Polygon,
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
  /** The walls that enclose nothing (`outlineWalls` of them) first, then the real walls. */
  readonly walls: readonly Segment[];
  /**
   * How many of `walls` enclose nothing: the walkable areas' outline, which
   * keeps a body on its layer, and its open walls, such as ramp rims (#2975).
   */
  readonly outlineWalls: number;
  /** Where a body can be (ADR-0051); empty: everywhere, the ground. */
  readonly walkable: readonly Polygon[];
  /** The map's size; `undefined` for a field with no edge. */
  readonly bounds: { readonly width: number; readonly height: number } | undefined;
  readonly clearance: number;
  readonly nodes: readonly Vec2[];
  /** For each node, the nodes a body can walk to in a straight line. */
  readonly edges: readonly (readonly number[])[];
  /** Beside `edges`: what each walk costs, its length with harmful ground counted `HARMFUL_ZONE_COST` times. */
  readonly costs: readonly (readonly number[])[];
  /** The harmful ground on this layer (#3026): walks through it cost more. */
  readonly zones: readonly CostZone[];
}

/** Harmful ground on a layer, as paths read it (#3026). */
export interface NavZone {
  readonly layer: number;
  readonly polygon: Polygon;
}

/**
 * What a unit walked inside harmful ground costs a route (#3026): a bot
 * takes a detour round a 100-wide strip if it is at most 200 longer, and
 * crosses otherwise. Zones cost, they never block.
 */
export const HARMFUL_ZONE_COST = 3;

/** Harmful ground as `walkCost` reads it: its polygon and the box round it. */
export interface CostZone {
  readonly polygon: Polygon;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** `polygon` with its box, worked out once rather than on every walk. */
export function costZone(polygon: Polygon): CostZone {
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const corner of polygon) {
    left = Math.min(left, corner.x);
    right = Math.max(right, corner.x);
    top = Math.min(top, corner.y);
    bottom = Math.max(bottom, corner.y);
  }
  return { polygon, left, right, top, bottom };
}

/** What the walk from `a` to `b` costs a route: its length, and twice more for each unit of it in `zones`. */
export function walkCost(zones: readonly CostZone[], a: Vec2, b: Vec2): number {
  let inside = 0;
  for (const zone of zones) {
    // Nowhere near: the box test settles most walks.
    if (
      Math.max(a.x, b.x) > zone.left &&
      Math.min(a.x, b.x) < zone.right &&
      Math.max(a.y, b.y) > zone.top &&
      Math.min(a.y, b.y) < zone.bottom
    ) {
      inside += lengthInPolygon(a, b, zone.polygon);
    }
  }
  return distance(a, b) + (HARMFUL_ZONE_COST - 1) * inside;
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
 * `clearance`, routing round harmful `zones` where that is shorter. Without
 * `bounds` the field has no edge.
 */
export function buildNavGraph(
  walls: readonly Segment[],
  bounds: NavGraph["bounds"],
  clearance: number,
  zones: readonly Polygon[],
): NavGraph {
  return navGraphFor(buildGatedNavGraph(walls, [], bounds, clearance, zones), 0);
}

/** How far a point must be from another area's side to count as inside it. */
const OUTLINE_EPSILON = 1e-6;

function insideArea(point: Vec2, area: Polygon): boolean {
  return (
    pointInPolygon(point, area) &&
    distance(point, closestPointOnPolygon(point, area)) > OUTLINE_EPSILON
  );
}

/** Where along `edge`, 0 to 1, `side` crosses or ends on it. */
function cutsAlong(edge: Segment, side: Segment, cuts: number[]): void {
  const ex = edge.b.x - edge.a.x;
  const ey = edge.b.y - edge.a.y;
  const sx = side.b.x - side.a.x;
  const sy = side.b.y - side.a.y;
  const denominator = ex * sy - ey * sx;
  if (denominator !== 0) {
    const t = ((side.a.x - edge.a.x) * sy - (side.a.y - edge.a.y) * sx) / denominator;
    const u = ((side.a.x - edge.a.x) * ey - (side.a.y - edge.a.y) * ex) / denominator;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) {
      cuts.push(t);
    }
    return;
  }
  const lengthSquared = ex * ex + ey * ey;
  for (const end of [side.a, side.b]) {
    if (distancePointToSegment(end, edge) <= OUTLINE_EPSILON && lengthSquared > 0) {
      const t = ((end.x - edge.a.x) * ex + (end.y - edge.a.y) * ey) / lengthSquared;
      if (t > 0 && t < 1) {
        cuts.push(t);
      }
    }
  }
}

function sidesOf(area: Polygon): Segment[] {
  return area.flatMap((corner, at) => {
    const next = area[(at + 1) % area.length];
    return next === undefined ? [] : [{ a: corner, b: next }];
  });
}

/** How far either side of a shared side `walkableOutline` looks for floor. */
const ABUT_PROBE = 0.01;

/**
 * The edge of a layer's walkable `areas`: each area's sides, split where
 * they meet another area's, keeping the parts not inside another area.
 * A deck and its ramp overlap, so the opening between them is no edge;
 * nor is a side two areas share end to end, a pit's and its tunnel's
 * (#2973), with floor on both sides of it.
 */
export function walkableOutline(areas: readonly Polygon[]): Segment[] {
  const outline: Segment[] = [];
  areas.forEach((area, at) => {
    const others = areas.filter((_, other) => other !== at);
    for (const edge of sidesOf(area)) {
      const cuts = [0, 1];
      for (const other of others) {
        for (const side of sidesOf(other)) {
          cutsAlong(edge, side, cuts);
        }
      }
      cuts.sort((a, b) => a - b);
      const along = sub(edge.b, edge.a);
      cuts.forEach((from, index) => {
        const to = cuts[index + 1];
        if (to === undefined || to - from <= OUTLINE_EPSILON) {
          return;
        }
        const middle = add(edge.a, scale(along, (from + to) / 2));
        const length = Math.hypot(along.x, along.y);
        const across = scale({ x: -along.y, y: along.x }, ABUT_PROBE / length);
        const floor = (point: Vec2): boolean => areas.some((each) => pointInPolygon(point, each));
        const abutted = floor(add(middle, across)) && floor(sub(middle, across));
        if (!others.some((other) => insideArea(middle, other)) && !abutted) {
          outline.push({
            a: add(edge.a, scale(along, from)),
            b: add(edge.a, scale(along, to)),
          });
        }
      });
    }
  });
  return outline;
}

/**
 * Every graph a map's gates can make (#2691), built once: the nodes of
 * the map and of every gate, and for each node and edge the gates, as
 * bits, that rule it out when closed. `navGraphFor` reads one combination
 * off it, so a gate moving mid-match costs a filter and no line of sight.
 */
export interface GatedNavGraph {
  /** As `NavGraph`'s: the walls that enclose nothing first, then the others. */
  readonly walls: readonly Segment[];
  readonly outlineWalls: number;
  readonly walkable: readonly Polygon[];
  readonly gates: readonly (readonly Segment[])[];
  readonly bounds: NavGraph["bounds"];
  readonly clearance: number;
  readonly nodes: readonly Vec2[];
  /** The gates whose corner each node is; 0 for a corner of the map, there however they stand. */
  readonly cornerOf: readonly number[];
  /** The gates each node would be too close to. */
  readonly nodeBlockedBy: readonly number[];
  readonly edges: readonly (readonly number[])[];
  /** Beside `edges`: the gates each edge crosses. */
  readonly edgeBlockedBy: readonly (readonly number[])[];
  /** Beside `edges`: what each walk costs, as `NavGraph`'s. */
  readonly costs: readonly (readonly number[])[];
  readonly zones: readonly CostZone[];
}

/** See `GatedNavGraph`; each of `gates` is one gate's segments. */
export function buildGatedNavGraph(
  mapWalls: readonly Segment[],
  gates: readonly (readonly Segment[])[],
  bounds: NavGraph["bounds"],
  clearance: number,
  zones: readonly Polygon[],
  walkable: readonly Polygon[] = [],
  open: readonly Segment[] = [],
): GatedNavGraph {
  const outline = walkableOutline(walkable);
  const walls = [...outline, ...open, ...mapWalls];
  const offset = clearance + 1;
  const inside = (point: Vec2): boolean =>
    (walkable.length === 0 || walkable.some((area) => pointInPolygon(point, area))) &&
    (bounds === undefined ||
      (point.x >= clearance &&
        point.y >= clearance &&
        point.x <= bounds.width - clearance &&
        point.y <= bounds.height - clearance));

  const corners = new Map<string, { readonly at: Vec2; gates: number }>();
  const addCorners = (segments: readonly Segment[], gateBit: number): void => {
    for (const wall of segments) {
      for (const end of [wall.a, wall.b]) {
        const key = `${String(end.x)},${String(end.y)}`;
        const known = corners.get(key);
        if (known === undefined) {
          corners.set(key, { at: end, gates: gateBit });
        } else if (known.gates !== 0) {
          known.gates |= gateBit;
        }
      }
    }
  };
  addCorners(walls, 0);
  gates.forEach((segments, at) => {
    addCorners(segments, 1 << at);
  });

  const nodes: Vec2[] = [];
  const cornerOf: number[] = [];
  const nodeBlockedBy: number[] = [];
  const addNode = (node: Vec2, gateBits: number): void => {
    if (inside(node) && walls.every((wall) => distancePointToSegment(node, wall) >= clearance)) {
      let blockedBy = 0;
      gates.forEach((segments, at) => {
        if (segments.some((wall) => distancePointToSegment(node, wall) < clearance)) {
          blockedBy |= 1 << at;
        }
      });
      nodes.push(node);
      cornerOf.push(gateBits);
      nodeBlockedBy.push(blockedBy);
    }
  };
  for (const corner of corners.values()) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      addNode(vec2(corner.at.x + dx * offset, corner.at.y + dy * offset), corner.gates);
    }
  }
  // A corner off each harmful zone's, outside every zone, or no route
  // could go round one (#3026). Zone order, then corner order (#267).
  for (const zone of zones) {
    for (let at = 0; at < zone.length; at += 1) {
      const node = offZoneCorner(zone, at, offset);
      if (node !== undefined && !zones.some((other) => pointInPolygon(node, other))) {
        addNode(node, 0);
      }
    }
  }

  const grid = buildWallGrid(walls, clearance);
  const gateGrids = gates.map((segments) => buildWallGrid(segments, clearance));
  const costZones = zones.map(costZone);
  const edges: number[][] = [];
  const edgeBlockedBy: number[][] = [];
  const costs: number[][] = [];
  nodes.forEach((node, i) => {
    const seen: number[] = [];
    const crossed: number[] = [];
    const cost: number[] = [];
    nodes.forEach((other, j) => {
      if (i !== j && isClear(grid, node, other)) {
        let blockedBy = 0;
        gateGrids.forEach((gateGrid, at) => {
          if (!isClear(gateGrid, node, other)) {
            blockedBy |= 1 << at;
          }
        });
        seen.push(j);
        crossed.push(blockedBy);
        cost.push(walkCost(costZones, node, other));
      }
    });
    edges.push(seen);
    edgeBlockedBy.push(crossed);
    costs.push(cost);
  });
  return {
    walls,
    outlineWalls: outline.length + open.length,
    walkable,
    gates,
    bounds,
    clearance,
    nodes,
    cornerOf,
    nodeBlockedBy,
    edges,
    edgeBlockedBy,
    costs,
    zones: costZones,
  };
}

/**
 * The spot `offset` out from `zone`'s corner `at` on each side's line, along
 * the corner's bisector, away from the zone; `undefined` for a corner with
 * no outside to it.
 */
function offZoneCorner(zone: Polygon, at: number, offset: number): Vec2 | undefined {
  const corner = zone[at];
  const before = zone[(at + zone.length - 1) % zone.length];
  const after = zone[(at + 1) % zone.length];
  if (corner === undefined || before === undefined || after === undefined) {
    return undefined;
  }
  const inward = sub(before, corner);
  const onward = sub(after, corner);
  const a = Math.hypot(inward.x, inward.y);
  const b = Math.hypot(onward.x, onward.y);
  if (a === 0 || b === 0) {
    return undefined;
  }
  // The sum of the two sides' unit vectors points into the corner's angle;
  // the far side of it, out of the zone at a convex corner.
  const bisector = add(scale(inward, 1 / a), scale(onward, 1 / b));
  const length = Math.hypot(bisector.x, bisector.y);
  const out = length < 1e-9 ? vec2(-inward.y / a, inward.x / a) : scale(bisector, -1 / length);
  // `offset` from both sides' lines: `offset` over the sine of half the
  // corner's angle along the bisector, a wall corner node's spot at a
  // square corner, and at most three times `offset` at a sharp one.
  const sinHalf = length < 1e-9 ? 1 : Math.sqrt(Math.max(0, 1 - (length / 2) ** 2));
  const reach = offset / Math.max(sinHalf, 1 / 3);
  const outside = add(corner, scale(out, reach));
  if (!pointInPolygon(outside, zone)) {
    return outside;
  }
  const flipped = add(corner, scale(out, -reach));
  return pointInPolygon(flipped, zone) ? undefined : flipped;
}

/** The graph for the gates in `closed`, a bit each, as `buildNavGraph` would build it. */
export function navGraphFor(gated: GatedNavGraph, closed: number): NavGraph {
  const { bounds, clearance, cornerOf, nodeBlockedBy, edgeBlockedBy } = gated;
  const walls = [
    ...gated.walls,
    ...gated.gates.flatMap((gate, at) => ((closed & (1 << at)) === 0 ? [] : gate)),
  ];
  const renumbered = new Int32Array(gated.nodes.length).fill(-1);
  const nodes: Vec2[] = [];
  gated.nodes.forEach((node, i) => {
    const corner = cornerOf[i] ?? 0;
    if ((corner === 0 || (corner & closed) !== 0) && ((nodeBlockedBy[i] ?? 0) & closed) === 0) {
      renumbered[i] = nodes.length;
      nodes.push(node);
    }
  });
  const edges: number[][] = [];
  const costs: number[][] = [];
  gated.edges.forEach((seen, i) => {
    if (renumbered[i] === -1) {
      return;
    }
    const crossed = edgeBlockedBy[i] ?? [];
    const walk = gated.costs[i] ?? [];
    const kept: number[] = [];
    const keptCosts: number[] = [];
    seen.forEach((j, at) => {
      const to = renumbered[j] ?? -1;
      if (to !== -1 && ((crossed[at] ?? 0) & closed) === 0) {
        kept.push(to);
        keptCosts.push(walk[at] ?? Number.POSITIVE_INFINITY);
      }
    });
    edges.push(kept);
    costs.push(keptCosts);
  });
  const { outlineWalls, walkable, zones } = gated;
  const graph: NavGraph = {
    walls,
    outlineWalls,
    walkable,
    bounds,
    clearance,
    nodes,
    edges,
    costs,
    zones,
  };
  GRIDS.set(graph, buildWallGrid(walls, clearance));
  return graph;
}

/**
 * Whether a body can stand at `point`: on the map and its walkable areas,
 * clear of every wall, and not inside one. Every wall is a closed outline (a map's rectangle
 * or polygon), so a ray to the right that crosses an odd number of sides
 * starts inside one, however far away its sides are.
 *
 * On the grid (#542): the walls within the clearance are those in the
 * cells round the point, and every side the ray crosses is in the
 * point's row of cells, from its column to the grid's edge, since the
 * crossing lies in that side's box. The ray walks that row.
 */
export function isStandable(graph: NavGraph, point: Vec2): boolean {
  const { bounds, clearance, walkable, outlineWalls } = graph;
  if (walkable.length > 0 && !walkable.some((area) => pointInPolygon(point, area))) {
    return false;
  }
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
        if (wall === undefined || index < outlineWalls) {
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
 * A point of a route, and the layer a body must be on while walking to it
 * (ADR-0051). `teleport` marks a teleport's entry (#3030): the body walks
 * into it rather than past it, and the next waypoint is the exit.
 * `dropOff` marks the landing below a drop-off (#3069): the body walks
 * to it off the edge, though its own layer has no way there.
 */
export type RouteWaypoint = Vec2 & {
  readonly layer: number;
  readonly teleport?: true;
  readonly dropOff?: true;
};

/**
 * A teleport, as paths read it (#3030): one way, from its entry `area` on
 * `from` to `exit` on `to`. Only an on one is given to a path finder.
 */
export interface NavTeleport {
  readonly from: number;
  readonly area: Polygon;
  readonly to: number;
  readonly exit: Vec2;
}

/** A ramp, as paths read it: inside `area` a body moves between `from` and `to`. */
export interface NavTransition {
  readonly from: number;
  readonly to: number;
  readonly area: Polygon;
  /** The way it climbs, a unit vector; none: its portal waypoint is its centre. */
  readonly uphill?: Vec2;
  /** The share of its speed a body crosses it at (#3069): a slow one costs more to path through. */
  readonly pace: number;
}

/**
 * A drop-off (#3069): a stretch `edge` of `layer`'s edge that a body
 * walking `outward` (a unit vector) steps off onto the layer below. One
 * way: from below it is the edge it always was.
 */
export interface NavDropOff {
  readonly layer: number;
  readonly edge: Segment;
  readonly outward: Vec2;
}

/**
 * How far in from the end a body leaves a ramp by its waypoint sits, as a
 * share of its length: a body's clearance in, or the walk to it would run
 * along that end's outline wall and no route would ever be kept (#1157).
 * At most this much, still inside the band where a body changes layer.
 */
const RAMP_WAYPOINT_LEAST_INSET = 0.05;
export const RAMP_WAYPOINT_MOST_INSET = 0.14;

/**
 * The shortest a ramp may be, going uphill, for a body of `clearance` to
 * route over it: any shorter and `RAMP_WAYPOINT_MOST_INSET` holds its
 * waypoints on its outline wall (#2995).
 */
export function minRampLength(clearance: number): number {
  return (clearance + 1) / RAMP_WAYPOINT_MOST_INSET;
}

/** How long a ramp's `area` is, going `uphill`. */
export function rampLength(area: Polygon, uphill: Vec2): number {
  return distance(pointAlong(area, uphill, 0), pointAlong(area, uphill, 1));
}

/** Finds paths over a map's layers, reusing its own scratch from one query to the next. */
export interface LayeredPathFinder {
  /** Every node of every layer, portals included: what the 600-node budget (#2544) counts. */
  readonly nodeCount: number;
  /**
   * The shortest way for a body from `from` on `fromLayer` to `to` on
   * `toLayer`: the waypoints after `from`, ending at `to`, or `undefined`
   * if there is none. A ramp is one waypoint, at the end a body
   * leaves it by, carrying the far layer; going up, a waypoint at its
   * foot comes first, so a body does not cut in under the deck it tops. A fresh array the caller may keep.
   */
  find(from: Vec2, fromLayer: number, to: Vec2, toLayer: number): RouteWaypoint[] | undefined;
}

/** One layer of a map, as `buildLayeredNavGraph` reads it. */
export interface NavLayer {
  readonly walls: readonly Segment[];
  /** Its decks and ramps; empty: everywhere, the ground. */
  readonly walkable: readonly Polygon[];
  /** Walls that stop a body but enclose nothing: its ramp rims (#2975). */
  readonly open: readonly Segment[];
}

/** A gate, with the layer it stands on. */
export interface NavGate {
  readonly layer: number;
  readonly segments: readonly Segment[];
}

/**
 * One `GatedNavGraph` per layer. Each keeps every gate, so a gate's bit
 * means the same on all of them; a gate on another layer has no segments.
 */
export function buildLayeredNavGraph(
  layers: readonly NavLayer[],
  gates: readonly NavGate[],
  bounds: NavGraph["bounds"],
  clearance: number,
  zones: readonly NavZone[],
): readonly GatedNavGraph[] {
  return layers.map((layer, at) =>
    buildGatedNavGraph(
      layer.walls,
      gates.map((gate) => (gate.layer === at ? gate.segments : [])),
      bounds,
      clearance,
      zones.filter((zone) => zone.layer === at).map(({ polygon }) => polygon),
      layer.walkable,
      layer.open,
    ),
  );
}

/**
 * A path finder for `graph`: A* with the straight-line distance as its
 * estimate (#211).
 */
export function createPathFinder(graph: NavGraph): PathFinder {
  const finder = createLayeredPathFinder([graph], []);
  return {
    find: (from, to) => finder.find(from, 0, to, 0)?.map(({ x, y }) => vec2(x, y)),
  };
}

/**
 * A path finder over `graphs`, one a layer, joined at each of
 * `transitions`' centres where a body fits on both layers, and one way
 * by each of `teleports` (#3030), and down each of `dropOffs` (#3069). It runs for every approaching attacker
 * on every tick, so it allocates its state once, here, and only the path
 * it returns per query (#267).
 */
export function createLayeredPathFinder(
  graphs: readonly NavGraph[],
  transitions: readonly NavTransition[],
  teleports: readonly NavTeleport[] = [],
  dropOffs: readonly NavDropOff[] = [],
): LayeredPathFinder {
  return new AStar(graphs, transitions, teleports, dropOffs);
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

const ZERO_POINT: Vec2 = { x: 0, y: 0 };

class AStar implements LayeredPathFinder {
  readonly #graphs: readonly NavGraph[];
  readonly #grids: readonly WallGrid[];
  /** Vertices are every layer's nodes then portals, in layer order, then `from`, then `to`. */
  readonly #points: Vec2[] = [];
  readonly #layerOf: Uint8Array;
  readonly #isPortal: Uint8Array;
  /** Where a route crossing a ramp to this portal vertex is sent. */
  readonly #exits = new Map<number, Vec2>();
  /** The ramp's area and foot, for a portal vertex a route climbs to. */
  readonly #climbs = new Map<number, { readonly area: Polygon; readonly foot: Vec2 }>();
  /** Each teleport's exit vertex, to its entry's (#3030): the one way between them. */
  readonly #teleports = new Map<number, number>();
  /** Each drop-off's landing vertex, to its top's (#3069): the one way between them. */
  readonly #drops = new Map<number, number>();
  /** Every teleport's entry and exit, for the estimate. */
  readonly #entries: readonly Vec2[];
  readonly #teleportExits: readonly Vec2[];
  /** The step into a teleport: what its edge costs. */
  readonly #jumpCost: number;
  /** Each vertex's distance to the nearest teleport entry (#3030). */
  readonly #toEntry: Float64Array;
  /** Through any teleport, the least a route still costs past its nearest entry: set per search. */
  #pastEntry = Number.POSITIVE_INFINITY;
  readonly #edges: number[][] = [];
  /** Beside `#edges`: what each walk costs (#3026). */
  readonly #costs: number[][] = [];
  /** The first vertex of each layer, and one past the last's. */
  readonly #firstOf: Int32Array;
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
  #toLayer = 0;

  public constructor(
    graphs: readonly NavGraph[],
    transitions: readonly NavTransition[],
    teleports: readonly NavTeleport[],
    dropOffs: readonly NavDropOff[],
  ) {
    this.#graphs = graphs;
    this.#grids = graphs.map(gridOf);
    const clearance = graphs[0]?.clearance ?? 0;
    const links = transitions.flatMap((transition) => {
      const point = polygonCentre(transition.area);
      const near = graphs[transition.from];
      const far = graphs[transition.to];
      return near !== undefined &&
        far !== undefined &&
        isStandable(near, point) &&
        isStandable(far, point)
        ? [{ ...transition, point, near: -1, far: -1 }]
        : [];
    });
    // A teleport is two vertices: its entry's centre, and its exit.
    const jumps = teleports.flatMap((teleport) => {
      const entry = polygonCentre(teleport.area);
      const near = graphs[teleport.from];
      const far = graphs[teleport.to];
      return near !== undefined &&
        far !== undefined &&
        isStandable(near, entry) &&
        isStandable(far, teleport.exit)
        ? [{ ...teleport, entry, near: -1, far: -1 }]
        : [];
    });
    // A drop-off is two vertices: a body's clearance in from its middle,
    // on its layer, and as far out, on the layer below.
    const drops = dropOffs.flatMap(({ layer, edge, outward }) => {
      const middle = scale(add(edge.a, edge.b), 0.5);
      const top = add(middle, scale(outward, -(clearance + 1)));
      const landing = add(middle, scale(outward, clearance + 1));
      const near = graphs[layer];
      const far = graphs[layer - 1];
      return near !== undefined &&
        far !== undefined &&
        isStandable(near, top) &&
        isStandable(far, landing)
        ? [{ layer, top, landing, near: -1, far: -1 }]
        : [];
    });
    const layers: number[] = [];
    const portals: boolean[] = [];
    const firsts: number[] = [];
    const portalsOn = graphs.map(() => [] as number[]);
    graphs.forEach((graph, layer) => {
      firsts.push(this.#points.length);
      const base = this.#points.length;
      graph.nodes.forEach((node) => {
        this.#points.push(node);
        layers.push(layer);
        portals.push(false);
      });
      graph.edges.forEach((seen, i) => {
        this.#edges.push(seen.map((j) => base + j));
        this.#costs.push([...(graph.costs[i] ?? [])]);
      });
      for (const link of links) {
        if (link.from === layer || link.to === layer) {
          if (link.from === layer) {
            link.near = this.#points.length;
          } else {
            link.far = this.#points.length;
          }
          portalsOn[layer]?.push(this.#points.length);
          this.#points.push(link.point);
          layers.push(layer);
          portals.push(true);
          this.#edges.push([]);
          this.#costs.push([]);
        }
      }
      for (const jump of jumps) {
        for (const end of ["near", "far"] as const) {
          if ((end === "near" ? jump.from : jump.to) !== layer) {
            continue;
          }
          jump[end] = this.#points.length;
          portalsOn[layer]?.push(this.#points.length);
          this.#points.push(end === "near" ? jump.entry : jump.exit);
          layers.push(layer);
          portals.push(true);
          this.#edges.push([]);
          this.#costs.push([]);
        }
      }
      for (const drop of drops) {
        for (const end of ["near", "far"] as const) {
          if ((end === "near" ? drop.layer : drop.layer - 1) !== layer) {
            continue;
          }
          drop[end] = this.#points.length;
          portalsOn[layer]?.push(this.#points.length);
          this.#points.push(end === "near" ? drop.top : drop.landing);
          layers.push(layer);
          portals.push(true);
          this.#edges.push([]);
          this.#costs.push([]);
        }
      }
    });
    firsts.push(this.#points.length);
    this.#joinPortals(portalsOn, firsts);
    this.#jumpCost = 2 * clearance;
    this.#entries = jumps.map(({ entry }) => entry);
    this.#teleportExits = jumps.map(({ exit }) => exit);
    this.#toEntry = Float64Array.from(this.#points, (point) => this.#nearestEntry(point));
    for (const { near, far } of jumps) {
      // One way, for about a body's length: the step into it.
      this.#edges[near]?.push(far);
      this.#costs[near]?.push(this.#jumpCost);
      this.#teleports.set(far, near);
    }
    for (const { near, far, top, landing } of drops) {
      // One way, the step off the edge.
      this.#edges[near]?.push(far);
      this.#costs[near]?.push(distance(top, landing));
      this.#drops.set(far, near);
    }
    for (const { near, far, area, uphill, pace } of links) {
      // One point on two layers: no way to walk between them, but the walk
      // up to it and on from it, across the ramp, is counted at full speed;
      // a slower one costs what is left of its length over its pace (#3069).
      const length = uphill === undefined ? 0 : rampLength(area, uphill);
      const slowness = length * (1 / pace - 1);
      this.#edges[near]?.push(far);
      this.#costs[near]?.push(slowness);
      this.#edges[far]?.push(near);
      this.#costs[far]?.push(slowness);
      if (uphill !== undefined) {
        const inset = Math.min(
          Math.max(RAMP_WAYPOINT_LEAST_INSET, (clearance + 1) / length),
          RAMP_WAYPOINT_MOST_INSET,
        );
        const foot = pointAlong(area, uphill, inset);
        this.#exits.set(near, foot);
        this.#exits.set(far, pointAlong(area, uphill, 1 - inset));
        this.#climbs.set(far, { area, foot });
      }
    }
    this.#layerOf = Uint8Array.from(layers);
    this.#isPortal = Uint8Array.from(portals, Number);
    this.#firstOf = Int32Array.from(firsts);
    const count = this.#points.length;
    this.#start = count;
    this.#goal = count + 1;
    this.#cost = new Float64Array(count + 2);
    this.#cameFrom = new Int32Array(count + 2);
    this.#state = new Uint8Array(count + 2);
    this.#seesGoal = new Uint8Array(count);
    this.#open = new Int32Array(count + 2);
  }

  /** Each portal to the nodes and the other portals it sees on its own layer. */
  #joinPortals(portalsOn: readonly (readonly number[])[], firsts: readonly number[]): void {
    portalsOn.forEach((portals, layer) => {
      const grid = this.#grids[layer];
      const first = firsts[layer] ?? 0;
      const last = firsts[layer + 1] ?? first;
      const zones = this.#graphs[layer]?.zones ?? [];
      if (grid === undefined) {
        return;
      }
      for (const portal of portals) {
        const point = this.#points[portal] ?? ZERO_POINT;
        for (let vertex = first; vertex < last; vertex += 1) {
          const other = this.#points[vertex];
          if (vertex !== portal && other !== undefined && isClear(grid, point, other)) {
            const cost = walkCost(zones, point, other);
            this.#edges[portal]?.push(vertex);
            this.#costs[portal]?.push(cost);
            if (!portals.includes(vertex)) {
              this.#edges[vertex]?.push(portal);
              this.#costs[vertex]?.push(cost);
            }
          }
        }
      }
    });
  }

  public get nodeCount(): number {
    return this.#points.length;
  }

  public find(
    from: Vec2,
    fromLayer: number,
    to: Vec2,
    toLayer: number,
  ): RouteWaypoint[] | undefined {
    // No estimate to a point off every number line is ever the best (#2735).
    if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) {
      return undefined;
    }
    const start = this.#graphs[fromLayer];
    const end = this.#graphs[toLayer];
    if (start === undefined || end === undefined) {
      return undefined;
    }
    if (end.walkable.length > 0 && !isStandable(end, to)) {
      return undefined;
    }
    if (start.walkable.length > 0 && !isStandable(start, from)) {
      // At a deck's edge, legal but inside the outline's clearance.
      const spot = nearestStandable(start, from);
      if (!isStandable(start, spot)) {
        return undefined;
      }
      const rest = this.#search(spot, fromLayer, to, toLayer);
      return rest === undefined ? undefined : [{ ...spot, layer: fromLayer }, ...rest];
    }
    return this.#search(from, fromLayer, to, toLayer);
  }

  #search(from: Vec2, fromLayer: number, to: Vec2, toLayer: number): RouteWaypoint[] | undefined {
    const fromGrid = this.#grids[fromLayer];
    if (fromGrid === undefined) {
      return undefined;
    }
    const fromZones = this.#graphs[fromLayer]?.zones ?? [];
    const straight =
      fromLayer === toLayer && isClear(fromGrid, from, to)
        ? walkCost(fromZones, from, to)
        : Number.POSITIVE_INFINITY;
    this.#pastEntry =
      this.#jumpCost +
      this.#teleportExits.reduce(
        (least, exit) => Math.min(least, distance(exit, to)),
        Number.POSITIVE_INFINITY,
      );
    // A clear straight line is the best, unless a teleport could beat it (#3030).
    if (straight <= distance(from, to) && straight <= this.#nearestEntry(from) + this.#pastEntry) {
      return [{ x: to.x, y: to.y, layer: toLayer }];
    }

    this.#from = from;
    this.#to = to;
    this.#toLayer = toLayer;
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
        const estimate = (this.#cost[i] ?? Number.POSITIVE_INFINITY) + this.#estimate(i);
        if (estimate < best) {
          best = estimate;
          current = i;
          at = k;
        }
      }
      if (at < 0) {
        // Nothing open is reachable at a finite cost: it never would be.
        return undefined;
      }
      if (current === goal) {
        return this.#path(from, fromLayer);
      }
      // Ordered removal, so the rest keep the order they were opened in.
      this.#open.copyWithin(at, at + 1, this.#openCount);
      this.#openCount -= 1;
      this.#state[current] = CLOSED;

      const here = this.#cost[current] ?? Number.POSITIVE_INFINITY;
      if (current === start) {
        // The vertices `from` sees on its layer, in order, skipping a
        // node it stands on. Not a portal: its way up starts there.
        const last = this.#firstOf[fromLayer + 1] ?? 0;
        for (let j = this.#firstOf[fromLayer] ?? 0; j < last; j += 1) {
          const node = this.#points[j];
          if (
            node !== undefined &&
            (this.#isPortal[j] === 1 || distance(node, from) > ARRIVED) &&
            isClear(fromGrid, from, node)
          ) {
            this.#relax(current, j, here + walkCost(fromZones, from, node));
          }
        }
        // Clear, but through harmful ground: still a way, at its cost.
        if (Number.isFinite(straight)) {
          this.#relax(current, goal, here + straight);
        }
      } else {
        const edges = this.#edges[current] ?? NO_EDGES;
        const costs = this.#costs[current] ?? NO_EDGES;
        for (let at = 0; at < edges.length; at += 1) {
          const next = edges[at] ?? current;
          this.#relax(current, next, here + (costs[at] ?? Number.POSITIVE_INFINITY));
        }
        if (this.#nodeSeesGoal(current)) {
          const toZones = this.#graphs[toLayer]?.zones ?? [];
          this.#relax(current, goal, here + walkCost(toZones, this.#point(current), to));
        }
      }
    }
    return undefined;
  }

  /**
   * The least a route from vertex `i` to the goal can cost: straight
   * there, or to the nearest entry and on from the nearest exit, however
   * many teleports it takes (#3030). Never more than the real cost, and
   * consistent, so A* closes no vertex too early.
   */
  #estimate(i: number): number {
    const straight = distance(this.#point(i), this.#to);
    if (this.#entries.length === 0 || i === this.#goal) {
      return straight;
    }
    const toEntry = i === this.#start ? this.#nearestEntry(this.#from) : (this.#toEntry[i] ?? 0);
    return Math.min(straight, toEntry + this.#pastEntry);
  }

  /** How far `point` is from the nearest teleport entry; none: infinitely. */
  #nearestEntry(point: Vec2): number {
    return this.#entries.reduce(
      (least, entry) => Math.min(least, distance(point, entry)),
      Number.POSITIVE_INFINITY,
    );
  }

  #point(i: number): Vec2 {
    return i === this.#start
      ? this.#from
      : i === this.#goal
        ? this.#to
        : (this.#points[i] ?? this.#to);
  }

  #opened(i: number): void {
    this.#state[i] = OPEN;
    this.#open[this.#openCount] = i;
    this.#openCount += 1;
  }

  /** Reaches `next` from `current` at a cost of `through` from the start, if that is cheaper. */
  #relax(current: number, next: number, through: number): void {
    if (this.#state[next] === CLOSED) {
      return;
    }
    if (through < (this.#cost[next] ?? Number.POSITIVE_INFINITY)) {
      this.#cost[next] = through;
      this.#cameFrom[next] = current;
      if (this.#state[next] === UNSEEN) {
        this.#opened(next);
      }
    }
  }

  /** Whether vertex `i` sees the goal, on the goal's layer: tested the first time `i` is expanded, then remembered. */
  #nodeSeesGoal(i: number): boolean {
    if (this.#layerOf[i] !== this.#toLayer) {
      return false;
    }
    if (this.#seesGoal[i] === GOAL_UNKNOWN) {
      const node = this.#points[i];
      const grid = this.#grids[this.#toLayer];
      this.#seesGoal[i] =
        node !== undefined && grid !== undefined && isClear(grid, node, this.#to)
          ? GOAL_CLEAR
          : GOAL_BLOCKED;
    }
    return this.#seesGoal[i] === GOAL_CLEAR;
  }

  /** Whether `a` and `b` are the two sides of one ramp's portal. */
  #isLink(a: number, b: number): boolean {
    return (
      b >= 0 &&
      this.#isPortal[a] === 1 &&
      this.#isPortal[b] === 1 &&
      this.#layerOf[a] !== this.#layerOf[b]
    );
  }

  /** The waypoints from `from` to the goal, as `cameFrom` records them; a portal is one, its far side. */
  #path(from: Vec2, fromLayer: number): RouteWaypoint[] {
    const path: RouteWaypoint[] = [];
    let at = this.#goal;
    while (at !== -1 && at !== this.#start) {
      const before = this.#cameFrom[at] ?? -1;
      if (before >= 0 && this.#drops.get(at) === before) {
        // To the edge, and on over it from the landing (#3069).
        const landing = this.#point(at);
        const top = this.#point(before);
        path.push({ x: landing.x, y: landing.y, layer: this.#layerOf[at] ?? 0, dropOff: true });
        path.push({ x: top.x, y: top.y, layer: this.#layerOf[before] ?? 0 });
        at = this.#cameFrom[before] ?? -1;
        continue;
      }
      if (before >= 0 && this.#teleports.get(at) === before) {
        // Into the entry, and on from the exit (#3030).
        const exit = this.#point(at);
        const entry = this.#point(before);
        path.push({ x: exit.x, y: exit.y, layer: this.#layerOf[at] ?? 0 });
        path.push({ x: entry.x, y: entry.y, layer: this.#layerOf[before] ?? 0, teleport: true });
        at = this.#cameFrom[before] ?? -1;
        continue;
      }
      const crossed = at !== this.#goal && this.#isLink(at, before);
      const { x, y } = (crossed ? this.#exits.get(at) : undefined) ?? this.#point(at);
      path.push({ x, y, layer: at === this.#goal ? this.#toLayer : (this.#layerOf[at] ?? 0) });
      const climb = crossed ? this.#climbs.get(at) : undefined;
      if (climb !== undefined && !pointInPolygon(from, climb.area)) {
        path.push({ ...climb.foot, layer: this.#layerOf[before] ?? 0 });
      }
      at = crossed ? (this.#cameFrom[before] ?? -1) : before;
    }
    path.reverse();
    const first = path[0];
    if (
      path.length > 1 &&
      first?.layer === fromLayer &&
      first.teleport !== true &&
      distance(first, from) <= ARRIVED
    ) {
      path.shift();
    }
    return path;
  }
}
