import { pointInPolygon, type Vec2 } from "@vibewars/game-core";

import type { MapStructure, RenderableShape, RenderableWall } from "./arena-snapshot.js";
import { creatureOutline } from "./creature-shape.js";
import { ELEVATION_STEP, elevationOf } from "./render-order.js";

/**
 * What a layered arena (ADR-0051) shows under the cursor, and which part
 * of a body its structures hide (#2831). No Phaser here: plain geometry,
 * so it can be tested in Node.
 */

export function shapeOutline(shape: RenderableShape): readonly Vec2[] {
  return shape.kind === "polygon"
    ? shape.points
    : [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
        { x: shape.x, y: shape.y + shape.height },
      ];
}

/** A place a click can name: the layer, and the point on it in the simulation's terms. */
export interface Surface {
  readonly layer: number;
  readonly point: Vec2;
}

/**
 * The surfaces drawn at `world`, the visible one first and the ground
 * last. A deck draws lifted, so the point on it lies below the cursor.
 */
export function surfacesAt(structure: MapStructure, world: Vec2): readonly Surface[] {
  const surfaces: Surface[] = [];
  for (let layer = structure.layerCount - 1; layer > 0; layer -= 1) {
    const point = { x: world.x, y: world.y + elevationOf(layer) };
    const here = structure.decks.some(
      (deck) => deck.layer === layer && pointInPolygon(point, shapeOutline(deck.footprint)),
    );
    if (here) {
      surfaces.push({ layer, point });
    }
  }
  surfaces.push({ layer: 0, point: world });
  return surfaces;
}

/** Where a click at `world` goes: the visible surface, or with `below` the one under it, if any. */
export function pickSurface(structure: MapStructure, world: Vec2, below: boolean): Surface {
  const surfaces = surfacesAt(structure, world);
  return surfaces[below ? 1 : 0] ?? { layer: 0, point: world };
}

/** A structure as it hides bodies: its outline, the lifts it is drawn at, whom it covers. */
export interface Occluder {
  readonly outline: readonly Vec2[];
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly lowLift: number;
  readonly highLift: number;
  /** The highest layer it covers: it draws over bodies up to this one. */
  readonly hidesThrough: number;
}

function occluder(
  shape: RenderableShape,
  lowLift: number,
  highLift: number,
  hidesThrough: number,
): Occluder {
  const outline = shapeOutline(shape);
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  return {
    outline,
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys) - highLift,
    bottom: Math.max(...ys) - lowLift,
    lowLift,
    highLift,
    hidesThrough,
  };
}

/** What can hide a body on this map; nothing on a map of one layer, where bodies draw in front. */
export function occludersOf(
  walls: readonly RenderableWall[],
  structure: MapStructure,
): readonly Occluder[] {
  if (structure.layerCount === 1) {
    return [];
  }
  return [
    ...walls.map((wall) =>
      occluder(wall, elevationOf(wall.layer), elevationOf(wall.layer), wall.layer),
    ),
    ...structure.decks.map((deck) =>
      occluder(
        deck.footprint,
        elevationOf(deck.layer - 1),
        elevationOf(deck.layer),
        deck.layer - 1,
      ),
    ),
  ];
}

/** How finely a deck's side face is tested, in world units. */
const LIFT_SLICE = ELEVATION_STEP / 4;
const probe = { x: 0, y: 0 };

function hides(each: Occluder, x: number, y: number): boolean {
  if (x < each.left || x > each.right || y < each.top || y > each.bottom) {
    return false;
  }
  for (let lift = each.lowLift; ; lift += LIFT_SLICE) {
    const at = Math.min(lift, each.highLift);
    probe.x = x;
    probe.y = y + at;
    if (pointInPolygon(probe, each.outline)) {
      return true;
    }
    if (at === each.highLift) {
      return false;
    }
  }
}

function closedPath(points: readonly Vec2[], perEdge: number): Float64Array {
  const path = new Float64Array((points.length * perEdge + 1) * 2);
  points.forEach((from, k) => {
    const to = points[(k + 1) % points.length] ?? from;
    for (let step = 0; step <= perEdge; step += 1) {
      const at = (k * perEdge + step) * 2;
      path[at] = from.x + ((to.x - from.x) * step) / perEdge;
      path[at + 1] = from.y + ((to.y - from.y) * step) / perEdge;
    }
  });
  return path;
}

const RING_SEGMENTS = 48;

/** A body's outline around the origin at radius 1, x and y in turn, closed. */
export const RING_PATH = closedPath(
  Array.from({ length: RING_SEGMENTS }, (_, k) => ({
    x: Math.cos((k * 2 * Math.PI) / RING_SEGMENTS),
    y: Math.sin((k * 2 * Math.PI) / RING_SEGMENTS),
  })),
  1,
);
/** A creature's outline, as `RING_PATH`. */
export const CREATURE_PATH = closedPath(creatureOutline(0, 0, 1), 8);

/**
 * Calls `segment` for each piece of the outline `path`, scaled to `r` at
 * (`x`, `y`), that a structure covers a body on `layer` at. A body clear
 * of every structure costs one box test each. Allocates nothing.
 */
export function traceHiddenOutline(
  path: Float64Array,
  x: number,
  y: number,
  r: number,
  layer: number,
  occluders: readonly Occluder[],
  segment: (ax: number, ay: number, bx: number, by: number) => void,
): void {
  for (const each of occluders) {
    if (
      layer > each.hidesThrough ||
      x + r * 1.2 < each.left ||
      x - r * 1.2 > each.right ||
      y + r * 1.2 < each.top ||
      y - r * 1.2 > each.bottom
    ) {
      continue;
    }
    for (let i = 0; i + 3 < path.length; i += 2) {
      const ax = x + (path[i] ?? 0) * r;
      const ay = y + (path[i + 1] ?? 0) * r;
      const bx = x + (path[i + 2] ?? 0) * r;
      const by = y + (path[i + 3] ?? 0) * r;
      if (hides(each, (ax + bx) / 2, (ay + by) / 2)) {
        segment(ax, ay, bx, by);
      }
    }
  }
}
