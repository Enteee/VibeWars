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

/** Scorched ground: an ember fill under a bright rim, warm against the cool floor. */
export const ZONE_LOOK: Record<ZoneKind, ZoneLook> = {
  scorched: { fill: 0xb8401a, edge: 0xff8a3d, alpha: 0.38, pulse: 0.1 },
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
