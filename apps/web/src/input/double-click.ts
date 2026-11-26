/** Two presses on one body, close enough together to mean "attack it" (#298). */
export interface DoubleClick {
  /**
   * A pointer-down on `hitId` (`undefined` for empty ground) at `nowMs`.
   *
   * @returns whether this press completes a double-click
   */
  press(hitId: string | undefined, nowMs: number): boolean;
}

/**
 * GW1's double-click, tracked on pointer-down rather than the DOM's
 * `dblclick`, which fires on the second release: by then the second
 * press has already sent its target. Phaser has none.
 *
 * Both presses must hit the same body within `windowMs`, so a body that
 * walks out from under the cursor between them does not count. A press
 * that completes one resets the tracker: a triple-click is one
 * double-click and a single click. The caller passes the clock in, so
 * this stays pure.
 */
export function createDoubleClick(windowMs = 350): DoubleClick {
  let last: { readonly hitId: string; readonly atMs: number } | undefined;
  return {
    press(hitId, nowMs) {
      const fired = hitId !== undefined && last?.hitId === hitId && nowMs - last.atMs <= windowMs;
      last = fired || hitId === undefined ? undefined : { hitId, atMs: nowMs };
      return fired;
    },
  };
}
