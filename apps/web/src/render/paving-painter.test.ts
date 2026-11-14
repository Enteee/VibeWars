import { distancePointToSegment, pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { MapPaving } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { BIOME, pavingPalette } from "./arena-palette.js";
import {
  MAX_PAVING_STONES,
  PAVING_EDGE,
  PAVING_TEXTURE_BUDGET,
  PAVING_TEXTURE_MAX_SIDE,
  PAVING_TEXTURE_SCALE,
  type PavingCanvas,
  type StonePaving,
  isStonePaving,
  paintPaving,
  paintPavingPiece,
  pavingDrawing,
  pavingTextureSizes,
  pavingTunnelPieces,
} from "./paving-painter.js";

const colours = BIOME.desert.paving;
const LOOKS = ["cobbles", "flagstones", "dirt"] as const;

/** Inside `outline`, or on its edge, where a stone cut by it ends. */
const within = (point: Vec2, outline: readonly Vec2[]): boolean =>
  pointInPolygon(point, outline) ||
  outline.some(
    (a, at) =>
      distancePointToSegment(point, { a, b: outline[(at + 1) % outline.length] ?? a }) < 1e-6,
  );

const street = (overrides: Partial<StonePaving> = {}): StonePaving => ({
  id: "main-street",
  layer: 0,
  look: "cobbles",
  area: {
    kind: "polygon",
    points: [
      { x: 100, y: 100 },
      { x: 420, y: 120 },
      { x: 400, y: 260 },
      { x: 240, y: 200 },
      { x: 110, y: 240 },
    ],
  },
  ...overrides,
});

describe("paving (#3210)", () => {
  it.each(LOOKS)("draws %s the same for the same id, and differently for another", (look) => {
    const drawn = pavingDrawing(street({ look }), colours[look]);
    expect(pavingDrawing(street({ look }), colours[look])).toEqual(drawn);
    expect(pavingDrawing(street({ look, id: "side-street" }), colours[look]).commands).not.toEqual(
      drawn.commands,
    );
  });

  it.each(LOOKS)("lays every stone of %s inside the area", (look) => {
    const drawn = pavingDrawing(street({ look }), colours[look]);
    expect(drawn.stones.length).toBeGreaterThan({ cobbles: 200, flagstones: 20, dirt: 5 }[look]);
    for (const stone of drawn.stones) {
      for (const corner of stone) {
        expect(within(corner, drawn.outline)).toBe(true);
      }
    }
  });

  it("draws in bounds round the area and its soft edge", () => {
    const drawn = pavingDrawing(
      street({ area: { kind: "rect", x: 50, y: 60, width: 200, height: 40 } }),
      colours.cobbles,
    );
    expect(drawn.bounds).toEqual({
      x: 50 - PAVING_EDGE,
      y: 60 - PAVING_EDGE,
      width: 200 + PAVING_EDGE * 2,
      height: 40 + PAVING_EDGE * 2,
    });
  });

  it("lays larger stones in a huge area, not more of them", () => {
    const huge = street({ area: { kind: "rect", x: 0, y: 0, width: 2600, height: 2600 } });
    for (const look of LOOKS) {
      expect(pavingDrawing({ ...huge, look }, colours[look]).stones.length).toBeLessThanOrEqual(
        MAX_PAVING_STONES,
      );
    }
  });

  it("is laid in the biome's tones, and in the flat palette's on a map of one layer", () => {
    expect(BIOME.desert.paving.cobbles.stone).not.toBe(BIOME.hall.paving.cobbles.stone);
    expect(pavingPalette({ layerCount: 2, biome: "desert" })).toBe(BIOME.desert.paving);
    expect(pavingPalette({ layerCount: 1, biome: "desert" })).not.toBe(BIOME.desert.paving);
  });

  it("is never brighter than a deck's stone: a floor material, not a decal", () => {
    const brightness = (colour: number): number =>
      ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);
    for (const biome of ["hall", "desert"] as const) {
      for (const look of LOOKS) {
        const { bed, stone, light } = BIOME[biome].paving[look];
        for (const colour of [bed, stone, light]) {
          expect(brightness(colour)).toBeLessThan(brightness(BIOME[biome].palette.deckTop));
        }
      }
    }
  });
});

