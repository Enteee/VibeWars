import { describe, expect, it } from "vitest";

import { pointInPolygon, type Vec2 } from "@vibewars/game-core";

import { DECK_SHADOW, DECK_TINT } from "./arena-palette.js";
import type { MapStructure, RenderableShape } from "./arena-snapshot.js";
import {
  CASTER_HEIGHT,
  layerLightShadows,
  layerSunShadows,
  lightShadow,
  paintDeckShadows,
  shadowCasters,
  sunShadow,
  sunShadowOffset,
  type Outline,
} from "./shadow-geometry.js";

/** A square caster, 20 on a side, from (100, 90). */
const SQUARE: Outline = [
  { x: 100, y: 90 },
  { x: 120, y: 90 },
  { x: 120, y: 110 },
  { x: 100, y: 110 },
];

const sun = (directionDeg: number, elevationDeg: number) => ({
  directionDeg,
  elevationDeg,
  colour: 0xffffff,
  intensity: 1,
});

function shaded(point: Vec2, shadows: readonly Outline[]): boolean {
  return shadows.some((shadow) => pointInPolygon(point, shadow));
}

describe("the sun's shadow (#2988)", () => {
  it("falls away from the sun, a caster's height long at 45°", () => {
    const fromTop = sunShadowOffset(sun(0, 45), CASTER_HEIGHT);
    expect(fromTop.x).toBeCloseTo(0, 9);
    expect(fromTop.y).toBeCloseTo(CASTER_HEIGHT, 9);
    const fromRight = sunShadowOffset(sun(90, 45), CASTER_HEIGHT);
    expect(fromRight.x).toBeCloseTo(-CASTER_HEIGHT, 9);
    expect(fromRight.y).toBeCloseTo(0, 9);
  });

  it("lengthens as the sun stands lower", () => {
    const high = sunShadowOffset(sun(0, 60), CASTER_HEIGHT).y;
    const low = sunShadowOffset(sun(0, 20), CASTER_HEIGHT).y;
    expect(low).toBeGreaterThan(high);
    expect(sunShadowOffset(sun(0, 30), CASTER_HEIGHT).y).toBeCloseTo(
      CASTER_HEIGHT * Math.sqrt(3),
      9,
    );
  });

  it("covers the ground behind a square caster, and nothing before it", () => {
    const shadows = sunShadow(SQUARE, sunShadowOffset(sun(0, 45), CASTER_HEIGHT));
    expect(shaded({ x: 110, y: 110 + CASTER_HEIGHT / 2 }, shadows)).toBe(true);
    expect(shaded({ x: 110, y: 110 + CASTER_HEIGHT - 1 }, shadows)).toBe(true);
    expect(shaded({ x: 110, y: 110 + CASTER_HEIGHT + 1 }, shadows)).toBe(false);
    expect(shaded({ x: 110, y: 80 }, shadows)).toBe(false);
    expect(shaded({ x: 125, y: 130 }, shadows)).toBe(false);
  });

  it("throws none from a sun overhead", () => {
    expect(sunShadow(SQUARE, sunShadowOffset(sun(0, 90), CASTER_HEIGHT))).toEqual([]);
  });

  it("throws none from a caster standing wholly indoors, where it does not reach", () => {
    const dark = { colour: 0xffffff, intensity: 0 };
    const roofed = (x: number) => ({
      ambient: dark,
      indoorAmbient: dark,
      indoor: [{ kind: "rect" as const, x, y: 80, width: 40, height: 40 }],
      sun: sun(0, 45),
      lights: [],
    });
    expect(layerSunShadows(roofed(90), [SQUARE])).toEqual([]);
    // Half under the roof, it still stands in the sun.
    expect(layerSunShadows(roofed(110), [SQUARE])).not.toEqual([]);
  });
});

