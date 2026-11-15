import { distancePointToSegment, pointInPolygon, type Vec2 } from "@vibewars/game-core";

import type { MapWater } from "./arena-snapshot.js";
import { boxWithout, shapeOutline, type Box } from "./layer-surfaces.js";

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

/**
 * A piece of a body of water split by the tunnel covers under it (#3350):
 * the part over tunnel `tunnel`, or of the rest when `undefined`. Its
 * `shore` is the edges of `outline` that are the water's own: a cut edge
 * meets the next piece's exactly and is never stroked.
 */
export interface WaterPiece {
  readonly tunnel: number | undefined;
  readonly outline: readonly Vec2[];
  readonly shore: readonly (readonly [Vec2, Vec2])[];
  readonly ripples: readonly Ripple[];
}

/** How far a corner may sit off a shore edge and still be on it, in world units. */
const ON_SHORE = 1e-6;

/**
 * `outline` clipped to `box` (Sutherland–Hodgman): what of it is inside,
 * empty when nothing is. A concave outline may come back with an edge run
 * back along the box's side, which has no area and so fills nothing.
 */
export function clipToBox(outline: readonly Vec2[], box: Box): readonly Vec2[] {
  const sides: readonly { readonly inside: (p: Vec2) => boolean; readonly cut: Cut }[] = [
    { inside: (p) => p.x >= box.left, cut: (a, b) => alongX(a, b, box.left) },
    { inside: (p) => p.x <= box.right, cut: (a, b) => alongX(a, b, box.right) },
    { inside: (p) => p.y >= box.top, cut: (a, b) => alongY(a, b, box.top) },
    { inside: (p) => p.y <= box.bottom, cut: (a, b) => alongY(a, b, box.bottom) },
  ];
  return sides.reduce<readonly Vec2[]>((points, { inside, cut }) => {
    const kept: Vec2[] = [];
    points.forEach((point, at) => {
      const previous = points[(at + points.length - 1) % points.length] ?? point;
      if (inside(point)) {
        if (!inside(previous)) {
          kept.push(cut(previous, point));
        }
        kept.push(point);
      } else if (inside(previous)) {
        kept.push(cut(previous, point));
      }
    });
    return kept;
  }, outline);
}

type Cut = (a: Vec2, b: Vec2) => Vec2;

function alongX(a: Vec2, b: Vec2, x: number): Vec2 {
  return { x, y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x) };
}

function alongY(a: Vec2, b: Vec2, y: number): Vec2 {
  return { x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y), y };
}

/** The area `outline` encloses, by the shoelace formula. */
export function outlineArea(outline: readonly Vec2[]): number {
  let twice = 0;
  outline.forEach((corner, at) => {
    const next = outline[(at + 1) % outline.length] ?? corner;
    twice += corner.x * next.y - next.x * corner.y;
  });
  return Math.abs(twice) / 2;
}

/**
 * `shape` split by the tunnel covers it lies over (#3350): one piece per
 * box of each cover it meets, and the rest of it in the boxes outside
 * every cover. Where two covers overlap, at a junction, the earlier owns
 * the overlap. Water over no cover is one piece, its whole self.
 */
export function waterPieces(
  shape: WaterShape,
  covers: readonly { readonly tunnel: number; readonly box: Box }[],
): readonly WaterPiece[] {
  const { centre, width, height } = shape.anchor;
  const whole: Box = {
    left: centre.x - width / 2,
    top: centre.y - height / 2,
    right: centre.x + width / 2,
    bottom: centre.y + height / 2,
  };
  const met = covers.filter(({ box }) => overlaps(box, whole));
  if (met.length === 0) {
    return [
      {
        tunnel: undefined,
        outline: shape.outline,
        shore: edges(shape.outline),
        ripples: shape.ripples,
      },
    ];
  }
  const owned: Box[] = [];
  const regions = met.flatMap(({ tunnel, box }) => {
    const boxes = boxWithout(box, owned).map((piece) => ({ tunnel, box: piece }));
    owned.push(box);
    return boxes;
  });
  const rest = boxWithout(whole, owned).map((box) => ({ tunnel: undefined, box }));
  const placed = new Set<Ripple>();
  return [...regions, ...rest].flatMap(({ tunnel, box }) => {
    const outline = clipToBox(shape.outline, box);
    if (outlineArea(outline) === 0) {
      return [];
    }
    // A ripple belongs to the one box its centre is in: right and bottom edges open.
    const ripples = shape.ripples.filter(
      (ripple) =>
        !placed.has(ripple) &&
        ripple.at.x >= box.left &&
        ripple.at.x < box.right &&
        ripple.at.y >= box.top &&
        ripple.at.y < box.bottom,
    );
    for (const ripple of ripples) {
      placed.add(ripple);
    }
    const shore = edges(outline).filter(([a, b]) =>
      edges(shape.outline).some(
        ([from, to]) =>
          distancePointToSegment(a, { a: from, b: to }) < ON_SHORE &&
          distancePointToSegment(b, { a: from, b: to }) < ON_SHORE,
      ),
    );
    return [{ tunnel, outline, shore, ripples }];
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function edges(outline: readonly Vec2[]): readonly (readonly [Vec2, Vec2])[] {
  return outline.map(
    (corner, at) => [corner, outline[(at + 1) % outline.length] ?? corner] as const,
  );
}
