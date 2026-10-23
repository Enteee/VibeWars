import { describe, expect, it } from "vitest";

import {
  circleIntersectsSegment,
  closestPointOnSegment,
  distancePointToSegment,
  distanceWithinRange,
  hasLineOfSight,
  resolveCircleSegmentCollision,
  segment,
  segmentsIntersect,
} from "./geometry.js";
import { distance, equals, vec2 } from "./vec2.js";

describe("closestPointOnSegment", () => {
  it("returns the point itself when it lies on the segment", () => {
    const seg = segment(vec2(0, 0), vec2(10, 0));
    expect(closestPointOnSegment(vec2(5, 0), seg)).toEqual(vec2(5, 0));
  });

  it("clamps to the nearer endpoint when the projection falls outside", () => {
    const seg = segment(vec2(0, 0), vec2(10, 0));
    expect(closestPointOnSegment(vec2(-5, 3), seg)).toEqual(vec2(0, 0));
    expect(closestPointOnSegment(vec2(15, 3), seg)).toEqual(vec2(10, 0));
  });

  it("projects perpendicular onto a diagonal segment", () => {
    const seg = segment(vec2(0, 0), vec2(10, 10));
    const closest = closestPointOnSegment(vec2(0, 10), seg);
    expect(closest.x).toBeCloseTo(5, 10);
    expect(closest.y).toBeCloseTo(5, 10);
  });

  it("handles a degenerate zero-length segment without dividing by zero", () => {
    const seg = segment(vec2(3, 3), vec2(3, 3));
    expect(closestPointOnSegment(vec2(10, 10), seg)).toEqual(vec2(3, 3));
  });
});

describe("distancePointToSegment", () => {
  it("is zero for a point on the segment", () => {
    expect(distancePointToSegment(vec2(5, 0), segment(vec2(0, 0), vec2(10, 0)))).toBe(0);
  });

  it("is the perpendicular distance for a point beside the segment", () => {
    expect(distancePointToSegment(vec2(5, 3), segment(vec2(0, 0), vec2(10, 0)))).toBe(3);
  });

  it("is the distance to the nearer endpoint beyond the segment's extent", () => {
    expect(distancePointToSegment(vec2(-3, 0), segment(vec2(0, 0), vec2(10, 0)))).toBe(3);
    expect(distancePointToSegment(vec2(13, 0), segment(vec2(0, 0), vec2(10, 0)))).toBe(3);
  });
});

describe("circleIntersectsSegment", () => {
  const wall = segment(vec2(0, 0), vec2(10, 0));

  it("is true when the circle overlaps the segment", () => {
    expect(circleIntersectsSegment(vec2(5, 2), 3, wall)).toBe(true);
  });

  it("is true exactly at the boundary (distance == radius)", () => {
    expect(circleIntersectsSegment(vec2(5, 3), 3, wall)).toBe(true);
  });

  it("is false when the circle is clearly clear of the segment", () => {
    expect(circleIntersectsSegment(vec2(5, 10), 3, wall)).toBe(false);
  });

  it("is true when the circle's center is on the segment", () => {
    expect(circleIntersectsSegment(vec2(5, 0), 1, wall)).toBe(true);
  });
});

describe("resolveCircleSegmentCollision", () => {
  const wall = segment(vec2(0, 0), vec2(10, 0));

  it("leaves the center untouched when there is no overlap", () => {
    const center = vec2(5, 10);
    expect(resolveCircleSegmentCollision(center, 3, wall)).toBe(center);
  });

  it("pushes the center out to exactly `radius` from the segment", () => {
    const resolved = resolveCircleSegmentCollision(vec2(5, 1), 3, wall);
    expect(distancePointToSegment(resolved, wall)).toBeCloseTo(3, 10);
    // Pushed away on the same side it penetrated from (+y here).
    expect(resolved.y).toBeGreaterThan(1);
  });

  it("pushes out on the correct side regardless of which side was penetrated", () => {
    const fromAbove = resolveCircleSegmentCollision(vec2(5, 1), 3, wall);
    const fromBelow = resolveCircleSegmentCollision(vec2(5, -1), 3, wall);
    expect(fromAbove.y).toBeGreaterThan(0);
    expect(fromBelow.y).toBeLessThan(0);
  });

  it("resolves a deep penetration (center already past the segment) the same way", () => {
    const resolved = resolveCircleSegmentCollision(vec2(5, 0.01), 3, wall);
    expect(distancePointToSegment(resolved, wall)).toBeCloseTo(3, 8);
  });

  it("does not throw and returns some valid point when the center sits exactly on the segment", () => {
    const resolved = resolveCircleSegmentCollision(vec2(5, 0), 3, wall);
    expect(Number.isFinite(resolved.x)).toBe(true);
    expect(Number.isFinite(resolved.y)).toBe(true);
    expect(distancePointToSegment(resolved, wall)).toBeCloseTo(3, 6);
  });

  it("resolves correctly against a diagonal wall", () => {
    const diagonal = segment(vec2(0, 0), vec2(10, 10));
    // A point just off the diagonal, inside the radius.
    const resolved = resolveCircleSegmentCollision(vec2(6, 4), 3, diagonal);
    expect(distancePointToSegment(resolved, diagonal)).toBeCloseTo(3, 10);
  });

  it("is idempotent: resolving an already-resolved position is a no-op", () => {
    const once = resolveCircleSegmentCollision(vec2(5, 1), 3, wall);
    const twice = resolveCircleSegmentCollision(once, 3, wall);
    expect(equals(once, twice, 1e-9)).toBe(true);
  });
});

