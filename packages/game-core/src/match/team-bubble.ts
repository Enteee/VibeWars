import { SPAWN_BUBBLE_RADIUS } from "../distances.js";
import { distance, type Vec2 } from "../vec2.js";

/**
 * A team's pre-match bubble (#3930): the convex hull of its members'
 * spawns grown by `radius`, a rounded convex shape. One spawn makes a
 * circle, two a capsule, more a rounded polygon. Every member may walk
 * anywhere inside it until the start. Host and client build it from the
 * same spawns, so they hold and draw the same shape.
 */
export interface TeamBubble {
  /**
   * The hull's corners, counter-clockwise (positive cross product) from
   * the lowest x, then lowest y: one for a point, two for a segment.
   */
  readonly hull: readonly Vec2[];
  readonly radius: number;
}

/** Turn of `o` -> `a` -> `b`: positive to the left, 0 when collinear. */
function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** The hull's corner `index`, counted round past either end. */
function corner(hull: readonly Vec2[], index: number): Vec2 {
  const point = hull[((index % hull.length) + hull.length) % hull.length];
  if (point === undefined) {
    throw new Error("a team bubble needs a spawn");
  }
  return point;
}

/**
 * The bubble round `spawns`, at least one. The hull is Andrew's monotone
 * chain over the spawns sorted by x then y, collinear and duplicate
 * spawns dropped, so the same spawns in any order make the same bubble.
 */
export function teamBubble(spawns: readonly Vec2[], radius = SPAWN_BUBBLE_RADIUS): TeamBubble {
  const sorted = [...spawns].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (point, index) =>
      index === 0 || point.x !== sorted[index - 1]?.x || point.y !== sorted[index - 1]?.y,
  );
  if (unique.length <= 2) {
    return { hull: unique, radius };
  }
  const chain = (points: readonly Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const point of points) {
      while (out.length >= 2 && cross(corner(out, -2), corner(out, -1), point) <= 0) {
        out.pop();
      }
      out.push(point);
    }
    out.pop();
    return out;
  };
  const hull = [...chain(unique), ...chain([...unique].reverse())];
  return { hull, radius };
}

/** The point on segment `a`–`b` nearest `point`. */
function nearestOnSegment(point: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * The point of the hull (its area included) nearest `point`: `point`
 * itself when it is inside a hull of three or more corners.
 */
export function nearestOnHull(point: Vec2, bubble: TeamBubble): Vec2 {
  const { hull } = bubble;
  const first = hull[0];
  if (first === undefined) {
    throw new Error("a team bubble needs a spawn");
  }
  if (hull.length >= 3 && hull.every((a, i) => cross(a, corner(hull, i + 1), point) >= 0)) {
    return point;
  }
  let best = first;
  let bestDistance = distance(point, first);
  for (let i = 0; i < hull.length; i += 1) {
    const at = nearestOnSegment(point, corner(hull, i), corner(hull, i + 1));
    const off = distance(point, at);
    if (off < bestDistance) {
      best = at;
      bestDistance = off;
    }
  }
  return best;
}

/** How far inside the bubble's edge `point` is: negative outside it. */
export function teamBubbleDepth(point: Vec2, bubble: TeamBubble): number {
  return bubble.radius - distance(point, nearestOnHull(point, bubble));
}

/**
 * `point` held in `bubble`: itself, the same object, when inside; else
 * the nearest point on its edge, `radius` out from the hull toward it.
 */
export function clampToTeamBubble(point: Vec2, bubble: TeamBubble): Vec2 {
  const on = nearestOnHull(point, bubble);
  const off = distance(point, on);
  if (off <= bubble.radius) {
    return point;
  }
  const k = bubble.radius / off;
  return { x: on.x + (point.x - on.x) * k, y: on.y + (point.y - on.y) * k };
}

/**
 * The bubble's edge as a closed loop, the last point not repeating the
 * first, counter-clockwise like the hull: round each corner an arc of
 * `segmentsPerTurn` pieces a full turn, so a lone spawn's circle has
 * exactly that many, and between two arcs the straight side.
 */
export function teamBubbleOutline(bubble: TeamBubble, segmentsPerTurn: number): Vec2[] {
  const { hull, radius } = bubble;
  const first = hull[0];
  if (first === undefined) {
    throw new Error("a team bubble needs a spawn");
  }
  const turn = 2 * Math.PI;
  const out: Vec2[] = [];
  if (hull.length === 1) {
    for (let i = 0; i < segmentsPerTurn; i += 1) {
      const angle = (turn * i) / segmentsPerTurn;
      out.push({ x: first.x + radius * Math.cos(angle), y: first.y + radius * Math.sin(angle) });
    }
    return out;
  }
  // Each side's outward normal is its direction turned a quarter clockwise,
  // the hull's inside being to the left.
  const normal = (a: Vec2, b: Vec2): number => Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
  for (let i = 0; i < hull.length; i += 1) {
    const at = corner(hull, i);
    const from = normal(corner(hull, i - 1), at);
    const to = normal(at, corner(hull, i + 1));
    const sweep = (((to - from) % turn) + turn) % turn;
    const pieces = Math.max(1, Math.ceil((sweep / turn) * segmentsPerTurn - 1e-9));
    for (let piece = 0; piece <= pieces; piece += 1) {
      const angle = from + (sweep * piece) / pieces;
      out.push({ x: at.x + radius * Math.cos(angle), y: at.y + radius * Math.sin(angle) });
    }
  }
  return out;
}
