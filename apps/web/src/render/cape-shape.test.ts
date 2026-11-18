import { CAPE_COLOURS, EMBLEM_GRID, packEmblem, unpackEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  CAPE_PALETTE,
  EMBLEM_PRESET_NAMES,
  emblemRects,
  emblemShape,
  presetEmblem,
  recolourEmblem,
} from "./cape-shape.js";

/** Every pixel of `emblem` the rectangles of `emblemShape` cover, back on the grid. */
function coverage(emblem: string): number[] {
  const pixels = new Array<number>(EMBLEM_GRID * EMBLEM_GRID).fill(0);
  for (const { pixel, left, top, right, bottom } of emblemRects(emblem)) {
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        expect(pixels[row * EMBLEM_GRID + column], "a pixel covered twice").toBe(0);
        pixels[row * EMBLEM_GRID + column] = pixel;
      }
    }
  }
  return pixels;
}

describe("emblemShape (#1422, #3554)", () => {
  it.each(EMBLEM_PRESET_NAMES)("draws the %s preset as quads inside its box", (name) => {
    const parts = emblemShape(presetEmblem(name, "gold"), { x: 0, y: 0 }, 0, 10);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.pixel).toBe(CAPE_COLOURS.indexOf("gold") + 1);
      expect(part.points).toHaveLength(4);
      for (const point of part.points) {
        expect(Math.max(Math.abs(point.x), Math.abs(point.y))).toBeLessThanOrEqual(5);
      }
    }
  });

  it("covers every pixel of a grid once, in its own colour, and no empty one", () => {
    let state = 7;
    const pixels = Array.from({ length: EMBLEM_GRID * EMBLEM_GRID }, () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % 9;
    });
    expect(coverage(packEmblem(pixels))).toEqual(pixels);
  });

  it("draws an empty grid as nothing", () => {
    expect(emblemShape(packEmblem([]), { x: 0, y: 0 }, 0, 10)).toEqual([]);
  });

  it("turns with the cape: up on the grid points along `turn`", () => {
    const top = packEmblem([0, 0, 0, 0, 0, 0, 0, 1]);
    const [part] = emblemShape(top, { x: 0, y: 0 }, Math.PI / 2, 16);
    // A quarter turn takes the top row (-y) to +x.
    expect(Math.min(...(part?.points.map((point) => point.x) ?? []))).toBeCloseTo(7);
  });

  it("works a grid's rectangles out once and reuses them", () => {
    const emblem = presetEmblem("ring", "teal");
    expect(emblemRects(emblem)).toBe(emblemRects(emblem));
  });

  it("keeps the 16 emblems drawn last, and works out a 17th's again", () => {
    const emblems = Array.from({ length: 17 }, (_, index) => {
      const pixels = new Array<number>(index + 1).fill(0);
      pixels[index] = 1;
      return packEmblem(pixels);
    });
    const first = emblemRects(emblems[0] ?? "");
    for (const emblem of emblems.slice(1)) {
      emblemRects(emblem);
    }
    expect(emblemRects(emblems[0] ?? "")).not.toBe(first);
    expect(emblemRects(emblems[0] ?? "")).toEqual(first);
  });
});

describe("the starting emblems (#3554)", () => {
  it("are eight distinct, filled shapes, each still distinct drawn 8 px across", () => {
    const grids = EMBLEM_PRESET_NAMES.map((name) => presetEmblem(name, "white"));
    expect(new Set(grids).size).toBe(EMBLEM_PRESET_NAMES.length);
    // 8 px across, each pixel of the drawing the grid's 2×2 block, filled if any of it is.
    const small = grids.map((grid) => {
      const pixels = unpackEmblem(grid) ?? [];
      return Array.from({ length: 64 }, (_, index) => {
        const row = Math.floor(index / 8) * 2;
        const column = (index % 8) * 2;
        return [0, 1, EMBLEM_GRID, EMBLEM_GRID + 1].some(
          (offset) => (pixels[row * EMBLEM_GRID + column + offset] ?? 0) > 0,
        );
      }).join();
    });
    for (const drawing of small) {
      expect(drawing).toContain("true");
    }
    expect(new Set(small).size).toBe(EMBLEM_PRESET_NAMES.length);
  });

  it("draw in the colour asked for", () => {
    const pixels = unpackEmblem(presetEmblem("cross", "pink")) ?? [];
    expect(new Set(pixels)).toEqual(new Set([0, CAPE_COLOURS.indexOf("pink") + 1]));
  });

  it("follow a new trim: its pixels change colour, the rest stay", () => {
    const two = packEmblem([1, 2, 3, 0]);
    expect(unpackEmblem(recolourEmblem(two, "violet", "pink"))?.slice(0, 4)).toEqual([1, 8, 3, 0]);
  });
});

describe("CAPE_PALETTE (#1422)", () => {
  it("gives every colour its own hue", () => {
    const hues = CAPE_COLOURS.map((colour) => CAPE_PALETTE[colour]);
    expect(new Set(hues).size).toBe(CAPE_COLOURS.length);
  });
});
