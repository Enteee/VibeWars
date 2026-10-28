import type { WeaponSetIntent, WireWeaponSets } from "@vibewars/game-protocol";

import { WEAPON_SET_ACTIONS, type KeyAction } from "./keymap.js";

/**
 * What a weapon-set key or click sends (#489): the swap, or nothing for
 * an empty set, or before the host has said which sets this player has.
 */
export function weaponSetIntent(
  sets: WireWeaponSets | undefined,
  set: number,
): WeaponSetIntent | undefined {
  if (
    sets === undefined ||
    (set !== 0 && set !== 1 && set !== 2 && set !== 3) ||
    (sets.sets[set] ?? null) === null
  ) {
    return undefined;
  }
  return { kind: "weapon-set", set };
}

/** The set a weapon-set action swaps to, 0-3; `undefined` for any other action. */
export function weaponSetOf(action: KeyAction): number | undefined {
  const set = WEAPON_SET_ACTIONS.indexOf(action);
  return set === -1 ? undefined : set;
}
