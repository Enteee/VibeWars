import { FLAT_STRUCTURE } from "./arena-snapshot.js";
import { describe, expect, it } from "vitest";

import { CREATURE_LOOKS, vec2 } from "@vibewars/game-core";

import {
  AREA_FLASH_SECONDS,
  EMPTY_SNAPSHOT,
  FLOATING_TEXT_LINE,
  FLOATING_TEXT_SECONDS,
  FLOATING_TEXT_STACK,
  NAMEPLATE_SIGNET_SIZE,
  areaFlashAlpha,
  beaconBoltPoints,
  decayAreaFlashes,
  floatingTextY,
  actorAtPoint,
  healthFraction,
  nameLabelBottom,
  nameShown,
  nameTagBox,
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
  withNames,
  placeFloatingText,
  teamColour,
  markedForTeam,
  teamSide,
  toRenderableGroundEffect,
  type ArenaSnapshot,
  type FloatingText,
  type Rect,
  type RenderableActor,
} from "./arena-snapshot.js";
import { PROFESSION_GLYPH_SIZE } from "./arena-atlas.js";
import { LYING_WIDTH } from "./lying-pose.js";

describe("beaconBoltPoints (#2694)", () => {
  it("starts and ends exactly on its ends, and keeps its shape", () => {
    const bolt = { id: 7, from: vec2(0, 0), to: vec2(400, 0) };
    const points = beaconBoltPoints(bolt);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points.at(-1)).toEqual({ x: 400, y: 0 });
    expect(points.some((point) => point.y !== 0)).toBe(true);
    expect(beaconBoltPoints(bolt)).toEqual(points);
  });
});

describe("teamColour", () => {
  it("draws you in your team's colour, and the two sides apart", () => {
    expect(teamColour("self")).toBe(teamColour("ally"));
    expect(teamColour("ally")).not.toBe(teamColour("enemy"));
  });

  it("draws a third team apart from both (#2684)", () => {
    expect(teamColour("third")).not.toBe(teamColour("ally"));
    expect(teamColour("third")).not.toBe(teamColour("enemy"));
  });
});

