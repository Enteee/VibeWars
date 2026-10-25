import { describe, expect, it } from "vitest";

import { add, distance, scale, vec2, ZERO } from "../vec2.js";
import { leadAimPoint } from "./projectile.js";

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
