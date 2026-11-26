import type { Vec2, ZoneKind, ZonePhase } from "@vibewars/game-core";

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
  /** What paints its ground (#3052): see `zone-painter.ts`. */
  readonly painter: ZonePainterId;
  /** The light it casts on what is round it (#3052), if any. */
  readonly light?: ZoneLight;
}

/**
 * How a zone's ground is painted (#3052): each a real thing, lava, embers,
 * fog, mud, three waters, grass, the spire's wash; `hazard` has no ground:
 * a timed or moving hazard is its mark (`hazard-marks.ts`, #3053).
 */
export type ZonePainterId =
  | "lava"
  | "embers"
  | "fog"
  | "mud"
  | "foul-water"
  | "tainted-water"
  | "spring"
  | "grass"
  | "spire"
  | "hazard";

/**
 * A zone's own light (#3052), at its centroid: `radiusScale` times its
 * outline's half-diagonal is where it reaches nothing. Fire flickers,
 * water and magic do not (visual-style.md §2).
 */
export interface ZoneLight {
  readonly colour: number;
  readonly intensity: number;
  readonly radiusScale: number;
  readonly flicker: number;
}

/**
 * Each kind its own hue, so ground is told apart at a glance before its
 * effect is: embers, lava, green gas, brown mud, murky water, and
 * (#3028) clear blue, leaf green, murky olive and violet.
 */
export const ZONE_LOOK: Record<ZoneKind, ZoneLook> = {
  // Scorched ground: an ember fill under a bright rim, warm against the cool floor.
  scorched: {
    fill: 0xb8401a,
    edge: 0xff8a3d,
    alpha: 0.38,
    pulse: 0.1,
    painter: "embers",
    light: { colour: 0xff7a30, intensity: 0.35, radiusScale: 1.2, flicker: 0.35 },
  },
  // Molten: brighter and thicker than scorched, it glows hard.
  molten: {
    fill: 0xff5a1f,
    edge: 0xffd23d,
    alpha: 0.55,
    pulse: 0.12,
    painter: "lava",
    light: { colour: 0xff9040, intensity: 0.9, radiusScale: 1.6, flicker: 0.35 },
  },
  // Toxic fog drifts: a sickly green that breathes the most.
  "toxic-fog": { fill: 0x7fbf2a, edge: 0xc8f05a, alpha: 0.32, pulse: 0.14, painter: "fog" },
  // Mire is thick mud: it hardly stirs, under a dull rim.
  mire: { fill: 0x6b4a26, edge: 0x9c7a46, alpha: 0.5, pulse: 0.03, painter: "mud" },
  // Foul water: a dark murky teal, barely moving.
  "foul-water": { fill: 0x3d5a3a, edge: 0x6f8f5a, alpha: 0.45, pulse: 0.04, painter: "foul-water" },
  // A spring: clear blue water, gently stirring.
  spring: {
    fill: 0x3f9fe8,
    edge: 0x9fdcff,
    alpha: 0.34,
    pulse: 0.06,
    painter: "spring",
    light: { colour: 0x8fd0ff, intensity: 0.45, radiusScale: 1.3, flicker: 0 },
  },
  // A grove: leafy green, darker and calmer than the fog.
  grove: { fill: 0x2f8a3c, edge: 0x76c96f, alpha: 0.34, pulse: 0.05, painter: "grass" },
  // Tainted water: murky olive, barely moving.
  "tainted-water": {
    fill: 0x66662a,
    edge: 0x9a9a4c,
    alpha: 0.45,
    pulse: 0.04,
    painter: "tainted-water",
  },
  // A draining spire: a faint violet wash under a violet rim; the obelisk is drawn apart.
  "draining-spire": {
    fill: 0x6a4a9c,
    edge: 0xa77bff,
    alpha: 0.18,
    pulse: 0.05,
    painter: "spire",
    light: { colour: 0xa77bff, intensity: 0.7, radiusScale: 1.4, flicker: 0 },
  },
  // Timed and moving hazards (#3029): drawn by their phase, see `strikeEdgeScale`.
  // A fire vent: hot orange-red, a flame jet.
  vent: {
    fill: 0xff4a12,
    edge: 0xffb03d,
    alpha: 0.6,
    pulse: 0,
    painter: "hazard",
    // A smoulder's light: its flare when it fires is drawn on the vent (#3053).
    light: { colour: 0xff7a30, intensity: 0.3, radiusScale: 1.1, flicker: 0.35 },
  },
  // A gas spout: a poison green puff, yellower than the fog.
  "gas-spout": { fill: 0x9ad62a, edge: 0xe6ff6a, alpha: 0.55, pulse: 0, painter: "hazard" },
  // Rockfall and rolling rocks: grey stone under a pale rim.
  rockfall: { fill: 0x8a8378, edge: 0xd8d0c0, alpha: 0.65, pulse: 0, painter: "hazard" },
};

/**
 * A timed or moving hazard's edge by phase (#3029, #3053): its width as a
 * multiple of `ZONE_EDGE_WIDTH`. Idle, a plain ring, so it is seen before
 * it fires; telegraphing and active, two and a half times as wide, the
 * brightest thing there, over any ground. Its mark (`hazard-marks.ts`)
 * shows the rest. A matter of play, not decoration, so still motion
 * changes nothing.
 */
export function strikeEdgeScale(phase: ZonePhase): number {
  return phase === "idle" ? 1 : 2.5;
}

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
export const PULSE_SECONDS = 1.6;

/** World units of a zone's edge, at a zoom of 1. */
export const ZONE_EDGE_WIDTH = 2;

/** `look`'s fill alpha `seconds` in; steady when the player asks for still motion. */
export function zoneFillAlpha(look: ZoneLook, seconds: number, still: boolean): number {
  return still
    ? look.alpha
    : look.alpha + look.pulse * Math.sin((seconds / PULSE_SECONDS) * Math.PI * 2);
}
