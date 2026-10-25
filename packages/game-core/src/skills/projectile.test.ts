import { describe, expect, it } from "vitest";

import { add, distance, scale, vec2, ZERO } from "../vec2.js";
import { leadAimPoint, PositionHistory, trackTarget } from "./projectile.js";

const FROM = vec2(0, 0);
const SPEED = 900;

describe("leadAimPoint", () => {
  it("aims a stationary target where it stands", () => {
    expect(leadAimPoint(FROM, vec2(300, 0), ZERO, SPEED)).toEqual(vec2(300, 0));
  });

  it("leads a perpendicular mover, so shot and target arrive together", () => {
    const target = vec2(300, 0);
    const velocity = vec2(0, 180);
    const aim = leadAimPoint(FROM, target, velocity, SPEED);

    expect(aim.x).toBeCloseTo(300, 9);
    expect(aim.y).toBeGreaterThan(0);
    const flight = distance(FROM, aim) / SPEED;
    expect(distance(add(target, scale(velocity, flight)), aim)).toBeCloseTo(0, 9);
    // The flight is longer than to where it stood: the shot chases.
    expect(flight).toBeGreaterThan(300 / SPEED);
  });

  it("meets a target walking straight in sooner than where it stood", () => {
    const aim = leadAimPoint(FROM, vec2(300, 0), vec2(-180, 0), SPEED);
    expect(aim.x).toBeCloseTo(300 * (SPEED / (SPEED + 180)), 9);
    expect(aim.y).toBe(0);
  });

  it("aims at a target faster than the shot where it stands", () => {
    expect(leadAimPoint(FROM, vec2(300, 0), vec2(2000, 0), SPEED)).toEqual(vec2(300, 0));
  });

  it("aims at a target exactly as fast as the shot, running away, where it stands", () => {
    expect(leadAimPoint(FROM, vec2(300, 0), vec2(SPEED, 0), SPEED)).toEqual(vec2(300, 0));
  });
});

const DT = 0.05;

describe("trackTarget", () => {
  it("reads a straight walk exactly", () => {
    const samples = Array.from({ length: 12 }, (_, i) => vec2(100 + 9 * i, 50 - 3 * i));
    const tracked = trackTarget(samples, DT, vec2(0, 0));
    expect(tracked.velocity.x).toBeCloseTo(180, 9);
    expect(tracked.velocity.y).toBeCloseTo(-60, 9);
    expect(tracked.position.x).toBeCloseTo(100 + 9 * 11, 9);
    expect(tracked.position.y).toBeCloseTo(50 - 3 * 11, 9);
  });

  it("reads a symmetric wobble as standing at its centre", () => {
    // Up 4 ticks, down 4, up 4: a square wave of input, centred on 0.
    const ys = [-18, -9, 0, 9, 18, 9, 0, -9, -18];
    const tracked = trackTarget(
      ys.map((y) => vec2(300, y)),
      DT,
      vec2(0, 0),
    );
    expect(tracked.velocity.x).toBeCloseTo(0, 9);
    expect(tracked.velocity.y).toBeCloseTo(0, 9);
    // Its mean, within one tick's step of the middle of the swing.
    expect(Math.abs(tracked.position.y)).toBeLessThan(9);
  });

  it("reads no motion from one sample, none, or no time", () => {
    expect(trackTarget([], DT, vec2(7, 8))).toEqual({ position: vec2(7, 8), velocity: ZERO });
    expect(trackTarget([vec2(1, 2)], DT, vec2(7, 8))).toEqual({
      position: vec2(1, 2),
      velocity: ZERO,
    });
    expect(trackTarget([vec2(1, 2), vec2(3, 4)], 0, vec2(7, 8))).toEqual({
      position: vec2(3, 4),
      velocity: ZERO,
    });
  });
});

describe("PositionHistory", () => {
  it("keeps the newest positions, oldest first, and forgets them on clear", () => {
    const history = new PositionHistory(3);
    for (let i = 1; i <= 5; i += 1) {
      history.push(vec2(i, 0));
    }
    expect(history.samples()).toEqual([vec2(3, 0), vec2(4, 0), vec2(5, 0)]);
    history.clear();
    expect(history.samples()).toEqual([]);
    history.push(vec2(9, 0));
    expect(history.samples()).toEqual([vec2(9, 0)]);
  });
});
