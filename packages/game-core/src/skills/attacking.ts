import { getSkill } from "./catalog.js";
import type { Combatant } from "./types.js";

/**
 * Whether `combatant` is attacking, as GW1 counts it: swinging at a foe,
 * or casting an attack skill. An auto-attack still walking to its foe is
 * the run-up, not an attack: GW1 counts only the swings, which are made
 * standing. Shadow Refuge's test, and Brawler's and Nightstalker's
 * (#1142); its own module, so damage needs no more of the catalog.
 */
export function isAttacking(combatant: Combatant): boolean {
  if (combatant.dead) {
    return false;
  }
  const cast = combatant.cast.activeCast;
  return (
    (combatant.attack !== undefined && !combatant.moving) ||
    (cast !== undefined && getSkill(cast.skillId)?.type === "attack")
  );
}
