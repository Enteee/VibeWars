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
