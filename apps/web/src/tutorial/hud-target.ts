/** As much of an `Element` as {@link hudTarget} reads. */
export interface HudNode<T> {
  closest(selector: string): T | null;
  querySelector(selector: string): T | null;
  getClientRects(): { readonly length: number };
}

/**
 * What a HUD highlight pulses: `found` itself, or, while a phone keeps it
 * collapsed behind the Party toggle (#3778), that toggle (#3782). A press
 * on the toggle opens the party window, and the pulse moves on to `found`.
 */
export function hudTarget<T extends HudNode<T>>(found: T): T {
  if (shown(found)) {
    return found;
  }
  const toggle = found.closest(".party-dock:not(.is-open)")?.querySelector(".party-toggle");
  return toggle !== null && toggle !== undefined && shown(toggle) ? toggle : found;
}

/**
 * Whether `node` is laid out: `display: none` on it or above gives no box.
 * Not `checkVisibility()`, which Safari before 17.4 lacks.
 */
function shown(node: HudNode<unknown>): boolean {
  return node.getClientRects().length > 0;
}
