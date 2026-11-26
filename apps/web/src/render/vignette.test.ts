import { describe, expect, it, vi } from "vitest";

import { ELEVATION_STEP } from "@vibewars/game-maps/schema";

import { FLAT_STRUCTURE, type MapStructure } from "./arena-snapshot.js";
import { deckCrop, deckVignetteTops, VIGNETTE, vignetteAlpha } from "./vignette.js";

// Phaser probes for a browser when it loads: only its constants are read here.
vi.mock("phaser", () => ({
  default: {
    Renderer: { Events: { RESTORE_WEBGL: "restorewebgl" } },
    BlendModes: { ADD: 1, MULTIPLY: 2 },
    Math: { Vector2: Object },
  },
}));

const WIDTH = 1280;
const HEIGHT = 720;

describe("vignetteAlpha (#4057)", () => {
  it("leaves the centre third of the view untouched", () => {
    for (const x of [WIDTH / 3, WIDTH / 2, (WIDTH * 2) / 3]) {
      for (const y of [HEIGHT / 3, HEIGHT / 2, (HEIGHT * 2) / 3]) {
        expect(vignetteAlpha(x, y, WIDTH, HEIGHT)).toBeCloseTo(0, 9);
      }
    }
  });

  it("reaches the cap at the corners", () => {
    for (const [x, y] of [
      [0, 0],
      [WIDTH, 0],
      [0, HEIGHT],
      [WIDTH, HEIGHT],
    ] as const) {
      expect(vignetteAlpha(x, y, WIDTH, HEIGHT)).toBeCloseTo(VIGNETTE.alpha, 6);
    }
  });

  it("darkens the edges part way, never past the cap", () => {
    const edge = vignetteAlpha(0, HEIGHT / 2, WIDTH, HEIGHT);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(VIGNETTE.alpha);
  });

  it("is symmetric about both axes", () => {
    for (const [x, y] of [
      [40, 90],
      [300, 20],
      [123, 456],
    ] as const) {
      const alpha = vignetteAlpha(x, y, WIDTH, HEIGHT);
      expect(vignetteAlpha(WIDTH - x, y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
      expect(vignetteAlpha(x, HEIGHT - y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
      expect(vignetteAlpha(WIDTH - x, HEIGHT - y, WIDTH, HEIGHT)).toBeCloseTo(alpha, 9);
    }
  });

  it("darkens steadily from the centre out", () => {
    let last = 0;
    for (let step = 0; step <= 20; step += 1) {
      const alpha = vignetteAlpha(
        (WIDTH / 2) * (1 - step / 20),
        (HEIGHT / 2) * (1 - step / 20),
        WIDTH,
        HEIGHT,
      );
      expect(alpha).toBeGreaterThanOrEqual(last);
      last = alpha;
    }
  });
});

describe("the vignette on deck tops (#4070)", () => {
  const deck = (layer: number, x: number, y: number, look: "platform" | "arch" = "platform") => ({
    layer,
    footprint: { kind: "rect" as const, x, y, width: 100, height: 60 },
    look,
    switched: null,
  });
  const HEIGHTS: MapStructure = {
    ...FLAT_STRUCTURE,
    layerCount: 3,
    decks: [deck(1, 400, 200), deck(1, 700, 200), deck(2, 420, 210), deck(1, 100, 500, "arch")],
  };

  it("takes each deck's top as drawn, lifted by its layer, by layer", () => {
    const tops = deckVignetteTops(HEIGHTS);
    expect([...tops.keys()].sort()).toEqual([1, 2]);
    expect(tops.get(1)).toHaveLength(2);
    const [raised] = tops.get(2) ?? [];
    expect(Math.min(...(raised ?? []).map(({ y }) => y))).toBe(210 - 2 * ELEVATION_STEP);
  });

  it("leaves out a deck that fades off a body under it", () => {
    const tops = deckVignetteTops(HEIGHTS);
    const xs = [...tops.values()].flat(2).map(({ x }) => x);
    expect(xs).not.toContain(100);
  });

  it("shades a point on a deck as the ground at the same place on screen", () => {
    const view = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };
    const box = { left: 1000, top: 500, right: 1400, bottom: 900 };
    const crop = deckCrop(box, view);
    expect(crop).toBeDefined();
    if (crop === undefined) {
      return;
    }
    // The texture spans the view, so a pixel of the crop is a share of it.
    const size = 128;
    for (const [x, y] of [
      [1000, 500],
      [1100, 600],
      [1280, 720],
    ] as const) {
      const u = crop.x + ((x - 1000) / (WIDTH - 1000)) * crop.width;
      const v = crop.y + ((y - 500) / (HEIGHT - 500)) * crop.height;
      expect((u / size) * WIDTH).toBeCloseTo(x, 6);
      expect((v / size) * HEIGHT).toBeCloseTo(y, 6);
      expect(vignetteAlpha((u / size) * WIDTH, (v / size) * HEIGHT, WIDTH, HEIGHT)).toBeCloseTo(
        vignetteAlpha(x, y, WIDTH, HEIGHT),
        9,
      );
    }
  });

  it("crops to the part of the deck in view, and nothing out of it", () => {
    const view = { left: 100, top: 100, right: 300, bottom: 200 };
    expect(deckCrop({ left: 0, top: 0, right: 1000, bottom: 1000 }, view)).toEqual({
      x: 0,
      y: 0,
      width: 128,
      height: 128,
    });
    expect(deckCrop({ left: 400, top: 0, right: 500, bottom: 50 }, view)).toBeUndefined();
  });
});
