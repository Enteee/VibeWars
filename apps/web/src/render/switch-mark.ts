import type { Vec2 } from "@vibewars/game-core";

import { SWITCH_MARK_LOOK } from "./arena-palette.js";

/**
 * A switch's mark (#3025), drawn each frame through one lookup keyed by
 * the switch's `id`, as a light's is (`light-mark.ts`): today it paints
 * procedurally; a sprite replaces one by painting its texture at the
 * anchor instead. Unlike a light's, every switch has a mark: one whose id
 * names no other is a lever.
 */

/** The few drawing calls a mark needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface SwitchMarkPainter {
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** How one kind of mark draws at `at` in world units, `up` or thrown. */
export type SwitchMarkArt = (painter: SwitchMarkPainter, at: Vec2, up: boolean) => void;

export type SwitchMarkKey = "lever";

const MARK_PREFIXES: readonly SwitchMarkKey[] = ["lever"];

/** The mark a switch's `id` names by its prefix; a lever for any other. */
export function switchMarkKey(id: string): SwitchMarkKey {
  return MARK_PREFIXES.find((key) => id.startsWith(`${key}-`)) ?? "lever";
}

/** A base on the anchor and a handle from it: upright when up, thrown to the right when down. */
const lever: SwitchMarkArt = (painter, at, up) => {
  painter.fillStyle(SWITCH_MARK_LOOK.base, 1);
  painter.fillRect(at.x - 8, at.y - 3, 16, 6);
  const knob = up ? { x: at.x - 4, y: at.y - 16 } : { x: at.x + 13, y: at.y - 6 };
  painter.lineStyle(3, SWITCH_MARK_LOOK.handle, 1);
  painter.lineBetween(at.x, at.y - 1, knob.x, knob.y);
  painter.fillStyle(SWITCH_MARK_LOOK.knob, 1);
  painter.fillCircle(knob.x, knob.y, 3);
};

export const SWITCH_MARK_ART: Record<SwitchMarkKey, SwitchMarkArt> = { lever };
