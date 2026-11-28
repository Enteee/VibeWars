import { isAttacking } from "../../skills/attacking.js";
import type { Skill } from "../../skills/types.js";
import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";
import { diverOn } from "./peel.js";
import { blindsUser } from "./skill-intent.js";

/**
 * Whether `skill` blinds the foe it is cast at (#4239): Blinding Flash.
 * Only a top-level Blind on the target counts, not one inside an `if`
 * (Steam's, on a burning foe), and not a skill that blinds its user too
 * (Signet of Midnight, which #2132's `blindWorth` keeps for the team's
 * target).
 */
export function blindStatus(skill: Skill): boolean {
  return (
    skill.target === "single-enemy" &&
    !blindsUser(skill) &&
    skill.effects.some(
      (effect) =>
        effect.kind === "apply-status" && effect.on === undefined && effect.statusId === "blind",
    )
  );
}

/**
 * The foe to cast `skill` at instead of the team's target (#4239): one
 * that is attacking, not yet blind, within `range` of `self` and allowed
 * by `mayCast`. The one diving `allies`' backline (`diverOn`) first, then
 * one attacking any ally, then any attacker, each nearest `self` first.
 * `undefined` for a skill that is no blind, or no such foe.
 */
export function blindTarget(
  skill: Skill,
  self: Participant,
  allies: readonly Participant[],
  foes: readonly Participant[],
  range: number,
  mayCast: (foeId: string) => boolean,
): string | undefined {
  if (!blindStatus(skill)) {
    return undefined;
  }
  const attackers = foes
    .filter(
      (foe) =>
        isAttacking(foe.combatant) &&
        !foe.combatant.statuses.has("blind") &&
        distance(foe.position, self.position) <= range &&
        mayCast(foe.id),
    )
    .sort((a, b) => distance(a.position, self.position) - distance(b.position, self.position));
  const diver = diverOn(allies, attackers);
  if (diver !== undefined) {
    return diver.id;
  }
  const onAlly = attackers.find((foe) =>
    allies.some((ally) => ally.id === foe.targetId && !ally.combatant.dead),
  );
  return (onAlly ?? attackers[0])?.id;
}
