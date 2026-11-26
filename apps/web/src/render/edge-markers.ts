import type { Vec2 } from "@vibewars/game-core";

import type { CameraView, Cover, ScreenRect, Size } from "./camera-rig.js";

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

/** Half a marker, px: how far a keep-out panel is grown before a marker counts as under it. */
export const EDGE_MARKER_HALF_PX = 6;

/** The gap a slid marker keeps from the panel it slid off (#1424), px. */
export const KEEP_OUT_GAP_PX = 8;

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
    const tx = dx === 0 ? Infinity : reachX / Math.abs(dx);
    const ty = dy === 0 ? Infinity : reachY / Math.abs(dy);
    // On the top or bottom edge when that is where the ray crosses, a
    // corner included, so a marker there slides along x.
    const alongX = ty <= tx;
    const t = Math.min(tx, ty);
    const x = centreX + dx * t;
    const y = centreY + dy * t;
    const slid = alongX
      ? slide(x, y, Math.sign(centreY - y), cover.keepOut, "x", centreX - reachX, centreX + reachX)
      : slide(y, x, Math.sign(centreX - x), cover.keepOut, "y", centreY - reachY, centreY + reachY);
    markers.push({
      id: thing.id,
      kind: thing.kind,
      colour: thing.colour,
      targeted: thing.targeted,
      x: slid.x,
      y: slid.y,
      angle: Math.atan2(dy, dx),
    });
  }
  return markers;
}

/** Whether a marker at (x, y) is under `rect`, grown by half a marker. */
function under(x: number, y: number, rect: ScreenRect): boolean {
  return (
    x > rect.left - EDGE_MARKER_HALF_PX &&
    x < rect.right + EDGE_MARKER_HALF_PX &&
    y > rect.top - EDGE_MARKER_HALF_PX &&
    y < rect.bottom + EDGE_MARKER_HALF_PX
  );
}

/**
 * Where a marker goes to be under no keep-out panel (#1424): unmoved if it
 * is under none, else along its edge just past whichever end of a panel is
 * nearest and in reach (`min` … `max`) and under none, the lower end on a
 * tie. With no such end, as when a short window's edge is all compass and
 * party window, it steps inward instead, past the inner side of every panel
 * it lands under. `along` is the coordinate that moves along the edge,
 * `across` the one that stays, `inward` the sign of the way to the centre
 * across; `axis` says which is x.
 */
function slide(
  along: number,
  across: number,
  inward: number,
  keepOut: readonly ScreenRect[],
  axis: "x" | "y",
  min: number,
  max: number,
): Vec2 {
  const point = (alongAt: number, acrossAt: number): Vec2 =>
    axis === "x" ? { x: alongAt, y: acrossAt } : { x: acrossAt, y: alongAt };
  const coverOf = (alongAt: number, acrossAt: number): ScreenRect | undefined => {
    const { x, y } = point(alongAt, acrossAt);
    return keepOut.find((rect) => under(x, y, rect));
  };
  if (coverOf(along, across) === undefined) {
    return point(along, across);
  }
  const clear = EDGE_MARKER_HALF_PX + KEEP_OUT_GAP_PX;
  const [end] = keepOut
    .flatMap((rect) =>
      axis === "x"
        ? [rect.left - clear, rect.right + clear]
        : [rect.top - clear, rect.bottom + clear],
    )
    .filter((value) => value >= min && value <= max && coverOf(value, across) === undefined)
    .sort((a, b) => Math.abs(a - along) - Math.abs(b - along) || a - b);
  if (end !== undefined) {
    return point(end, across);
  }
  // Each step clears one panel for good, so this ends within keepOut.length.
  let inside = across;
  for (let rect = coverOf(along, inside); rect !== undefined; rect = coverOf(along, inside)) {
    const [low, high] = axis === "x" ? [rect.top, rect.bottom] : [rect.left, rect.right];
    inside = inward < 0 ? low - clear : high + clear;
  }
  return point(along, inside);
}
