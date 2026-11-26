import type { Vec2 } from "@vibewars/game-core";

/**
 * Where you clicked the floor to walk (#310): an `ink` × of four ticks
 * with an open centre, fading out (docs/art/art-direction.md "Walk
 * marker"). Client-only and yours alone; the server never hears of it.
 * There is only ever one, so a new click replaces it.
 */
export interface WalkMarker {
  readonly position: Vec2;
  /** Seconds of life remaining. */
  readonly remainingSeconds: number;
}

/** How long the marker lasts, fading or, under reduced motion, held. */
export const WALK_MARKER_SECONDS = 0.4;
/** Each tick runs from this far out from the click point… */
export const WALK_MARKER_INNER = 3;
/** …to this far. */
export const WALK_MARKER_OUTER = 8;

export function walkMarkerAt(position: Vec2): WalkMarker {
  return { position, remainingSeconds: WALK_MARKER_SECONDS };
}

/** The marker `dt` seconds older, or none once its time is up. */
export function decayWalkMarker(
  marker: WalkMarker | undefined,
  dt: number,
): WalkMarker | undefined {
  if (marker === undefined) {
    return undefined;
  }
  const remainingSeconds = marker.remainingSeconds - dt;
  return remainingSeconds > 0 ? { ...marker, remainingSeconds } : undefined;
}

/** Its opacity: from 1 to 0 over its life, or 1 throughout under reduced motion. */
export function walkMarkerAlpha(marker: WalkMarker, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 1;
  }
  return Math.max(0, Math.min(1, marker.remainingSeconds / WALK_MARKER_SECONDS));
}

/** The four ticks, at 45°, 135°, 225° and 315°, each as its two ends. */
export function walkMarkerTicks(marker: WalkMarker): readonly (readonly [Vec2, Vec2])[] {
  const { x, y } = marker.position;
  return [1, 3, 5, 7].map((eighth) => {
    const angle = (eighth * Math.PI) / 4;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return [
      { x: x + dx * WALK_MARKER_INNER, y: y + dy * WALK_MARKER_INNER },
      { x: x + dx * WALK_MARKER_OUTER, y: y + dy * WALK_MARKER_OUTER },
    ] as const;
  });
}
