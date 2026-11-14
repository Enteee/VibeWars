import { pointInPolygon, type Vec2 } from "@vibewars/game-core";
import type { OverhangLook } from "@vibewars/game-maps/schema";

import type { OverhangLookColours } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import { plankLines, shapeOutline, southFacingEdges } from "./layer-surfaces.js";

/**
 * Awnings, lean-tos and canopies (#3293, docs/art/visual-style.md): roofs
 * nobody stands on, drawn at their layer's height over whoever is under
 * them, and faded so they never hide a body. Phaser-free, so the looks and
 * the fade are tested without a scene.
 */

/** How far an overhang fades over a body under it: the tunnel cutaway's (#3234). */
export const OVERHANG_FADED_ALPHA = 0.35;
/** How long it takes to fade back once nobody is under it, in seconds. */
export const OVERHANG_FADE_SECONDS = 0.2;

/** How deep its front edge hangs below its roof, in world units: the eave that shows it is thin. */
const EAVE_DEPTH = 6;
/** An awning's stripes and a lean-to's slats, every so many world units. */
const STRIPE_EVERY = 16;
const SLAT_EVERY = 10;
/** A canopy's clumps of leaves: one every so many world units, this wide. */
const LEAF_EVERY = 22;
const LEAF_RADIUS = 9;

export interface OverhangPainter {
  fillStyle(colour: number, alpha: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  fillShape(shape: RenderableShape): void;
  fillCircle(x: number, y: number, radius: number): void;
  lineBetween(ax: number, ay: number, bx: number, by: number): void;
}

/**
 * `footprint` drawn as `look`, in world units at its own height: the
 * caller lifts it. Its eave first, hanging below its south-facing edges,
 * then its roof, then what tells the looks apart.
 */
export function paintOverhang(
  painter: OverhangPainter,
  look: OverhangLook,
  footprint: RenderableShape,
  colours: OverhangLookColours,
  line: number,
): void {
  const outline = shapeOutline(footprint);
  painter.fillStyle(colours.eave, 1);
  painter.fillShape(lowered(footprint, EAVE_DEPTH));
  painter.fillStyle(colours.roof, 1);
  painter.fillShape(footprint);
  switch (look) {
    case "awning":
      // Cloth in two dyes, striped north to south.
      painter.lineStyle(STRIPE_EVERY / 2, colours.detail, 1);
      for (const { from, to } of plankLines(footprint, STRIPE_EVERY, "x")) {
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
      break;
    case "lean-to":
      // Timber slats laid east to west, a dark gap between each.
      painter.lineStyle(line * 1.5, colours.detail, 1);
      for (const { from, to } of plankLines(footprint, SLAT_EVERY, "y")) {
        painter.lineBetween(from.x, from.y, to.x, to.y);
      }
      break;
    case "canopy": {
      // Clumps of leaves, lighter, on a staggered grid inside it.
      painter.fillStyle(colours.detail, 1);
      const xs = outline.map(({ x }) => x);
      const ys = outline.map(({ y }) => y);
      let row = 0;
      for (let y = Math.min(...ys) + LEAF_EVERY / 2; y < Math.max(...ys); y += LEAF_EVERY) {
        const offset = row % 2 === 0 ? LEAF_EVERY / 2 : LEAF_EVERY;
        for (let x = Math.min(...xs) + offset; x < Math.max(...xs); x += LEAF_EVERY) {
          if (pointInPolygon({ x, y }, outline)) {
            painter.fillCircle(x, y, LEAF_RADIUS);
          }
        }
        row += 1;
      }
      break;
    }
  }
  painter.lineStyle(line, colours.eave, 1);
  for (const { from, to } of southFacingEdges(footprint)) {
    painter.lineBetween(from.x, from.y + EAVE_DEPTH, to.x, to.y + EAVE_DEPTH);
  }
}

/** `shape` moved `by` south. */
function lowered(shape: RenderableShape, by: number): RenderableShape {
  return shape.kind === "rect"
    ? { ...shape, y: shape.y + by }
    : { ...shape, points: shape.points.map(({ x, y }) => ({ x, y: y + by })) };
}

/** An overhang as its fade reads it: where it hangs in the world, and where it is drawn. */
export interface OverhangCover {
  readonly layer: number;
  readonly outline: readonly Vec2[];
  /** Its drawn lift, `elevationOf` its layer. */
  readonly top: number;
}

/** A body as its overhang reads it: where it draws, lifted by its layer, and on which. */
export interface OverhangBody {
  readonly id: string;
  readonly position: Vec2;
  readonly layer: number;
}

/**
 * Whether any body is under `cover`: below its layer and standing inside
 * its footprint, its drawn position lowered by `liftOf` it, or drawn
 * where its roof is drawn, as a body just north of it is. Allocates
 * nothing: it runs every frame for every overhang.
 */
export function bodyUnder(
  cover: OverhangCover,
  bodies: readonly OverhangBody[],
  liftOf: (id: string) => number,
): boolean {
  for (const body of bodies) {
    if (body.layer >= cover.layer) {
      continue;
    }
    const { x, y } = body.position;
    if (inside(cover.outline, x, y + liftOf(body.id)) || inside(cover.outline, x, y + cover.top)) {
      return true;
    }
  }
  return false;
}

/** Whether `(x, y)` is inside `outline`: `pointInPolygon` without making a point. */
function inside(outline: readonly Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const a = outline[i];
    const b = outline[j];
    if (a !== undefined && b !== undefined && a.y > y !== b.y > y) {
      if (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/**
 * An overhang's alpha `dt` seconds on: toward `OVERHANG_FADED_ALPHA` while
 * a body is under it, back to 1 once none is, over
 * `OVERHANG_FADE_SECONDS`. At once under reduced motion.
 */
export function overhangAlpha(
  alpha: number,
  covering: boolean,
  dt: number,
  reducedMotion: boolean,
): number {
  const target = covering ? OVERHANG_FADED_ALPHA : 1;
  const step = reducedMotion ? 1 : (dt * (1 - OVERHANG_FADED_ALPHA)) / OVERHANG_FADE_SECONDS;
  return alpha < target ? Math.min(target, alpha + step) : Math.max(target, alpha - step);
}
