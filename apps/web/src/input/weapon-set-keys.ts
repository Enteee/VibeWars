import type { WeaponSetIntent, WireWeaponSets } from "@vibewars/game-protocol";

import { WEAPON_SET_ACTIONS, type KeyAction } from "./keymap.js";

/**
 * What a weapon-set key sends (#489), shared by the match and the Training
 * Ground: the swap to its set, or nothing for a set that is not carried
 * or not yet known. The host decides whether, and when, it happens.
 */
export function weaponSetIntent(
  action: KeyAction,
  weaponSets: WireWeaponSets | undefined,
): WeaponSetIntent | undefined {
  const set = WEAPON_SET_ACTIONS.indexOf(action);
  if (!isSetIndex(set)) {
    return undefined;
  }
  const carried = weaponSets?.sets[set];
  return carried === null || carried === undefined ? undefined : { kind: "weapon-set", set };
}

function isSetIndex(value: number): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
