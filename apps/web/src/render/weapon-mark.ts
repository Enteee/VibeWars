import { isWeaponId } from "@vibewars/game-core";

import type { AttackFrame } from "./attack-clock.js";
import { WEAPON_MARK_RADIUS, type Point } from "./weapon-mark-geometry.js";
import { weaponPose, type WeaponMarkLayout } from "./weapon-pose.js";

/**
 * The weapon mark (#188, #418, docs/art/art-direction.md "Player mark"):
 * one silhouette per weapon, held in the hands. The shapes are plain data in
 * `weapon-mark-geometry.ts`, posed by `weapon-pose.ts` as the attack goes
 * (#558); this places the pose on a body. At rest the pose is the plain mark.
 *
 * No Phaser here: plain geometry, so the shapes can be tested in Node.
 */

export type { WeaponMarkLayout } from "./weapon-pose.js";

const NOTHING: WeaponMarkLayout = { strokes: [], fills: [], strings: [], alpha: 1 };

/**
 * The weapon mark of a body of radius `r` at (`x`, `y`), facing `facing`
 * radians, posed at `frame` of its attack.
 */
export function weaponMarkLayout(
  x: number,
  y: number,
  r: number,
  facing: number,
  weaponId: string | undefined,
  frame: AttackFrame,
): WeaponMarkLayout {
  if (weaponId === undefined || !isWeaponId(weaponId)) {
    return NOTHING;
  }
  const posed = weaponPose(weaponId, frame.clip, frame.hit);
  const scale = r / WEAPON_MARK_RADIUS;
  const cos = Math.cos(facing);
  const sin = Math.sin(facing);
  const place = (line: readonly Point[]): Point[] =>
    line.map((q) => ({
      x: x + (q.x * cos - q.y * sin) * scale,
      y: y + (q.x * sin + q.y * cos) * scale,
    }));
  return {
    strokes: posed.strokes.map(place),
    fills: posed.fills.map(place),
    strings: posed.strings.map(place),
    alpha: posed.alpha,
  };
}
