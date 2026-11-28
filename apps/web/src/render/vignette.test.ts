import { describe, expect, it, vi } from "vitest";

import { pointInPolygon } from "@vibewars/game-core";
import { ELEVATION_STEP } from "@vibewars/game-maps/schema";

import { ARENA_MAPS, structureOf } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import { FLAT_STRUCTURE, type MapStructure } from "./arena-snapshot.js";
import {
  clipToBox,
  disjointPieces,
  VIGNETTE,
  VIGNETTE_GRID,
  type VignetteCell,
  vignetteAlpha,
  vignetteCells,
  vignetteTriangles,
} from "./vignette-model.js";
import { deckPieces, deckVignetteTops } from "./vignette.js";

// Phaser probes for a browser when it loads: its constants are read here,
// and the triangulation deck tops are cut by.
vi.mock("phaser", async () => {
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  const require = createRequire(import.meta.url);
  // Phaser's own earcut, which its package does not export by name.
  const Earcut = require(
    path.join(path.dirname(require.resolve("phaser/package.json")), "src/geom/polygon/Earcut.js"),
  ) as (points: readonly number[]) => number[];
  return {
    default: {
      Renderer: { Events: { RESTORE_WEBGL: "restorewebgl" } },
      BlendModes: { ADD: 1, MULTIPLY: 2 },
      Geom: { Polygon: { Earcut } },
      Math: { Vector2: Object },
    },
  };
});

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

  it("shades a deck's cells as the ground's at the same place on screen", () => {
    const view = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };
    const box = { left: 1000, top: 500, right: 1400, bottom: 900 };
    const deck = vignetteCells(view, box);
    expect(deck.length).toBeGreaterThan(0);
    const ground = vignetteCells(view);
    for (const cell of deck) {
      expect(cell.box.left).toBeGreaterThanOrEqual(box.left);
      expect(cell.box.bottom).toBeLessThanOrEqual(HEIGHT);
      for (const [x, y, alpha] of [
        [cell.box.left, cell.box.top, cell.topLeft],
        [cell.box.right, cell.box.bottom, cell.bottomRight],
      ] as const) {
        expect(shadeAt(ground, x, y)).toBeCloseTo(alpha, 9);
      }
    }
  });

  it("draws nothing of a deck out of view, or in the clear centre", () => {
    const view = { left: 100, top: 100, right: 300, bottom: 200 };
    expect(vignetteCells(view, { left: 400, top: 0, right: 500, bottom: 50 })).toEqual([]);
    expect(vignetteCells(view, { left: 190, top: 145, right: 210, bottom: 155 })).toEqual([]);
  });
});

/** How dark `cells` shade `(x, y)`, between the corners of the one it falls in; 0 in none. */
function shadeAt(cells: readonly VignetteCell[], x: number, y: number): number {
  const cell = cells.find(
    ({ box }) => box.left <= x && x <= box.right && box.top <= y && y <= box.bottom,
  );
  if (cell === undefined) {
    return 0;
  }
  const across = (x - cell.box.left) / (cell.box.right - cell.box.left);
  const down = (y - cell.box.top) / (cell.box.bottom - cell.box.top);
  const top = cell.topLeft + (cell.topRight - cell.topLeft) * across;
  const bottom = cell.bottomLeft + (cell.bottomRight - cell.bottomLeft) * across;
  return top + (bottom - top) * down;
}

describe("the vignette's cells (#4130)", () => {
  const view = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };

  it("shade within 1 % of vignetteAlpha everywhere", () => {
    const cells = vignetteCells(view);
    for (let x = 0; x <= WIDTH; x += 16) {
      for (let y = 0; y <= HEIGHT; y += 9) {
        expect(Math.abs(shadeAt(cells, x, y) - vignetteAlpha(x, y, WIDTH, HEIGHT))).toBeLessThan(
          0.01,
        );
      }
    }
  });

  it("leave out the clear centre", () => {
    const cells = vignetteCells(view);
    expect(cells.length).toBeLessThan(VIGNETTE_GRID * VIGNETTE_GRID);
    expect(shadeAt(cells, WIDTH / 2, HEIGHT / 2)).toBe(0);
    expect(
      cells.some(
        ({ box }) =>
          box.left < WIDTH / 2 &&
          WIDTH / 2 < box.right &&
          box.top < HEIGHT / 2 &&
          HEIGHT / 2 < box.bottom,
      ),
    ).toBe(false);
  });
});

