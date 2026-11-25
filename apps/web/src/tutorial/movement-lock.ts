import type { ClientIntent } from "@vibewars/game-protocol";

/** The station during which the player stands still and only looks (#3970). */
export const LOOK_STATION = "look";

/**
 * Whether `intent` is dropped while `station` runs (#3970): walking, by keys
 * or by a click, tap or press and hold, during the look station. The camera
 * still pans and zooms, and everything else passes.
 */
export function lockedIntent(station: string | undefined, intent: ClientIntent): boolean {
  return station === LOOK_STATION && (intent.kind === "move" || intent.kind === "walk-to");
}
