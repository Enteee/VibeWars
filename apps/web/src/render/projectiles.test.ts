import { describe, expect, it } from "vitest";

import { vec2 } from "@vibewars/game-core";

import {
  MatchClock,
  SHOT_FADE_SECONDS,
  shotFadeAlpha,
  projectileHeading,
  projectilePosition,
  projectileSprite,
  type RenderableProjectile,
} from "./projectiles.js";

describe("projectileSprite", () => {
  it("gives every bow an arrow, the spear a spear, wand and staff a bolt", () => {
    expect(projectileSprite("flatbow", undefined)).toBe("arrow");
    expect(projectileSprite("shortbow", undefined)).toBe("arrow");
    expect(projectileSprite("longbow", undefined)).toBe("arrow");
    expect(projectileSprite("recurve-bow", undefined)).toBe("arrow");
    expect(projectileSprite("hornbow", undefined)).toBe("arrow");
    expect(projectileSprite("spear", undefined)).toBe("spear");
    expect(projectileSprite("wand", undefined)).toBe("bolt");
    expect(projectileSprite("staff", undefined)).toBe("bolt");
  });

  it("gives a melee or unknown weapon a bolt rather than throwing", () => {
    expect(projectileSprite("unarmed", undefined)).toBe("bolt");
    expect(projectileSprite("sword", undefined)).toBe("bolt");
    expect(projectileSprite("axe", undefined)).toBe("bolt");
    expect(projectileSprite("hammer", undefined)).toBe("bolt");
    expect(projectileSprite("daggers", undefined)).toBe("bolt");
    expect(projectileSprite("scythe", undefined)).toBe("bolt");
    expect(projectileSprite("trebuchet", undefined)).toBe("bolt");
  });

  it("gives a flying spell a bolt, whatever its caster holds (#535)", () => {
    expect(projectileSprite("longbow", "elementalist.fireball")).toBe("bolt");
    expect(projectileSprite("spear", "elementalist.fireball")).toBe("bolt");
  });
});

describe("projectilePosition", () => {
  const shot: RenderableProjectile = {
    id: 1,
    shooterId: "ranger",
    weaponShot: true,
    sprite: "arrow",
    from: vec2(0, 0),
    to: vec2(100, 50),
    launchedAt: 10,
    flightSeconds: 2,
    colour: 0,
  };

  it("flies from its release to its aim point over its flight", () => {
    expect(projectilePosition(shot, 10)).toEqual({ x: 0, y: 0 });
    expect(projectilePosition(shot, 11)).toEqual({ x: 50, y: 25 });
    expect(projectilePosition(shot, 12)).toEqual({ x: 100, y: 50 });
  });

  it("is not drawn once it has landed, and waits at its release before", () => {
    expect(projectilePosition(shot, 12.01)).toBeUndefined();
    expect(projectilePosition(shot, 9)).toEqual({ x: 0, y: 0 });
  });

  it("points the way it flies", () => {
    expect(projectileHeading(shot)).toBeCloseTo(Math.atan2(50, 100), 9);
  });
});

describe("shotFadeAlpha (#238)", () => {
  it("fades an ended shot from full to nothing over 120 ms, then lets it go", () => {
    expect(SHOT_FADE_SECONDS).toBe(0.12);
    expect(shotFadeAlpha(0, 0)).toBe(1);
    expect(shotFadeAlpha(0, 0.06)).toBeCloseTo(0.5, 9);
    expect(shotFadeAlpha(0, 0.12)).toBe(0);
    expect(shotFadeAlpha(0, 0.121)).toBeUndefined();
  });
});

describe("MatchClock", () => {
  it("runs on from the server's clock at real time, a little way", () => {
    const clock = new MatchClock();
    clock.observe(5, 100);
    expect(clock.read(100.1)).toBeCloseTo(5.1, 9);
    // Never far past what the server last said.
    expect(clock.read(105)).toBeCloseTo(5.25, 9);
  });

  it("starts again from each new server time, not from each frame", () => {
    const clock = new MatchClock();
    clock.observe(5, 100);
    clock.observe(5, 100.04);
    expect(clock.read(100.05)).toBeCloseTo(5.05, 9);
    clock.observe(5.05, 100.06);
    expect(clock.read(100.06)).toBeCloseTo(5.05, 9);
  });
});
