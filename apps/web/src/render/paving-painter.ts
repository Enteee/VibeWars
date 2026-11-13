import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { MapPaving } from "@vibewars/game-maps/schema";

import { type PavingLookColours, shade } from "./arena-palette.js";
import { shapeOutline } from "./layer-surfaces.js";

/**
 * A road, a square or a worn track (#3210), as the draw commands that
 * paint it: no Phaser here, so it can be tested in Node. The scene bakes
 * them into one texture per paving when the map changes, never per frame.
 * The pattern is seeded from the paving's id, so it is the same on every
 * reload and every peer.
 */

export type PavingCommand =
  | {
      readonly kind: "fill";
      readonly colour: number;
      readonly alpha: number;
      readonly points: readonly Vec2[];
    }
  | {
      readonly kind: "stroke";
      readonly colour: number;
      readonly alpha: number;
      readonly width: number;
      readonly points: readonly Vec2[];
    };

export interface PavingDrawing {
  /** The world rectangle the commands draw in: the area and its soft edge. */
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** The paving's outline, corner by corner. */
  readonly outline: readonly Vec2[];
  /** The stones, slabs and pebbles, each a closed outline drawn by a `fill`. */
  readonly stones: readonly (readonly Vec2[])[];
  readonly commands: readonly PavingCommand[];
}

/** How far a soft edge reaches past the outline, in world units. */
export const PAVING_EDGE = 4;
/** The most stones one paving lays: a larger area lays larger ones. */
export const MAX_PAVING_STONES = 3000;

/** A cobble's cell, in world units: small stones in staggered rows. */
const COBBLE = { width: 12, height: 9 };
/** A flagstone's cell: large slabs. */
const FLAGSTONE = { width: 38, height: 28 };
/** World units of track per pebble. */
const DIRT_PEBBLE_AREA = 700;

/** A 32-bit seed for `id` (FNV-1a): the same on every peer. */
export function pavingSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** `paving`'s draw commands, in `colours`. */
export function pavingDrawing(paving: MapPaving, colours: PavingLookColours): PavingDrawing {
  const outline = shapeOutline(paving.area);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const area = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  const random = seeded(pavingSeed(paving.id));
  const stones = LAY[paving.look](outline, area, random);
  const commands: PavingCommand[] = [];
  const fill = (colour: number, alpha: number, points: readonly Vec2[]): void => {
    commands.push({ kind: "fill", colour, alpha, points });
  };
  const stroke = (colour: number, alpha: number, width: number): void => {
    commands.push({ kind: "stroke", colour, alpha, width, points: outline });
  };
  if (paving.look === "dirt") {
    // Feathered: the track fades into the ground round it.
    stroke(colours.bed, 0.2, PAVING_EDGE * 2);
    stroke(colours.bed, 0.45, PAVING_EDGE);
    fill(colours.bed, 0.85, outline);
    for (const patch of worn(outline, area, random)) {
      fill(colours.light, 0.18, patch);
    }
  } else {
    fill(colours.bed, 1, outline);
  }
  for (const stone of stones) {
    const tone = shade(colours.stone, random() * 0.18);
    fill(
      colours.rim,
      0.6,
      stone.map((corner) => ({ x: corner.x + 0.8, y: corner.y + 1 })),
    );
    fill(tone, 1, stone);
    fill(colours.light, 0.35, shrunk(stone, 0.55, { x: -0.6, y: -0.8 }));
  }
  if (paving.look !== "dirt") {
    // A darker rim, so a road is laid in the ground, not pasted on it.
    stroke(colours.rim, 0.55, 2);
  }
  return {
    bounds: {
      x: area.x - PAVING_EDGE,
      y: area.y - PAVING_EDGE,
      width: area.width + PAVING_EDGE * 2,
      height: area.height + PAVING_EDGE * 2,
    },
    outline,
    stones,
    commands,
  };
}

interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
type Random = () => number;

/** Each look's stones: closed outlines wholly inside the paving's outline. */
const LAY: Record<
  MapPaving["look"],
  (outline: readonly Vec2[], area: Area, random: Random) => (readonly Vec2[])[]
