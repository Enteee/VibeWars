import { UPHILL, type Vec2 } from "@vibewars/game-core";

import type { ArenaPalette } from "./arena-palette.js";
import type { MapStructure, RenderableLift } from "./arena-snapshot.js";
import { shapeOutline } from "./layer-surfaces.js";
import { elevationOf } from "./render-order.js";
import type { StructurePainter } from "./structure-art.js";

/**
 * A lift (#3079), as docs/art/3079-lift.md draws it: an iron frame round
 * a dark shaft, drawn once with the map, and a plank platform hung on two
 * brass chains from its beam, drawn every frame at its height. On its way,
 * iron bars close both its ends and a brass chevron points the way; at
 * rest its ends are open. Its colours are a transition's: `rampTop` the
 * planks, `rampPanel` the brass, `rampChevron` the iron, `slab` the
 * platform's underside.
 */

/** A lift as its art draws it: its area's box, its two heights, and its ends. */
export interface LiftFrame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  /** The heights of its bottom layer and its top one. */
  readonly foot: number;
  readonly head: number;
  /** Whether it climbs east or west, so its ends are its west and east sides. */
  readonly acrossX: boolean;
  /** One CSS pixel, in world units. */
  readonly line: number;
  readonly palette: ArenaPalette;
}

/** How far the frame's beam stands over the top layer, in world units. */
const BEAM_OVER = 14;
/** How thick the platform's planks are, and how far apart. */
const PLATFORM_THICK = 4;
const PLATFORM_PLANK = 12;
/** How far apart the bars across a closed end are, and how tall. */
const BAR_EVERY = 7;
const BAR_HEIGHT = 12;
/** A chevron's half-width and height, in world units. */
const CHEVRON_HALF = 10;
const CHEVRON_RISE = 6;
/** How far under the platform's front edge the chevrons sit. */
const CHEVRON_GAP = 8;
/** Where the chains hang, as shares of the platform's width. */
const CHAINS = [0.25, 0.75] as const;
/** The shaft under the platform: always dark. */
const SHAFT = 0x0d1016;

/** `transition`, a lift, measured for its art. */
export function liftFrame(
  structure: MapStructure,
  transition: MapStructure["transitions"][number],
  line: number,
  palette: ArenaPalette,
): LiftFrame {
  const outline = shapeOutline(transition.area);
  const xs = outline.map(({ x }) => x);
  const ys = outline.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
    foot: elevationOf(transition.from, structure.ground),
    head: elevationOf(transition.to, structure.ground),
    acrossX: UPHILL[transition.uphill].x !== 0,
    line,
    palette,
  };
}

/** The platform's height `progress` of the way up. */
function heightAt(frame: LiftFrame, progress: number): number {
  return frame.foot + Math.min(1, Math.max(0, progress)) * (frame.head - frame.foot);
}

/** The shaft and the frame round it, drawn once with the map: four iron posts and a beam. */
export function liftShaft(painter: StructurePainter, frame: LiftFrame): void {
  const { left, top, right, bottom, foot, head, line, palette } = frame;
  painter.fillStyle(SHAFT, 1);
  painter.fillRect(left, top - foot, right - left, bottom - top);
  const beam = head + BEAM_OVER;
  painter.lineStyle(line * 3, palette.rampChevron, 1);
  for (const [x, y] of [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ] as const) {
    painter.lineBetween(x, y - foot, x, y - beam);
  }
  painter.lineBetween(left, top - beam, right, top - beam);
  painter.lineBetween(left, bottom - beam, right, bottom - beam);
}

/** The ends of the platform at `height`: the sides a body steps on and off by. */
function ends(frame: LiftFrame, height: number): readonly (readonly [Vec2, Vec2])[] {
  const { left, top, right, bottom } = frame;
  return frame.acrossX
    ? [
        [
          { x: left, y: top - height },
          { x: left, y: bottom - height },
        ],
        [
          { x: right, y: top - height },
          { x: right, y: bottom - height },
        ],
      ]
    : [
        [
          { x: left, y: top - height },
          { x: right, y: top - height },
        ],
        [
          { x: left, y: bottom - height },
          { x: right, y: bottom - height },
        ],
      ];
}

/**
 * The platform where `lift` has it, drawn every frame: its chains from the
 * beam, its underside and planks; on its way, bars across both ends and a
 * chevron the way it goes.
 */
export function liftPlatform(
  painter: StructurePainter,
  frame: LiftFrame,
  lift: RenderableLift,
): void {
  const { left, top, right, bottom, head, line, palette } = frame;
  const height = heightAt(frame, lift.progress);
  const beam = head + BEAM_OVER;
  const middle = (top + bottom) / 2;
  painter.lineStyle(line * 1.5, palette.rampPanel, 1);
  for (const share of CHAINS) {
    const x = left + share * (right - left);
    painter.lineBetween(x, middle - beam, x, middle - height);
  }
  painter.fillStyle(palette.slab, 1);
  painter.fillRect(left, bottom - height, right - left, PLATFORM_THICK);
  painter.fillStyle(palette.rampTop, 1);
  painter.fillRect(left, top - height, right - left, bottom - top);
  painter.lineStyle(line, palette.slab, 1);
  if (frame.acrossX) {
    for (let y = top + PLATFORM_PLANK; y < bottom; y += PLATFORM_PLANK) {
      painter.lineBetween(left, y - height, right, y - height);
    }
  } else {
    for (let x = left + PLATFORM_PLANK; x < right; x += PLATFORM_PLANK) {
      painter.lineBetween(x, top - height, x, bottom - height);
    }
  }
  if (lift.phase === "low" || lift.phase === "high") {
    return;
  }
  // Each end closed: a dashed iron gate across it, as the study's plan
  // view, its bars standing up from it where an end runs east to west.
  for (const [from, to] of ends(frame, height)) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const bars = Math.max(2, Math.round(length / BAR_EVERY));
    const at = (k: number): Vec2 => ({
      x: from.x + ((to.x - from.x) * k) / bars,
      y: from.y + ((to.y - from.y) * k) / bars,
    });
    painter.lineStyle(line * 4, palette.rampChevron, 1);
    for (let k = 0; k < bars; k += 2) {
      const [a, b] = [at(k), at(k + 1)];
      painter.lineBetween(a.x, a.y, b.x, b.y);
    }
    painter.lineStyle(line * 2, palette.rampChevron, 1);
    for (let k = 0; k <= bars; k += 1) {
      const bar = at(k);
      painter.lineBetween(bar.x, bar.y, bar.x, bar.y - BAR_HEIGHT);
    }
    painter.lineBetween(from.x, from.y - BAR_HEIGHT, to.x, to.y - BAR_HEIGHT);
  }
  // A brass chevron pair on the shaft, under the platform's front edge,
  // tips the way it goes: where no rider stands over it.
  const way = lift.phase === "rising" ? -1 : 1;
  const centre = { x: (left + right) / 2, y: bottom - height + PLATFORM_THICK + CHEVRON_GAP };
  painter.lineStyle(line * 3, palette.rampPanel, 1);
  for (const offset of [0, CHEVRON_RISE + 2]) {
    const tip = { x: centre.x, y: centre.y + offset + (way < 0 ? 0 : CHEVRON_RISE) };
    const arms = tip.y - way * CHEVRON_RISE;
    for (const side of [-1, 1]) {
      painter.lineBetween(tip.x + side * CHEVRON_HALF, arms, tip.x, tip.y);
    }
  }
}
