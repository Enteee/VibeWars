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
  return distance(point, closestPointOnSegment(point, seg));
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
 * the geometry stays testable in complete isolation from Colyseus.
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
  const { a: p1, b: p2 } = s1;
  const { a: p3, b: p4 } = s2;

  const d1 = cross(sub(p4, p3), sub(p1, p3));
  const d2 = cross(sub(p4, p3), sub(p2, p3));
  const d3 = cross(sub(p2, p1), sub(p3, p1));
  const d4 = cross(sub(p2, p1), sub(p4, p1));

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && isOnSegment(p3, p4, p1)) return true;
  if (d2 === 0 && isOnSegment(p3, p4, p2)) return true;
  if (d3 === 0 && isOnSegment(p1, p2, p3)) return true;
  if (d4 === 0 && isOnSegment(p1, p2, p4)) return true;

  return false;
}

/**
 * The shortest distance between two segments: 0 if they touch or cross,
 * otherwise the nearest of their four endpoints to the other segment.
 */
export function distanceSegmentToSegment(s: Segment, t: Segment): number {
  if (segmentsIntersect(s, t)) {
    return 0;
  }
  return Math.min(
    distancePointToSegment(s.a, t),
    distancePointToSegment(s.b, t),
    distancePointToSegment(t.a, s),
    distancePointToSegment(t.b, s),
  );
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/** Whether `point` lies on the closed segment `[a, b]`, given they are collinear. */
function isOnSegment(a: Vec2, b: Vec2, point: Vec2): boolean {
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
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