describe("the vignette's deck triangles (#4130)", () => {
  const view = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT };

  it("shade each corner as the ground's cells shade it", () => {
    const ground = vignetteCells(view);
    const shaded = vignetteTriangles(view, [
      [
        { x: 900, y: 400 },
        { x: 1270, y: 450 },
        { x: 1000, y: 710 },
      ],
    ]);
    expect(shaded.length).toBeGreaterThan(0);
    for (const { x, y, alpha } of shaded.flat()) {
      expect(alpha).toBeCloseTo(shadeAt(ground, x, y), 9);
    }
  });

  it("cover the triangle's darkened part, and nothing in the clear centre", () => {
    const area = (points: readonly { x: number; y: number }[]) =>
      Math.abs(
        points.reduce((sum, { x, y }, i) => {
          const next = points[(i + 1) % points.length] ?? { x, y };
          return sum + x * next.y - next.x * y;
        }, 0),
      ) / 2;
    const corner = [
      { x: 1100, y: 600 },
      { x: 1280, y: 600 },
      { x: 1280, y: 720 },
    ] as const;
    expect(vignetteTriangles(view, [corner]).reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(
      area(corner),
      6,
    );
    const centre = [
      { x: 600, y: 340 },
      { x: 680, y: 340 },
      { x: 640, y: 380 },
    ] as const;
    expect(vignetteTriangles(view, [centre])).toEqual([]);
  });

  it("are cut to a box side by side", () => {
    const box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(
      clipToBox(
        [
          { x: -10, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: -10 },
        ],
        box,
      ),
    ).toHaveLength(4);
    expect(
      clipToBox(
        [
          { x: 20, y: 20 },
          { x: 30, y: 20 },
          { x: 25, y: 30 },
        ],
        box,
      ),
    ).toEqual([]);
  });

  it("come from pieces that cover a layer's tops once, overlapping or not", () => {
    const square = (left: number, top: number) => [
      [
        { x: left, y: top },
        { x: left + 10, y: top },
        { x: left + 10, y: top + 10 },
      ],
      [
        { x: left, y: top },
        { x: left + 10, y: top + 10 },
        { x: left, y: top + 10 },
      ],
    ];
    const pieces = disjointPieces([...square(0, 0), ...square(5, 5), ...square(30, 0)]);
    const covered = (x: number, y: number) =>
      pieces.filter((piece) => pointInPolygon({ x, y }, piece)).length;
    for (let x = 0.5; x < 40; x += 1) {
      for (let y = 0.5; y < 15; y += 1) {
        const inside = (x < 10 && y < 10) || (x > 5 && x < 15 && y > 5) || (x > 30 && y < 10);
        expect(covered(x, y)).toBe(inside ? 1 : 0);
      }
    }
  });

  // Two tops of one layer can overlap (arena-crossroads' bridges): their pieces must not.
  it("darken no point of a shipped map's deck tops twice", () => {
    for (const map of [...ARENA_MAPS, ...TRAINING_MAPS.values()]) {
      for (const tops of deckVignetteTops(structureOf(map).structure).values()) {
        const pieces = deckPieces(tops);
        for (const top of tops) {
          const xs = top.map(({ x }) => x);
          const ys = top.map(({ y }) => y);
          for (let x = Math.min(...xs) + 0.37; x < Math.max(...xs); x += 20) {
            for (let y = Math.min(...ys) + 0.41; y < Math.max(...ys); y += 20) {
              const inPieces = pieces.filter((piece) => pointInPolygon({ x, y }, piece)).length;
              if (pointInPolygon({ x, y }, top)) {
                expect(inPieces, `${map.id} at ${String(x)},${String(y)}`).toBe(1);
              }
            }
          }
        }
      }
    }
  }, 30_000);
});