describe("segmentsIntersect", () => {
  it("detects a simple X crossing", () => {
    const s1 = segment(vec2(0, 0), vec2(10, 10));
    const s2 = segment(vec2(0, 10), vec2(10, 0));
    expect(segmentsIntersect(s1, s2)).toBe(true);
  });

  it("is false for clearly separate segments", () => {
    const s1 = segment(vec2(0, 0), vec2(1, 1));
    const s2 = segment(vec2(10, 10), vec2(11, 11));
    expect(segmentsIntersect(s1, s2)).toBe(false);
  });

  it("is false for parallel, non-overlapping segments", () => {
    const s1 = segment(vec2(0, 0), vec2(10, 0));
    const s2 = segment(vec2(0, 5), vec2(10, 5));
    expect(segmentsIntersect(s1, s2)).toBe(false);
  });

  it("detects a shared endpoint as an intersection", () => {
    const s1 = segment(vec2(0, 0), vec2(5, 5));
    const s2 = segment(vec2(5, 5), vec2(10, 0));
    expect(segmentsIntersect(s1, s2)).toBe(true);
  });

  it("detects a T-junction (one segment's endpoint touching the other's interior)", () => {
    const s1 = segment(vec2(0, 0), vec2(10, 0));
    const s2 = segment(vec2(5, 0), vec2(5, 5));
    expect(segmentsIntersect(s1, s2)).toBe(true);
  });

  it("detects collinear overlapping segments", () => {
    const s1 = segment(vec2(0, 0), vec2(10, 0));
    const s2 = segment(vec2(5, 0), vec2(15, 0));
    expect(segmentsIntersect(s1, s2)).toBe(true);
  });

  it("is false for collinear but disjoint segments", () => {
    const s1 = segment(vec2(0, 0), vec2(5, 0));
    const s2 = segment(vec2(10, 0), vec2(15, 0));
    expect(segmentsIntersect(s1, s2)).toBe(false);
  });

  it("is symmetric: order of arguments does not matter", () => {
    const s1 = segment(vec2(0, 0), vec2(10, 10));
    const s2 = segment(vec2(0, 10), vec2(10, 0));
    expect(segmentsIntersect(s1, s2)).toBe(segmentsIntersect(s2, s1));
  });
});

describe("hasLineOfSight", () => {
  it("is true with no blockers at all", () => {
    expect(hasLineOfSight(vec2(0, 0), vec2(100, 100), [])).toBe(true);
  });

  it("is false when a single wall sits directly between two points", () => {
    const wall = segment(vec2(5, -5), vec2(5, 5));
    expect(hasLineOfSight(vec2(0, 0), vec2(10, 0), [wall])).toBe(false);
  });

  it("is true when the wall is beside the sight line, not on it", () => {
    const wall = segment(vec2(5, 5), vec2(5, 15));
    expect(hasLineOfSight(vec2(0, 0), vec2(10, 0), [wall])).toBe(true);
  });

  it("is true for a degenerate query where from equals to", () => {
    const wall = segment(vec2(-1, -1), vec2(1, 1));
    expect(hasLineOfSight(vec2(0, 0), vec2(0, 0), [wall])).toBe(true);
  });

  it("is blocked if any one of several blockers intersects, even if others do not", () => {
    const clear = segment(vec2(5, 5), vec2(5, 15));
    const blocking = segment(vec2(5, -5), vec2(5, 5));
    expect(hasLineOfSight(vec2(0, 0), vec2(10, 0), [clear, blocking])).toBe(false);
  });

  it("is true around a corner (the box's segments don't cross the direct line)", () => {
    // A box well off to the side of the straight line from (0,0) to (10,0).
    const box = [
      segment(vec2(4, 2), vec2(6, 2)),
      segment(vec2(6, 2), vec2(6, 4)),
      segment(vec2(6, 4), vec2(4, 4)),
      segment(vec2(4, 4), vec2(4, 2)),
    ];
    expect(hasLineOfSight(vec2(0, 0), vec2(10, 0), box)).toBe(true);
  });

  it("is false through the middle of an enclosing box", () => {
    const box = [
      segment(vec2(4, -2), vec2(6, -2)),
      segment(vec2(6, -2), vec2(6, 2)),
      segment(vec2(6, 2), vec2(4, 2)),
      segment(vec2(4, 2), vec2(4, -2)),
    ];
    expect(hasLineOfSight(vec2(0, 0), vec2(10, 0), box)).toBe(false);
  });
});

describe("distanceWithinRange", () => {
  it("is true at exactly the range boundary", () => {
    expect(distanceWithinRange(vec2(0, 0), vec2(5, 0), 5)).toBe(true);
  });

  it("is true for anything closer", () => {
    expect(distanceWithinRange(vec2(0, 0), vec2(3, 0), 5)).toBe(true);
  });

  it("is false for anything farther", () => {
    expect(distanceWithinRange(vec2(0, 0), vec2(6, 0), 5)).toBe(false);
  });

  it("agrees with a direct distance() computation", () => {
    const a = vec2(1, 2);
    const b = vec2(7, 11);
    expect(distanceWithinRange(a, b, distance(a, b))).toBe(true);
    expect(distanceWithinRange(a, b, distance(a, b) - 0.01)).toBe(false);
  });
});
