import {
  CAPE_COLOURS,
  EMBLEM_GRID,
  packEmblem,
  unpackEmblem,
  type WireCape,
} from "@vibewars/game-protocol";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * The guild cape's look (#1422): its palette and the emblem grid on it
 * (#3554). How it moves and the shape it takes are `cape-motion.ts` (#1699).
 */

export type CapeColour = (typeof CAPE_COLOURS)[number];

/** The study's palette (`docs/art/art-direction.md`), as 0xRRGGBB. */
export const CAPE_PALETTE: Readonly<Record<CapeColour, number>> = {
  gold: 0xe6c04a,
  violet: 0xa078e0,
  white: 0xf2f2f2,
  black: 0x23272e,
  lime: 0x9bd445,
  orange: 0xf0963c,
  teal: 0x2fb8a0,
  pink: 0xe86fb4,
};

/** A cape as it is drawn: its colours as 0xRRGGBB. */
export interface CapeLook {
  readonly main: number;
  readonly trim: number;
  /** The emblem grid, packed as the wire carries it. */
  readonly emblem: string;
  /** What each emblem pixel `i` is drawn in, at `i - 1`: `CAPE_COLOURS`' palette, or toned. */
  readonly palette: readonly number[];
}

export function capeLook(cape: WireCape): CapeLook {
  return {
    main: CAPE_PALETTE[cape.main],
    trim: CAPE_PALETTE[cape.trim],
    emblem: cape.emblem,
    palette: CAPE_COLOURS.map((colour) => CAPE_PALETTE[colour]),
  };
}

/**
 * How wide an emblem is on a fully unfolded cape (#3627): 1.6 times the old
 * 5.5, the largest that clears the band and the notch on a player's body.
 */
export const EMBLEM_SIZE = 9;

/** The starting emblems (#3554), in the order the cape designer shows them. */
export const EMBLEM_PRESET_NAMES = [
  "disc",
  "bar",
  "chevron",
  "diamond",
  "triangle",
  "cross",
  "ring",
  "half-disc",
] as const;

export type EmblemPresetName = (typeof EMBLEM_PRESET_NAMES)[number];

/**
 * The eight shapes the cape had before its emblem was a grid (#1422),
 * rasterised by hand: `#` is a pixel, pointing up.
 */
const PRESET_MASKS: Readonly<Record<EmblemPresetName, readonly string[]>> = {
  disc: [
    "................",
    "......####......",
    "....########....",
    "...##########...",
    "..############..",
    "..############..",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    "..############..",
    "..############..",
    "...##########...",
    "....########....",
    "......####......",
    "................",
  ],
  bar: [
    "................",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    "................",
  ],
  chevron: [
    "................",
    "................",
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....########....",
    "...####..####...",
    "..####....####..",
    ".####......####.",
    ".###........###.",
    ".##..........##.",
    ".#............#.",
    "................",
    "................",
    "................",
  ],
  diamond: [
    "................",
    ".......##.......",
    "......####......",
    ".....######.....",
    "....########....",
    "...##########...",
    "..############..",
    ".##############.",
    ".##############.",
    "..############..",
    "...##########...",
    "....########....",
    ".....######.....",
    "......####......",
    ".......##.......",
    "................",
  ],
  triangle: [
    "................",
    "................",
    ".......##.......",
    "......####......",
    "......####......",
    ".....######.....",
    ".....######.....",
    "....########....",
    "....########....",
    "...##########...",
    "..############..",
    "..############..",
    ".##############.",
    ".##############.",
    "................",
    "................",
  ],
  cross: [
    "................",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".##############.",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    ".....######.....",
    "................",
  ],
  ring: [
    "................",
    ".....######.....",
    "...##########...",
    "..############..",
    "..#####..#####..",
    ".####......####.",
    ".####......####.",
    ".###........###.",
    ".###........###.",
    ".####......####.",
    ".####......####.",
    "..#####..#####..",
    "..############..",
    "...##########...",
    ".....######.....",
    "................",
  ],
  "half-disc": [
    "................",
    "....###.........",
    "....#####.......",
    "....######......",
    "....######......",
    "....#######.....",
    "....#######.....",
    "....#######.....",
    "....#######.....",
    "....#######.....",
    "....#######.....",
    "....######......",
    "....######......",
    "....#####.......",
    "....###.........",
    "................",
  ],
};

/** The preset `name` drawn in `colour`, packed as a cape carries it. */
export function presetEmblem(name: EmblemPresetName, colour: CapeColour): string {
  const pixel = CAPE_COLOURS.indexOf(colour) + 1;
  return packEmblem(
    PRESET_MASKS[name].flatMap((row) =>
      Array.from({ length: EMBLEM_GRID }, (_, column) => (row[column] === "#" ? pixel : 0)),
    ),
  );
}

/** `emblem` with every pixel in `from` turned to `to`, packed again; others as they were. */
export function recolourEmblem(emblem: string, from: CapeColour, to: CapeColour): string {
  const pixels = unpackEmblem(emblem);
  if (pixels === undefined) {
    return emblem;
  }
  const before = CAPE_COLOURS.indexOf(from) + 1;
  const after = CAPE_COLOURS.indexOf(to) + 1;
  return packEmblem(pixels.map((pixel) => (pixel === before ? after : pixel)));
}

/** One rectangle of same-coloured pixels, in grid cells, its end exclusive. */
interface EmblemRect {
  readonly pixel: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** How many emblems' rectangles are kept: a match never shows more capes. */
const EMBLEM_CACHE_SIZE = 16;

/** The rectangles of the emblems drawn lately, by packed grid, the newest last. */
const emblemCache = new Map<string, readonly EmblemRect[]>();

/**
 * `emblem` as few rectangles of one colour each, worked out once for each
 * emblem (#3554), so a cape draws a handful of quads a frame, not 256
 * pixels. Each grows right, then down, from the first pixel no other holds.
 */
export function emblemRects(emblem: string): readonly EmblemRect[] {
  const cached = emblemCache.get(emblem);
  if (cached !== undefined) {
    emblemCache.delete(emblem);
    emblemCache.set(emblem, cached);
    return cached;
  }
  const pixels = unpackEmblem(emblem) ?? [];
  const at = (row: number, column: number): number => pixels[row * EMBLEM_GRID + column] ?? 0;
  const taken = new Set<number>();
  const free = (row: number, column: number, pixel: number): boolean =>
    column < EMBLEM_GRID && at(row, column) === pixel && !taken.has(row * EMBLEM_GRID + column);
  const rects: EmblemRect[] = [];
  for (let top = 0; top < EMBLEM_GRID; top += 1) {
    for (let left = 0; left < EMBLEM_GRID; left += 1) {
      const pixel = at(top, left);
      if (pixel === 0 || !free(top, left, pixel)) {
        continue;
      }
      let right = left + 1;
      while (free(top, right, pixel)) {
        right += 1;
      }
      let bottom = top + 1;
      const rowFree = (row: number): boolean => {
        for (let column = left; column < right; column += 1) {
          if (!free(row, column, pixel)) {
            return false;
          }
        }
        return true;
      };
      while (bottom < EMBLEM_GRID && rowFree(bottom)) {
        bottom += 1;
      }
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          taken.add(row * EMBLEM_GRID + column);
        }
      }
      rects.push({ pixel, left, top, right, bottom });
    }
  }
  emblemCache.set(emblem, rects);
  const oldest = emblemCache.keys().next();
  if (emblemCache.size > EMBLEM_CACHE_SIZE && oldest.done !== true) {
    emblemCache.delete(oldest.value);
  }
  return rects;
}

/** An emblem part: one filled quad of the pixel colour `pixel`, 1 to 8. */
export interface EmblemPart {
  readonly pixel: number;
  readonly points: readonly Point[];
}

/** `emblem` centred on `centre`, `size` across, its up turned by `turn` radians from -y. */
export function emblemShape(
  emblem: string,
  centre: Point,
  turn: number,
  size: number,
): readonly EmblemPart[] {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const cell = size / EMBLEM_GRID;
  const half = EMBLEM_GRID / 2;
  const place = (column: number, row: number): Point => {
    const x = (column - half) * cell;
    const y = (row - half) * cell;
    return { x: centre.x + x * cos - y * sin, y: centre.y + x * sin + y * cos };
  };
  return emblemRects(emblem).map(({ pixel, left, top, right, bottom }) => ({
    pixel,
    points: [place(left, top), place(right, top), place(right, bottom), place(left, bottom)],
  }));
}
