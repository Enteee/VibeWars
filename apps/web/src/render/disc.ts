import type Phaser from "phaser";

/**
 * Circles drawn with only the sides they need (#3162). Phaser's own arc
 * is 100 points whatever its size, and a `Graphics` triangulates every
 * point again each frame it is shown: a fog bank or a field of embers
 * redrawn every frame spent most of a frame there.
 */

/** Phaser's own arc: a point every 1 % of the turn. */
const MOST_SIDES = 100;
const FEWEST_SIDES = 8;
/** How far, in CSS px, a side may fall inside the true circle: a quarter pixel is not seen. */
const TOLERANCE_PX = 0.25;

/** The sides a circle of `radius` world units needs to look round, where 1 CSS px is `line` world units. */
export function circleSides(radius: number, line: number): number {
  const px = radius / line;
  if (px <= TOLERANCE_PX) {
    return FEWEST_SIDES;
  }
  const sides = Math.ceil(Math.PI / Math.acos(1 - TOLERANCE_PX / px));
  return Math.min(MOST_SIDES, Math.max(FEWEST_SIDES, sides));
}

/** A disc on `g`, in its fill style, with the sides `circleSides` gives. */
export function fillDisc(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  line: number,
): void {
  traceCircle(g, x, y, radius, line);
  g.fillPath();
}

/** A ring on `g`, in its line style, with the sides `circleSides` gives. */
export function strokeDisc(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  line: number,
): void {
  traceCircle(g, x, y, radius, line);
  g.strokePath();
}

function traceCircle(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  line: number,
): void {
  const sides = circleSides(radius, line);
  g.beginPath();
  g.moveTo(x + radius, y);
  for (let side = 1; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    g.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  g.closePath();
}
