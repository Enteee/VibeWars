import {
  EMBLEM_GRID,
  MAX_EMBLEM_COLOURS,
  unpackEmblem,
  type WireCape,
} from "@vibewars/game-protocol";

import { nudgeFromTeams } from "./colour-wheel.js";
import type { Point } from "./weapon-mark-geometry.js";

/**
 * The guild cape's look (#1422): its colours and the emblem grid on it
 * (#3554). How it moves and the shape it takes are `cape-motion.ts` (#1699).
 */

/** A cape colour as the wire spells it (six hex digits, #3628), as 0xRRGGBB. */
export function capeColour(hex: string): number {
  return Number.parseInt(hex, 16);
}

/** A cape as it is drawn: its colours as 0xRRGGBB. */
export interface CapeLook {
  readonly main: number;
  readonly trim: number;
  /** The emblem grid, packed as the wire carries it. */
  readonly emblem: string;
  /** What each emblem pixel `i` is drawn in, at `i - 1`: the cape's emblem colours, or toned. */
  readonly palette: readonly number[];
}

/**
 * `cape` as it is drawn (#3628): the colours the player picked, each one
 * within a hand of a team colour turned clear of it, so no cape reads as
 * a team. What is stored and sent stays what was picked.
 */
export function capeLook(cape: WireCape): CapeLook {
  const drawn = (hex: string): number => nudgeFromTeams(capeColour(hex));
  return {
    main: drawn(cape.main),
    trim: drawn(cape.trim),
    emblem: cape.emblem,
    palette: cape.emblemColours.map(drawn),
  };
}

/** How wide an emblem is on a cape. */
export const EMBLEM_SIZE = 5;

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

/** The preset `name`'s pixels, each 1 (its one colour, #3628) or 0 for empty. */
export function presetEmblem(name: EmblemPresetName): number[] {
  return PRESET_MASKS[name].flatMap((row) =>
    Array.from({ length: EMBLEM_GRID }, (_, column) => (row[column] === "#" ? 1 : 0)),
  );
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
  const pixels = unpackEmblem(emblem, MAX_EMBLEM_COLOURS) ?? [];
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

/** An emblem part: one filled quad of the pixel colour `pixel`, 1 to 15. */
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
