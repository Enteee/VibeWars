import { pointInPolygon, progressAlong, UPHILL, type Vec2 } from "@vibewars/game-core";

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

/** The lift of `layer` on `structure`'s map. */
function liftOf(structure: MapStructure, layer: number): number {
  return elevationOf(layer, structure.ground);
}

/** The height a ramp draws at `t` of the way up. */
function rampLift(structure: MapStructure, ramp: Transition, t: number): number {
  const from = liftOf(structure, ramp.from);
  return from + t * (liftOf(structure, ramp.to) - from);
}

/**
 * The drawn lift of a body on `layer` at `position`: its layer's height,
 * or on a ramp of its layer the ramp's height at that point, which does
 * not depend on which of the ramp's two layers the body is on.
 */
export function liftAt(structure: MapStructure, position: Vec2, layer: number): number {
  const ramp = rampAt(structure, position, layer);
  if (ramp === undefined) {
    return liftOf(structure, layer);
  }
  return rampLift(
    structure,
    ramp,
    progressAlong(shapeOutline(ramp.area), UPHILL[ramp.uphill], position),
  );
}

/** Whether a disc of `radius` at `position` reaches into `box`. */
function discReaches(box: Box, position: Vec2, radius: number): boolean {
  const x = position.x - Math.min(Math.max(position.x, box.left), box.right);
  const y = position.y - Math.min(Math.max(position.y, box.top), box.bottom);
  return x * x + y * y < radius * radius;
}

/**
 * The layer a body of `radius` draws on: a ramp's upper one while its
 * disc is on that ramp, so the ramp never cuts into it. A ramp's top
 * overlaps its deck, and a body walking down it has already become the
 * lower layer's, which would put it under that deck. A body whose centre
 * is off the ramp and under a deck stays under it.
 */
export function drawnLayerAt(
  structure: MapStructure,
  position: Vec2,
  layer: number,
  radius: number,
): number {
  const on = rampAt(structure, position, layer);
  if (on !== undefined) {
    return Math.max(on.from, on.to);
  }
  const near = structure.transitions.find(
    ({ from, to, area }) =>
      (from === layer || to === layer) && discReaches(boxOf(area), position, radius),
  );
  const underDeck = structure.decks.some(
    (deck) => deck.layer > layer && pointInPolygon(position, shapeOutline(deck.footprint)),
  );
  return near === undefined || underDeck ? layer : Math.max(near.from, near.to);
}

/** A ramp as it draws: all points already lifted. */
export interface RampDrawing {
  readonly slope: readonly Vec2[];
  readonly side: readonly Vec2[];
  readonly chevrons: readonly (readonly Vec2[])[];
  /** The lines across the slope, each its two ends. */
  readonly panels: readonly (readonly Vec2[])[];
}

/** Where the chevrons of a ramp sit, as shares of its length. */
const CHEVRON_AT = [0.25, 0.5, 0.75];
/** A chevron's arms: how far back along the ramp, how wide across it, as shares. */
const CHEVRON_BACK = 0.1;
const CHEVRON_WIDE = 0.28;
/** How far apart a ramp's panel lines are, in world units. */
const RAMP_PANEL = 24;

/** The slope, south side face and uphill chevrons of `ramp`. */
export function rampDrawing(structure: MapStructure, ramp: Transition): RampDrawing {
  const uphill = UPHILL[ramp.uphill];
  const box = boxOf(ramp.area);
  const lifted = (point: Vec2): Vec2 => ({
    x: point.x,
    y: point.y - rampLift(structure, ramp, progressAlong(shapeOutline(ramp.area), uphill, point)),
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
  const foot = liftOf(structure, ramp.from);
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
      { x: southEast.x, y: southEast.y - foot },
      { x: southWest.x, y: southWest.y - foot },
    ],
    chevrons: CHEVRON_AT.map((t) => [
      onRamp(t - CHEVRON_BACK, -CHEVRON_WIDE),
      onRamp(t, 0),
      onRamp(t - CHEVRON_BACK, CHEVRON_WIDE),
    ]),
    panels: Array.from({ length: Math.ceil(length / RAMP_PANEL) - 1 }, (_, k) => {
      const t = ((k + 1) * RAMP_PANEL) / length;
      return [onRamp(t, -0.5), onRamp(t, 0.5)];
    }),
  };
}

/** How thick a deck on pillars draws: the rest of its height is open air. */
export const DECK_SLAB = 12;

/** How high a wall that is not a support stands above its layer. */
export const WALL_HEIGHT = 28;

/** A straight line between two points. */
export interface Segment {
  readonly from: Vec2;
  readonly to: Vec2;
}

