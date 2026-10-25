import { isWeaponId } from "@vibewars/game-core";

import { WEAPON_MARK_GEOMETRY, WEAPON_MARK_RADIUS, type Point } from "./weapon-mark-geometry.js";

/**
 * The weapon mark (#188, #418, docs/art/art-direction.md "Player mark"):
 * one silhouette per weapon, held in the hands. The shapes are plain data in
 * `weapon-mark-geometry.ts`; this places them on a body.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

export interface WeaponMarkLayout {
  /** Open polylines: 4 px `edge` casing under a 2 px `ink` core. */
  readonly strokes: readonly (readonly Point[])[];
  /** Filled polygons: cased outline, then an `ink` fill. */
  readonly fills: readonly (readonly Point[])[];
  /** Bow strings: 3 px `edge` casing under a 1 px `ink` core. */
  readonly strings: readonly (readonly Point[])[];
}

const NOTHING: WeaponMarkLayout = { strokes: [], fills: [], strings: [] };

/** The weapon mark of a body of radius `r` at (`x`, `y`), facing `facing` radians. */
export function weaponMarkLayout(
  x: number,
  y: number,
  r: number,
  facing: number,
  weaponId: string | undefined,
): WeaponMarkLayout {
  if (weaponId === undefined || !isWeaponId(weaponId)) {
    return NOTHING;
  }
  const geometry = WEAPON_MARK_GEOMETRY[weaponId];
  const scale = r / WEAPON_MARK_RADIUS;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const place = (line: readonly Point[]): Point[] =>
    line.map((q) => ({
      x: x + (q.x * cos - q.y * sin) * scale,
      y: y + (q.x * sin + q.y * cos) * scale,
    }));
  return {
    strokes: geometry.strokes.map(place),
    fills: geometry.fills.map(place),
    strings: geometry.strings.map(place),
  };
}
