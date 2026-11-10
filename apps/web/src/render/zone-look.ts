import type { ZoneKind } from "@vibewars/game-core";

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
 * effect is: embers, lava, green gas, brown mud, murky water.
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
};

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