/** Machado 2009 (severity 1) matrices, applied to linear sRGB. */
const CVD = {
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** CIE L*a*b* (D65) of a 0xRRGGBB colour after the matrix `m`. */
function labOf(hex: number, m: readonly (readonly number[])[]): [number, number, number] {
  const rgb = [hex >> 16, (hex >> 8) & 255, hex & 255].map((c) => linear(c / 255));
  const [r = 0, g = 0, b = 0] = m.map(
    (row) =>
      (row[0] ?? 0) * (rgb[0] ?? 0) + (row[1] ?? 0) * (rgb[1] ?? 0) + (row[2] ?? 0) * (rgb[2] ?? 0),
  );
  const f = (v: number): number => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 distance between two colours as someone with `vision` sees them. */
function seenApart(a: number, b: number, vision: keyof typeof CVD): number {
  const [l1, a1, b1] = labOf(a, CVD[vision]);
  const [l2, a2, b2] = labOf(b, CVD[vision]);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

describe("the third team's colour (#2755)", () => {
  it.each(Object.keys(CVD) as (keyof typeof CVD)[])(
    "is at least 45 from the ally blue and the foe red under %s",
    (vision) => {
      expect(seenApart(teamColour("third"), teamColour("ally"), vision)).toBeGreaterThanOrEqual(45);
      expect(seenApart(teamColour("third"), teamColour("enemy"), vision)).toBeGreaterThanOrEqual(
        45,
      );
    },
  );

  it("marks only the third team with a ◆", () => {
    expect(markedForTeam("third", "Brynn")).toBe("◆ Brynn");
    for (const side of ["ally", "enemy", "self"] as const) {
      expect(markedForTeam(side, "Brynn")).toBe("Brynn");
    }
  });
});

describe("teamSide (#2684)", () => {
  it("is the ally's for ours, the enemy's for the lowest other team, third for the last", () => {
    expect([0, 1, 2].map((team) => teamSide(team, 0))).toEqual(["ally", "enemy", "third"]);
    expect([0, 1, 2].map((team) => teamSide(team, 1))).toEqual(["enemy", "ally", "third"]);
    expect([0, 1, 2].map((team) => teamSide(team, 2))).toEqual(["enemy", "third", "ally"]);
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
    heroRank: 0,
    signet: undefined,
    cape: undefined,
    bot: false,
    position: vec2(x, y),
    facing: 0,
    layer: 0,
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
    teleportReadyAt: 0,
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
    layer: 1,
    radius: 109,
    endsAt: 19,
    durationSeconds: 17,
  };

  it("draws a ward where it was placed, at its radius, with its skill", () => {
    expect(toRenderableGroundEffect(ward, 1, "ward")).toEqual({
      id: 4,
      skillId: "elementalist.ward-against-melee",
      position: { x: 120, y: 80 },
      layer: 1,
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
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
    };
    expect(actorAtPoint(snapshot, vec2(0, 0))).toBeUndefined();
  });

  it("hits an actor when the point is within its radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
    };
    expect(actorAtPoint(snapshot, vec2(105, 100))?.id).toBe("a");
  });

  it("misses when the point is outside every actor's radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
    };
    expect(actorAtPoint(snapshot, vec2(200, 200))).toBeUndefined();
  });

  it("hits exactly at the radius boundary", () => {
    const self = actor("a", 0, 0, 10);
    const snapshot: ArenaSnapshot = {
      actors: [self],
      walls: [],
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
    };
    expect(actorAtPoint(snapshot, vec2(10, 0))?.id).toBe("a");
  });

  it("picks the closest actor when two overlap the point", () => {
    const near = actor("near", 100, 100, 20);
    const far = actor("far", 110, 100, 20);
    const snapshot: ArenaSnapshot = {
      actors: [far, near],
      walls: [],
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
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
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
    };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("living");
  });

  it("returns undefined when the only actor under the point is a dead foe", () => {
    const corpse = actor("corpse", 100, 100, 20, { team: "enemy", dead: true });
    const snapshot: ArenaSnapshot = {
      actors: [corpse],
      walls: [],
      structure: FLAT_STRUCTURE,
      shrines: [],
      flags: [],
      stand: undefined,
      altar: undefined,
      capturePoints: [],
      gates: [],
      switches: [],
      teleports: [],
      breakables: [],
      targetId: undefined,
      projectiles: [],
      groundEffects: [],
      clock: 0,
      hoverId: undefined,
      showAllNames: false,
      nameBoxes: new Map(),
      calledId: undefined,
      pings: [],
      strokes: [],
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

describe("actorAtPoint with name tags (#2738)", () => {
  const box = (left: number, top: number, right: number, bottom: number): Rect => ({
    left,
    top,
    right,
    bottom,
  });
  const arena = (actors: readonly RenderableActor[]): ArenaSnapshot => ({
    ...EMPTY_SNAPSHOT,
    actors,
  });
  // A body at (100, 100), radius 14; its tag 40 wide, 16 tall, 24 above.
  const foe = actor("foe", 100, 100, 14, { team: "enemy" });
  const tags = new Map([["foe", box(80, 60, 120, 76)]]);

  it("hits on the tag with the boxes, and misses without", () => {
    expect(actorAtPoint(arena([foe]), vec2(115, 65), tags)?.id).toBe("foe");
    expect(actorAtPoint(arena([foe]), vec2(115, 65))).toBeUndefined();
  });

  it("hits between the tag and the body", () => {
    expect(actorAtPoint(arena([foe]), vec2(100, 80), tags)?.id).toBe("foe");
    expect(actorAtPoint(arena([foe]), vec2(100, 80))).toBeUndefined();
  });

  it("misses beside the column and below the body", () => {
    expect(actorAtPoint(arena([foe]), vec2(125, 70), tags)).toBeUndefined();
    expect(actorAtPoint(arena([foe]), vec2(100, 115), tags)).toBeUndefined();
  });

  it("lets a body under the point beat a nearer tag column", () => {
    const body = actor("body", 100, 100, 14, { team: "enemy" });
    // A small body whose wide tag column covers the point, centre nearer it.
    const small = actor("small", 113, 108, 5, { team: "enemy" });
    const both = new Map([["small", box(90, 90, 160, 100)]]);
    expect(actorAtPoint(arena([body, small]), vec2(113, 100), both)?.id).toBe("body");
  });

  it("picks the nearest body when two tag columns hold the point", () => {
    const left = actor("left", 100, 100, 14, { team: "enemy" });
    const right = actor("right", 130, 100, 14, { team: "enemy" });
    const overlapping = new Map([
      ["left", box(70, 60, 160, 76)],
      ["right", box(70, 60, 160, 76)],
    ]);
    expect(actorAtPoint(arena([left, right]), vec2(125, 65), overlapping)?.id).toBe("right");
    expect(actorAtPoint(arena([left, right]), vec2(105, 65), overlapping)?.id).toBe("left");
  });

  it("never picks a foe's corpse through its tag, but an ally's", () => {
    const foeCorpse = actor("foe", 100, 100, 14, { team: "enemy", dead: true });
    const allyCorpse = actor("foe", 100, 100, 14, { team: "ally", dead: true });
    expect(actorAtPoint(arena([foeCorpse]), vec2(100, 65), tags)).toBeUndefined();
    expect(actorAtPoint(arena([allyCorpse]), vec2(100, 65), tags)?.id).toBe("foe");
  });

  it("prefers a living actor's tag to an ally's corpse under the point", () => {
    const corpse = actor("corpse", 100, 70, 10, { team: "ally", dead: true });
    expect(actorAtPoint(arena([corpse, foe]), vec2(100, 70), tags)?.id).toBe("foe");
  });

  it("gives the same hit at any zoom, the boxes being world units", () => {
    const monk = actor("monk", 100, 100, 14, { team: "enemy", profession: "monk" });
    for (const zoom of [0.5, 2]) {
      const tag = nameTagBox(monk, 40, 14, zoom, false);
      const onTag = vec2((tag.left + tag.right) / 2, (tag.top + tag.bottom) / 2);
      expect(actorAtPoint(arena([monk]), onTag, new Map([["monk", tag]]))?.id).toBe("monk");
    }
  });
});

describe("nameTagBox (#2738)", () => {
  it("covers the glyph and the label, as tall as the taller", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    const layout = nameplateLayout(monk, 40, 1, false);
    expect(nameTagBox(monk, 40, 14, 1, false)).toEqual({
      left: (layout.glyphX ?? 0) - PROFESSION_GLYPH_SIZE / 2,
      top: layout.bottom - Math.max(14, PROFESSION_GLYPH_SIZE),
      right: layout.textX + 20,
      bottom: layout.bottom,
    });
  });

  it("is the label alone with no profession", () => {
    const creature = actor("c", 200, 100, 10);
    const layout = nameplateLayout(creature, 40, 1, false);
    expect(nameTagBox(creature, 40, 14, 1, false)).toEqual({
      left: 180,
      top: layout.bottom - 14,
      right: 220,
      bottom: layout.bottom,
    });
  });

  it("spans more world zoomed out, as the screen-sized label does", () => {
    const creature = actor("c", 200, 100, 10);
    const near = nameTagBox(creature, 40, 14, 1, false);
    const wide = nameTagBox(creature, 40, 14, 0.5, false);
    expect(wide.right - wide.left).toBeCloseTo(2 * (near.right - near.left), 9);
    expect(wide.bottom - wide.top).toBeCloseTo(2 * (near.bottom - near.top), 9);
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
    expect(withNames(base, vec2(105, 100), false, new Map()).hoverId).toBe("enemy");
    expect(withNames(base, vec2(300, 100), false, new Map()).hoverId).toBeUndefined();
    expect(withNames(base, vec2(500, 500), false, new Map()).hoverId).toBeUndefined();
  });

  it("hovers a body by its name while Show names is held (#2738)", () => {
    const tags = new Map([["enemy", { left: 80, top: 60, right: 120, bottom: 76 }]]);
    expect(withNames(base, vec2(115, 65), true, tags).hoverId).toBe("enemy");
    expect(withNames(base, vec2(115, 65), false, tags).hoverId).toBeUndefined();
  });

  it("hovers nothing once the cursor has left, and carries Ctrl through", () => {
    const named = withNames(base, undefined, true, new Map());
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
    const layout = nameplateLayout(monk, 40, 1, false);
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
    const near = nameplateLayout(monk, 40, 1, false);
    const wide = nameplateLayout(monk, 40, 0.5, false);
    expect(wide.textX - 200).toBeCloseTo(2 * (near.textX - 200), 9);
    expect(wide.glyphX ?? 0).toBeCloseTo(200 + 2 * ((near.glyphX ?? 0) - 200), 9);
  });

  it("moves the glyph left with a longer name", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk" });
    expect(nameplateLayout(monk, 120, 1, false).glyphX ?? 0).toBeLessThan(
      nameplateLayout(monk, 40, 1, false).glyphX ?? 0,
    );
  });

  it("centres the glyph alone on a zero-width name", () => {
    const layout = nameplateLayout(actor("m", 200, 100, 14, { profession: "monk" }), 0, 1, false);
    expect(
      (layout.glyphX ?? 0) + (PROFESSION_GLYPH_SIZE + 2) / 2 - PROFESSION_GLYPH_SIZE / 2,
    ).toBeCloseTo(200, 9);
  });

  it("centres the name alone, with no glyph, for no profession", () => {
    const layout = nameplateLayout(actor("d", 200, 100), 40, 1, false);
    expect(layout.glyphX).toBeUndefined();
    expect(layout.textX).toBe(200);
  });

  it("puts a drawn signet between glyph and name, all centred together (#2805)", () => {
    const monk = actor("m", 200, 100, 14, { profession: "monk", signet: 42 });
    const layout = nameplateLayout(monk, 40, 1, true);
    const glyphRight = (layout.glyphX ?? 0) + PROFESSION_GLYPH_SIZE / 2;
    const signetLeft = (layout.signetX ?? 0) - NAMEPLATE_SIGNET_SIZE / 2;
    const signetRight = (layout.signetX ?? 0) + NAMEPLATE_SIGNET_SIZE / 2;
    expect(signetLeft - glyphRight).toBeCloseTo(2, 9);
    expect(layout.textX - 20 - signetRight).toBeCloseTo(2, 9);
    expect(((layout.glyphX ?? 0) - PROFESSION_GLYPH_SIZE / 2 + layout.textX + 20) / 2).toBeCloseTo(
      200,
      9,
    );
  });

  it("leaves no gap for a signet not loaded yet, nor for none, as over a bot (#2805)", () => {
    const plain = nameplateLayout(actor("m", 200, 100, 14, { profession: "monk" }), 40, 1, false);
    const loading = actor("m", 200, 100, 14, { profession: "monk", signet: 42 });
    expect(nameplateLayout(loading, 40, 1, false)).toEqual(plain);
    const bot = actor("b", 200, 100, 14, { profession: "monk", bot: true });
    expect(nameplateLayout(bot, 40, 1, true)).toEqual(plain);
    expect(plain.signetX).toBeUndefined();
  });

  it("widens the name tag's box by the signet only when it is drawn (#2805)", () => {
    const marked = actor("m", 200, 100, 14, { signet: 42 });
    const without = nameTagBox(marked, 40, 14, 1, false);
    const drawn = nameTagBox(marked, 40, 14, 1, true);
    expect(drawn.right - drawn.left - (without.right - without.left)).toBeCloseTo(
      NAMEPLATE_SIGNET_SIZE + 2,
      9,
    );
    expect(drawn.bottom - drawn.top).toBe(NAMEPLATE_SIGNET_SIZE);
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
