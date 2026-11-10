import { distancePointToSegment, pointInPolygon, type Vec2 } from "@vibewars/game-core";

import type { MapWater } from "./arena-snapshot.js";
import { shapeOutline } from "./layer-surfaces.js";

/**
 * What a body of water draws (#2984): its shore and the ripples on it,
 * built once per map. No Phaser here: plain geometry, so it can be tested
 * in Node, and nothing per frame but the ripples' phase.
 */

/** One ripple: a short level stroke centred on `at`, and where in its swell it starts. */
export interface Ripple {
  readonly at: Vec2;
  readonly seed: number;
}

export interface WaterShape {
  readonly layer: number;
  readonly depth: MapWater["depth"];
  /** The shore, corner by corner. */
  readonly outline: readonly Vec2[];
  /**
   * Where a sprite would sit: the outline's bounds' centre and size. The
   * procedural drawing ignores them; a texture is placed by them.
   */
  readonly anchor: { readonly centre: Vec2; readonly width: number; readonly height: number };
  readonly ripples: readonly Ripple[];
}

/** World units between ripples, across and down. */
export const RIPPLE_SPACING = 40;
/** A ripple stroke's half length, in world units. */
export const RIPPLE_HALF_LENGTH = 8;
/** How far a ripple drifts either side, in world units. */
export const RIPPLE_DRIFT = 3;
/** How near a ripple comes to the shore: its stroke and drift never cross it. */
export const RIPPLE_SHORE_CLEARANCE = RIPPLE_HALF_LENGTH + RIPPLE_DRIFT + 4;
/** Seconds one ripple takes to swell and fade: slow. */
export const RIPPLE_PERIOD_SECONDS = 5;
/** The most ripples one body of water draws, however large. */
export const MAX_RIPPLES = 400;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** `water`'s shore and ripples. */
export function waterShapeOf(water: MapWater): WaterShape {
  const outline = shapeOutline(water.area);
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    layer: water.layer,
    depth: water.depth,
    outline,
    anchor: {
      centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
      width: right - left,
      height: bottom - top,
    },
    ripples: ripplesIn(outline, RIPPLE_SPACING),
  };
}

/**
 * Ripples on a staggered lattice `spacing` apart over `outline`, each
 * clear of the shore: water's, and a watery zone's, closer (#3052).
 */
export function ripplesIn(outline: readonly Vec2[], spacing: number): readonly Ripple[] {
  const xs = outline.map((corner) => corner.x);
  const ys = outline.map((corner) => corner.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const ripples: Ripple[] = [];
  let row = 0;
  for (let y = top + spacing / 2; y < bottom; y += spacing, row += 1) {
    const stagger = row % 2 === 0 ? 0 : spacing / 2;
    for (let x = left + spacing / 2 + stagger; x < right; x += spacing) {
      const at = { x, y };
      if (pointInPolygon(at, outline) && shoreDistance(at, outline) >= RIPPLE_SHORE_CLEARANCE) {
        ripples.push({ at, seed: (ripples.length * GOLDEN_ANGLE) % (Math.PI * 2) });
        if (ripples.length === MAX_RIPPLES) {
          return ripples;
        }
      }
    }
  }
  return ripples;
}

/** How far `point` is from the nearest edge of `outline`. */
export function shoreDistance(point: Vec2, outline: readonly Vec2[]): number {
  let nearest = Infinity;
  outline.forEach((corner, at) => {
    const next = outline[(at + 1) % outline.length] ?? corner;
    nearest = Math.min(nearest, distancePointToSegment(point, { a: corner, b: next }));
  });
  return nearest;
}

/** Where `ripple` is in its swell at render time `seconds`, in radians. */
function rippleAngle(ripple: Ripple, seconds: number, still: boolean): number {
  return (still ? 0 : (seconds / RIPPLE_PERIOD_SECONDS) * Math.PI * 2) + ripple.seed;
}

/**
 * A ripple's swell at render time `seconds`, 0 to 1. Render time only,
 * never the simulation's: still water (reduced motion) holds every ripple
 * where it starts. Each frame asks this of every ripple, so it allocates
 * nothing.
 */
export function rippleSwell(ripple: Ripple, seconds: number, still: boolean): number {
  return 0.5 + 0.5 * Math.sin(rippleAngle(ripple, seconds, still));
}

/** A ripple's drift along its stroke at render time `seconds`, in world units. */
export function rippleDrift(ripple: Ripple, seconds: number, still: boolean): number {
  return RIPPLE_DRIFT * Math.cos(rippleAngle(ripple, seconds, still));
}
