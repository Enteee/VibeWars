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
  fillEllipse(x: number, y: number, width: number, height: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/**
 * How one kind of mark draws at `at` in world units: `thrown` is 0 up, 1
 * down, and between while its throw plays (#3053).
 */
export type SwitchMarkArt = (painter: SwitchMarkPainter, at: Vec2, thrown: number) => void;

export type SwitchMarkKey = "lever";

const MARK_PREFIXES: readonly SwitchMarkKey[] = ["lever"];

/** The mark a switch's `id` names by its prefix; a lever for any other. */
export function switchMarkKey(id: string): SwitchMarkKey {
  return MARK_PREFIXES.find((key) => id.startsWith(`${key}-`)) ?? "lever";
}

/** How long a lever's throw takes, in seconds: short, a flick, not a swing. */
export const LEVER_THROW_SECONDS = 0.25;

/**
 * Where a lever's arm is, 0 up to 1 down, `since` seconds after it was set
 * `up`; with no throw seen, or under reduced motion, it is where it rests.
 */
export function leverThrown(up: boolean, since: number | undefined, still: boolean): number {
  const rest = up ? 0 : 1;
  if (since === undefined || still || since >= LEVER_THROW_SECONDS) {
    return rest;
  }
  // Eased out: it snaps over and settles.
  const t = 1 - (1 - since / LEVER_THROW_SECONDS) ** 2;
  return up ? 1 - t : t;
}

/** The arm's angle up and thrown, in radians from east: it leans back standing, lies right thrown. */
const ARM_UP = (-110 * Math.PI) / 180;
const ARM_DOWN = (-12 * Math.PI) / 180;
const ARM_LENGTH = 17;

/** A stone base on the anchor and a wooden arm from it, its knob brass up and grey thrown. */
const lever: SwitchMarkArt = (painter, at, thrown) => {
  painter.fillStyle(SWITCH_MARK_LOOK.shadow, 0.35);
  painter.fillEllipse(at.x + 2, at.y + 3, 26, 10);
  painter.fillStyle(SWITCH_MARK_LOOK.baseFace, 1);
  painter.fillEllipse(at.x, at.y + 2, 22, 9);
  painter.fillStyle(SWITCH_MARK_LOOK.base, 1);
  painter.fillEllipse(at.x, at.y, 22, 9);
  painter.lineStyle(1, SWITCH_MARK_LOOK.outline, 1);
  painter.strokeEllipse(at.x, at.y, 22, 9);
  const angle = ARM_UP + (ARM_DOWN - ARM_UP) * thrown;
  const pivot = { x: at.x, y: at.y - 1 };
  const knob = {
    x: pivot.x + Math.cos(angle) * ARM_LENGTH,
    y: pivot.y + Math.sin(angle) * ARM_LENGTH,
  };
  const up = thrown < 0.5;
  if (up) {
    painter.fillStyle(SWITCH_MARK_LOOK.knobUp, 0.12);
    painter.fillCircle(knob.x, knob.y, 9);
    painter.fillCircle(knob.x, knob.y, 6);
  }
  painter.lineStyle(5, SWITCH_MARK_LOOK.armEdge, 1);
  painter.lineBetween(pivot.x, pivot.y, knob.x, knob.y);
  painter.lineStyle(3, SWITCH_MARK_LOOK.arm, 1);
  painter.lineBetween(pivot.x, pivot.y, knob.x, knob.y);
  painter.fillStyle(SWITCH_MARK_LOOK.armEdge, 1);
  painter.fillCircle(pivot.x, pivot.y, 2.5);
  painter.fillStyle(SWITCH_MARK_LOOK.outline, 1);
  painter.fillCircle(knob.x, knob.y, 4.2);
  painter.fillStyle(up ? SWITCH_MARK_LOOK.knobUp : SWITCH_MARK_LOOK.knobDown, 1);
  painter.fillCircle(knob.x, knob.y, 3.4);
};

export const SWITCH_MARK_ART: Record<SwitchMarkKey, SwitchMarkArt> = { lever };
