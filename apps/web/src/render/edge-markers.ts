import type { Vec2 } from "@vibewars/game-core";

import type { CameraView, Cover, Size } from "./camera-rig.js";

/**
 * Off-screen markers (#437 §4, #440): for each living body outside the
 * view, a small triangle on the screen edge points at it, and an
 * outlined one at each objective a mode is played around (#1413). Pure,
 * in screen px; the scene draws them.
 */

export type EdgeMarkerKind = "foe" | "friend" | "self" | "objective";

/** A body, or an objective (#1413): a capture shrine, the altar or the flag stand. */
export interface EdgeThing {
  readonly id: string;
  readonly kind: EdgeMarkerKind;
  /** An `"objective"`'s colour (#1413); `undefined` for a body, whose kind says it. */
  readonly colour: number | undefined;
  readonly position: Vec2;
  readonly dead: boolean;
  /** Your target: its marker gets the target outline. */
  readonly targeted: boolean;
}

export interface EdgeMarker {
  readonly id: string;
  readonly kind: EdgeMarkerKind;
  readonly colour: number | undefined;
  readonly targeted: boolean;
  /** Screen px. */
  readonly x: number;
  readonly y: number;
  /** Radians, the way the marker points: 0 is right, π/2 down. */
  readonly angle: number;
}

/** How far inside the screen edge the markers sit, px. */
export const EDGE_INSET_PX = 22;

/**
 * A marker for every living thing outside the part of the viewport the HUD
 * leaves uncovered, inset by `insetPx`, where the ray from that part's
 * centre to it crosses the inset rectangle: a foe due south is marked
 * above the skill bar, not under it.
 */
export function edgeMarkers(
  things: readonly EdgeThing[],
  view: CameraView,
  viewport: Size,
  cover: Cover,
  insetPx = EDGE_INSET_PX,
): EdgeMarker[] {
  const centreX = viewport.width / 2;
  const centreY = (cover.top + viewport.height - cover.bottom) / 2;
  const reachX = Math.max(0, viewport.width / 2 - insetPx);
  const reachY = Math.max(0, (viewport.height - cover.top - cover.bottom) / 2 - insetPx);
  const markers: EdgeMarker[] = [];
  for (const thing of things) {
    if (thing.dead) {
      continue;
    }
    // From the uncovered centre, in screen px.
    const dx = viewport.width / 2 + (thing.position.x - view.x) * view.zoom - centreX;
    const dy = viewport.height / 2 + (thing.position.y - view.y) * view.zoom - centreY;
    if (Math.abs(dx) <= reachX && Math.abs(dy) <= reachY) {
      continue;
    }
    const t = Math.min(
      dx === 0 ? Infinity : reachX / Math.abs(dx),
      dy === 0 ? Infinity : reachY / Math.abs(dy),
    );
    markers.push({
      id: thing.id,
      kind: thing.kind,
      colour: thing.colour,
      targeted: thing.targeted,
      x: centreX + dx * t,
      y: centreY + dy * t,
      angle: Math.atan2(dy, dx),
    });
  }
  return markers;
}
