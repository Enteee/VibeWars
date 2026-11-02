import { getSkill } from "./catalog.js";
import { resolvedBar } from "./cast-state.js";
import { isSpell, type Combatant } from "./types.js";

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

/** Whether `combatant` is activating a spell (#2010): Knowing is Half the Battle's test. */
export function isCastingSpell(combatant: Combatant): boolean {
  const cast = combatant.cast.activeCast;
  if (combatant.dead || cast === undefined) {
    return false;
  }
  const skill = getSkill(cast.skillId);
  return skill !== undefined && isSpell(skill.type);
}

/**
 * Slots of `combatant`'s bar whose skill now is a signet (#1206), an
 * echoed slot's copy counted rather than the build's: Artificer's test.
 */
export function signetsOnBar(combatant: Combatant): number {
  return resolvedBar(combatant.skillBar, combatant.cast).filter(
    (slot) => slot !== null && getSkill(slot.skillId)?.type === "signet",
  ).length;
}
