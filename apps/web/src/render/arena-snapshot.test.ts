import { describe, expect, it } from "vitest";

import { CREATURE_LOOKS, vec2 } from "@vibewars/game-core";

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
  offhandMarkLayout,
  type OffhandMarkLayout,
  nameplateLayout,
  bodyGlyphLayout,
  BODY_EDGE,
  BODY_GLYPH_ALPHA,
  BODY_GLYPH_SIZE,
  CREATURE_GLYPH_SIZE,
  GHOST_GLYPH_TINT,
  DEAD_COLOUR,
  EXPLOITED_CORPSE_COLOUR,
  PROFESSION_GLYPH_SIZE,
  withNames,
  placeFloatingText,
  teamColour,
  toRenderableGroundEffect,
  type ArenaSnapshot,
  type FloatingText,
  type RenderableActor,
} from "./arena-snapshot.js";
import { LYING_WIDTH } from "./lying-pose.js";

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
    guildTag: undefined,
    cape: undefined,
    bot: false,
    position: vec2(x, y),
    facing: 0,
    weaponId: undefined,
    swingElapsed: 0,
    swingTotal: 0,
    attackCast: undefined,
    offhandId: undefined,
    profession: undefined,
    creatureLook: undefined,
    radius,
    team: "ally",
    health: 500,
    maxHealth: 500,
    dead: false,
    exploited: false,
    knockedDown: false,
    castProgress: undefined,
    castType: undefined,
    statuses: [],
    enchanted: false,
    hexed: false,
    invulnerable: false,
    conditionCues: [],
    ...overrides,
  };
}

describe("toRenderableGroundEffect (#1087)", () => {
  const ward = {
    id: 4,
    skillId: "elementalist.ward-against-melee",
    team: 1,
    x: 120,
    y: 80,
    radius: 109,
    endsAt: 19,
    durationSeconds: 17,
  };

  it("draws a ward where it was placed, at its radius, with its skill", () => {
    expect(toRenderableGroundEffect(ward, 1, "ward")).toEqual({
      id: 4,
      skillId: "elementalist.ward-against-melee",
      position: { x: 120, y: 80 },
      radius: 109,
      colour: teamColour("ally"),
      filled: true,
    });
  });

  it("colours a ward by side: yours as an ally's, any other team's as a foe's", () => {
    expect(toRenderableGroundEffect(ward, 0, "ward").colour).toBe(teamColour("enemy"));
    expect(toRenderableGroundEffect(ward, undefined, "ward").colour).toBe(teamColour("enemy"));
  });

  it("draws a trap as its outline alone (#1105)", () => {
    expect(toRenderableGroundEffect(ward, 1, "trap").filled).toBe(false);
  });
});

describe("actorAtPoint", () => {
  it("returns undefined when there are no actors", () => {
    const snapshot: ArenaSnapshot = {
      actors: [],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(0, 0))).toBeUndefined();
  });

  it("hits an actor when the point is within its radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(105, 100))?.id).toBe("a");
  });

  it("misses when the point is outside every actor's radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(200, 200))).toBeUndefined();
  });

  it("hits exactly at the radius boundary", () => {
    const self = actor("a", 0, 0, 10);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(10, 0))?.id).toBe("a");
  });

  it("picks the closest actor when two overlap the point", () => {
    const near = actor("near", 100, 100, 20);
    const far = actor("far", 110, 100, 20);
    const snapshot: ArenaSnapshot = {
      actors: [far, near],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
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
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("living");
  });

  it("returns undefined when the only actor under the point is a dead foe", () => {
    const corpse = actor("corpse", 100, 100, 20, { team: "enemy", dead: true });
    const snapshot: ArenaSnapshot = {
      actors: [corpse],
      walls: [],
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      calledId: undefined,
      pings: [],
    };
    expect(actorAtPoint(snapshot, vec2(100, 100))).toBeUndefined();
  });
});

