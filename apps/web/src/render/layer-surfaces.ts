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

type Transition = MapStructure["transitions"][number];

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function boxOf(shape: RenderableShape): Box {
  const outline = shapeOutline(shape);
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/** The ramp `layer`'s body at `position` stands on, if any. */
function rampAt(structure: MapStructure, position: Vec2, layer: number): Transition | undefined {
  return structure.transitions.find(
    ({ from, to, area }) =>
      (from === layer || to === layer) && pointInPolygon(position, shapeOutline(area)),
  );
}

/** The cardinal direction `ramp` climbs: toward the nearest deck of its `to` layer. */
function uphillOf(structure: MapStructure, ramp: Transition): Vec2 | undefined {
  const box = boxOf(ramp.area);
  const centre = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  let nearest: Vec2 | undefined;
  for (const deck of structure.decks) {
    if (deck.layer !== ramp.to) {
      continue;
    }
    const footprint = boxOf(deck.footprint);
    const x = Math.min(Math.max(centre.x, footprint.left), footprint.right) - centre.x;
    const y = Math.min(Math.max(centre.y, footprint.top), footprint.bottom) - centre.y;
    if (nearest === undefined || x * x + y * y < nearest.x * nearest.x + nearest.y * nearest.y) {
      nearest = { x, y };
    }
  }
  if (nearest === undefined) {
    return undefined;
  }
  return Math.abs(nearest.x) >= Math.abs(nearest.y)
    ? { x: Math.sign(nearest.x), y: 0 }
    : { x: 0, y: Math.sign(nearest.y) };
}

/** How far along `box` `position` is going `uphill`: 0 at the low end, 1 at the high, clamped. */
function progressAlong(box: Box, uphill: Vec2, position: Vec2): number {
  const across =
    uphill.x !== 0
      ? (uphill.x > 0 ? position.x - box.left : box.right - position.x) / (box.right - box.left)
      : (uphill.y > 0 ? position.y - box.top : box.bottom - position.y) / (box.bottom - box.top);
  return Math.min(Math.max(across, 0), 1);
}

/** The height a ramp draws at `t` of the way up. */
function rampLift(ramp: Transition, t: number): number {
  return elevationOf(ramp.from) + t * (elevationOf(ramp.to) - elevationOf(ramp.from));
}

/**
 * The drawn lift of a body on `layer` at `position`: its layer's height,
 * or on a ramp of its layer the ramp's height at that point, which does
 * not depend on which of the ramp's two layers the body is on.
 */
export function liftAt(structure: MapStructure, position: Vec2, layer: number): number {
  const ramp = rampAt(structure, position, layer);
  const uphill = ramp === undefined ? undefined : uphillOf(structure, ramp);
  if (ramp === undefined || uphill === undefined) {
    return elevationOf(layer);
  }
  return rampLift(ramp, progressAlong(boxOf(ramp.area), uphill, position));
}

/**
 * The layer a body draws on: a ramp's upper one while it is on that ramp.
 * A ramp's top overlaps its deck, and a body walking down it has already
 * become the lower layer's, which would put it under that deck.
 */
export function drawnLayerAt(structure: MapStructure, position: Vec2, layer: number): number {
  const ramp = rampAt(structure, position, layer);
  return ramp === undefined ? layer : Math.max(ramp.from, ramp.to);
}

/** A ramp as it draws: all points already lifted. */
export interface RampDrawing {
  readonly slope: readonly Vec2[];
  readonly side: readonly Vec2[];
  readonly chevrons: readonly (readonly Vec2[])[];
}

/** Where the chevrons of a ramp sit, as shares of its length. */
const CHEVRON_AT = [0.25, 0.5, 0.75];
/** A chevron's arms: how far back along the ramp, how wide across it, as shares. */
const CHEVRON_BACK = 0.1;
const CHEVRON_WIDE = 0.28;

/** The slope, south side face and uphill chevrons of `ramp`; none if no deck tops it. */
export function rampDrawing(structure: MapStructure, ramp: Transition): RampDrawing | undefined {
  const uphill = uphillOf(structure, ramp);
  if (uphill === undefined) {
    return undefined;
  }
  const box = boxOf(ramp.area);
  const lifted = (point: Vec2): Vec2 => ({
    x: point.x,
    y: point.y - rampLift(ramp, progressAlong(box, uphill, point)),
  });
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const length = uphill.x !== 0 ? width : height;
  const wide = uphill.x !== 0 ? height : width;
  const centre = { x: box.left + width / 2, y: box.top + height / 2 };
  const onRamp = (t: number, across: number): Vec2 =>
    lifted({
      x: centre.x + uphill.x * (t - 0.5) * length - uphill.y * across * wide,
      y: centre.y + uphill.y * (t - 0.5) * length + uphill.x * across * wide,
    });
  const southWest = { x: box.left, y: box.bottom };
  const southEast = { x: box.right, y: box.bottom };
  const ground = elevationOf(ramp.from);
  return {
    slope: [
      lifted({ x: box.left, y: box.top }),
      lifted({ x: box.right, y: box.top }),
      lifted(southEast),
      lifted(southWest),
    ],
    side: [
      lifted(southWest),
      lifted(southEast),
      { x: southEast.x, y: southEast.y - ground },
      { x: southWest.x, y: southWest.y - ground },
    ],
    chevrons: CHEVRON_AT.map((t) => [
      onRamp(t - CHEVRON_BACK, -CHEVRON_WIDE),
      onRamp(t, 0),
      onRamp(t - CHEVRON_BACK, CHEVRON_WIDE),
    ]),
  };
}

/** How thick a deck on pillars draws: the rest of its height is open air. */
export const DECK_SLAB = 10;

/** Whether `wall`'s middle lies inside `shape`: a wall under a deck is a support. */
export function shapeHoldsCentre(shape: RenderableShape, wall: RenderableShape): boolean {
  const corners = shapeOutline(wall);
  const sum = corners.reduce((at, c) => ({ x: at.x + c.x, y: at.y + c.y }), { x: 0, y: 0 });
  return pointInPolygon(
    { x: sum.x / corners.length, y: sum.y / corners.length },
    shapeOutline(shape),
  );
}

/**
 * The lowest lift of `deck`'s side face: a layer-1 deck standing on a
 * ground wall is a slab, every other deck is solid down to the layer below.
 */
export function deckSideLow(
  deck: MapStructure["decks"][number],
  walls: readonly RenderableWall[],
): number {
  const onPillars =
    deck.layer === 1 &&
    walls.some((wall) => wall.layer === 0 && shapeHoldsCentre(deck.footprint, wall));
  return onPillars ? elevationOf(deck.layer) - DECK_SLAB : elevationOf(deck.layer - 1);
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

/** Whether Alt is held, as of a pointer's last event: a pointer that has had none has no event. */
export function altHeld(pointer: { readonly event?: { readonly altKey: boolean } }): boolean {
  return pointer.event?.altKey === true;
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
      occluder(deck.footprint, deckSideLow(deck, walls), elevationOf(deck.layer), deck.layer - 1),
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
