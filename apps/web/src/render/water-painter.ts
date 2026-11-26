import type { Vec2 } from "@vibewars/game-core";

import { WATER_LOOK } from "./arena-palette.js";
import type { MapWater } from "./arena-snapshot.js";
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
  /** Stroke the closed outline. */
  strokeOutline(outline: readonly Vec2[]): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/**
 * How one kind of water draws. `line` is 1 CSS px in world units;
 * `surface` is drawn once per map, `ripples` every frame at render time
 * `seconds`, held still under reduced motion.
 */
export interface WaterArt {
  surface(painter: WaterPainter, shape: WaterShape, line: number): void;
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

/** Water drawn from its look's colours: a fill, a shore, level ripple strokes. */
function proceduralWater(depth: MapWater["depth"]): WaterArt {
  const look = WATER_LOOK[depth];
  return {
    surface(painter, shape, line) {
      painter.fillStyle(look.fill, look.fillAlpha);
      painter.fillOutline(shape.outline);
      painter.lineStyle(look.shoreWidth * line, look.shore, 1);
      painter.strokeOutline(shape.outline);
    },
    ripples(painter, shape, line, seconds, still) {
      paintRipples(painter, shape.ripples, line, seconds, still, look.ripple, look.rippleAlpha);
    },
  };
}

/**
 * Level ripple strokes, each swelling and drifting on its own beat at
 * render time `seconds`: water's, and a watery zone's (#3052).
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
