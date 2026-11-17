import type { Vec2 } from "@vibewars/game-core";
import { BIOMES, type Biome } from "@vibewars/game-maps/schema";

import { GROUND_DRESSING, type GroundDressingTones } from "./arena-palette.js";
import { hash } from "./hazard-marks.js";
import { OUTSIDE_TILE, wrapped } from "./outside-land.js";

/**
 * The ground's grain and dressing (#3484, docs/art/visual-style.md §4):
 * one tile per biome, painted once and repeated over the floor inside
 * its outline, so the ground reads as earth, sand, ice or flagstone and
 * not a flat colour. Fractal noise in the biome's tones, then a sparse
 * scatter of its own small marks, each one shape, one colour and one
 * outline. Decoration only: nothing in it collides, costs a walk or
 * means anything to the fight.
 */

/** A tile's side, world units and pixels: the outside's, so `wrapped` seams it too. */
export const GROUND_TILE = OUTSIDE_TILE;
/** How opaque the grain lies over the ground's own tone: 50 to 80 %, so the base still names it. */
export const GRAIN_ALPHA = 0.65;
/** The noise's octaves, as lattice cells across a tile, and their weights: the first is a feature per body (32 u). */
const OCTAVES = [
  { cells: 8, weight: 0.57 },
  { cells: 16, weight: 0.29 },
  { cells: 32, weight: 0.14 },
] as const;
/** A mark's largest side, world units: a mark, not a drawing, at zoom 1. */
export const MARK_MAX = 16;

/** What a tile's marks are painted with: a 2D canvas, or a test's recorder. */
export type DressingCanvas = Pick<
  CanvasRenderingContext2D,
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineCap"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "ellipse"
  | "closePath"
  | "fill"
  | "stroke"
>;

/** One kind of mark: how it draws, at a point, `size` across (at most `MARK_MAX`), turned `angle`. */
type MarkKind = "crack" | "grit" | "pebble" | "tuft" | "ripple" | "cinder" | "drift";

/** A scatter of one kind: how many a tile holds, in which of the biome's tones, and how big. */
interface Scatter {
  readonly kind: MarkKind;
  readonly tone: "mark" | "accent";
  readonly count: number;
  readonly size: readonly [min: number, max: number];
}

/** Each biome's marks, sparse: a few per body's width of ground at most. */
export const DRESSING: Record<Biome, readonly Scatter[]> = {
  hall: [
    { kind: "crack", tone: "mark", count: 6, size: [10, 16] },
    { kind: "grit", tone: "accent", count: 22, size: [2, 3] },
  ],
  heights: [
    { kind: "pebble", tone: "mark", count: 12, size: [4, 8] },
    { kind: "grit", tone: "accent", count: 16, size: [2, 3] },
  ],
  wilds: [
    { kind: "tuft", tone: "mark", count: 14, size: [8, 14] },
    { kind: "pebble", tone: "accent", count: 6, size: [5, 9] },
  ],
  desert: [
    { kind: "ripple", tone: "accent", count: 10, size: [12, 16] },
    { kind: "pebble", tone: "mark", count: 8, size: [4, 7] },
  ],
  volcanic: [
    { kind: "cinder", tone: "mark", count: 14, size: [3, 6] },
    { kind: "crack", tone: "accent", count: 7, size: [10, 16] },
  ],
  snow: [
    { kind: "drift", tone: "mark", count: 9, size: [12, 16] },
    { kind: "grit", tone: "accent", count: 10, size: [2, 3] },
  ],
  marsh: [
    { kind: "tuft", tone: "mark", count: 12, size: [8, 14] },
    { kind: "pebble", tone: "accent", count: 8, size: [5, 10] },
  ],
  jungle: [
    { kind: "tuft", tone: "mark", count: 14, size: [8, 14] },
    { kind: "pebble", tone: "accent", count: 7, size: [5, 10] },
  ],
};

/** The texture a biome's tile is kept under. */
export function groundTileKey(biome: Biome): string {
  return `ground-dressing-${biome}`;
}

/** The seed a biome's tile is painted from: the same on every peer and every frame. */
function seedOf(biome: Biome): number {
  return 31 + BIOMES.indexOf(biome) * 7919;
}

/** `colour` as RGB bytes. */
function channels(colour: number): readonly [number, number, number] {
  return [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];
}

/** `colour` as a CSS colour, for a canvas. */
function css(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}

/** The noise lattice's value at a corner, wrapping at the tile's side so the tile repeats without a seam. */
function corner(seed: number, cells: number, column: number, row: number): number {
  const c = ((column % cells) + cells) % cells;
  const r = ((row % cells) + cells) % cells;
  return hash(seed + cells * 1013 + r * cells + c);
}

