import type { Vec2 } from "@vibewars/game-core";

import { TELEPORT_MARK_LOOK } from "./arena-palette.js";

/**
 * A portal's marks (#3030, docs/art/3030-world-elements.md), painted each
 * frame on its layer as a switch's is (`switch-mark.ts`): a ring of rune
 * stones round a swirl dish at its entry, a smaller ring at its exit, and
 * at the exit a burst and a fading ring after each arrival.
 */

/** The few drawing calls a portal needs, in Phaser `Graphics` terms: colours are 0xRRGGBB. */
export interface TeleportMarkPainter {
  fillStyle(colour: number, alpha: number): void;
  fillCircle(x: number, y: number, radius: number): void;
  fillEllipse(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeEllipse(x: number, y: number, width: number, height: number): void;
  lineStyle(width: number, colour: number, alpha: number): void;
  lineBetween(x1: number, y1: number, x2: number, y2: number): void;
}

/** How flat the ground's circles draw: the arena is seen from above and in front. */
const SQUASH = 0.42;
const STONES = 10;
/** The entry's radius, whatever its area: the stones ring the area's centre. */
export const TELEPORT_RADIUS = 24;
/** The exit's, smaller: it is where a body lands, not a door. */
export const TELEPORT_EXIT_RADIUS = 16;
/** One turn of the swirl, in seconds. */
const SWIRL_SECONDS = 2.4;
/** How long the white burst of an arrival lasts. */
const BURST_SECONDS = 0.3;

/** A point `turn` (0..1) round a ground circle of `radius` about `at`. */
function round(at: Vec2, radius: number, turn: number): Vec2 {
  const angle = turn * Math.PI * 2;
  return { x: at.x + Math.cos(angle) * radius, y: at.y + Math.sin(angle) * radius * SQUASH };
}

/** The stones round `at`, back ones first so front ones stand over them; `lit`, their runes glow. */
function stones(painter: TeleportMarkPainter, at: Vec2, radius: number, lit: boolean): void {
  const look = TELEPORT_MARK_LOOK;
  const places = Array.from({ length: STONES }, (_, i) => round(at, radius, (i + 0.5) / STONES));
  places.sort((a, b) => a.y - b.y);
  for (const stone of places) {
    painter.fillStyle(look.shadow, 0.35);
    painter.fillEllipse(stone.x + 1.5, stone.y + 1, 8, 3.5);
    painter.fillStyle(look.outline, 1);
    painter.fillRect(stone.x - 3, stone.y - 8, 6, 9);
    painter.fillStyle(look.stoneFace, 1);
    painter.fillRect(stone.x - 2.5, stone.y - 5.5, 5, 6);
    painter.fillStyle(lit ? look.stoneTop : look.stone, 1);
    painter.fillRect(stone.x - 2.5, stone.y - 7.5, 5, 2.5);
    if (lit) {
      painter.fillStyle(look.swirl, 1);
      painter.fillCircle(stone.x, stone.y - 3, 1.1);
    }
  }
}

/** A dashed ground ring: what an off portal shows where its swirl was. */
function dashedRing(painter: TeleportMarkPainter, at: Vec2, radius: number): void {
  painter.lineStyle(1.5, TELEPORT_MARK_LOOK.offRing, 0.8);
  const dashes = 14;
  for (let i = 0; i < dashes; i += 1) {
    const from = round(at, radius, i / dashes);
    const to = round(at, radius, (i + 0.5) / dashes);
    painter.lineBetween(from.x, from.y, to.x, to.y);
  }
}

/**
 * A portal's entry at `at`, `on` or off; `time` in seconds turns its swirl
 * and lifts its wisp, and holds still at 0 under reduced motion.
 */
export function paintTeleportEntry(
  painter: TeleportMarkPainter,
  at: Vec2,
  on: boolean,
  time: number,
): void {
  const look = TELEPORT_MARK_LOOK;
  const radius = TELEPORT_RADIUS;
  painter.fillStyle(look.shadow, 0.3);
  painter.fillEllipse(at.x + 2, at.y + 2, radius * 2.3, radius * 2.3 * SQUASH);
  painter.fillStyle(look.dish, 1);
  painter.fillEllipse(at.x, at.y, radius * 1.6, radius * 1.6 * SQUASH);
  if (!on) {
    dashedRing(painter, at, radius * 0.62);
    stones(painter, at, radius, false);
    return;
  }
  painter.fillStyle(look.swirl, 0.14);
  painter.fillEllipse(at.x, at.y, radius * 2.6, radius * 2.6 * SQUASH);
  painter.lineStyle(2, look.swirl, 0.9);
  painter.strokeEllipse(at.x, at.y, radius * 1.4, radius * 1.4 * SQUASH);
  painter.lineStyle(1.5, look.swirl, 0.7);
  painter.strokeEllipse(at.x, at.y, radius * 0.9, radius * 0.9 * SQUASH);
  const turn = time / SWIRL_SECONDS;
  for (let arm = 0; arm < 3; arm += 1) {
    for (let step = 0; step < 4; step += 1) {
      const spark = round(at, radius * (0.55 - step * 0.08), turn + arm / 3 - step * 0.05);
      painter.fillStyle(look.swirl, 0.9 - step * 0.2);
      painter.fillCircle(spark.x, spark.y, 1.8 - step * 0.3);
    }
  }
  painter.fillStyle(look.core, 0.9);
  painter.fillEllipse(at.x, at.y, radius * 0.45, radius * 0.45 * SQUASH);
  stones(painter, at, radius, true);
  // The wisp: three motes rising off the core, each fading as it climbs.
  for (let mote = 0; mote < 3; mote += 1) {
    const rise = (time * 0.5 + mote / 3) % 1;
    painter.fillStyle(look.swirl, 0.5 * (1 - rise));
    painter.fillCircle(at.x + Math.sin((rise + mote) * 5) * 2, at.y - 4 - rise * 26, 2.5 - rise);
  }
}

/** A portal's exit at `at`: a smaller ring of stones, faint aqua inside while its portal is `on`. */
export function paintTeleportExit(painter: TeleportMarkPainter, at: Vec2, on: boolean): void {
  const look = TELEPORT_MARK_LOOK;
  const radius = TELEPORT_EXIT_RADIUS;
  painter.fillStyle(look.dish, 0.6);
  painter.fillEllipse(at.x, at.y, radius * 1.6, radius * 1.6 * SQUASH);
  if (on) {
    painter.lineStyle(1.5, look.swirl, 0.45);
    painter.strokeEllipse(at.x, at.y, radius * 1.3, radius * 1.3 * SQUASH);
  } else {
    dashedRing(painter, at, radius * 0.65);
  }
  stones(painter, at, radius, on);
}

/**
 * An arrival at `at`, `age` seconds ago, of `cooldown` seconds: a white
 * burst, then a ring that spreads and fades over the cooldown, so it
 * shows when whoever came through may go again. Nothing once it is over.
 */
export function paintArrival(
  painter: TeleportMarkPainter,
  at: Vec2,
  age: number,
  cooldown: number,
): void {
  if (age < 0 || age >= cooldown) {
    return;
  }
  const look = TELEPORT_MARK_LOOK;
  if (age < BURST_SECONDS) {
    const burst = age / BURST_SECONDS;
    painter.fillStyle(look.core, 0.8 * (1 - burst));
    painter.fillCircle(at.x, at.y - 8, 6 + burst * 10);
  }
  const spent = age / cooldown;
  const radius = TELEPORT_EXIT_RADIUS * (1 + spent * 0.6);
  painter.lineStyle(2.5, look.core, 0.85 * (1 - spent));
  painter.strokeEllipse(at.x, at.y, radius * 2, radius * 2 * SQUASH);
}
