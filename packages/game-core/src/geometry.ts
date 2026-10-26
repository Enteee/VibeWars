import { add, distance, dot, equals, scale, sub, type Vec2 } from "./vec2.js";

/**
 * Collision and line-of-sight primitives (brief §17–§18).
 *
 * Every wall, regardless of whether map data describes it as a rectangle or
 * an arbitrary polygon, collides and blocks sight through exactly one
 * primitive: a line segment. A rectangle is just four segments; an N-point
 * polygon is N segments. This is the "boring, explicit" choice (brief §44)
 * over maintaining a parallel rect-collision system and polygon-collision
 * system that would have to agree with each other.
 */

export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
}

export function segment(a: Vec2, b: Vec2): Segment {
  return { a, b };
}

/** The point on `seg` closest to `point`. */
export function closestPointOnSegment(point: Vec2, seg: Segment): Vec2 {
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

export function distancePointToSegment(point: Vec2, seg: Segment): number {
  return distancePointToSegmentXY(point.x, point.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
}

/**
 * `distancePointToSegment` on bare coordinates, allocating nothing (#267):
 * the point `(px, py)` and the segment `(ax, ay)-(bx, by)`. The same
 * operations in the same order as `closestPointOnSegment` and `distance`,
 * so the result is bit-identical to theirs.
 */
export function distancePointToSegmentXY(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSquared = abx * abx + aby * aby;
  if (abLengthSquared < 1e-12) {
    // Degenerate (zero-length) segment: the distance to its one point.
    return hypot(px - ax, py - ay);
  }
  const t = ((px - ax) * abx + (py - ay) * aby) / abLengthSquared;
  const clampedT = Math.max(0, Math.min(1, t));
  return hypot(px - (ax + abx * clampedT), py - (ay + aby * clampedT));
}

/** `distance`'s arithmetic on a difference already taken. */
function hypot(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

/** Whether a circle at `center` with `radius` overlaps `seg` at all. */
export function circleIntersectsSegment(center: Vec2, radius: number, seg: Segment): boolean {
  return distancePointToSegment(center, seg) <= radius;
}

/**
 * Push a circle out of a segment it has penetrated, returning a corrected
 * center. Returns `center` unchanged if there is no overlap.
 *
 * This is deliberately a pure "resolve one circle against one segment"
 * function with no knowledge of a tick, a room, or multiple walls — the
 * caller (the simulation) applies it once per wall per entity per tick, so
 * the geometry stays testable in complete isolation from the network.
 */
export function resolveCircleSegmentCollision(center: Vec2, radius: number, seg: Segment): Vec2 {
  const closest = closestPointOnSegment(center, seg);
  const toCenter = sub(center, closest);
  const penetrationDistance = distance(center, closest);

  if (penetrationDistance >= radius) {
    return center;
  }

  if (penetrationDistance < 1e-9) {
    // Center lands exactly on the segment (or the segment is degenerate):
    // there is no well-defined push-out direction, so push along the
    // segment's normal rather than dividing by ~zero length.
    const ab = sub(seg.b, seg.a);
    const normal = { x: -ab.y, y: ab.x };
    const normalLength = distance({ x: 0, y: 0 }, normal);
    if (normalLength < 1e-9) {
      return center;
    }
    return add(closest, scale(normal, radius / normalLength));
  }

  const pushDirection = scale(toCenter, 1 / penetrationDistance);
  return add(closest, scale(pushDirection, radius));
}

/**
 * Classic orientation-based segment intersection test (does `p1->p2` cross
 * `p3->p4`), including shared-endpoint and collinear-overlap cases.
 */
export function segmentsIntersect(s1: Segment, s2: Segment): boolean {
  return segmentsIntersectXY(s1.a.x, s1.a.y, s1.b.x, s1.b.y, s2.a.x, s2.a.y, s2.b.x, s2.b.y);
}

/**
 * `segmentsIntersect` on bare coordinates, allocating nothing (#267):
 * `p1->p2` against `p3->p4`. The one implementation; the `Segment` form
 * delegates here.
 */
export function segmentsIntersectXY(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  // The cross products of (p4 - p3) and (p2 - p1) with each other end.
  const d1 = (x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3);
  const d2 = (x4 - x3) * (y2 - y3) - (y4 - y3) * (x2 - x3);
  const d3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  const d4 = (x2 - x1) * (y4 - y1) - (y2 - y1) * (x4 - x1);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && isOnSegment(x3, y3, x4, y4, x1, y1)) return true;
  if (d2 === 0 && isOnSegment(x3, y3, x4, y4, x2, y2)) return true;
  if (d3 === 0 && isOnSegment(x1, y1, x2, y2, x3, y3)) return true;
  if (d4 === 0 && isOnSegment(x1, y1, x2, y2, x4, y4)) return true;

  return false;
}

/**
 * The shortest distance between two segments: 0 if they touch or cross,
 * otherwise the nearest of their four endpoints to the other segment.
 */
export function distanceSegmentToSegment(s: Segment, t: Segment): number {
  return distanceSegmentToSegmentXY(s.a.x, s.a.y, s.b.x, s.b.y, t.a.x, t.a.y, t.b.x, t.b.y);
}

/**
 * `distanceSegmentToSegment` on bare coordinates, allocating nothing
 * (#267): `(ax, ay)-(bx, by)` against `(cx, cy)-(dx, dy)`. The one
 * implementation; the `Segment` form delegates here, so the nav graph's
 * edges and its paths are the same whichever form a caller uses.
 */
export function distanceSegmentToSegmentXY(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  if (segmentsIntersectXY(ax, ay, bx, by, cx, cy, dx, dy)) {
    return 0;
  }
  return Math.min(
    distancePointToSegmentXY(ax, ay, cx, cy, dx, dy),
    distancePointToSegmentXY(bx, by, cx, cy, dx, dy),
    distancePointToSegmentXY(cx, cy, ax, ay, bx, by),
    distancePointToSegmentXY(dx, dy, ax, ay, bx, by),
  );
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** Whether `(px, py)` lies on the closed segment `[a, b]`, given they are collinear. */
function isOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  return (
    Math.min(ax, bx) <= px &&
    px <= Math.max(ax, bx) &&
    Math.min(ay, by) <= py &&
    py <= Math.max(ay, by)
  );
}

/**
 * Whether `from` can see `to` given a set of opaque `blockers` (brief §18).
 *
 * Deliberately conservative: the sight line is blocked if it touches a
 * blocker *at all*, including just grazing an endpoint or lying flush
 * along a wall's edge — not only on a full interior crossing. In practice
 * `from`/`to` are entity centers, which movement collision
 * (`resolveCircleSegmentCollision`) already keeps at least one entity
 * radius away from any wall segment, so this case is rare in play but is
 * still handled the safe way rather than left to chance.
 */
export function hasLineOfSight(from: Vec2, to: Vec2, blockers: readonly Segment[]): boolean {
  if (equals(from, to)) {
    return true;
  }
  const sightLine = segment(from, to);
  for (const blocker of blockers) {
    if (segmentsIntersect(sightLine, blocker)) {
      return false;
    }
  }
  return true;
}

/**
 * Where the segment `from -> to` first meets one of `blockers`: the
 * meeting point nearest `from`, or `undefined` if it meets none. Touching
 * counts, a grazed endpoint included, by the same conservative rule as
 * `hasLineOfSight`.
 */
export function firstHit(from: Vec2, to: Vec2, blockers: readonly Segment[]): Vec2 | undefined {
  const path = segment(from, to);
  const r = sub(to, from);
  const lengthSq = dot(r, r);
  let nearest: number | undefined;
  for (const blocker of blockers) {
    if (!segmentsIntersect(path, blocker)) {
      continue;
    }
    const s = sub(blocker.b, blocker.a);
    const denominator = cross(r, s);
    let t: number;
    if (Math.abs(denominator) > 1e-12) {
      t = cross(sub(blocker.a, from), s) / denominator;
    } else if (lengthSq < 1e-12) {
      t = 0;
    } else {
      // Collinear and overlapping: the first of the blocker's points on the path.
      const ta = dot(sub(blocker.a, from), r) / lengthSq;
      const tb = dot(sub(blocker.b, from), r) / lengthSq;
      t = Math.max(0, Math.min(ta, tb));
    }
    t = Math.max(0, Math.min(1, t));
    if (nearest === undefined || t < nearest) {
      nearest = t;
    }
  }
  return nearest === undefined ? undefined : add(from, scale(r, nearest));
}

export function distanceWithinRange(a: Vec2, b: Vec2, range: number): boolean {
  return distance(a, b) <= range;
}

/**
 * Resolve a circle against another circle, pushing only the first one out
 * (brief §21's body blocking).
 *
 * Body blocking is what makes positioning matter: a front line can
 * physically deny a path, and a caster can be boxed in. Pushing only the
 * moving circle keeps the simulation order-independent — each entity is
 * resolved against the others' *current* positions within a tick, so two
 * players walking into each other do not shove each other twice.
 */
export function resolveCircleCircleCollision(
  center: Vec2,
  radius: number,
  otherCenter: Vec2,
  otherRadius: number,
): Vec2 {
  const minimumDistance = radius + otherRadius;
  const offset = sub(center, otherCenter);
  const distanceBetween = distance(center, otherCenter);

  if (distanceBetween >= minimumDistance) {
    return center;
  }

  if (distanceBetween < 1e-9) {
    // Exactly coincident: there is no meaningful direction to separate
    // along, so nudge along +x rather than dividing by ~zero. Rare, but
    // two players spawning on the same point would otherwise produce NaN.
    return { x: otherCenter.x + minimumDistance, y: otherCenter.y };
  }

  const pushDirection = scale(offset, 1 / distanceBetween);
  return add(otherCenter, scale(pushDirection, minimumDistance));
}