/** Smoothed value noise, 0 to 1, of one octave at a pixel. */
function octave(seed: number, cells: number, x: number, y: number): number {
  const fx = (x / GROUND_TILE) * cells;
  const fy = (y / GROUND_TILE) * cells;
  const column = Math.floor(fx);
  const row = Math.floor(fy);
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const sx = smooth(fx - column);
  const sy = smooth(fy - row);
  const top =
    corner(seed, cells, column, row) * (1 - sx) + corner(seed, cells, column + 1, row) * sx;
  const bottom =
    corner(seed, cells, column, row + 1) * (1 - sx) + corner(seed, cells, column + 1, row + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/**
 * A biome's grain, `GROUND_TILE` square, as RGBA bytes: three octaves of
 * value noise between its dark and light grain tones, at `GRAIN_ALPHA`
 * all over, so it lies over the floor's own fill.
 */
export function grainPixels(biome: Biome): Uint8ClampedArray<ArrayBuffer> {
  const seed = seedOf(biome);
  const [dark, light] = GROUND_DRESSING[biome].grain.map(channels);
  const pixels = new Uint8ClampedArray(GROUND_TILE * GROUND_TILE * 4);
  const alpha = Math.round(GRAIN_ALPHA * 255);
  for (let y = 0; y < GROUND_TILE; y += 1) {
    for (let x = 0; x < GROUND_TILE; x += 1) {
      const n = OCTAVES.reduce(
        (total, { cells, weight }) => total + octave(seed, cells, x + 0.5, y + 0.5) * weight,
        0,
      );
      const at = (y * GROUND_TILE + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const from = dark?.[channel] ?? 0;
        const to = light?.[channel] ?? 0;
        pixels[at + channel] = Math.round(from + (to - from) * n);
      }
      pixels[at + 3] = alpha;
    }
  }
  return pixels;
}

/** One mark of `kind`, `size` across, at `at`, turned `angle`. */
function paintMark(
  canvas: DressingCanvas,
  kind: MarkKind,
  at: Vec2,
  size: number,
  angle: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  /** A point `u` along the mark and `v` across it, from its middle. */
  const p = (u: number, v: number): Vec2 => ({
    x: at.x + u * cos - v * sin,
    y: at.y + u * sin + v * cos,
  });
  const polyline = (points: readonly Vec2[]): void => {
    canvas.beginPath();
    points.forEach(({ x, y }, k) => {
      if (k === 0) {
        canvas.moveTo(x, y);
      } else {
        canvas.lineTo(x, y);
      }
    });
    canvas.stroke();
  };
  const half = size / 2;
  switch (kind) {
    case "grit":
    case "pebble":
    case "cinder":
      canvas.beginPath();
      canvas.ellipse(
        at.x,
        at.y,
        half,
        half * (kind === "pebble" ? 0.7 : 0.85),
        angle,
        0,
        Math.PI * 2,
      );
      canvas.closePath();
      canvas.fill();
      if (kind !== "grit") {
        canvas.stroke();
      }
      return;
    case "crack":
      polyline([p(-half, 0), p(-half / 3, half / 4), p(half / 4, -half / 5), p(half, half / 6)]);
      return;
    case "tuft":
      // Three blades from one root, leaning apart.
      for (const lean of [-0.45, 0, 0.45]) {
        polyline([at, { x: at.x + Math.sin(lean) * size * 0.6, y: at.y - Math.cos(lean) * size }]);
      }
      return;
    case "ripple":
    case "drift":
      polyline([
        p(-half, 0),
        p(-half / 2, -size / 8),
        p(0, -size / 6),
        p(half / 2, -size / 8),
        p(half, 0),
      ]);
      return;
  }
}

/**
 * Paints a biome's marks over its grain, at the tile's origin: each
 * scatter a jittered sprinkle in its tone, outlined, a copy over each
 * edge it crosses, so the tile repeats without a seam.
 */
export function paintDressing(canvas: DressingCanvas, biome: Biome): void {
  const tones: GroundDressingTones = GROUND_DRESSING[biome];
  const seed = seedOf(biome);
  canvas.lineCap = "round";
  DRESSING[biome].forEach(({ kind, tone, count, size: [min, max] }, scatter) => {
    const colour = css(tones[tone]);
    const filled = kind === "grit" || kind === "pebble" || kind === "cinder";
    canvas.fillStyle = colour;
    canvas.strokeStyle = filled ? css(tones.outline) : colour;
    canvas.lineWidth = filled ? 1 : kind === "tuft" ? 1.5 : 1;
    for (let k = 0; k < count; k += 1) {
      const n = seed + scatter * 10007 + k * 7;
      const at = { x: hash(n) * GROUND_TILE, y: hash(n + 1) * GROUND_TILE };
      const size = Math.min(MARK_MAX, min + hash(n + 2) * (max - min));
      const angle = hash(n + 3) * Math.PI * 2;
      wrapped(at, size, (copy) => {
        paintMark(canvas, kind, copy, size, angle);
      });
    }
  });
}