describe("actorAtPoint and an ally's corpse (#812)", () => {
  const arena = (actors: readonly RenderableActor[]): ArenaSnapshot => ({
    ...EMPTY_SNAPSHOT,
    actors,
  });

  it("picks an ally's corpse when nobody living is under the point", () => {
    const corpse = actor("corpse", 100, 100, 20, { dead: true });
    expect(actorAtPoint(arena([corpse]), vec2(100, 100))?.id).toBe("corpse");
  });

  it("still prefers the living, even farther from the point", () => {
    const corpse = actor("corpse", 100, 100, 20, { dead: true });
    const living = actor("living", 115, 100, 20, { team: "enemy" });
    expect(actorAtPoint(arena([corpse, living]), vec2(100, 100))?.id).toBe("living");
  });

  it("never picks a foe's corpse or your own", () => {
    const foe = actor("foe", 100, 100, 20, { team: "enemy", dead: true });
    const me = actor("me", 100, 100, 20, { team: "self", dead: true });
    expect(actorAtPoint(arena([foe, me]), vec2(100, 100))).toBeUndefined();
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
    expect(nameLabelBottom(living, 1)).toBeLessThan(100 - 14 - 19);
  });

  it("lowers a corpse's name, which has no bars to clear", () => {
    expect(nameLabelBottom(actor("a", 100, 100, 14, { dead: true }), 1)).toBeGreaterThan(
      nameLabelBottom(actor("a", 100, 100), 1),
    );
  });

  it("keeps the gap over the cast bar the same on screen at every zoom (#456)", () => {
    const living = actor("a", 100, 100);
    for (const zoom of [0.26, 0.65, 1]) {
      // The cast bar's top scales with the world; the gap above it does not.
      const gap = (100 - 14 - 19 - nameLabelBottom(living, zoom)) * zoom;
      expect(gap).toBeCloseTo(3, 9);
    }
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
      lift: 0,
      colour: 0xff7b72,
      weight: "normal",
      remainingSeconds,
    };
  };
  /** Add texts one by one, as the scene does, and say where each one is now. */
  const burst = (texts: FloatingText[], zoom = 1): number[] => {
    const placed: FloatingText[] = [];
    for (const incoming of texts) {
      const next = placeFloatingText(placed, incoming, zoom);
      if (next !== undefined) {
        placed.push(next);
      }
    }
    return placed.map((floating) => floatingTextY(floating, zoom));
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

  it("stacks and rises in screen px, so a zoomed-out line is more world (#456)", () => {
    for (const zoom of [0.26, 0.65, 1]) {
      const [first = 0, second = 0] = burst([text("b"), text("b")], zoom);
      expect((first - second) * zoom).toBeCloseTo(FLOATING_TEXT_LINE, 9);
    }
    const older = text("b", FLOATING_TEXT_SECONDS - 1);
    // A second's 24 px rise, on screen.
    expect((100 - floatingTextY(older, 0.5)) * 0.5).toBeCloseTo(24, 9);
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
      const placed = placeFloatingText(live, text("b"), 1);
      if (placed !== undefined) {
        live.push(placed);
      }
      expect(live.length).toBeLessThanOrEqual(FLOATING_TEXT_STACK);
      tallest = Math.max(tallest, ...live.map((floating) => 100 - floatingTextY(floating, 1)));
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

describe("offhandMarkLayout (#276)", () => {
  const R = 14;
  const X = 100;
  const Y = 100;
  const FACINGS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  /** Points on both edges of the casing, the widest thing the mark paints. */
  function painted(mark: OffhandMarkLayout): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    for (const offset of [-mark.casing / 2, mark.casing / 2]) {
      for (let k = 0; k <= 24; k += 1) {
        if (mark.kind === "arc") {
          const angle = mark.from + ((mark.to - mark.from) * k) / 24;
          const radius = mark.radius + offset;
          points.push({
            x: mark.x + Math.cos(angle) * radius,
            y: mark.y + Math.sin(angle) * radius,
          });
        } else {
          const angle = (k * 2 * Math.PI) / 24;
          const radius = mark.radius + offset;
          points.push({
            x: mark.x + Math.cos(angle) * radius,
            y: mark.y + Math.sin(angle) * radius,
          });
        }
      }
    }
    return points;
  }

  /** Signed angle from the facing to the point, in degrees; negative is left (y down). */
  function bearing(point: { x: number; y: number }, facing: number): number {
    const raw = Math.atan2(point.y - Y, point.x - X) - facing;
    return (Math.atan2(Math.sin(raw), Math.cos(raw)) * 180) / Math.PI;
  }

  it("draws nothing without an off-hand", () => {
    expect(offhandMarkLayout(X, Y, R, 0, undefined)).toBeUndefined();
  });

  it("makes the shield an arc on the body at r + 3.5, cased 5 under 3", () => {
    expect(offhandMarkLayout(X, Y, R, 0, "shield")).toEqual({
      kind: "arc",
      x: X,
      y: Y,
      radius: R + 3.5,
      from: (-105 * Math.PI) / 180,
      to: (-45 * Math.PI) / 180,
      casing: 5,
      core: 3,
    });
  });

  it("makes the focus a 1.75 ring at r + 3.5, 75° left, cased 3 under 1.5", () => {
    const mark = offhandMarkLayout(X, Y, R, 0, "focus");
    expect(mark?.kind).toBe("ring");
    expect(mark?.radius).toBe(1.75);
    expect(mark?.casing).toBe(3);
    expect(mark?.core).toBe(1.5);
    expect(Math.hypot((mark?.x ?? 0) - X, (mark?.y ?? 0) - Y)).toBeCloseTo(R + 3.5, 9);
  });

  for (const offhand of ["shield", "focus"] as const) {
    it(`keeps the ${offhand} inside r + 7, left of the facing, clear of the weapon's 25°`, () => {
      for (const facing of FACINGS) {
        const mark = offhandMarkLayout(X, Y, R, facing, offhand);
        expect(mark).toBeDefined();
        if (mark === undefined) {
          continue;
        }
        for (const point of painted(mark)) {
          expect(Math.hypot(point.x - X, point.y - Y)).toBeLessThanOrEqual(R + 7 + 1e-9);
          const off = bearing(point, facing);
          // Left of the facing, never inside the weapon mark's corridor.
          expect(off, `facing ${String(facing)}`).toBeLessThan(-25);
          expect(off).toBeGreaterThan(-180);
        }
      }
    });
  }

  it("turns with the body: facing south puts it east, facing north puts it west", () => {
    const south = offhandMarkLayout(X, Y, R, Math.PI / 2, "focus");
    const north = offhandMarkLayout(X, Y, R, -Math.PI / 2, "focus");
    expect(south?.x ?? 0).toBeGreaterThan(X);
    expect(north?.x ?? 0).toBeLessThan(X);
  });
});

describe("nameplateLayout (#281)", () => {
  it("centres glyph, gap and name together on the body, on the name's bottom", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    const layout = nameplateLayout(monk, 40, 1);
    const glyphLeft = (layout.glyphX ?? 0) - PROFESSION_GLYPH_SIZE / 2;
    const textRight = layout.textX + 40 / 2;
    expect((glyphLeft + textRight) / 2).toBeCloseTo(200, 9);
    // Glyph, then a 2 px gap, then the name.
    expect(layout.textX - 20 - ((layout.glyphX ?? 0) + PROFESSION_GLYPH_SIZE / 2)).toBeCloseTo(
      2,
      9,
    );
    expect(layout.bottom).toBe(nameLabelBottom(monk, 1));
  });

  it("lays glyph, gap and name out in screen px, so they span more world zoomed out (#456)", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    const near = nameplateLayout(monk, 40, 1);
    const wide = nameplateLayout(monk, 40, 0.5);
    expect(wide.textX - 200).toBeCloseTo(2 * (near.textX - 200), 9);
    expect(wide.glyphX ?? 0).toBeCloseTo(200 + 2 * ((near.glyphX ?? 0) - 200), 9);
  });

  it("moves the glyph left with a longer name", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    expect(nameplateLayout(monk, 120, 1).glyphX ?? 0).toBeLessThan(
      nameplateLayout(monk, 40, 1).glyphX ?? 0,
    );
  });

  it("centres the glyph alone on a zero-width name", () => {
    const layout = nameplateLayout(actor("m", 200, 100, 14, { profession: "monk" }), 0, 1);
    expect(
      (layout.glyphX ?? 0) + (PROFESSION_GLYPH_SIZE + 2) / 2 - PROFESSION_GLYPH_SIZE / 2,
    ).toBeCloseTo(200, 9);
  });

  it("centres the name alone, with no glyph, for no profession", () => {
    const layout = nameplateLayout(actor("d", 200, 100), 40, 1);
    expect(layout.glyphX).toBeUndefined();
    expect(layout.textX).toBe(200);
  });
});

describe("bodyGlyphLayout (#1037)", () => {
  it("centres a 13 u glyph on a living body, in edge at 60 %", () => {
    const layout = bodyGlyphLayout(actor("m", 200, 100, 14, { profession: "monk" }));
    expect(layout).toEqual({
      glyph: { kind: "profession", profession: "monk" },
      x: 200,
      y: 100,
      size: 13,
      tint: BODY_EDGE,
      alpha: 0.6,
    });
    expect(BODY_GLYPH_SIZE).toBe(13);
    expect(BODY_GLYPH_ALPHA).toBe(0.6);
  });

  it("greys a corpse's glyph at full opacity, same size", () => {
    const layout = bodyGlyphLayout(
      actor("m", 200, 100, 14, { profession: "necromancer", dead: true }),
    );
    expect(layout).toMatchObject({ size: 13, tint: DEAD_COLOUR, alpha: 1, x: 200, y: 100 });
  });

  it("darkens an exploited corpse's glyph (#466)", () => {
    const layout = bodyGlyphLayout(
      actor("m", 200, 100, 14, { profession: "necromancer", dead: true, exploited: true }),
    );
    expect(layout).toMatchObject({ tint: EXPLOITED_CORPSE_COLOUR, alpha: 1 });
  });

  it("shrinks it to fit the flattened disc of a knocked-down body", () => {
    const layout = bodyGlyphLayout(
      actor("m", 200, 100, 14, { profession: "warrior", knockedDown: true }),
    );
    expect(layout?.size).toBeCloseTo(13 * LYING_WIDTH, 9);
    expect(layout).toMatchObject({ x: 200, y: 100, tint: BODY_EDGE, alpha: 0.6 });
  });

  it("draws none without a profession", () => {
    expect(bodyGlyphLayout(actor("m", 200, 100))).toBeUndefined();
  });

  it("gives a creature its kind's glyph, opaque, and keeps its size knocked down (#1162)", () => {
    for (const look of CREATURE_LOOKS) {
      const standing = bodyGlyphLayout(actor("c", 200, 100, 10, { creatureLook: look }));
      expect(standing).toEqual({
        glyph: { kind: "creature", look },
        x: 200,
        y: 100,
        size: CREATURE_GLYPH_SIZE,
        // A Ghostly Hero's stand-in glyph is pale (#1377).
        tint: look === "ghostly-hero" ? GHOST_GLYPH_TINT : BODY_EDGE,
        alpha: 1,
      });
      expect(
        bodyGlyphLayout(actor("c", 200, 100, 10, { creatureLook: look, knockedDown: true })),
      ).toEqual(standing);
    }
  });

  it("greys a dead pet's glyph (#1162)", () => {
    expect(
      bodyGlyphLayout(actor("c", 200, 100, 10, { creatureLook: "beast", dead: true })),
    ).toMatchObject({ glyph: { kind: "creature", look: "beast" }, tint: DEAD_COLOUR, alpha: 1 });
  });
});