describe("a point light's shadow (#2988)", () => {
  it("covers the ground behind a caster, out past the light's reach", () => {
    const shadows = lightShadow(SQUARE, { x: 50, y: 100 }, 100);
    expect(shaded({ x: 140, y: 100 }, shadows)).toBe(true);
    expect(shaded({ x: 149, y: 100 }, shadows)).toBe(true);
    expect(shaded({ x: 50, y: 150 }, shadows)).toBe(false);
    expect(shaded({ x: 80, y: 100 }, shadows)).toBe(false);
  });

  it("is a wedge from a light off a corner", () => {
    const shadows = lightShadow(SQUARE, { x: 90, y: 80 }, 100);
    expect(shaded({ x: 130, y: 120 }, shadows)).toBe(true);
    expect(shaded({ x: 140, y: 85 }, shadows)).toBe(false);
    expect(shaded({ x: 85, y: 130 }, shadows)).toBe(false);
  });

  it("stays a number for a light right on a corner", () => {
    const shadows = lightShadow(SQUARE, { x: 100, y: 90 }, 100);
    expect(shadows.flat().every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
  });

  it("keeps its far edge outside the light for a long wall close by", () => {
    const wall: Outline = [
      { x: -500, y: 10 },
      { x: 500, y: 10 },
      { x: 500, y: 20 },
      { x: -500, y: 20 },
    ];
    for (const [, , c, d] of lightShadow(wall, { x: 0, y: 0 }, 100)) {
      if (c !== undefined && d !== undefined) {
        expect(Math.hypot((c.x + d.x) / 2, (c.y + d.y) / 2)).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it("throws none from a light inside a wall: it is ignored, not refused", () => {
    const torch = {
      id: "torch",
      position: { x: 110, y: 100 },
      layer: 0,
      radius: 100,
      colour: 0xffffff,
      intensity: 1,
      flicker: 0,
    };
    const other: Outline = SQUARE.map(({ x, y }) => ({ x: x + 40, y }));
    expect(lightShadow(SQUARE, torch.position, torch.radius)).toEqual([]);
    expect(layerLightShadows(torch, [SQUARE, other])).toEqual([]);
  });

  it("takes no shadow from a caster out of the light's reach", () => {
    const torch = {
      id: "torch",
      position: { x: 500, y: 500 },
      layer: 0,
      radius: 100,
      colour: 0xffffff,
      intensity: 1,
      flicker: 0,
    };
    expect(layerLightShadows(torch, [SQUARE])).toEqual([]);
  });
});

const BRIDGE: RenderableShape = { kind: "rect", x: 100, y: 100, width: 200, height: 100 };
const STRUCTURE: MapStructure = {
  layerCount: 2,
  bounds: { kind: "rect" },
  ground: 0,
  pits: [],
  tunnels: [],
  downDecks: [],
  decks: [{ layer: 1, footprint: BRIDGE, look: "platform", switched: null }],
  transitions: [],
  water: [],
  zones: [],
};

/** STRUCTURE with a pit under its ground (#2973): the bridge a step over it. */
const SUNK: MapStructure = {
  ...STRUCTURE,
  layerCount: 3,
  bounds: { kind: "rect" },
  ground: 1,
  decks: [{ layer: 2, footprint: BRIDGE, look: "platform", switched: null }],
};

describe("what casts a shadow on a layer (#2988)", () => {
  const walls = [
    { kind: "rect", layer: 0, x: 0, y: 0, width: 10, height: 10 },
    { kind: "rect", layer: 1, x: 150, y: 150, width: 10, height: 10 },
  ] as const;

  it("is the ground's walls and every deck, on the ground", () => {
    expect(shadowCasters(walls, STRUCTURE, 0)).toHaveLength(2);
  });

  it("is a deck's own walls alone, on a deck", () => {
    const casters = shadowCasters(walls, STRUCTURE, 1);
    expect(casters).toHaveLength(1);
    expect(casters[0]?.[0]).toEqual({ x: 150, y: 150 });
  });

  it("is the ground's walls and every deck where the ground is over a pit (#2973)", () => {
    const raised = walls.map((wall) => ({ ...wall, layer: wall.layer + 1 }));
    expect(shadowCasters(raised, SUNK, 1)).toHaveLength(2);
    expect(shadowCasters(raised, SUNK, 0)).toEqual([]);
  });
});

describe("the fixed deck shadow (#2988)", () => {
  function paint(lightShadows: boolean, structure: MapStructure = STRUCTURE): string[] {
    const calls: string[] = [];
    paintDeckShadows(
      {
        save: () => calls.push("save"),
        restore: () => calls.push("restore"),
        translateCanvas: (x, y) => calls.push(`translate ${String(x)} ${String(y)}`),
        fillStyle: (colour) => calls.push(`fill ${colour.toString(16)}`),
        fillShape: () => calls.push("shape"),
      },
      structure,
      lightShadows,
    );
    return calls;
  }

  it("is drawn on a map whose light maps cast no shadows", () => {
    expect(paint(false)).toEqual([
      "save",
      `translate ${String(DECK_SHADOW.offset)} ${String(DECK_SHADOW.offset)}`,
      `fill ${DECK_SHADOW.colour.toString(16)}`,
      "shape",
      "restore",
      `fill ${DECK_TINT.colour.toString(16)}`,
      "shape",
    ]);
  });

  it("gives way to the light maps' shadows, keeping the ground under the deck darker", () => {
    expect(paint(true)).toEqual([`fill ${DECK_TINT.colour.toString(16)}`, "shape"]);
  });

  it("falls from a deck one step over the ground, wherever the ground is (#2973)", () => {
    expect(paint(false, SUNK)).toEqual(paint(false));
  });
});