> = {
  cobbles: (outline, area, random) =>
    rows(outline, area, COBBLE, random, (cell) =>
      rounded(inset(cell, 1 + random() * 0.8, 0.8 + random() * 0.6), 2),
    ),
  flagstones: (outline, area, random) =>
    rows(outline, area, FLAGSTONE, random, (cell) => {
      // Each corner pulled in its own way, so the mortar lines wander.
      const m = (): number => 1.2 + random() * 3;
      return [
        { x: cell.x + m(), y: cell.y + m() },
        { x: cell.x + cell.width - m(), y: cell.y + m() },
        { x: cell.x + cell.width - m(), y: cell.y + cell.height - m() },
        { x: cell.x + m(), y: cell.y + cell.height - m() },
      ];
    }),
  dirt: (outline, area, random) => {
    const count = Math.min(
      MAX_PAVING_STONES,
      Math.round((area.width * area.height) / DIRT_PEBBLE_AREA),
    );
    const pebbles: (readonly Vec2[])[] = [];
    for (let k = 0; k < count; k += 1) {
      const size = 1.5 + random() * 2.5;
      const centre = { x: area.x + random() * area.width, y: area.y + random() * area.height };
      const pebble = rounded(
        { x: centre.x - size, y: centre.y - size * 0.7, width: size * 2, height: size * 1.4 },
        size * 0.5,
      );
      if (inside(pebble, outline)) {
        pebbles.push(pebble);
      }
    }
    return pebbles;
  },
};

/**
 * Cells of `cell`'s size in rows across `area`, each row shifted half a
 * cell from the last, made into stones by `stone` and cut to `outline`
 * at its edge. A larger area lays larger cells.
 */
function rows(
  outline: readonly Vec2[],
  area: Area,
  cell: { readonly width: number; readonly height: number },
  random: Random,
  stone: (cell: Area) => readonly Vec2[],
): (readonly Vec2[])[] {
  // Planned for a fifth fewer than the most, as staggered rows and short
  // stones lay a few more cells than the area holds.
  const grow = Math.max(
    1,
    Math.sqrt((area.width * area.height) / (cell.width * cell.height) / (MAX_PAVING_STONES * 0.8)),
  );
  const width = cell.width * grow;
  const height = cell.height * grow;
  const stones: (readonly Vec2[])[] = [];
  for (let row = 0; area.y + row * height < area.y + area.height; row += 1) {
    const shift = row % 2 === 0 ? 0 : -width / 2;
    for (let x = area.x + shift; x < area.x + area.width; x += width) {
      // Stones are not all one length.
      const length = width * (0.8 + random() * 0.4);
      const laid = stone({ x, y: area.y + row * height, width: length, height });
      const kept = cut(laid, outline);
      if (kept !== undefined) {
        stones.push(kept);
      }
      x += length - width;
    }
  }
  return stones;
}

/** A few lighter worn patches along a dirt track. */
function worn(outline: readonly Vec2[], area: Area, random: Random): (readonly Vec2[])[] {
  const count = Math.min(24, Math.round((area.width * area.height) / 20000) + 1);
  const patches: (readonly Vec2[])[] = [];
  for (let k = 0; k < count; k += 1) {
    const w = 10 + random() * 30;
    const h = 6 + random() * 14;
    const patch = rounded(
      {
        x: area.x + random() * (area.width - w),
        y: area.y + random() * (area.height - h),
        width: w,
        height: h,
      },
      Math.min(w, h) / 2,
    );
    if (inside(patch, outline)) {
      patches.push(patch);
    }
  }
  return patches;
}

function inset(cell: Area, x: number, y: number): Area {
  return { x: cell.x + x, y: cell.y + y, width: cell.width - x * 2, height: cell.height - y * 2 };
}

/** `box` with its corners cut by `corner`: an octagon, which reads as a rounded stone. */
function rounded(box: Area, corner: number): readonly Vec2[] {
  const c = Math.min(corner, box.width / 2, box.height / 2);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    { x: box.x + c, y: box.y },
    { x: right - c, y: box.y },
    { x: right, y: box.y + c },
    { x: right, y: bottom - c },
    { x: right - c, y: bottom },
    { x: box.x + c, y: bottom },
    { x: box.x, y: bottom - c },
    { x: box.x, y: box.y + c },
  ];
}

/** `stone` scaled by `share` about its centre, then moved by `offset`: its lit top. */
function shrunk(stone: readonly Vec2[], share: number, offset: Vec2): readonly Vec2[] {
  const centre = {
    x: stone.reduce((sum, corner) => sum + corner.x, 0) / stone.length,
    y: stone.reduce((sum, corner) => sum + corner.y, 0) / stone.length,
  };
  return stone.map((corner) => ({
    x: centre.x + (corner.x - centre.x) * share + offset.x,
    y: centre.y + (corner.y - centre.y) * share + offset.y,
  }));
}

