/**
 * `?capture` (#3811): the combat events of a match, for `scripts/promo`.
 * The promo cut picks its slow-mo and its beat from them. Without the flag
 * nothing is recorded and `window.__capture` does not exist.
 */

/** One combat event as the cut needs it: when it was seen, and what it was. */
export interface CaptureEvent {
  /** `performance.now()` in ms, the clock Playwright's page also reads. */
  readonly t: number;
  readonly kind: string;
  /** The skill that caused it, `""` for a weapon or the world. */
  readonly skillId: string;
  /** Whether the local seat caused it: the trailer shoots its own player, not any bot. */
  readonly own: boolean;
}

/** Whether the page asked to record its events: `?capture`. */
export function capturing(search: string): boolean {
  return new URLSearchParams(search).has("capture");
}

/** The page's list, on `window.__capture`, or `undefined` without `?capture`. */
export function captureEvents(search: string): CaptureEvent[] | undefined {
  if (!capturing(search)) {
    return undefined;
  }
  const shown: unknown = Reflect.get(window, "__capture");
  if (Array.isArray(shown)) {
    return shown as CaptureEvent[];
  }
  const events: CaptureEvent[] = [];
  Object.assign(window, { __capture: events });
  return events;
}

/** What the capture script steers by: the local player's spot, and which gates are open. */
export interface CaptureState {
  /** The local seat's player; `null` before spawn, or as a watcher. */
  readonly position: { readonly x: number; readonly y: number } | null;
  /** The match's gates in map order. */
  readonly gatesOpen: readonly boolean[];
}

/**
 * Expose `window.__captureState()` over `read`, with `?capture` only: the
 * trailer's script polls it to walk onto a plate and to cut on a gate opening.
 */
export function exposeCaptureState(search: string, read: () => CaptureState): void {
  if (capturing(search)) {
    Object.assign(window, { __captureState: read });
  }
}
