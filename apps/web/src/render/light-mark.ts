import type { Vec2 } from "@vibewars/game-core";

import { LIGHT_MARK_LOOK } from "./arena-palette.js";

/**
 * What stands at a light's anchor (ADR-0052, #2989), drawn through one
 * lookup keyed by the light's `id`: today each key paints procedurally; a
 * sprite replaces one by painting its texture at the anchor instead. A
 * light whose id names no mark is a light alone.
 */

/** The few drawing calls a mark needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface LightMarkPainter {
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
}

/** How one kind of mark draws, once per map, at `at` in world units. */
export type LightMarkArt = (painter: LightMarkPainter, at: Vec2) => void;

export type LightMarkKey = "torch" | "fire" | "brazier";

const MARK_PREFIXES: readonly LightMarkKey[] = ["torch", "fire", "brazier"];

/** The mark a light's `id` names by its prefix, `torch-`, `fire-` or `brazier-`; none otherwise. */
export function lightMarkKey(id: string): LightMarkKey | undefined {
  return MARK_PREFIXES.find((key) => id.startsWith(`${key}-`));
}

/** A post with a flame on top: its foot is the anchor. */
const torch: LightMarkArt = (painter, at) => {
  painter.fillStyle(LIGHT_MARK_LOOK.stand, 1);
  painter.fillRect(at.x - 2, at.y - 14, 4, 14);
  painter.fillStyle(LIGHT_MARK_LOOK.flame, 1);
  painter.fillCircle(at.x, at.y - 17, 5);
  painter.fillStyle(LIGHT_MARK_LOOK.core, 1);
  painter.fillCircle(at.x, at.y - 16, 2.5);
};

/** A ring of stones round a flame, centred on the anchor. */
const fire: LightMarkArt = (painter, at) => {
  painter.fillStyle(LIGHT_MARK_LOOK.stone, 1);
  for (let stone = 0; stone < 8; stone += 1) {
    const angle = (stone / 8) * Math.PI * 2;
    painter.fillCircle(at.x + Math.cos(angle) * 11, at.y + Math.sin(angle) * 11, 3.5);
  }
  painter.fillStyle(LIGHT_MARK_LOOK.flame, 1);
  painter.fillCircle(at.x, at.y, 8);
  painter.fillStyle(LIGHT_MARK_LOOK.core, 1);
  painter.fillCircle(at.x, at.y + 1, 4);
};

/** How wide a brazier's bowl is, and how high its rim stands over the anchor (#3504). */
export const BRAZIER_WIDTH = 28;
export const BRAZIER_HEIGHT = 16;
/** Its legs, as [left, top, bottom] off the anchor: the back one first, its foot behind the others. */
const BRAZIER_LEGS: readonly (readonly [number, number, number])[] = [
  [-1.5, -12, -2],
  [-11, -10, 0],
  [8, -10, 0],
];
const LEG_WIDTH = 3;

/**
 * An iron bowl on three short legs (#3504), its foot on the anchor: a
 * contact shadow, a 2 px outline, the dark legs, the bowl's side, its rim
 * lit by its own fire, then the coals and the flame in it. The flame is the
 * light itself, so nothing dims it.
 */
const brazier: LightMarkArt = (painter, at) => {
  const { x, y } = at;
  const top = y - BRAZIER_HEIGHT;
  painter.fillStyle(LIGHT_MARK_LOOK.shadow, LIGHT_MARK_LOOK.shadowAlpha);
  painter.fillEllipse(x + 4, y + 1, BRAZIER_WIDTH + 6, 10);
  const legs = (grow: number): void => {
    for (const [left, legTop, bottom] of BRAZIER_LEGS) {
      painter.fillRect(
        x + left - grow,
        y + legTop - grow,
        LEG_WIDTH + grow * 2,
        bottom - legTop + grow * 2,
      );
    }
  };
  const bowl = (grow: number): void => {
    painter.fillEllipse(x, top + 3, BRAZIER_WIDTH + grow * 2, 14 + grow * 2);
  };
  painter.fillStyle(LIGHT_MARK_LOOK.outline, 1);
  legs(2);
  bowl(2);
  painter.fillStyle(LIGHT_MARK_LOOK.stand, 1);
  legs(0);
  painter.fillStyle(LIGHT_MARK_LOOK.iron, 1);
  bowl(0);
  painter.fillStyle(LIGHT_MARK_LOOK.ironRim, 1);
  painter.fillEllipse(x, top, BRAZIER_WIDTH, 9);
  painter.fillStyle(LIGHT_MARK_LOOK.coals, 1);
  painter.fillEllipse(x, top, BRAZIER_WIDTH - 6, 5);
  painter.fillCircle(x, top - 4, 6);
  painter.fillStyle(LIGHT_MARK_LOOK.blaze, 1);
  painter.fillCircle(x, top - 3, 3);
  painter.fillCircle(x + 1, top - 8, 2);
};

export const LIGHT_MARK_ART: Record<LightMarkKey, LightMarkArt> = { torch, fire, brazier };

/** The box each mark is painted in, round its anchor, in world units: what it can hide (#3251). */
export const LIGHT_MARK_BOX: Record<
  LightMarkKey,
  { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
> = {
  torch: { left: -5, top: -22, right: 5, bottom: 0 },
  fire: { left: -14.5, top: -14.5, right: 14.5, bottom: 14.5 },
  brazier: { left: -16, top: -26, right: 21, bottom: 6 },
};