function inside(stone: readonly Vec2[], outline: readonly Vec2[]): boolean {
  return stone.every((corner) => pointInPolygon(corner, outline));
}

/** A stream of numbers from 0 to 1, the same for the same `seed` on every engine (mulberry32). */
function seeded(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The few canvas calls a paving's texture needs. */
export type PavingCanvas = Pick<
  CanvasRenderingContext2D,
  | "setTransform"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "stroke"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "lineJoin"
  | "globalAlpha"
>;

/** Pixels per world unit of a paving's texture at most, however small the map's pavings are. */
export const PAVING_TEXTURE_SCALE = 2;
/** The longest side of one paving's texture. */
export const PAVING_TEXTURE_MAX_SIDE = 2048;
/** The pixels of all of a map's paving textures together: 32 MiB on the GPU. */
export const PAVING_TEXTURE_BUDGET = 8 * 1024 * 1024;

/** A paving's texture: its size in pixels, at `scale` pixels per world unit. */
export interface PavingTextureSize {
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The textures for a map's pavings, given their bounds: one scale for
 * all of them, so together they stay under `PAVING_TEXTURE_BUDGET`, and
 * each side under `PAVING_TEXTURE_MAX_SIDE`. Sides round down, so no
 * texture holds more than its share; the sliver lost lies inside the
 * paving's soft edge.
 */
export function pavingTextureSizes(
  bounds: readonly { readonly width: number; readonly height: number }[],
): PavingTextureSize[] {
  const area = bounds.reduce((sum, { width, height }) => sum + width * height, 0);
  const shared = Math.min(
    PAVING_TEXTURE_SCALE,
    Math.sqrt(PAVING_TEXTURE_BUDGET / Math.max(1, area)),
  );
  return bounds.map(({ width, height }) => {
    const scale = Math.min(shared, PAVING_TEXTURE_MAX_SIDE / Math.max(1, width, height));
    return {
      scale,
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
  });
}

/** `drawing` painted onto a canvas of its bounds at `scale` pixels per world unit. */
export function paintPaving(context: PavingCanvas, drawing: PavingDrawing, scale: number): void {
  const { x, y } = drawing.bounds;
  context.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
  context.lineJoin = "round";
  for (const command of drawing.commands) {
    const [first, ...rest] = command.points;
    if (first === undefined) {
      continue;
    }
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const corner of rest) {
      context.lineTo(corner.x, corner.y);
    }
    context.closePath();
    const colour = `#${command.colour.toString(16).padStart(6, "0")}`;
    context.globalAlpha = command.alpha;
    if (command.kind === "fill") {
      context.fillStyle = colour;
      context.fill();
    } else {
      context.strokeStyle = colour;
      context.lineWidth = command.width;
      context.stroke();
    }
  }
  context.globalAlpha = 1;
}

/** The least share of a stone cut at the edge that is still laid: no slivers. */
const LEAST_CUT_SHARE = 0.35;

/**
 * `stone` as laid in `outline`: whole inside it, cut along its edge as a
 * kerb cuts a road's last stones, or `undefined` if too little is left.
 */
function cut(stone: readonly Vec2[], outline: readonly Vec2[]): readonly Vec2[] | undefined {
  if (inside(stone, outline)) {
    return stone;
  }
  // The outline clipped by the stone, which is convex: the part of the
  // stone inside the outline, whatever the outline's shape.
  const sign = Math.sign(signedArea(stone));
  let kept: readonly Vec2[] = outline;
  stone.forEach((a, index) => {
    const b = stone[(index + 1) % stone.length] ?? a;
    const side = (p: Vec2): number =>
      sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const next: Vec2[] = [];
    kept.forEach((p, at) => {
      const q = kept[(at + 1) % kept.length] ?? p;
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) {
        next.push(p);
      }
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        next.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    });
    kept = next;
  });
  return kept.length >= 3 &&
    Math.abs(signedArea(kept)) >= Math.abs(signedArea(stone)) * LEAST_CUT_SHARE
    ? kept
    : undefined;
}

/** The shoelace area of `outline`, signed by its winding. */
function signedArea(outline: readonly Vec2[]): number {
  let sum = 0;
  outline.forEach((p, index) => {
    const q = outline[(index + 1) % outline.length] ?? p;
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}
