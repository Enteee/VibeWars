import type { CreatureLook } from "@vibewars/game-core";

import type { WeaponMarkId } from "./weapon-mark-geometry.js";

/**
 * What an armed creature carries (#2047, C of #2043): a player's weapon
 * mark, and a shield as a player's off-hand, scaled to the creature's
 * drawn radius. A creature not listed is unarmed and shows a facing tick.
 */
export interface CreatureArms {
  readonly weapon: WeaponMarkId;
  readonly offHand?: "shield";
}

export const CREATURE_ARMS: Readonly<Partial<Record<CreatureLook, CreatureArms>>> = {
  priest: { weapon: "staff" },
  guard: { weapon: "spear", offHand: "shield" },
  // No greatsword mark: the sword, scaled to the Lord's size.
  "guild-lord": { weapon: "sword" },
  "ghostly-hero": { weapon: "sword" },
};
