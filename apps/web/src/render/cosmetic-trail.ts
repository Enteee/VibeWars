/**
 * The weapon trail cosmetic (ADR-0056, #3579): a thin ribbon behind a
 * melee swing's arc, from where the strike began to where the weapon's
 * tip is now, fading out after the hit. It reads the swing's clip and
 * never changes it: the swing's timing and silhouette are the weapon
 * mark's alone. A spell's raise, a wind-up, a settle and a ranged
 * attack get none; under reduced motion there is none.
 *
 * No Phaser here, so the ribbon can be tested in Node.
 */

import { getWeapon, RANGE_MELEE } from "@vibewars/game-core";

import type { AttackFrame, CastBeat } from "./attack-clock.js";
import type { Painter } from "./body-painter.js";
import { weaponTipAt } from "./weapon-mark.js";
import type { Point } from "./weapon-mark-geometry.js";

/** The longest a ribbon shows, seconds: its strike, then its fade. */
export const SWING_TRAIL_SECONDS = 0.25;
/** How long a ribbon fades out after the hit, seconds. */
export const SWING_FADE_SECONDS = 0.1;
/** A ribbon's strongest alpha, at the weapon: ADR-0056 §4's ground budget. */
export const SWING_TRAIL_ALPHA = 0.35;
/** The ribbon's width at the weapon, a share of the body's radius; it tapers to nothing behind. */
export const SWING_WIDTH_OF_BODY = 0.2;
/** How many pieces the arc is drawn in. */
const SWING_SAMPLES = 8;

/** A ribbon: the tip's path, oldest first, how opaque and how wide it is at its newest end. */
export interface SwingRibbon {
  readonly points: readonly Point[];
  readonly alpha: number;
  readonly width: number;
}

/** Whether `weaponId` is swung in melee: its reach is `RANGE_MELEE`. */
export function isMeleeWeapon(weaponId: string | undefined): boolean {
  return weaponId !== undefined && getWeapon(weaponId)?.range === RANGE_MELEE;
}

/**
 * The ribbon behind `weaponId`'s swing at `frame`, held by the body at
 * `at`; `undefined` when there is none to draw. It grows with the strike
 * and fades over `SWING_FADE_SECONDS` from the hit, through the hold and
 * into the recovery. A spell's release strikes too (#3320): while `beat`
 * is a spell under way, or one released within `SWING_TRAIL_SECONDS`,
 * there is none.
 */
export function swingRibbon(
  at: { readonly x: number; readonly y: number; readonly r: number; readonly facing: number },
  weaponId: string | undefined,
  frame: AttackFrame,
  beat: CastBeat | undefined,
  reducedMotion: boolean,
): SwingRibbon | undefined {
  const { clip } = frame;
  const spell =
    beat?.phase === "casting" || (beat?.phase === "released" && beat.since < SWING_TRAIL_SECONDS);
  if (reducedMotion || spell || !isMeleeWeapon(weaponId)) {
    return undefined;
  }
  let upTo: number;
  let alpha: number;
  switch (clip.phase) {
    case "strike":
      upTo = clip.progress;
      alpha = SWING_TRAIL_ALPHA;
      break;
    case "hold":
    case "recover":
      upTo = 1;
      alpha = SWING_TRAIL_ALPHA * (1 - clip.sinceHit / SWING_FADE_SECONDS);
      break;
    case "rest":
    case "wind-up":
    case "raise":
    case "settle":
      return undefined;
  }
  if (upTo <= 0 || alpha <= 0) {
    return undefined;
  }
  const points: Point[] = [];
  for (let k = 0; k <= SWING_SAMPLES; k += 1) {
    const tip = weaponTipAt(at.x, at.y, at.r, at.facing, weaponId, {
      clip: { phase: "strike", progress: (upTo * k) / SWING_SAMPLES },
      hit: frame.hit,
    });
    if (tip !== undefined) {
      points.push(tip);
    }
  }
  return points.length < 2
    ? undefined
    : { points, alpha, width: at.r * SWING_WIDTH_OF_BODY };
}

/** Paint `ribbon` in `colour`: each piece wider and stronger toward the weapon. */
export function paintSwingRibbon(painter: Painter, ribbon: SwingRibbon, colour: number): void {
  const { points } = ribbon;
  const pieces = points.length - 1;
  for (let i = 1; i <= pieces; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    if (from === undefined || to === undefined) {
      continue;
    }
    const share = i / pieces;
    painter.lineStyle(ribbon.width * share, colour, ribbon.alpha * share);
    painter.beginPath();
    painter.moveTo(from.x, from.y);
    painter.lineTo(to.x, to.y);
    painter.strokePath();
  }
}
