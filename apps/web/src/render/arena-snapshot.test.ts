import { describe, expect, it } from "vitest";

import { vec2 } from "@vibewars/game-core";

import {
  AREA_FLASH_SECONDS,
  areaFlashAlpha,
  decayAreaFlashes,
  actorAtPoint,
  healthFraction,
  nameLabelBottom,
  teamColour,
  type ArenaSnapshot,
  type RenderableActor,
} from "./arena-snapshot.js";

describe("teamColour", () => {
  it("draws you in your team's colour, and the two sides apart", () => {
    expect(teamColour("self")).toBe(teamColour("ally"));
    expect(teamColour("ally")).not.toBe(teamColour("enemy"));
  });
});

function actor(
  id: string,
  x: number,
  y: number,
  radius = 14,
  overrides: Partial<RenderableActor> = {},
): RenderableActor {
  return {
    id,
    name: id,
    position: vec2(x, y),
    radius,
    team: "ally",
    health: 500,
    maxHealth: 500,
    dead: false,
    castProgress: undefined,
    statuses: [],
    ...overrides,
  };
}

describe("actorAtPoint", () => {
  it("returns undefined when there are no actors", () => {
    const snapshot: ArenaSnapshot = { actors: [], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(0, 0))).toBeUndefined();
  });

  it("hits an actor when the point is within its radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(105, 100))?.id).toBe("a");
  });

  it("misses when the point is outside every actor's radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(200, 200))).toBeUndefined();
  });

  it("hits exactly at the radius boundary", () => {
    const self = actor("a", 0, 0, 10);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(10, 0))?.id).toBe("a");
  });

  it("picks the closest actor when two overlap the point", () => {
    const near = actor("near", 100, 100, 20);
    const far = actor("far", 110, 100, 20);
    const snapshot: ArenaSnapshot = { actors: [far, near], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("near");
  });
});

describe("actorAtPoint and the dead", () => {
  it("skips a dead actor so a click selects whoever is behind the corpse", () => {
    const corpse = actor("corpse", 100, 100, 20, { dead: true });
    const living = actor("living", 105, 100, 20);
    const snapshot: ArenaSnapshot = {
      actors: [corpse, living],
      walls: [],
      targetId: undefined,
    };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("living");
  });

  it("returns undefined when the only actor under the point is dead", () => {
    const corpse = actor("corpse", 100, 100, 20, { dead: true });
    const snapshot: ArenaSnapshot = { actors: [corpse], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(100, 100))).toBeUndefined();
  });
});

describe("healthFraction", () => {
  it("is 1 at full health and 0 at none", () => {
    expect(healthFraction(actor("a", 0, 0, 14, { health: 500, maxHealth: 500 }))).toBe(1);
    expect(healthFraction(actor("a", 0, 0, 14, { health: 0, maxHealth: 500 }))).toBe(0);
  });

  it("is the ratio in between", () => {
    expect(healthFraction(actor("a", 0, 0, 14, { health: 250, maxHealth: 500 }))).toBe(0.5);
  });

  it("clamps rather than returning a value outside 0..1", () => {
    expect(healthFraction(actor("a", 0, 0, 14, { health: 900, maxHealth: 500 }))).toBe(1);
    expect(healthFraction(actor("a", 0, 0, 14, { health: -50, maxHealth: 500 }))).toBe(0);
  });

  it("does not divide by zero when maxHealth is zero", () => {
    expect(healthFraction(actor("a", 0, 0, 14, { health: 0, maxHealth: 0 }))).toBe(0);
  });
});

describe("area flashes", () => {
  const flash = {
    id: 1,
    position: vec2(0, 0),
    radius: 81,
    colour: 0,
    remainingSeconds: AREA_FLASH_SECONDS,
  };

  it("fade from full to nothing over their lifetime, then are gone", () => {
    expect(areaFlashAlpha(flash)).toBe(1);
    const half = decayAreaFlashes([flash], AREA_FLASH_SECONDS / 2);
    expect(half).toHaveLength(1);
    expect(areaFlashAlpha(half[0] ?? flash)).toBeCloseTo(0.5);
    expect(decayAreaFlashes(half, AREA_FLASH_SECONDS / 2)).toEqual([]);
  });

  it("never change their radius, and leave the input alone", () => {
    const [older] = decayAreaFlashes([flash], 0.1);
    expect(older?.radius).toBe(81);
    expect(flash.remainingSeconds).toBe(AREA_FLASH_SECONDS);
  });
});

describe("nameLabelBottom", () => {
  it("keeps a living actor's name clear of its health and cast bars", () => {
    const living = actor("a", 100, 100);
    // The cast bar's top is 19 above the circle; the name sits above that.
    expect(nameLabelBottom(living)).toBeLessThan(100 - 14 - 19);
  });

  it("lowers a corpse's name, which has no bars to clear", () => {
    expect(nameLabelBottom(actor("a", 100, 100, 14, { dead: true }))).toBeGreaterThan(
      nameLabelBottom(actor("a", 100, 100)),
    );
  });
});
