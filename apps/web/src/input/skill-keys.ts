/**
 * The bar slot a match keydown casts, or `undefined` for none: 1–9 are
 * slots 1–9 and 0 is slot 10, as far as the bar reaches.
 *
 * An auto-repeat keydown casts nothing. Holding a skill key while it
 * recharges is a common habit, and at a fast OS repeat rate it would
 * send one `use-skill` per repeat, enough on its own to cross the
 * server's message cap and get the player dropped (#43). One press is
 * one cast.
 */
export function skillSlotForKeyDown(
  event: Pick<KeyboardEvent, "key" | "repeat">,
  barLength: number,
): number | undefined {
  if (event.repeat || !/^[0-9]$/.test(event.key)) {
    return undefined;
  }
  const slot = event.key === "0" ? 9 : Number.parseInt(event.key, 10) - 1;
  return slot < barLength ? slot : undefined;
}
