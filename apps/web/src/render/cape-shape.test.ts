import { EMBLEM_GRID, packEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  EMBLEM_PRESET_NAMES,
  capeLook,
  emblemRects,
  emblemShape,
  presetEmblem,
} from "./cape-shape.js";
import { FOE_COLOUR, FRIEND_COLOUR, HAND, wheelDistance } from "./colour-wheel.js";

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
    const parts = emblemShape(packEmblem(presetEmblem(name)), { x: 0, y: 0 }, 0, 10);
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      expect(part.pixel).toBe(1);
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
    const emblem = packEmblem(presetEmblem("ring"));
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
    const grids = EMBLEM_PRESET_NAMES.map((name) => presetEmblem(name));
    expect(new Set(grids.map((grid) => grid.join())).size).toBe(EMBLEM_PRESET_NAMES.length);
    // 8 px across, each pixel of the drawing the grid's 2×2 block, filled if any of it is.
    const small = grids.map((grid) => {
      const pixels = grid;
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

  it("are drawn in their one colour (#3628)", () => {
    for (const name of EMBLEM_PRESET_NAMES) {
      expect(new Set(presetEmblem(name))).toEqual(new Set([0, 1]));
    }
  });
});

describe("capeLook (#3628)", () => {
  it("draws the colours picked, the emblem's by its pixels", () => {
    const look = capeLook({
      main: "a078e0",
      trim: "f2f2f2",
      emblemColours: ["e6c04a", "23272e"],
      emblem: packEmblem([1, 2]),
    });
    expect(look).toEqual({
      main: 0xa078e0,
      trim: 0xf2f2f2,
      emblem: packEmblem([1, 2]),
      palette: [0xe6c04a, 0x23272e],
    });
  });

  it("turns a team's own colours a hand clear of both teams", () => {
    const look = capeLook({
      main: "59c2ff",
      trim: "ff7b72",
      emblemColours: ["ff7b72"],
      emblem: packEmblem([1]),
    });
    for (const colour of [look.main, look.trim, ...look.palette]) {
      expect(wheelDistance(colour, FRIEND_COLOUR)).toBeGreaterThanOrEqual(HAND);
      expect(wheelDistance(colour, FOE_COLOUR)).toBeGreaterThanOrEqual(HAND);
    }
  });
});
