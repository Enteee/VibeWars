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
 * cracks as it is struck and at 0 falls to rubble. Pure, so its crack
 * stage and what a right click picks are testable without Phaser. The
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

/** How cracked a breakable wall looks: whole, cracked, badly cracked, or crumbled. */
export type CrackStage = 0 | 1 | 2 | 3;

/** The stage a crumbled wall is at: rubble, no longer a wall. */
export const CRUMBLED: CrackStage = 3;

/** `health` of `maxHealth` as a look: cracks at two thirds and at a third, rubble at 0. */
export function crackStage(health: number, maxHealth: number): CrackStage {
  if (health <= 0) {
    return CRUMBLED;
  }
  const fraction = maxHealth > 0 ? health / maxHealth : 1;
  return fraction <= 1 / 3 ? 2 : fraction <= 2 / 3 ? 1 : 0;
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
