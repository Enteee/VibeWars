import type { Vec2 } from "@vibewars/game-core";

/** Past this many screen px from the press, an RMB press is a pan (#437 §2). */
export const DRAG_THRESHOLD_PX = 7;
/** A press released within this many ms that never became a pan is a click. */
export const CLICK_MAX_MS = 300;

/**
 * What one RMB pointer event meant. A pan's moves are in screen px, so the
 * threshold and the drag feel the same at every zoom.
 */
export type SecondaryOutcome =
  /** A click, at the screen point of the press: it picks a target. */
  | { readonly kind: "click"; readonly at: Vec2 }
  /** The press became a pan; `delta` is the whole way from the press, so the view does not jump. */
  | { readonly kind: "pan-start"; readonly delta: Vec2 }
  /** Screen px since the last move. */
  | { readonly kind: "pan-move"; readonly delta: Vec2 }
  | { readonly kind: "pan-end" }
  /** Nothing to do: held too long without dragging, a move under the threshold, or no press. */
  | { readonly kind: "none" };

export interface SecondaryPress {
  down(screen: Vec2, nowMs: number): void;
  move(screen: Vec2): SecondaryOutcome;
  up(nowMs: number): SecondaryOutcome;
}

const NONE: SecondaryOutcome = { kind: "none" };

/**
 * The right button's click or drag (#442): a press that moves more than
 * `DRAG_THRESHOLD_PX` is a pan and never a click; one released within
 * `CLICK_MAX_MS` that did not is a click. Pure: the caller passes the
 * clock in.
 */
export function createSecondaryPress(): SecondaryPress {
  let press:
    { readonly from: Vec2; readonly atMs: number; last: Vec2; panning: boolean } | undefined;
  return {
    down(screen, nowMs) {
      press = { from: screen, atMs: nowMs, last: screen, panning: false };
    },
    move(screen) {
      if (press === undefined) {
        return NONE;
      }
      const delta = { x: screen.x - press.last.x, y: screen.y - press.last.y };
      if (press.panning) {
        press.last = screen;
        return { kind: "pan-move", delta };
      }
      if (Math.hypot(screen.x - press.from.x, screen.y - press.from.y) <= DRAG_THRESHOLD_PX) {
        return NONE;
      }
      press.panning = true;
      press.last = screen;
      return { kind: "pan-start", delta };
    },
    up(nowMs) {
      const ended = press;
      press = undefined;
      if (ended === undefined) {
        return NONE;
      }
      if (ended.panning) {
        return { kind: "pan-end" };
      }
      return nowMs - ended.atMs <= CLICK_MAX_MS ? { kind: "click", at: ended.from } : NONE;
    },
  };
}
