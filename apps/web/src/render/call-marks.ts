import type { Vec2 } from "@vibewars/game-core";
import { PING_SECONDS } from "@vibewars/game-session";

/**
 * What your team's calls look like in the arena (#443,
 * docs/art/art-direction.md "Calls, pings and the watched ally"). Plain
 * geometry, no Phaser, so every shape is tested in Node.
 *
 * - The called foe: a `condition` chevron pointing down at it, over its name.
 * - A ping: a `friend` pin standing on the spot, and a ring that grows from
 *   it and fades over the ping's life.
 * - The ally you watch: four `ink` corner brackets round the body.
 */

/** A ping on the floor, as the scene draws it. */
export interface RenderablePing {
  readonly id: number;
  readonly position: Vec2;
  /** Seconds of it left. */
  readonly remaining: number;
}

/** The chevron's tip sits this far above the body's top edge, clear of the name label. */
const CHEVRON_GAP = 37;
const CHEVRON_HALF_WIDTH = 6;
const CHEVRON_HEIGHT = 6;

/** The chevron over a called body of radius `r` at `centre`: left arm, tip, right arm. */
export function callChevron(centre: Vec2, r: number): readonly [Vec2, Vec2, Vec2] {
  const tipY = centre.y - r - CHEVRON_GAP;
  return [
    { x: centre.x - CHEVRON_HALF_WIDTH, y: tipY - CHEVRON_HEIGHT },
    { x: centre.x, y: tipY },
    { x: centre.x + CHEVRON_HALF_WIDTH, y: tipY - CHEVRON_HEIGHT },
  ];
}

/** The pin's head stands this far over the spot, on a needle down to it. */
export const PING_PIN_HEIGHT = 14;
export const PING_HEAD_RADIUS = 3.5;
/** The ring grows from the first radius to the second over the ping's life. */
const PING_RING_FROM = 6;
const PING_RING_TO = 26;

/**
 * The ping's ring with `remaining` seconds left: it grows and fades over
 * its life. Under reduced motion it holds still and whole until it goes.
 */
export function pingRing(
  remaining: number,
  reducedMotion: boolean,
): { readonly radius: number; readonly alpha: number } {
  if (reducedMotion) {
    return { radius: PING_RING_FROM, alpha: 1 };
  }
  const age = Math.max(0, Math.min(1, 1 - remaining / PING_SECONDS));
  return { radius: PING_RING_FROM + (PING_RING_TO - PING_RING_FROM) * age, alpha: 1 - age };
}

/** The brackets sit this far outside the body's edge, outside the target ring. */
const BRACKET_GAP = 13;
const BRACKET_ARM = 5;

/**
 * The watched ally's four corner brackets, each an L of three points:
 * a square round the body, open at the middle of every side, so it is
 * never a ring.
 */
export function watchBrackets(centre: Vec2, r: number): readonly (readonly [Vec2, Vec2, Vec2])[] {
  const d = r + BRACKET_GAP;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx = 0, sy = 0]) => {
    const corner = { x: centre.x + sx * d, y: centre.y + sy * d };
    return [
      { x: corner.x - sx * BRACKET_ARM, y: corner.y },
      corner,
      { x: corner.x, y: corner.y - sy * BRACKET_ARM },
    ] as const;
  });
}
