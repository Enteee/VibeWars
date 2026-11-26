import type { Vec2 } from "@vibewars/game-core";

import { WATER_LOOK, type WaterLook } from "./arena-palette.js";
import type { MapWater } from "./arena-snapshot.js";
import type { LiquidCellsOptions } from "./liquid-cells.js";
import {
  RIPPLE_HALF_LENGTH,
  rippleDrift,
  rippleSwell,
  type Ripple,
  type WaterShape,
} from "./water-shape.js";

/**
 * Water drawn through one lookup keyed by its depth (#2984): today each
 * key paints procedurally; a sprite replaces one by painting its texture
 * at the shape's `anchor` instead.
 */

/** The few drawing calls water needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface WaterPainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  /** Fill the closed outline. */
  fillOutline(outline: readonly Vec2[]): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
  /** Stroke the ellipse `width` × `height` centred on (`x`, `y`). */
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  /**
   * The edges of `outline` that are the water's own shore (#3350): all of
   * them, but where a piece of the water is cut, which meets the next.
   */
  shore(outline: readonly Vec2[]): readonly (readonly [Vec2, Vec2])[];
}

/** The biome's colours deep water's edge takes (#4058): the rest of water is the same everywhere. */
export interface WaterEdge {
  /** The sunk wall on the far shore: the graded floor's pit wall. */
  readonly wall: number;
  /** The stone lip: the biome's wall top. */
  readonly lip: number;
  /** The dark line round the lip. */
  readonly outline: number;
}

/** One layer of the liquid cells' texture, baked into the water (#4058). */
export interface CellLayer {
  /** Texture px to a world unit. */
  readonly scale: number;
}

/**
 * How one kind of water draws. `line` is 1 CSS px in world units;
 * `surface` is drawn once per map, `ripples` every frame at render time
 * `seconds`, held still under reduced motion. `cells` are baked over
 * the surface once per map, tinted `look.cell`.
 */
export interface WaterArt {
  readonly look: WaterLook;
  readonly cells: readonly CellLayer[];
  surface(painter: WaterPainter, shape: WaterShape, line: number, edge: WaterEdge): void;
  ripples(
    painter: WaterPainter,
    shape: WaterShape,
    line: number,
    seconds: number,
    still: boolean,
  ): void;
}

export type WaterArtKey = "water-deep" | "water-shallow";

export function waterArtKey(depth: MapWater["depth"]): WaterArtKey {
  return depth === "deep" ? "water-deep" : "water-shallow";
}

/** World units deep water sits under the floor: the far shore's sunk wall is this tall. */
export const WATER_SUNK = 6;
/** CSS px deep water's lip stands proud of the floor. */
export const LIP_RISE = 3;
/** CSS px wide the lip is, before its dark line. */
const LIP_WIDTH = 4;

/** The liquid cells' texture (#4058), painted once and shared by every water. */
export const WATER_CELLS: LiquidCellsOptions = { seed: 4058, sites: 15, gap: 7, size: 512 };

/** Two layers at different scales, still: drifting, they cost a frame too much (#4078). */
const CELL_LAYERS: readonly CellLayer[] = [{ scale: 0.5 }, { scale: 0.32 }];

/**
 * Water drawn from its look's colours (#4058). Deep: the far shore's
 * sunk wall, the fill, rings darker toward the middle, a stone lip. Shallow:
 * the see-through fill and a thin lighter shore.
 */
function proceduralWater(depth: MapWater["depth"]): WaterArt {
  const look = WATER_LOOK[depth];
  return {
    look,
    cells: CELL_LAYERS,
    surface(painter, shape, line, edge) {
      const shore = painter.shore(shape.outline);
      if (look.lip) {
        // The water sits below the floor: on the far shore its wall shows.
        painter.fillStyle(edge.wall, 1);
        painter.fillOutline(shape.outline);
      }
      painter.fillStyle(look.fill, look.fillAlpha);
      painter.fillOutline(look.lip ? sunk(shape.outline, shore) : shape.outline);
      const { width, height } = shape.anchor;
      const wall = look.lip ? WATER_SUNK : 0;
      const step = Math.max(0, Math.min(width, height) / 2 - wall) / (look.rings + 1);
      for (let ring = 1; ring <= look.rings; ring += 1) {
        painter.fillStyle(look.ring, look.ringAlpha);
        painter.fillOutline(insetShore(shape.outline, shore, wall + ring * step));
      }
      if (!look.lip) {
        painter.lineStyle(look.shoreWidth * line, look.shore, 1);
        strokeShore(painter, shore, 0);
        return;
      }
      painter.lineStyle((LIP_WIDTH + 2) * line, edge.outline, 1);
      strokeShore(painter, shore, 0);
      for (let rise = 0; rise <= LIP_RISE; rise += 1) {
        painter.lineStyle(LIP_WIDTH * line, edge.lip, 0.6 + (0.4 * rise) / LIP_RISE);
        strokeShore(painter, shore, rise * line);
      }
    },
    ripples(painter, shape, line, seconds, still) {
      paintRings(painter, shape.ripples, line, seconds, still, look.ripple, look.rippleAlpha);
    },
  };
}

