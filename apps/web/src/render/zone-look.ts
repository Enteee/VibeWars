import type { Vec2, ZoneKind } from "@vibewars/game-core";

import type { RenderableShape } from "./arena-snapshot.js";
import { shapeOutline } from "./layer-surfaces.js";

/**
 * How an effect zone looks (ADR-0053, #3024): a tinted area with a hard
 * edge, so a player sees it before stepping in, its fill breathing by
 * `pulse` round `alpha`. One entry per kind, as `LIGHT_MARK_ART` is per mark.
 */
export interface ZoneLook {
  readonly fill: number;
  readonly edge: number;
  readonly alpha: number;
  readonly pulse: number;
}

/**
 * Each kind its own hue, so ground is told apart at a glance before its
 * effect is: embers, lava, green gas, brown mud, murky water, and
 * (#3028) clear blue, leaf green, murky olive and violet.
 */
export const ZONE_LOOK: Record<ZoneKind, ZoneLook> = {
  // Scorched ground: an ember fill under a bright rim, warm against the cool floor.
  scorched: { fill: 0xb8401a, edge: 0xff8a3d, alpha: 0.38, pulse: 0.1 },
  // Molten: brighter and thicker than scorched, it glows hard.
  molten: { fill: 0xff5a1f, edge: 0xffd23d, alpha: 0.55, pulse: 0.12 },
  // Toxic fog drifts: a sickly green that breathes the most.
  "toxic-fog": { fill: 0x7fbf2a, edge: 0xc8f05a, alpha: 0.32, pulse: 0.14 },
  // Mire is thick mud: it hardly stirs, under a dull rim.
  mire: { fill: 0x6b4a26, edge: 0x9c7a46, alpha: 0.5, pulse: 0.03 },
  // Foul water: a dark murky teal, barely moving.
  "foul-water": { fill: 0x3d5a3a, edge: 0x6f8f5a, alpha: 0.45, pulse: 0.04 },
  // A spring: clear blue water, gently stirring.
  spring: { fill: 0x3f9fe8, edge: 0x9fdcff, alpha: 0.34, pulse: 0.06 },
  // A grove: leafy green, darker and calmer than the fog.
  grove: { fill: 0x2f8a3c, edge: 0x76c96f, alpha: 0.34, pulse: 0.05 },
  // Tainted water: murky olive, barely moving.
  "tainted-water": { fill: 0x66662a, edge: 0x9a9a4c, alpha: 0.45, pulse: 0.04 },
  // A draining spire: a faint violet wash under a violet rim; the obelisk is drawn apart.
  "draining-spire": { fill: 0x6a4a9c, edge: 0xa77bff, alpha: 0.18, pulse: 0.05 },
};

/**
 * A draining spire's obelisk (#3028): a stone needle standing on its zone's
 * centroid, with a violet glow ring on the zone's edge. Decoration only:
 * it blocks nothing.
 */
export const SPIRE_LOOK = {
  stone: 0x4a4656,
  outline: 0x24222c,
  rune: 0xc9a8ff,
  ring: 0xa77bff,
  ringAlpha: 0.25,
  /** World units, at a zoom of 1. */
  width: 14,
  height: 40,
} as const;

/** Where a shape's area balances: its polygon's centroid, by area. */
export function zoneCentroid(area: RenderableShape): Vec2 {
  const outline = shapeOutline(area);
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (const [index, a] of outline.entries()) {
    const b = outline[(index + 1) % outline.length] ?? a;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (twiceArea === 0) {
    // A degenerate outline: the mean of its corners.
    const n = Math.max(1, outline.length);
    return {
      x: outline.reduce((sum, point) => sum + point.x, 0) / n,
      y: outline.reduce((sum, point) => sum + point.y, 0) / n,
    };
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

/** The obelisk's outline, its foot on `foot`: a tapered shaft under a pointed cap. */
export function obeliskOutline(foot: Vec2): readonly Vec2[] {
  const half = SPIRE_LOOK.width / 2;
  const shoulder = SPIRE_LOOK.height * 0.8;
  return [
    { x: foot.x - half, y: foot.y },
    { x: foot.x + half, y: foot.y },
    { x: foot.x + half * 0.6, y: foot.y - shoulder },
    { x: foot.x, y: foot.y - SPIRE_LOOK.height },
    { x: foot.x - half * 0.6, y: foot.y - shoulder },
  ];
}

/** Seconds a zone's fill takes to breathe out and in again. */
const PULSE_SECONDS = 1.6;

/** World units of a zone's edge, at a zoom of 1. */
export const ZONE_EDGE_WIDTH = 2;

/** `look`'s fill alpha `seconds` in; steady when the player asks for still motion. */
export function zoneFillAlpha(look: ZoneLook, seconds: number, still: boolean): number {
  return still
    ? look.alpha
    : look.alpha + look.pulse * Math.sin((seconds / PULSE_SECONDS) * Math.PI * 2);
}