/** The edges of `shape` whose outside faces the camera: a wall's lit edge, a deck's lip. */
export function southFacingEdges(shape: RenderableShape): readonly Segment[] {
  const outline = shapeOutline(shape);
  const pairs = outline.map((from, k) => ({ from, to: outline[(k + 1) % outline.length] ?? from }));
  const winding = pairs.reduce((sum, { from, to }) => sum + from.x * to.y - to.x * from.y, 0);
  return pairs.filter(({ from, to }) => Math.sign(winding) * (from.x - to.x) > 0);
}

/** The north-south lines across `shape`, one every `every`, cut to its outline. */
export function plankLines(shape: RenderableShape, every: number): readonly Segment[] {
  const box = boxOf(shape);
  const outline = shapeOutline(shape);
  const lines: Segment[] = [];
  for (let x = box.left + every; x < box.right; x += every) {
    const crossings = outline
      .flatMap((a, k) => {
        const b = outline[(k + 1) % outline.length] ?? a;
        return a.x <= x === b.x <= x ? [] : [a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x)];
      })
      .sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      lines.push({
        from: { x, y: crossings[i] ?? 0 },
        to: { x, y: crossings[i + 1] ?? 0 },
      });
    }
  }
  return lines;
}

/** Whether `wall`'s middle lies inside `shape`: a wall under a deck is a support. */
export function shapeHoldsCentre(shape: RenderableShape, wall: RenderableShape): boolean {
  const corners = shapeOutline(wall);
  const sum = corners.reduce((at, c) => ({ x: at.x + c.x, y: at.y + c.y }), { x: 0, y: 0 });
  return pointInPolygon(
    { x: sum.x / corners.length, y: sum.y / corners.length },
    shapeOutline(shape),
  );
}

/** The deck `wall` holds up, if it stands under one. */
export function deckHeldBy(
  wall: RenderableWall,
  structure: MapStructure,
): MapStructure["decks"][number] | undefined {
  return structure.decks.find(
    (deck) => deck.layer > wall.layer && shapeHoldsCentre(deck.footprint, wall),
  );
}

/**
 * The lowest lift of `deck`'s side face: a deck one layer over the
 * `ground` standing on a ground wall is a slab, every other deck is solid
 * down to the layer below.
 */
export function deckSideLow(
  deck: MapStructure["decks"][number],
  walls: readonly RenderableWall[],
  ground: number,
): number {
  const onPillars =
    deck.layer === ground + 1 &&
    walls.some((wall) => wall.layer === ground && shapeHoldsCentre(deck.footprint, wall));
  return onPillars
    ? elevationOf(deck.layer, ground) - DECK_SLAB
    : elevationOf(deck.layer - 1, ground);
}

