import { describe, expect, it } from "vitest";

import { distance, vec2, type Vec2 } from "../vec2.js";
import { LOOKAHEAD_RADII, STEER_MARGIN, steerAround } from "./steering.js";

const R = 14;
const FROM = vec2(100, 200);
/** Due east, far off. y grows downward, so "right of travel" is +y. */
const EAST = vec2(500, 200);

/** The direction `steerAround` walks. */
function walk(...args: Parameters<typeof steerAround>): Vec2 {
  return steerAround(...args).direction;
}

function unit(direction: Vec2): Vec2 {
  const length = Math.hypot(direction.x, direction.y);
  return vec2(direction.x / length, direction.y / length);
}

describe("steerAround", () => {
  it("walks straight at the waypoint with nobody about, exactly as before steering", () => {
    expect(walk(FROM, EAST, R, [])).toEqual(vec2(400, 0));
  });

  it("passes a body offset left on the right, and one offset right on the left", () => {
    const left = walk(FROM, EAST, R, [vec2(150, 195)]);
    const right = walk(FROM, EAST, R, [vec2(150, 205)]);
    expect(left.y).toBeGreaterThan(0);
    expect(right.y).toBeLessThan(0);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it("passes a body dead ahead on the right of travel", () => {
    expect(walk(FROM, EAST, R, [vec2(150, 200)]).y).toBeGreaterThan(0);
    // Travelling west, the right is north.
    expect(walk(EAST, FROM, R, [vec2(450, 200)]).y).toBeLessThan(0);
  });

  it("walks the tangent, clearing the body by the margin", () => {
    const body = vec2(150, 200);
    const way = unit(walk(FROM, EAST, R, [body]));
    // The closest the walk's line comes to the body's centre.
    const closest = Math.abs(way.x * (body.y - FROM.y) - way.y * (body.x - FROM.x));
    expect(closest).toBeCloseTo(2 * R + STEER_MARGIN, 9);
  });

  it("ignores a body behind, beyond the lookahead, past the waypoint or out of the lane", () => {
    const straight = vec2(400, 0);
    expect(walk(FROM, EAST, R, [vec2(60, 200)])).toEqual(straight);
    expect(walk(FROM, EAST, R, [vec2(100 + LOOKAHEAD_RADII * R + 1, 200)])).toEqual(straight);
    expect(walk(FROM, vec2(140, 200), R, [vec2(150, 200)])).toEqual(vec2(40, 0));
    expect(walk(FROM, EAST, R, [vec2(150, 200 + 2 * R)])).toEqual(straight);
  });

  it("slides round a body it already touches, along the perpendicular", () => {
    // Touching, dead ahead: straight to the right of travel.
    const slide = walk(FROM, EAST, R, [vec2(100 + 2 * R, 200)]);
    expect(slide.x).toBeCloseTo(0, 12);
    expect(slide.y).toBe(1);
  });

  it("steers round the nearest body in the way, not the first listed", () => {
    const far = vec2(150, 205);
    const near = vec2(130, 195);
    expect(walk(FROM, EAST, R, [far, near])).toEqual(walk(FROM, EAST, R, [near]));
  });

  it("turns two attackers meeting head-on the same way, so they pass", () => {
    const a = vec2(100, 200);
    const b = vec2(150, 200);
    const fromA = walk(a, vec2(500, 200), R, [b]);
    const fromB = walk(b, vec2(-300, 200), R, [a]);
    // Mirror images through the midpoint: each goes to its own right.
    expect(fromB.x).toBeCloseTo(-fromA.x, 12);
    expect(fromB.y).toBeCloseTo(-fromA.y, 12);
    expect(fromA.y).toBeGreaterThan(0);
  });

  it("names the side it passed on, and none with nothing in the way (#3707)", () => {
    expect(steerAround(FROM, EAST, R, [vec2(150, 195)]).passRight).toBe(true);
    expect(steerAround(FROM, EAST, R, [vec2(150, 205)]).passRight).toBe(false);
    expect(steerAround(FROM, EAST, R, [vec2(150, 200)]).passRight).toBe(true);
    expect(steerAround(FROM, EAST, R, []).passRight).toBeUndefined();
  });

  it("keeps the side it is given, for a body now across the line or another body (#3707)", () => {
    // Offset right, it would be passed on the left; kept right, it is passed on the right.
    const kept = steerAround(FROM, EAST, R, [vec2(150, 205)], true);
    expect(kept.passRight).toBe(true);
    expect(kept.direction.y).toBeGreaterThan(0);
    // Nothing in the way: straight on, and the side is let go.
    expect(steerAround(FROM, EAST, R, [], true)).toEqual({
      direction: vec2(400, 0),
      passRight: undefined,
    });
  });

  it("walks round two bodies shoulder to shoulder, not back and forth between them (#3707)", () => {
    // The waypoint just past a pair with no room between them.
    const pair = [vec2(130, 190), vec2(130, 212)];
    const waypoint = vec2(160, 200);
    let at = FROM;
    let side: boolean | undefined;
    let turns = 0;
    let across = 0;
    for (let step = 0; step < 60 && distance(at, waypoint) > 2; step += 1) {
      const steer = steerAround(at, waypoint, R, pair, side);
      side = steer.passRight;
      const way = unit(steer.direction);
      if (Math.sign(way.y) !== 0 && Math.sign(way.y) !== Math.sign(across)) turns += 1;
      across = way.y;
      at = vec2(at.x + 2 * way.x, at.y + 2 * way.y);
    }
    expect(distance(at, waypoint)).toBeLessThanOrEqual(2);
    expect(turns).toBeLessThanOrEqual(2);
  });
});
