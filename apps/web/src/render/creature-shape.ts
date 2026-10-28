import type { Point } from "./weapon-mark-geometry.js";

/**
 * A creature's body (#1162, #1158 direction C): never a circle. Every
 * creature, pets included, is a hexagon plate, pointy top, upright whatever
 * its facing. Picking and collision stay the circle of its radius.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

/** A hexagon plate's circumradius, against the creature's radius. */
export const HEXAGON_SCALE = 1.1;
/** A dead pet's dash and gap (#1046), against its radius: the study's `3 2` at radius 10. */
export const DEAD_DASH = 0.3;
export const DEAD_GAP = 0.2;

/** The closed outline of a creature of radius `r` at (`x`, `y`). */
export function creatureOutline(x: number, y: number, r: number): readonly Point[] {
  // A vertex straight up and one straight down: pointy top.
  return Array.from({ length: 6 }, (_, k) => {
    const angle = Math.PI / 6 + (k * Math.PI) / 3;
    return {
      x: x + Math.cos(angle) * r * HEXAGON_SCALE,
      y: y + Math.sin(angle) * r * HEXAGON_SCALE,
    };
  });
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