/** A box's corners, clockwise from its north-west. */
function boxOutline(left: number, top: number, right: number, bottom: number): readonly Vec2[] {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

/** A pit as it draws (#2973), every point already sunk. */
export interface PitDrawing {
  /** Its floor, a step down; the ground's near lip covers its south strip. */
  readonly floor: readonly Vec2[];
  /** Its far (north) wall, from the rim down to the floor. */
  readonly farWall: readonly Vec2[];
  /** Where each tunnel leaves it: a dark opening at the foot of its wall. */
  readonly mouths: readonly (readonly Vec2[])[];
  /** The ground's near lip: the strip south of it that hides its floor's south edge. */
  readonly lip: readonly Vec2[];
}

/** How far a tunnel's mouth reaches into a pit's floor, in world units. */
const MOUTH_DEPTH = 14;

/** The floor, far wall, tunnel mouths and near lip of `pit`. */
export function pitDrawing(structure: MapStructure, pit: MapStructure["pits"][number]): PitDrawing {
  const step = -liftOf(structure, structure.ground - 1);
  const box = boxOf(pit.footprint);
  const mouths = structure.tunnels.flatMap(({ footprint }) => {
    const tunnel = boxOf(footprint);
    const top = Math.max(box.top, tunnel.top) + step;
    const bottom = Math.min(box.bottom, tunnel.bottom) + step;
    const left = Math.max(box.left, tunnel.left);
    const right = Math.min(box.right, tunnel.right);
    if (bottom > top && tunnel.left <= box.right && tunnel.right > box.right) {
      return [boxOutline(box.right - MOUTH_DEPTH, top, box.right, bottom)];
    }
    if (bottom > top && tunnel.right >= box.left && tunnel.left < box.left) {
      return [boxOutline(box.left, top, box.left + MOUTH_DEPTH, bottom)];
    }
    // Through the far wall, the whole of its height.
    if (right > left && tunnel.bottom >= box.top && tunnel.top < box.top) {
      return [boxOutline(left, box.top, right, box.top + step)];
    }
    return [];
  });
  return {
    floor: boxOutline(box.left, box.top + step, box.right, box.bottom + step),
    farWall: boxOutline(box.left, box.top, box.right, box.top + step),
    mouths,
    lip: boxOutline(box.left, box.bottom, box.right, box.bottom + step),
  };
}

/**
 * The ground drawn over `tunnel` (#2973): its footprint, and a step south
 * of it, where whoever is in the tunnel draws, sunk a step down.
 */
export function tunnelCover(
  structure: MapStructure,
  tunnel: MapStructure["tunnels"][number],
): readonly Vec2[] {
  const step = -liftOf(structure, structure.ground - 1);
  const box = boxOf(tunnel.footprint);
  return boxOutline(box.left, box.top, box.right, box.bottom + step);
}

/** A place a click can name: the layer, and the point on it in the simulation's terms. */
export interface Surface {
  readonly layer: number;
  readonly point: Vec2;
}

/** The point on `ramp` drawn at `world`, with its lift; none if it is not on the ramp. */
function rampSurface(
  structure: MapStructure,
  ramp: Transition,
  world: Vec2,
): (Surface & { readonly lift: number }) | undefined {
  const uphill = UPHILL[ramp.uphill];
  const outline = shapeOutline(ramp.area);
  // The lift rises linearly along the ramp, so the point drawn at `world`
  // solves y = world.y + lift(y) exactly; its slope is under 1.
  const along = outline.map((corner) => corner.x * uphill.x + corner.y * uphill.y);
  const low = Math.min(...along);
  const foot = liftOf(structure, ramp.from);
  const rise = (liftOf(structure, ramp.to) - foot) / (Math.max(...along) - low);
  const point = {
    x: world.x,
    y: (world.y + foot + rise * (world.x * uphill.x - low)) / (1 - rise * uphill.y),
  };
  if (!pointInPolygon(point, outline)) {
    return undefined;
  }
  const t = progressAlong(outline, uphill, point);
  return { layer: t >= 0.5 ? ramp.to : ramp.from, point, lift: rampLift(structure, ramp, t) };
}

/** Whether `point` lies in one of `shapes`' footprints. */
function inAny(shapes: readonly { readonly footprint: RenderableShape }[], point: Vec2): boolean {
  return shapes.some(({ footprint }) => pointInPolygon(point, shapeOutline(footprint)));
}

/**
 * The surfaces drawn at `world`, the visible one first, one per layer. A
 * deck or ramp draws lifted, so the point on it lies below the cursor; a
 * pit or tunnel draws sunk (#2973), so the point on its floor lies above.
 */
export function surfacesAt(structure: MapStructure, world: Vec2): readonly Surface[] {
  const { ground } = structure;
  const surfaces: (Surface & { readonly lift: number })[] = [];
  for (let layer = structure.layerCount - 1; layer > ground; layer -= 1) {
    const point = { x: world.x, y: world.y + liftOf(structure, layer) };
    const here = structure.decks.some(
      (deck) => deck.layer === layer && pointInPolygon(point, shapeOutline(deck.footprint)),
    );
    if (here) {
      surfaces.push({ layer, point, lift: liftOf(structure, layer) });
    }
  }
  for (const ramp of structure.transitions) {
    const surface = rampSurface(structure, ramp, world);
    if (surface !== undefined) {
      surfaces.push(surface);
    }
  }
  // A pit's floor shows through its hole, under the ground's near lip; a
  // tunnel's only under the ground over it.
  const below = { x: world.x, y: world.y + liftOf(structure, ground - 1) };
  const inPit = inAny(structure.pits, below);
  if (inPit || inAny(structure.tunnels, below)) {
    surfaces.push({ layer: ground - 1, point: below, lift: liftOf(structure, ground - 1) });
  }
  if (!inPit || !inAny(structure.pits, world)) {
    surfaces.push({ layer: ground, point: world, lift: 0 });
  }
  const seen = new Set<number>();
  return surfaces
    .sort((a, b) => b.lift - a.lift)
    .filter(({ layer }) => !seen.has(layer) && seen.add(layer))
    .map(({ layer, point }) => ({ layer, point }));
}

/** Whether Alt is held, from the latest key or pointer event. */
export interface AltTracker {
  held(): boolean;
  dispose(): void;
}

/**
 * Tracks Alt on `target` (#3020): a key event as well as a pointer's, so
 * pressing it with the mouse still counts at once. A blurred window gets
 * no keyup, so it is not held after the window loses focus.
 */
export function trackAlt(
  target: Pick<Window, "addEventListener" | "removeEventListener">,
): AltTracker {
  let held = false;
  const follow = (event: Event): void => {
    held = "altKey" in event && event.altKey === true;
  };
  const release = (): void => {
    held = false;
  };
  const followed = ["keydown", "keyup", "pointermove", "pointerdown"] as const;
  for (const type of followed) {
    target.addEventListener(type, follow);
  }
  target.addEventListener("blur", release);
  return {
    held: () => held,
    dispose: () => {
      for (const type of followed) {
        target.removeEventListener(type, follow);
      }
      target.removeEventListener("blur", release);
    },
  };
}

/** Where a click at `world` goes: the visible surface, or with `below` the one under it, if any. */
export function pickSurface(structure: MapStructure, world: Vec2, below: boolean): Surface {
  const surfaces = surfacesAt(structure, world);
  return (
    (below ? surfaces[1] : undefined) ?? surfaces[0] ?? { layer: structure.ground, point: world }
  );
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
  /** A ground outline where a body's feet clear it: a ground ramp's own area (#3000). */
  readonly exempt: readonly Vec2[] | null;
}

function occluder(
  outline: readonly Vec2[],
  lowLift: number,
  highLift: number,
  hidesThrough: number,
  exempt: readonly Vec2[] | null,
): Occluder {
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
    exempt,
  };
}

