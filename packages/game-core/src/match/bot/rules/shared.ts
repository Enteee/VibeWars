import { getSkill } from "../../../skills/catalog.js";
import { raisedMaxHealth } from "../../../skills/tick.js";
import type { Skill } from "../../../skills/types.js";
import { distance, ZERO } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";

export const NOTHING: BehaviourIntent = {
  moveDirection: ZERO,
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
  applyStatuses: [],
};

/** Below this share of its health, an ally is worth a heal. */
export const HURT_FRACTION = 0.6;

export function nearestLiving(
  self: Participant,
  foes: readonly Participant[],
): Participant | undefined {
  let best: Participant | undefined;
  for (const foe of foes) {
    if (
      best === undefined ||
      distance(foe.position, self.position) < distance(best.position, self.position)
    ) {
      best = foe;
    }
  }
  return best;
}

/** The skills on `participant`'s bar, its empty slots left out. */
export function skillsOf(participant: Participant): Skill[] {
  return participant.skillBar.flatMap((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return skill === undefined ? [] : [skill];
  });
}

export function healthFraction(participant: Participant): number {
  const maxHealth = raisedMaxHealth(participant.combatant);
  return maxHealth > 0 ? participant.combatant.health / maxHealth : 0;
}
