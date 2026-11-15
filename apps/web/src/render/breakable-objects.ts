import {
  breakableTargetId,
  pointInPolygon,
  polygonCentre,
  segmentsIntersect,
  type Vec2,
} from "@vibewars/game-core";
import type { BreakableDescriptor } from "@vibewars/game-protocol";

import type { MapStructure, RenderableShape } from "./arena-snapshot.js";
import { shapeOutline, WALL_HEIGHT } from "./layer-surfaces.js";
import { elevationOf } from "./render-order.js";

/**
 * Breakable walls (#3031) as the arena draws them: a stone wall that
 * cracks as it is struck and at 0 falls to rubble. Pure, so how far it
 * has cracked and what a right click picks are testable without Phaser. The
 * server keeps its health; the client only shows it.
 */

/** A breakable wall, standing or crumbled. */
export interface RenderableBreakable {
  /** What a click on it targets: `breakable-<id>`. */
  readonly id: string;
  readonly layer: number;
  /** Its wall's shape, as a map wall's. */
  readonly wall: RenderableShape;
  /** Its wall's outline, corner by corner. */
  readonly outline: readonly Vec2[];
  /** 0 once it has crumbled: then rubble, and nothing to click. */
  readonly health: number;
  readonly maxHealth: number;
}

/**
 * How far its cracks have grown at `health` of `maxHealth` (#3370): 0
 * whole, 1 crumbled, smoothly between, as `crackNetwork` reads it.
 */
export function crackReveal(health: number, maxHealth: number): number {
  return maxHealth > 0 ? Math.max(0, Math.min(1, 1 - health / maxHealth)) : 1;
}

/** A seed from its id: the same wall cracks and falls the same way on every client. */
export function breakableSeed(id: string): number {
  let seed = 0;
  for (let at = 0; at < id.length; at += 1) {
    seed = (seed * 31 + id.charCodeAt(at)) % 1000003;
  }
  return seed;
}

/**
 * Every breakable wall, with its health as `health` gives it; `[]` on a
 * map without them. One the snapshot has not reached yet stands whole.
 */
export function renderableBreakables(
  breakables: readonly BreakableDescriptor[],
  health: readonly number[],
): RenderableBreakable[] {
  return breakables.map(({ id, layer, wall, maxHealth }, at) => ({
    id: breakableTargetId(id),
    layer,
    wall,
    outline: shapeOutline(wall),
    health: health[at] ?? maxHealth,
    maxHealth,
  }));
}

/** Its health as a 0..1 fraction, clamped: the shape a health bar needs. */
export function breakableHealthFraction(breakable: RenderableBreakable): number {
  return breakable.maxHealth > 0
    ? Math.max(0, Math.min(1, breakable.health / breakable.maxHealth))
    : 0;
}

/** Where its health bar sits: over the middle of its wall's top, in world units. */
export function breakableBarAnchor(
  breakable: RenderableBreakable,
  structure: Pick<MapStructure, "ground" | "layerCount">,
): Vec2 {
  const centre = polygonCentre(breakable.outline);
  const { base, rise } = drawnRise(breakable.layer, structure);
  const top = Math.min(...breakable.outline.map((corner) => corner.y));
  return { x: centre.x, y: top - base - rise };
}

/** How high a wall on `layer` stands drawn: from its layer's lift, a wall's height up, or flat. */
function drawnRise(
  layer: number,
  { ground, layerCount }: Pick<MapStructure, "ground" | "layerCount">,
): { readonly base: number; readonly rise: number } {
  return layerCount === 1
    ? { base: 0, rise: 0 }
    : { base: elevationOf(layer, ground), rise: WALL_HEIGHT };
}

/**
 * The standing breakable wall drawn under `point`, for a right click to
 * target as a switch is (#3025): its top or its front face, as the wall
 * stands lifted on its layer. Rubble is nothing to click.
 */
export function breakableAtPoint(
  breakables: readonly RenderableBreakable[],
  point: Vec2,
  structure: Pick<MapStructure, "ground" | "layerCount">,
): string | undefined {
  return breakables.find((breakable) => {
    if (breakable.health <= 0) {
      return false;
    }
    // What is drawn at `point` is the footprint lifted by base..base+rise:
    // the footprint points straight below it, down that far.
    const { base, rise } = drawnRise(breakable.layer, structure);
    const low = { x: point.x, y: point.y + base };
    const high = { x: point.x, y: point.y + base + rise };
    const { outline } = breakable;
    return (
      pointInPolygon(low, outline) ||
      pointInPolygon(high, outline) ||
      outline.some((corner, at) =>
        segmentsIntersect(
          { a: low, b: high },
          { a: corner, b: outline[(at + 1) % outline.length] ?? corner },
        ),
      )
    );
  })?.id;
}

/** How long a hit's new crack takes to draw in, seconds (#3370). */
export const CRACK_GROW_SECONDS = 0.15;

/** What the client has seen of a breakable wall (#3370): its health, its last hit, its fall. */
export interface BreakableSeen {
  readonly health: number;
  /** How far its cracks were drawn as its last hit landed, 0..1, to grow on from. */
  readonly from: number;
  /** When its last hit landed, seconds; `undefined` before any this client saw. */
  readonly hitAt: number | undefined;
  /** How many hits it has taken that this client saw, to vary each one's chips. */
  readonly hits: number;
  /** When it fell, seconds; `undefined` while it stands, and for one seen already fallen. */
  readonly fellAt: number | undefined;
}

/**
 * `seen` brought up to `breakable` at `now` (#3370): a drop in health is a
 * hit, from where its cracks are drawn now; a drop to 0 is its fall; a
 * rise, a heal or repair, moves them back at once. A wall first seen
 * fallen is rubble, with no fall to show. `seen` itself while nothing changed.
 */
export function observeBreakable(
  seen: BreakableSeen | undefined,
  breakable: Pick<RenderableBreakable, "health" | "maxHealth">,
  now: number,
): BreakableSeen {
  const { health, maxHealth } = breakable;
  if (seen === undefined) {
    return {
      health,
      from: crackReveal(health, maxHealth),
      hitAt: undefined,
      hits: 0,
      fellAt: undefined,
    };
  }
  if (health === seen.health) {
    return seen;
  }
  if (health <= 0) {
    return { ...seen, health, fellAt: seen.health > 0 ? now : seen.fellAt };
  }
  if (health < seen.health) {
    return {
      health,
      from: drawnReveal(seen, maxHealth, now),
      hitAt: now,
      hits: seen.hits + 1,
      fellAt: undefined,
    };
  }
  return {
    health,
    from: crackReveal(health, maxHealth),
    hitAt: undefined,
    hits: seen.hits,
    fellAt: undefined,
  };
}

/** How far its cracks draw at `now`: its last hit's growing in over `CRACK_GROW_SECONDS`. */
export function drawnReveal(seen: BreakableSeen, maxHealth: number, now: number): number {
  const target = crackReveal(seen.health, maxHealth);
  if (seen.hitAt === undefined) {
    return target;
  }
  const t = Math.max(0, Math.min(1, (now - seen.hitAt) / CRACK_GROW_SECONDS));
  return seen.from + (target - seen.from) * (1 - (1 - t) * (1 - t));
}
