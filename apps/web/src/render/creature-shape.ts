import type { CreatureLook } from "@vibewars/game-core";

import type { Point } from "./weapon-mark-geometry.js";

/**
 * A creature's body (#1162, #1158 direction C): never a circle. A minion
 * or spirit is a hexagon plate, pointy top, upright whatever its facing;
 * a pet is a teardrop, its round back behind it and its point toward its
 * facing. Picking and collision stay the circle of its radius.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

/** A hexagon plate's circumradius, against the creature's radius. */
export const HEXAGON_SCALE = 1.1;
/**
 * The teardrop, in the study's units at radius 10 (`M14.5 0L5-8.7A10 10 0 1
 * 0 5 8.7Z`): its tip, and where the tip's sides meet the round back.
 */
const TEAR_TIP = 1.45;
const TEAR_SIDE_ANGLE = Math.PI / 3;
/** Points on the teardrop's round back. */
const TEAR_BACK_POINTS = 16;
/** A dead pet's dash and gap (#1046), against its radius: the study's `3 2` at radius 10. */
export const DEAD_DASH = 0.3;
export const DEAD_GAP = 0.2;

/**
 * The closed outline of a creature that looks like `look`, of radius `r`
 * at (`x`, `y`), facing `facing` radians.
 */
export function creatureOutline(
  look: CreatureLook,
  x: number,
  y: number,
  r: number,
  facing: number,
): readonly Point[] {
  if (look !== "beast") {
    // A vertex straight up and one straight down: pointy top.
    return Array.from({ length: 6 }, (_, k) => {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      return {
        x: x + Math.cos(angle) * r * HEXAGON_SCALE,
        y: y + Math.sin(angle) * r * HEXAGON_SCALE,
      };
    });
  }
  // From the tip round the back, the long way from one side to the other.
  const local: Point[] = [{ x: TEAR_TIP * r, y: 0 }];
  for (let k = 0; k <= TEAR_BACK_POINTS; k += 1) {
    const angle = -TEAR_SIDE_ANGLE - (k / TEAR_BACK_POINTS) * (2 * Math.PI - 2 * TEAR_SIDE_ANGLE);
    local.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  return local.map((point) => ({
    x: x + point.x * cos - point.y * sin,
    y: y + point.x * sin + point.y * cos,
  }));
}

/**
 * The dashes along the closed outline `points`: each `dash` long, `gap`
 * apart, the pattern running on round the corners as an SVG dash does.
 */
export function dashes(
  points: readonly Point[],
  dash: number,
  gap: number,
): readonly (readonly [Point, Point])[] {
  const result: [Point, Point][] = [];
  // Where in the pattern this edge starts: under `dash`, drawing.
  let phase = 0;
  for (let i = 0; i < points.length; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    if (from === undefined || to === undefined) {
      continue;
    }
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const at = (t: number): Point => ({
      x: from.x + ((to.x - from.x) * t) / length,
      y: from.y + ((to.y - from.y) * t) / length,
    });
    let t = 0;
    while (t < length) {
      const drawing = phase < dash;
      const step = Math.min(length - t, drawing ? dash - phase : dash + gap - phase);
      if (drawing) {
        result.push([at(t), at(t + step)]);
      }
      t += step;
      phase = (phase + step) % (dash + gap);
    }
  }
  return result;
}