describe("pavingTextureSizes", () => {
  const pixels = (sizes: readonly { width: number; height: number }[]): number =>
    sizes.reduce((sum, { width, height }) => sum + width * height, 0);

  it("keeps 32 map-sized pavings under the budget together", () => {
    const sizes = pavingTextureSizes(
      Array.from({ length: 32 }, () => ({ width: 6400, height: 3600 })),
    );
    expect(pixels(sizes)).toBeLessThanOrEqual(PAVING_TEXTURE_BUDGET);
    for (const size of sizes) {
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(PAVING_TEXTURE_MAX_SIDE);
    }
  });

  it("paints a town's roads at one scale, under the budget", () => {
    const bounds = [
      ...Array.from({ length: 12 }, () => ({ width: 6000, height: 3000 })),
      { width: 400, height: 400 },
    ];
    const sizes = pavingTextureSizes(bounds);
    expect(pixels(sizes)).toBeLessThanOrEqual(PAVING_TEXTURE_BUDGET);
    expect(new Set(sizes.map((size) => size.scale)).size).toBe(1);
  });

  it("keeps the full scale while a map's pavings are small", () => {
    const sizes = pavingTextureSizes([
      { width: 300, height: 120 },
      { width: 80, height: 80 },
    ]);
    expect(sizes).toEqual([
      { scale: PAVING_TEXTURE_SCALE, width: 600, height: 240 },
      { scale: PAVING_TEXTURE_SCALE, width: 160, height: 160 },
    ]);
  });

  it("caps a single long paving's side", () => {
    const [size] = pavingTextureSizes([{ width: 6400, height: 40 }]);
    expect(size?.width).toBeLessThanOrEqual(PAVING_TEXTURE_MAX_SIDE);
  });
});

describe("lava paving (#3245)", () => {
  it("is no stone paving: the zone painter paints it as a molten zone's ground", () => {
    const stream: MapPaving = { ...street(), id: "stream", look: "lava" };
    expect(isStonePaving(stream)).toBe(false);
    expect(LOOKS.every((look) => isStonePaving({ ...street(), look }))).toBe(true);
  });
});

describe("pavingTunnelPieces (#3272)", () => {
  const drawing = pavingDrawing(street(), colours.cobbles);
  const [size] = pavingTextureSizes([drawing.bounds]);
  if (size === undefined) {
    throw new Error("no size");
  }
  const { x, y } = drawing.bounds;
  const box = (left: number, top: number, right: number, bottom: number): readonly Vec2[] => [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];

  it("makes none for a tunnel the paving misses", () => {
    const covers = [{ tunnel: 0, layer: 0, outline: box(900, 900, 1000, 1000) }];
    expect(pavingTunnelPieces(drawing, 0, size, covers)).toEqual([]);
  });

  it("cuts only the overlap, in whole pixels of the paving's texture", () => {
    const covers = [{ tunnel: 3, layer: 0, outline: box(300.2, 150, 900, 200) }];
    expect(pavingTunnelPieces(drawing, 0, size, covers)).toEqual([
      {
        tunnel: 3,
        pixels: {
          left: Math.round((300.2 - x) * size.scale),
          top: (150 - y) * size.scale,
          width: size.width - Math.round((300.2 - x) * size.scale),
          height: 50 * size.scale,
        },
      },
    ]);
  });

  it("makes a piece for each tunnel under it, and none for a tunnel on another layer", () => {
    const covers = [
      { tunnel: 0, layer: 0, outline: box(120, 130, 160, 150) },
      { tunnel: 1, layer: 1, outline: box(200, 130, 240, 150) },
      { tunnel: 2, layer: 0, outline: box(300, 140, 340, 160) },
    ];
    expect(pavingTunnelPieces(drawing, 0, size, covers).map(({ tunnel }) => tunnel)).toEqual([
      0, 2,
    ]);
    expect(pavingTunnelPieces(drawing, 1, size, covers).map(({ tunnel }) => tunnel)).toEqual([1]);
  });

  it("cuts each piece out of the paving, and paints it on the same pixel grid", () => {
    const [piece] = pavingTunnelPieces(drawing, 0, size, [
      { tunnel: 0, layer: 0, outline: box(150, 120, 260, 180) },
    ]);
    if (piece === undefined) {
      throw new Error("no piece");
    }
    const calls = (paint: (context: PavingCanvas) => void): unknown[][] => {
      const seen: unknown[][] = [];
      const context = new Proxy({} as PavingCanvas, {
        get:
          (_target, name) =>
          (...args: unknown[]) => {
            seen.push([name, ...args]);
          },
        set: () => true,
      });
      paint(context);
      return seen;
    };
    const whole = calls((context) => {
      paintPaving(context, drawing, size.scale, [piece]);
    });
    const { left, top, width, height } = piece.pixels;
    expect(whole.at(-1)).toEqual(["clearRect", left, top, width, height]);
    const part = calls((context) => {
      paintPavingPiece(context, drawing, size.scale, piece);
    });
    const [, a, b, c, d, e, f] = part[0] ?? [];
    expect([a, b, c, d]).toEqual([size.scale, 0, 0, size.scale]);
    expect(e).toBeCloseTo(-x * size.scale - left);
    expect(f).toBeCloseTo(-y * size.scale - top);
    expect(part.slice(1)).toEqual(whole.slice(1, part.length));
  });
});
