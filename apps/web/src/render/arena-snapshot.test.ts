import { describe, expect, it } from "vitest";

import { vec2 } from "@vibewars/game-core";

import {
  AREA_FLASH_SECONDS,
  EMPTY_SNAPSHOT,
  FLOATING_TEXT_LINE,
  FLOATING_TEXT_SECONDS,
  FLOATING_TEXT_STACK,
  areaFlashAlpha,
  decayAreaFlashes,
  floatingTextY,
  actorAtPoint,
  healthFraction,
  nameLabelBottom,
  nameShown,
  nameplateLayout,
  PROFESSION_GLYPH_SIZE,
  withNames,
  placeFloatingText,
  teamColour,
  type ArenaSnapshot,
  type FloatingText,
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
    facing: 0,
    weaponId: undefined,
    profession: undefined,
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
    const snapshot: ArenaSnapshot = {
      actors: [],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
    expect(actorAtPoint(snapshot, vec2(0, 0))).toBeUndefined();
  });

  it("hits an actor when the point is within its radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
    expect(actorAtPoint(snapshot, vec2(105, 100))?.id).toBe("a");
  });

  it("misses when the point is outside every actor's radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
    expect(actorAtPoint(snapshot, vec2(200, 200))).toBeUndefined();
  });

  it("hits exactly at the radius boundary", () => {
    const self = actor("a", 0, 0, 10);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
    expect(actorAtPoint(snapshot, vec2(10, 0))?.id).toBe("a");
  });

  it("picks the closest actor when two overlap the point", () => {
    const near = actor("near", 100, 100, 20);
    const far = actor("far", 110, 100, 20);
    const snapshot: ArenaSnapshot = {
      actors: [far, near],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
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
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("living");
  });

  it("returns undefined when the only actor under the point is dead", () => {
    const corpse = actor("corpse", 100, 100, 20, { dead: true });
    const snapshot: ArenaSnapshot = {
      actors: [corpse],
      walls: [],
      targetId: undefined,
      projectiles: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
    };
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

describe("placeFloatingText", () => {
  let nextId = 0;
  const text = (anchorId: string, remainingSeconds = FLOATING_TEXT_SECONDS): FloatingText => {
    nextId += 1;
    return {
      id: nextId,
      anchorId,
      text: "−10",
      position: vec2(100, 100),
      colour: 0xff7b72,
      weight: "normal",
      remainingSeconds,
    };
  };
  /** Add texts one by one, as the scene does, and say where each one is now. */
  const burst = (texts: FloatingText[]): number[] => {
    const placed: FloatingText[] = [];
    for (const incoming of texts) {
      const next = placeFloatingText(placed, incoming);
      if (next !== undefined) {
        placed.push(next);
      }
    }
    return placed.map(floatingTextY);
  };

  it("stacks hits landing together a line apart, newest on top (#54)", () => {
    expect(burst([text("b"), text("b"), text("b")])).toEqual([
      100,
      100 - FLOATING_TEXT_LINE,
      100 - 2 * FLOATING_TEXT_LINE,
    ]);
  });

  it("leaves a number alone once the last one has risen out of its way", () => {
    // A second old: risen 24px, well clear of a fresh number.
    expect(burst([text("b", FLOATING_TEXT_SECONDS - 1), text("b")])).toEqual([76, 100]);
  });

  it("lifts past an old number only as far as it has to", () => {
    // Half a second old: risen 12px, so the new one goes a line above it.
    const ys = burst([text("b", FLOATING_TEXT_SECONDS - 0.5), text("b")]);
    expect(ys[1]).toBeCloseTo(88 - FLOATING_TEXT_LINE, 6);
  });

  it("makes no room for numbers over somebody else", () => {
    expect(burst([text("a"), text("b")])).toEqual([100, 100]);
  });

  it("never stacks more than FLOATING_TEXT_STACK over one actor, even from a stream", () => {
    // A status ticking at 20 Hz for one text lifetime: 24 texts.
    let live: FloatingText[] = [];
    let tallest = 0;
    for (let tick = 0; tick < 24; tick += 1) {
      for (const floating of live) {
        floating.remainingSeconds -= 0.05;
      }
      live = live.filter((floating) => floating.remainingSeconds > 0);
      const placed = placeFloatingText(live, text("b"));
      if (placed !== undefined) {
        live.push(placed);
      }
      expect(live.length).toBeLessThanOrEqual(FLOATING_TEXT_STACK);
      tallest = Math.max(tallest, ...live.map((floating) => 100 - floatingTextY(floating)));
    }
    // A column of FLOATING_TEXT_STACK lines, plus how far one rises in its life.
    expect(tallest).toBeLessThanOrEqual((FLOATING_TEXT_STACK - 1) * FLOATING_TEXT_LINE + 24 * 1.2);
  });
});

describe("nameShown (#253)", () => {
  const enemy = actor("enemy", 100, 100, 14, { team: "enemy" });
  const me = actor("me", 200, 100, 14, { team: "self" });
  const corpse = actor("corpse", 300, 100, 14, { team: "enemy", dead: true });
  const arena = (overrides: Partial<ArenaSnapshot>): ArenaSnapshot => ({
    ...EMPTY_SNAPSHOT,
    actors: [enemy, me, corpse],
    ...overrides,
  });

  it("shows your target's, the hovered body's, and every name under Ctrl", () => {
    expect(nameShown(arena({ targetId: "enemy" }), enemy)).toBe(true);
    expect(nameShown(arena({ hoverId: "enemy" }), enemy)).toBe(true);
    expect(nameShown(arena({ showAllNames: true }), enemy)).toBe(true);
  });

  it("hides every other name", () => {
    expect(nameShown(arena({}), enemy)).toBe(false);
    expect(nameShown(arena({ targetId: "corpse", hoverId: "me" }), enemy)).toBe(false);
  });

  it("never shows your own, whatever the rule", () => {
    expect(nameShown(arena({ targetId: "me" }), me)).toBe(false);
    expect(nameShown(arena({ hoverId: "me" }), me)).toBe(false);
    expect(nameShown(arena({ showAllNames: true }), me)).toBe(false);
  });

  it("shows a dead target's name, and the dead under Ctrl", () => {
    expect(nameShown(arena({ targetId: "corpse" }), corpse)).toBe(true);
    expect(nameShown(arena({ showAllNames: true }), corpse)).toBe(true);
  });

  it("does not mind a hovered id that is not in the snapshot", () => {
    expect(nameShown(arena({ hoverId: "gone" }), enemy)).toBe(false);
  });
});

describe("withNames (#253)", () => {
  const enemy = actor("enemy", 100, 100, 14, { team: "enemy" });
  const corpse = actor("corpse", 300, 100, 14, { team: "enemy", dead: true });
  const base: ArenaSnapshot = { ...EMPTY_SNAPSHOT, actors: [enemy, corpse] };

  it("hovers the living body under the cursor, as a click would target it", () => {
    expect(withNames(base, vec2(105, 100), false).hoverId).toBe("enemy");
    expect(withNames(base, vec2(300, 100), false).hoverId).toBeUndefined();
    expect(withNames(base, vec2(500, 500), false).hoverId).toBeUndefined();
  });

  it("hovers nothing once the cursor has left, and carries Ctrl through", () => {
    const named = withNames(base, undefined, true);
    expect(named.hoverId).toBeUndefined();
    expect(named.showAllNames).toBe(true);
    expect(named.actors).toBe(base.actors);
  });
});

describe("nameplateLayout (#281)", () => {
  it("centres glyph, gap and name together on the body, on the name's bottom", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    const layout = nameplateLayout(monk, 40);
    const glyphLeft = (layout.glyphX ?? 0) - PROFESSION_GLYPH_SIZE / 2;
    const textRight = layout.textX + 40 / 2;
    expect((glyphLeft + textRight) / 2).toBeCloseTo(200, 9);
    // Glyph, then a 2 px gap, then the name.
    expect(layout.textX - 20 - ((layout.glyphX ?? 0) + PROFESSION_GLYPH_SIZE / 2)).toBeCloseTo(
      2,
      9,
    );
    expect(layout.bottom).toBe(nameLabelBottom(monk));
  });

  it("moves the glyph left with a longer name", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    expect(nameplateLayout(monk, 120).glyphX ?? 0).toBeLessThan(
      nameplateLayout(monk, 40).glyphX ?? 0,
    );
  });

  it("centres the glyph alone on a zero-width name", () => {
    const layout = nameplateLayout(actor("m", 200, 100, 14, { profession: "monk" }), 0);
    expect(
      (layout.glyphX ?? 0) + (PROFESSION_GLYPH_SIZE + 2) / 2 - PROFESSION_GLYPH_SIZE / 2,
    ).toBeCloseTo(200, 9);
  });

  it("centres the name alone, with no glyph, for no profession", () => {
    const layout = nameplateLayout(actor("d", 200, 100), 40);
    expect(layout.glyphX).toBeUndefined();
    expect(layout.textX).toBe(200);
  });
});