/** `shore` stroked `rise` world units up. */
function strokeShore(
  painter: WaterPainter,
  shore: readonly (readonly [Vec2, Vec2])[],
  rise: number,
): void {
  for (const [a, b] of shore) {
    painter.lineBetween(a.x, a.y - rise, b.x, b.y - rise);
  }
}

/**
 * What of `outline` shows `art`'s water (#4058): deep water's is sunk
 * under the far shore's wall, shallow water's the whole of it.
 */
export function waterSurface(
  art: WaterArt,
  outline: readonly Vec2[],
  shore: readonly (readonly [Vec2, Vec2])[],
): readonly Vec2[] {
  return art.look.lip ? sunk(outline, shore) : outline;
}

/** Water's own surface under the far shore's wall: its shore pulled in half the wall, then sunk the other half. */
function sunk(
  outline: readonly Vec2[],
  shore: readonly (readonly [Vec2, Vec2])[],
): readonly Vec2[] {
  return insetShore(outline, shore, WATER_SUNK / 2).map((p) => ({
    x: p.x,
    y: p.y + WATER_SUNK / 2,
  }));
}

/** A mitre may reach this many times the inset at a sharp corner, no further. */
const MITRE_LIMIT = 3;

/**
 * `outline` with its `shore` edges moved `by` inward and its cut edges
 * left where they are, so a piece of water meets the next without a seam.
 */
export function insetShore(
  outline: readonly Vec2[],
  shore: readonly (readonly [Vec2, Vec2])[],
  by: number,
): readonly Vec2[] {
  const area = outline.reduce((sum, p, k) => {
    const q = outline[(k + 1) % outline.length] ?? p;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  // With y down, a positive shoelace sum winds clockwise on screen, and (-dy, dx) points in.
  const inward = area > 0 ? 1 : -1;
  const isShore = (a: Vec2, b: Vec2): boolean =>
    shore.some(([from, to]) => from.x === a.x && from.y === a.y && to.x === b.x && to.y === b.y);
  const edges = outline.map((a, k) => {
    const b = outline[(k + 1) % outline.length] ?? a;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const normal = { x: (-(b.y - a.y) / length) * inward, y: ((b.x - a.x) / length) * inward };
    return { normal, by: isShore(a, b) ? by : 0 };
  });
  return outline.map((p, k) => {
    const before = edges[(k + outline.length - 1) % outline.length];
    const after = edges[k];
    if (before === undefined || after === undefined) {
      return p;
    }
    // The corner where the two moved edges meet: d = n1·m = by1 and n2·m = by2.
    const n1 = before.normal;
    const n2 = after.normal;
    const det = n1.x * n2.y - n1.y * n2.x;
    if (Math.abs(det) < 1e-9) {
      return { x: p.x + n2.x * after.by, y: p.y + n2.y * after.by };
    }
    let mx = (before.by * n2.y - after.by * n1.y) / det;
    let my = (n1.x * after.by - n2.x * before.by) / det;
    const reach = Math.hypot(mx, my);
    const limit = MITRE_LIMIT * Math.max(before.by, after.by);
    if (reach > limit) {
      mx *= limit / reach;
      my *= limit / reach;
    }
    return { x: p.x + mx, y: p.y + my };
  });
}

/**
 * Pale rings on water, each swelling and drifting slowly on its own beat
 * at render time `seconds` (#4058): ellipses, flat as the floor is.
 */
export function paintRings(
  painter: Pick<WaterPainter, "lineStyle" | "strokeEllipse">,
  ripples: readonly Ripple[],
  line: number,
  seconds: number,
  still: boolean,
  colour: number,
  alpha: number,
): void {
  for (const ripple of ripples) {
    const swell = rippleSwell(ripple, seconds, still);
    const width = 2 * RIPPLE_HALF_LENGTH * (0.6 + 0.4 * swell);
    painter.lineStyle(line, colour, alpha * (1 - swell * 0.6));
    painter.strokeEllipse(
      ripple.at.x + rippleDrift(ripple, seconds, still),
      ripple.at.y,
      width,
      width / 2,
    );
  }
}

/**
 * Level ripple strokes, each swelling and drifting on its own beat at
 * render time `seconds`: a watery zone's (#3052).
 */
export function paintRipples(
  painter: Pick<WaterPainter, "lineStyle" | "lineBetween">,
  ripples: readonly Ripple[],
  line: number,
  seconds: number,
  still: boolean,
  colour: number,
  alpha: number,
): void {
  for (const ripple of ripples) {
    const drift = rippleDrift(ripple, seconds, still);
    const { x, y } = ripple.at;
    painter.lineStyle(1.5 * line, colour, alpha * rippleSwell(ripple, seconds, still));
    painter.lineBetween(x - RIPPLE_HALF_LENGTH + drift, y, x + RIPPLE_HALF_LENGTH + drift, y);
  }
}

export const WATER_ART: Record<WaterArtKey, WaterArt> = {
  "water-deep": proceduralWater("deep"),
  "water-shallow": proceduralWater("shallow"),
};