/**
 * The north edge of the strip along `pit`'s south edge that the ground's
 * near lip hides: nothing on the pit's floor may reach further south (#3081).
 */
export function pitLipTop(structure: MapStructure, pit: MapStructure["pits"][number]): number {
  return boxOf(pit.footprint).bottom + liftOf(structure, structure.ground - 1);
}

/** What can hide a body on this map; nothing on a map of one layer, where bodies draw in front. */
export function occludersOf(
  walls: readonly RenderableWall[],
  structure: MapStructure,
): readonly Occluder[] {
  if (structure.layerCount === 1) {
    return [];
  }
  const { ground } = structure;
  const sunk = liftOf(structure, ground - 1);
  return [
    ...walls.map((wall) => {
      const base = liftOf(structure, wall.layer);
      const held = deckHeldBy(wall, structure);
      const high = held === undefined ? base + WALL_HEIGHT : deckSideLow(held, walls, ground);
      return occluder(shapeOutline(wall), base, high, wall.layer, null);
    }),
    ...structure.decks.map((deck) =>
      occluder(
        shapeOutline(deck.footprint),
        deckSideLow(deck, walls, ground),
        liftOf(structure, deck.layer),
        deck.layer - 1,
        null,
      ),
    ),
    // A raised ramp covers the ground under it as a deck does (#2975); its
    // slope is drawn already lifted, so it hides at no further lift. A ramp
    // up from the ground covers the ground behind it, but not a body on it
    // (#3000): on its upper half that body is on the layer above already.
    ...structure.transitions.flatMap((ramp) => {
      if (ramp.from < ground) {
        return [];
      }
      const { slope } = rampDrawing(structure, ramp);
      return ramp.from === ground
        ? [occluder(slope, 0, 0, ground, shapeOutline(ramp.area))]
        : [occluder(slope, 0, 0, ramp.from - 1, null)];
    }),
    // The ground over a tunnel covers it whole, from its sunk floor up (#2973).
    ...structure.tunnels.map((tunnel) =>
      occluder(shapeOutline(tunnel.footprint), sunk, 0, ground - 1, null),
    ),
    // A pit draws a step down: the strip along its south edge then falls
    // behind the ground's near lip (#2973).
    ...structure.pits.map((pit) => {
      const box = boxOf(pit.footprint);
      const strip = boxOutline(
        box.left,
        Math.max(box.top, pitLipTop(structure, pit)),
        box.right,
        box.bottom,
      );
      return occluder(strip, sunk, sunk, ground - 1, null);
    }),
  ];
}

/** How finely a deck's side face is tested, in world units. */
const LIFT_SLICE = ELEVATION_STEP / 4;
const probe = { x: 0, y: 0 };
const feet = { x: 0, y: 0 };

