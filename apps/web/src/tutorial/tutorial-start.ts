import { vec2, type Vec2 } from "@vibewars/game-core";

import {
  DEFAULT_STEP,
  VIEW_STEPS,
  clampToLeash,
  zoomFor,
  type Size,
} from "../render/camera-rig.js";

/** How far past the view's edge the teleporter keeps, out of it or in it (#3222). */
export const TELEPORTER_MARGIN = 100;
/** The search for an open spot: the steps along the span, and the steps aside. */
const SPOT_STEP = 25;
const SPOT_ASIDE = [0, 40, -40, 80, -80] as const;
/** How far aside a snapped spot may land and still be north of the start. */
const SPOT_ASIDE_MOST = 160;

/**
 * `spawn` moved along the line to the map's centre until it is at least
 * `half` from every edge (#3221), so the default view is all playfield;
 * the centre itself on a map too small for that.
 */
export function inwardStart(
  spawn: Vec2,
  size: { readonly width: number; readonly height: number },
  half: Vec2,
): Vec2 {
  const centre = vec2(size.width / 2, size.height / 2);
  // The least share of the way to the centre that clears one axis' edges.
  const share = (from: number, mid: number, keep: number, extent: number): number => {
    if (keep > mid) {
      return 1;
    }
    if (from < keep) {
      return (keep - from) / (mid - from);
    }
    if (from > extent - keep) {
      return (from - (extent - keep)) / (from - mid);
    }
    return 0;
  };
  const along = Math.min(
    1,
    Math.max(
      share(spawn.x, centre.x, half.x, size.width),
      share(spawn.y, centre.y, half.y, size.height),
    ),
  );
  return vec2(spawn.x + (centre.x - spawn.x) * along, spawn.y + (centre.y - spawn.y) * along);
}

/**
 * How far north of the player the teleporter may stand (#3222), on a
 * canvas of `viewport`: `near` is out of the default view by
 * `TELEPORTER_MARGIN`; `far` is in view by as much after one wheel
 * notch out and a right-drag up to the leash.
 */
export function teleporterReach(viewport: Size): { readonly near: number; readonly far: number } {
  const half = (step: number): number => viewport.height / 2 / zoomFor(step, viewport);
  const wide = Math.min(VIEW_STEPS.length - 1, DEFAULT_STEP + 1);
  const leash = -clampToLeash(vec2(0, Number.NEGATIVE_INFINITY), viewport, zoomFor(wide, viewport))
    .y;
  return {
    near: half(DEFAULT_STEP) + TELEPORTER_MARGIN,
    far: leash + half(wide) - TELEPORTER_MARGIN,
  };
}

/**
 * Where the teleporter stands (#3222): straight north of `start`, inside
 * `teleporterReach`, on ground `standable` snaps to and `open` passes,
 * nearest first: after the drag it stands low on the screen, below the
 * tutor's line, which would hide it higher up. On a map too small for that, the
 * farthest standable point north, which may be in the default view.
 */
export function teleporterSpot(
  start: Vec2,
  viewport: Size,
  standable: (at: Vec2) => Vec2,
  open: (at: Vec2) => boolean,
): Vec2 {
  const { near, far } = teleporterReach(viewport);
  for (let north = near; north <= far; north += SPOT_STEP) {
    for (const aside of SPOT_ASIDE) {
      const spot = standable(vec2(start.x + aside, start.y - north));
      const rise = start.y - spot.y;
      if (
        rise >= near &&
        rise <= far &&
        Math.abs(spot.x - start.x) <= SPOT_ASIDE_MOST &&
        open(spot)
      ) {
        return spot;
      }
    }
  }
  return standable(vec2(start.x, start.y - far));
}
