import type { Vec2 } from "@vibewars/game-core";

/** Past this many screen px from the press, a finger is a drag, never a tap (#3781). */
export const TAP_SLOP_PX = 10;
/** A finger lifted within this many ms of its press, never dragged, is a tap. */
export const TAP_MAX_MS = 500;
/** One held still at least this long is a long-press (#3878): where a tap ends, it begins. */
export const LONG_PRESS_MS = TAP_MAX_MS;
/** A tap that hits nothing takes what is drawn within this many screen px of it. */
export const FINGER_SLOP_PX = 20;
/** A pinch changes the finger distance by this factor per zoom notch, as one wheel notch (#440). */
export const PINCH_NOTCH_RATIO = 1.15;

/** One pointer event of a finger on the arena, screen px and ms. */
export interface TouchSample {
  readonly id: number;
  readonly phase: "down" | "move" | "up" | "cancel";
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** What a finger gesture meant. */
export type TouchOutcome =
  /** A tap, at the screen point of its press. */
  | { readonly kind: "tap"; readonly at: Vec2 }
  /** A press held still for `LONG_PRESS_MS` or more, at the screen point of its press. */
  | { readonly kind: "long-press"; readonly at: Vec2 }
  /** One finger dragged: screen px since the last pan, the first the whole way from the press. */
  | { readonly kind: "pan"; readonly delta: Vec2 }
  /** The drag ended, or was cut by a second finger or the OS. */
  | { readonly kind: "pan-end" }
  /** Two fingers pinched one notch: `-1` apart (closer in), `1` together, as the wheel. */
  | { readonly kind: "pinch"; readonly notch: -1 | 1 }
  | { readonly kind: "none" };

export interface TouchGesture {
  feed(sample: TouchSample): TouchOutcome;
}

const NONE: TouchOutcome = { kind: "none" };

type State =
  | { readonly kind: "idle" }
  | {
      readonly kind: "press";
      readonly id: number;
      readonly from: Vec2;
      readonly atMs: number;
      last: Vec2;
      panning: boolean;
    }
  | { readonly kind: "pinch"; readonly ids: readonly [number, number]; base: number }
  /** A pinch or a cancel ended: nothing more until every finger is up. */
  | { readonly kind: "spent" };

/**
 * Fingers on the arena (#3781): one finger lifted within `TAP_SLOP_PX`
 * and `TAP_MAX_MS` of its press is a tap, one held still longer is a
 * long-press (#3878), one that moved further pans, and a second finger
 * turns it into a pinch, which zooms in notches and never taps. Both
 * are decided on release, so a drag never walks. A
 * cancel drops the gesture. Pure: the caller passes the clock in.
 */
export function createTouchGesture(): TouchGesture {
  const fingers = new Map<number, Vec2>();
  let state: State = { kind: "idle" };

  const spread = (ids: readonly [number, number]): number => {
    const a = fingers.get(ids[0]);
    const b = fingers.get(ids[1]);
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  };
  /** After a finger leaves: idle once none is left, else spent. */
  const settle = (): void => {
    state = fingers.size === 0 ? { kind: "idle" } : { kind: "spent" };
  };

  return {
    feed(sample) {
      const at = { x: sample.x, y: sample.y };
      switch (sample.phase) {
        case "down": {
          fingers.set(sample.id, at);
          if (state.kind === "idle" && fingers.size === 1) {
            state = {
              kind: "press",
              id: sample.id,
              from: at,
              atMs: sample.t,
              last: at,
              panning: false,
            };
            return NONE;
          }
          if (state.kind === "press" && fingers.size === 2) {
            const ids: [number, number] = [state.id, sample.id];
            const ended = state.panning;
            state = { kind: "pinch", ids, base: spread(ids) };
            return ended ? { kind: "pan-end" } : NONE;
          }
          return NONE;
        }
        case "move": {
          if (!fingers.has(sample.id)) {
            return NONE;
          }
          fingers.set(sample.id, at);
          if (state.kind === "press" && state.id === sample.id) {
            const delta = { x: at.x - state.last.x, y: at.y - state.last.y };
            if (!state.panning) {
              if (Math.hypot(at.x - state.from.x, at.y - state.from.y) <= TAP_SLOP_PX) {
                return NONE;
              }
              state.panning = true;
            }
            state.last = at;
            return { kind: "pan", delta };
          }
          if (state.kind === "pinch" && state.ids.includes(sample.id) && state.base > 0) {
            const now = spread(state.ids);
            if (now >= state.base * PINCH_NOTCH_RATIO) {
              state.base = now;
              return { kind: "pinch", notch: -1 };
            }
            if (now <= state.base / PINCH_NOTCH_RATIO) {
              state.base = now;
              return { kind: "pinch", notch: 1 };
            }
          }
          return NONE;
        }
        case "up":
        case "cancel": {
          if (!fingers.delete(sample.id)) {
            return NONE;
          }
          const ended = state;
          if (ended.kind === "press" && ended.id === sample.id) {
            settle();
            if (ended.panning) {
              return { kind: "pan-end" };
            }
            if (sample.phase === "cancel") {
              return NONE;
            }
            return sample.t - ended.atMs < LONG_PRESS_MS
              ? { kind: "tap", at: ended.from }
              : { kind: "long-press", at: ended.from };
          }
          if (ended.kind !== "idle") {
            settle();
          }
          return NONE;
        }
      }
    },
  };
}
