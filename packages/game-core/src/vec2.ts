/**
 * Immutable 2D vector helpers.
 *
 * The whole game is played on a flat plane, so this is the only spatial
 * primitive the domain needs. Values are plain readonly objects rather than a
 * class so they serialise trivially and stay cheap to copy.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const ZERO: Vec2 = Object.freeze({ x: 0, y: 0 });

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lengthSquared(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function length(a: Vec2): number {
  return Math.sqrt(lengthSquared(a));
}

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.sqrt(distanceSquared(a, b));
}

/**
 * Returns a unit-length vector pointing the same way as `a`, or `ZERO` if `a`
 * has (near-)zero length. Returning `ZERO` rather than throwing keeps callers
 * such as "move toward my current input direction" branch-free.
 */
export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  if (len < 1e-9) {
    return ZERO;
  }
  return { x: a.x / len, y: a.y / len };
}

/** Clamp a vector's magnitude to at most `maxLength`. */
export function clampLength(a: Vec2, maxLength: number): Vec2 {
  if (maxLength < 0) {
    throw new RangeError("maxLength must be non-negative");
  }
  const lenSq = lengthSquared(a);
  if (lenSq <= maxLength * maxLength) {
    return a;
  }
  return scale(normalize(a), maxLength);
}

export function equals(a: Vec2, b: Vec2, epsilon = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}
