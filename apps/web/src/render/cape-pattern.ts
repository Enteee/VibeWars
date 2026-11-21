/**
 * The cape pattern cosmetic (ADR-0056, #3579): stripes, chevrons,
 * quarters or stars on the guild cape's cloth, in its trim colour. The
 * shapes are laid out on the tab `cape-motion.ts` shapes, so they follow
 * the cloth as it unfolds, trails and swings. They stop at the notch's
 * line, so the hem's trim stays clear, and `body-painter.ts` lays the
 * emblem's field over them, so the emblem reads as it does on a plain cape.
 *
 * No Phaser here, so the shapes can be tested in Node.
 */

import type { CapePattern } from "../cosmetics/catalog.js";

import type { CapeTab } from "./cape-motion.js";
import type { Point } from "./weapon-mark-geometry.js";

/** A spot on the tab: `s` 0 at the root to 1 at the notch's line, `a` -1 … 1 from side to side. */
type TabPoint = readonly [s: number, a: number];

/** The lengthwise stripes, as spans of `a`. */
const STRIPES: readonly (readonly [number, number])[] = [
  [-0.75, -0.45],
  [0.45, 0.75],
];
/** Each chevron's `s` at the sides, how far its point dips toward the hem, and its thickness. */
const CHEVRONS: readonly number[] = [0.3, 0.6];
const CHEVRON_DIP = 0.2;
const CHEVRON_THICKNESS = 0.12;
/** The stars' centres, and a star's reach and waist, shares of the hem's half width. */
const STARS: readonly TabPoint[] = [
  [0.4, -0.6],
  [0.6, 0.6],
  [0.85, -0.55],
];
const STAR_REACH = 0.35;
const STAR_WAIST = 0.12;

/** `pattern` on the cape whose tab is `tab`: closed polygons, each filled in the trim colour. */
export function capePatternShapes(pattern: CapePattern, tab: CapeTab): readonly Point[][] {
  const length = tab.notch - tab.root;
  if (length <= 0) {
    return [];
  }
  const halfAt = (s: number): number =>
    tab.rootHalf + ((tab.hemHalf - tab.rootHalf) * (s * length)) / (tab.hem - tab.root);
  const place = ([s, a]: TabPoint): Point => {
    const along = tab.root + s * length;
    const aside = a * halfAt(s);
    return {
      x: tab.x + tab.dx * along + tab.dy * aside,
      y: tab.y + tab.dy * along - tab.dx * aside,
    };
  };
  const shape = (points: readonly TabPoint[]): Point[] => points.map(place);
  switch (pattern) {
    case "stripes":
      return STRIPES.map(([from, to]) =>
        shape([
          [0, from],
          [1, from],
          [1, to],
          [0, to],
        ]),
      );
    case "chevrons":
      // Each a V pointing toward the hem, side to side.
      return CHEVRONS.map((s) =>
        shape([
          [s, -1],
          [s + CHEVRON_DIP, 0],
          [s, 1],
          [s + CHEVRON_THICKNESS, 1],
          [s + CHEVRON_DIP + CHEVRON_THICKNESS, 0],
          [s + CHEVRON_THICKNESS, -1],
        ]),
      );
    case "quarters":
      // The root's left and the hem's right.
      return [
        shape([
          [0, -1],
          [0.5, -1],
          [0.5, 0],
          [0, 0],
        ]),
        shape([
          [0.5, 0],
          [1, 0],
          [1, 1],
          [0.5, 1],
        ]),
      ];
    case "stars":
      // Four-pointed, each point along or across the tab, sized by the hem.
      return STARS.map((centre) => {
        const { x, y } = place(centre);
        const reach = STAR_REACH * tab.hemHalf;
        const waist = STAR_WAIST * tab.hemHalf;
        const points: Point[] = [];
        for (let k = 0; k < 8; k += 1) {
          const angle = Math.atan2(tab.dy, tab.dx) + (k * Math.PI) / 4;
          const d = k % 2 === 0 ? reach : waist;
          points.push({ x: x + Math.cos(angle) * d, y: y + Math.sin(angle) * d });
        }
        return points;
      });
  }
}