/** Whether a body's feet at (`x`, `y`) stand where `each` cannot cover them. */
function exempted(each: Occluder, x: number, y: number): boolean {
  if (each.exempt === null) {
    return false;
  }
  feet.x = x;
  feet.y = y;
  return pointInPolygon(feet, each.exempt);
}

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
 * A hidden outline is dashed (#2979), as in `docs/art/2811-occlusion-d1.png`:
 * this long a dash, then this long a gap, in world units, measured along
 * the outline from its start, so the dashes keep to the body as it moves.
 */
export const HIDDEN_DASH = 5;
export const HIDDEN_GAP = 4;
const DASH_PERIOD = HIDDEN_DASH + HIDDEN_GAP;

/** Whether the point `along` an outline from its start is on a dash. */
function onDash(along: number): boolean {
  return along % DASH_PERIOD < HIDDEN_DASH;
}

/**
 * Calls `segment` for each piece of the outline `path`, scaled to `r` at
 * (`x`, `y`), that a structure covers a body on `layer` at and that lies
 * on a dash. A body clear of every structure costs one box test each.
 * Allocates nothing.
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
    if (exempted(each, x, y)) {
      continue;
    }
    let along = 0;
    for (let i = 0; i + 3 < path.length; i += 2) {
      const ax = x + (path[i] ?? 0) * r;
      const ay = y + (path[i + 1] ?? 0) * r;
      const bx = x + (path[i + 2] ?? 0) * r;
      const by = y + (path[i + 3] ?? 0) * r;
      const length = Math.hypot(bx - ax, by - ay);
      if (onDash(along + length / 2) && hides(each, (ax + bx) / 2, (ay + by) / 2)) {
        segment(ax, ay, bx, by);
      }
      along += length;
    }
  }
}

/** A piece of a polyline, in world space. */
export interface HiddenPiece {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

/** How long a piece of a polyline is tested as one, in world units. */
const POLYLINE_STEP = 2;

/** Whether a structure covers a body on `layer` at this point. */
function hiddenAt(occluders: readonly Occluder[], layer: number, x: number, y: number): boolean {
  return occluders.some(
    (each) => layer <= each.hidesThrough && hides(each, x, y) && !exempted(each, x, y),
  );
}

/**
 * The pieces of the world-space `points` that a structure covers on a body
 * on `layer`, dashed as `traceHiddenOutline`'s: every piece is cut at the
 * dash boundaries, so a long straight shaft dashes too.
 */
export function traceHiddenPolyline(
  points: readonly Vec2[],
  layer: number,
  occluders: readonly Occluder[],
): readonly HiddenPiece[] {
  const pieces: HiddenPiece[] = [];
  let start = 0;
  points.forEach((from, at) => {
    const to = points[at + 1];
    if (to === undefined) {
      return;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    // Each dash this piece of the line crosses, as distances along it.
    for (let k = Math.floor(start / DASH_PERIOD); k * DASH_PERIOD < start + length; k += 1) {
      const dashTo = Math.min(length, k * DASH_PERIOD + HIDDEN_DASH - start);
      for (let done = Math.max(0, k * DASH_PERIOD - start); done < dashTo; done += POLYLINE_STEP) {
        const next = Math.min(dashTo, done + POLYLINE_STEP);
        const ax = from.x + ((to.x - from.x) * done) / length;
        const ay = from.y + ((to.y - from.y) * done) / length;
        const bx = from.x + ((to.x - from.x) * next) / length;
        const by = from.y + ((to.y - from.y) * next) / length;
        if (hiddenAt(occluders, layer, (ax + bx) / 2, (ay + by) / 2)) {
          pieces.push({ ax, ay, bx, by });
        }
      }
    }
    start += length;
  });
  return pieces;
}

/** A part of a box, each number a fraction of its size. */
export interface BoxPart {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const CROP_SAMPLES = 8;

/**
 * The part of the `size` box centred on (`x`, `y`) a structure covers on a
 * body on `layer`: the bounding box of its hidden samples, on a grid.
 * `undefined` with none hidden.
 */
export function hiddenCrop(
  x: number,
  y: number,
  size: number,
  layer: number,
  occluders: readonly Occluder[],
): BoxPart | undefined {
  let left = CROP_SAMPLES;
  let top = CROP_SAMPLES;
  let right = -1;
  let bottom = -1;
  for (let row = 0; row < CROP_SAMPLES; row += 1) {
    for (let column = 0; column < CROP_SAMPLES; column += 1) {
      const sx = x - size / 2 + ((column + 0.5) * size) / CROP_SAMPLES;
      const sy = y - size / 2 + ((row + 0.5) * size) / CROP_SAMPLES;
      if (hiddenAt(occluders, layer, sx, sy)) {
        left = Math.min(left, column);
        top = Math.min(top, row);
        right = Math.max(right, column);
        bottom = Math.max(bottom, row);
      }
    }
  }
  return right < 0
    ? undefined
    : {
        x: left / CROP_SAMPLES,
        y: top / CROP_SAMPLES,
        width: (right - left + 1) / CROP_SAMPLES,
        height: (bottom - top + 1) / CROP_SAMPLES,
      };
}
