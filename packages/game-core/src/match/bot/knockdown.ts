import type { Skill, Surroundings } from "../../skills/types.js";
import { unblockableNow } from "../../skills/weapon-attack.js";
import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";
import { blocksMe } from "./block-swap.js";
import { roleOf } from "./role.js";

/**
 * Whether `skill` knocks down the one foe it is cast at, whatever holds
 * (#4228): Shock's and Gale's top-level knockdown. Not one inside an
 * `if` (Water Trident, "Coward!"), not one on its caster, not an area's
 * (Earthquake), and not a blow that can be blocked (Hammer Bash): a
 * blocked knockdown is the waste it is meant to end. An attack that is
 * unblockable only in a state is read against the foe by
 * `knockdownTarget`.
 */
export function knocksDown(skill: Skill): boolean {
  return (
    skill.target === "single-enemy" &&
    skill.area === undefined &&
    skill.attack?.unblockable !== false &&
    skill.effects.some((effect) => effect.kind === "knockdown" && effect.on === undefined)
  );
}

/**
 * The foe to knock down instead of the team's target (#4228): one whose
 * block stance is wasting an ally attacker's blows, living, within
 * `range` of `self` and allowed by `mayCast`. An ally attacker is a
 * living frontline or ranged ally with that foe as its target, within
 * its weapon's range of it, that the foe `blocksMe`. Of several, the one
 * with the most such allies on it; then the team's `targetId`, then the
 * nearest, then `foes`' order. `undefined` for a skill that does not
 * `knocksDown`, or no such foe.
 */
export function knockdownTarget(
  skill: Skill,
  self: Participant,
  allies: readonly Participant[],
  foes: readonly Participant[],
  targetId: string,
  range: number,
  mayCast: (foeId: string) => boolean,
  surroundings: Surroundings,
): string | undefined {
  if (!knocksDown(skill)) {
    return undefined;
  }
  const attack = skill.attack;
  let best: { foe: Participant; blocked: number; reach: number } | undefined;
  for (const foe of foes) {
    const reach = distance(foe.position, self.position);
    if (
      foe.combatant.dead ||
      reach > range ||
      !mayCast(foe.id) ||
      (attack !== undefined &&
        !unblockableNow(attack.unblockable, self.combatant, foe.combatant, surroundings))
    ) {
      continue;
    }
    const blocked = allies.filter((ally) => {
      const role = roleOf(ally);
      return (
        (role === "frontline" || role === "ranged") &&
        !ally.combatant.dead &&
        ally.targetId === foe.id &&
        distance(ally.position, foe.position) <= ally.combatant.equipment.mainHand.weapon.range &&
        blocksMe(ally.combatant, foe.combatant, undefined, surroundings)
      );
    }).length;
    if (
      blocked > 0 &&
      (best === undefined ||
        blocked > best.blocked ||
        (blocked === best.blocked &&
          best.foe.id !== targetId &&
          (foe.id === targetId || reach < best.reach)))
    ) {
      best = { foe, blocked, reach };
    }
  }
  return best?.foe.id;
}
