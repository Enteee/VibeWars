import type { Vec2 } from "@vibewars/game-core";
import type { MapLighting } from "@vibewars/game-maps/schema";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * What a light visibly comes from (docs/art/visual-style.md §2): a light
 * with a `source` has it drawn under it, once with the static map. Scenery
 * only: no collision, no nav cost, nothing to click.
 */

/** One stroke of a source, in world units. `lit` iron takes the scene's light; fire never does. */
export type SourceCommand =
  | {
      readonly kind: "ellipse";
      readonly at: Vec2;
      readonly width: number;
      readonly height: number;
      readonly colour: number;
      readonly alpha: number;
      /** A dark edge round it, in world units wide; none when 0. */
      readonly edge: number;
      readonly lit: boolean;
    }
  | {
      readonly kind: "line";
      readonly from: Vec2;
      readonly to: Vec2;
      readonly width: number;
      readonly colour: number;
      readonly lit: boolean;
    }
  | {
      readonly kind: "flame";
      readonly outline: readonly Point[];
      readonly colour: number;
      readonly lit: false;
    };

/** Across the bowl: legible at 16 px. */
export const BRAZIER_WIDTH = 28;
/** How far the bowl's top stands above the ground. */
export const BRAZIER_LIFT = 16;
const BOWL_HEIGHT = 12;
const IRON_TOP = 0x6b6a70;
const IRON_RIM = 0x4a494f;
const IRON_LEG = 0x2e2d33;
/** The dark 2 px outline every prop has (§3). */
export const SOURCE_EDGE = 0x15141a;
const COAL = 0xff9040;
const FLAME = 0xffd23d;
const SHADOW = 0x000000;

/** A teardrop `height` tall on `base`, `width` across its foot. */
function teardrop(base: Vec2, width: number, height: number): readonly Point[] {
  const half = width / 2;
  return [
    { x: base.x - half, y: base.y },
    { x: base.x - half * 0.8, y: base.y - height * 0.4 },
    { x: base.x - half * 0.2, y: base.y - height * 0.7 },
    { x: base.x, y: base.y - height },
    { x: base.x + half * 0.3, y: base.y - height * 0.65 },
    { x: base.x + half * 0.85, y: base.y - height * 0.35 },
    { x: base.x + half, y: base.y },
  ];
}

/**
 * An iron bowl on three short legs standing on the light's position, in
 * paint order: contact shadow, legs, bowl (lightest top, then its rim),
 * then the coals and flame, unlit because they are the light.
 */
export function brazierCommands(
  light: Pick<MapLighting["lights"][number], "position">,
): readonly SourceCommand[] {
  const { x, y } = light.position;
  const top = { x, y: y - BRAZIER_LIFT };
  const spread = BRAZIER_WIDTH * 0.36;
  const legs: SourceCommand[] = [-spread, 0, spread].map((dx) => ({
    kind: "line",
    from: { x: x + dx * 0.7, y: top.y + 2 },
    to: { x: x + dx, y: y + (dx === 0 ? 3 : 0) },
    width: 3,
    colour: IRON_LEG,
    lit: true,
  }));
  return [
    {
      kind: "ellipse",
      at: { x: x + 4, y: y + 2 },
      width: BRAZIER_WIDTH + 2,
      height: 10,
      colour: SHADOW,
      alpha: 0.35,
      edge: 0,
      lit: false,
    },
    ...legs,
    {
      kind: "ellipse",
      at: top,
      width: BRAZIER_WIDTH,
      height: BOWL_HEIGHT,
      colour: IRON_RIM,
      alpha: 1,
      edge: 2,
      lit: true,
    },
    {
      kind: "ellipse",
      at: { x, y: top.y + 1 },
      width: BRAZIER_WIDTH - 6,
      height: BOWL_HEIGHT - 5,
      colour: IRON_TOP,
      alpha: 1,
      edge: 0,
      lit: true,
    },
    {
      kind: "ellipse",
      at: { x, y: top.y + 1 },
      width: BRAZIER_WIDTH - 10,
      height: BOWL_HEIGHT - 7,
      colour: COAL,
      alpha: 1,
      edge: 0,
      lit: false,
    },
    { kind: "flame", outline: teardrop({ x, y: top.y + 1 }, 14, 20), colour: COAL, lit: false },
    { kind: "flame", outline: teardrop({ x, y: top.y + 1 }, 7, 12), colour: FLAME, lit: false },
  ];
}
