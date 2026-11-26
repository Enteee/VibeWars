import type { Point } from "./weapon-mark-geometry.js";

/**
 * A knocked-down body (#545): the disc flattened across its facing, so it
 * lies along it, with the weapon mark dropped on the floor beside it. Pose
 * by transform only, no new art; the disc and the weapon are the ones a
 * standing body draws.
 *
 * No Phaser here: plain geometry, so the pose can be tested in Node.
 */

/** How much of the radius the body keeps across its facing while it lies. */
export const LYING_WIDTH = 0.55;
/** The dropped weapon's size, against the body's radius. */
const DROPPED_SCALE = 0.75;
/** How far to the body's right the dropped weapon lies, in radii. */
const DROPPED_OFFSET = 0.35;
/** Points on the flattened disc's outline. */
const OUTLINE_POINTS = 24;

export interface LyingPose {
  /** The body's outline, closed: an ellipse, long along the facing. */
  readonly body: readonly Point[];
  /** Where to draw the dropped weapon mark: `weaponMarkLayout`'s arguments. */
  readonly weapon: {
    readonly x: number;
    readonly y: number;
    readonly r: number;
    readonly facing: number;
  };
}

/** The lying pose of a body of radius `r` at (`x`, `y`), facing `facing` radians. */
export function lyingPose(x: number, y: number, r: number, facing: number): LyingPose {
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const body = Array.from({ length: OUTLINE_POINTS }, (_, k) => {
    const angle = (k / OUTLINE_POINTS) * 2 * Math.PI;
    const along = r * Math.cos(angle);
    const across = r * LYING_WIDTH * Math.sin(angle);
    return { x: x + along * cos - across * sin, y: y + along * sin + across * cos };
  });
  // Out of the right hand that held it, and turned a quarter toward the
  // feet, so it reads as let go rather than still held.
  const offset = r * DROPPED_OFFSET;
  return {
    body,
    weapon: {
      x: x - offset * sin,
      y: y + offset * cos,
      r: r * DROPPED_SCALE,
      facing: facing + Math.PI / 2,
    },
  };
}
