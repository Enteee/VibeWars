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
}

/** How one kind of mark draws, once per map, at `at` in world units. */
export type LightMarkArt = (painter: LightMarkPainter, at: Vec2) => void;

export type LightMarkKey = "torch" | "fire";

const MARK_PREFIXES: readonly LightMarkKey[] = ["torch", "fire"];

/** The mark a light's `id` names by its prefix, `torch-` or `fire-`; none otherwise. */
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

export const LIGHT_MARK_ART: Record<LightMarkKey, LightMarkArt> = { torch, fire };

/** The box each mark is painted in, round its anchor, in world units: what it can hide (#3251). */
export const LIGHT_MARK_BOX: Record<
  LightMarkKey,
  { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
> = {
  torch: { left: -5, top: -22, right: 5, bottom: 0 },
  fire: { left: -14.5, top: -14.5, right: 14.5, bottom: 14.5 },
};
