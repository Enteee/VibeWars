import { RANGE_SPELL } from "../../../distances.js";
import { getSkill } from "../../../skills/catalog.js";
import { raisedMaxHealth } from "../../../skills/tick.js";
import type { Skill } from "../../../skills/types.js";
import { distance, ZERO, type Vec2 } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import type { BehaviourContext } from "../../behaviour.js";
import { carriedRelic } from "../../relics.js";
import type { Participant } from "../../simulation.js";
import { summonAura } from "../skill-intent.js";

export const NOTHING: BehaviourIntent = {
  moveDirection: ZERO,
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
  applyStatuses: [],
  endUpkeep: undefined,
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

/**
 * Whether a spirit from `skill` still stands that a new one would only
 * replace (#2491): within its aura, any of `self`'s side's, as the
 * simulation ends them; with no aura, its own. Recovery outlives its
 * recharge, and two Ritualists would otherwise take turns replacing each
 * other's. `false` for a skill that summons no spirit.
 */
export function spiritUp(context: BehaviourContext, self: Participant, skill: Skill): boolean {
  if (!skill.effects.some((effect) => effect.kind === "summon")) {
    return false;
  }
  const radius = summonAura(skill)?.radius;
  return context.participants.some(
    ({ combatant, creature, position }) =>
      creature?.kind === "spirit" &&
      creature.skillId === skill.id &&
      !combatant.dead &&
      (radius === undefined
        ? creature.ownerId === self.id
        : combatant.team === self.combatant.team && distance(position, self.position) <= radius),
  );
}

/**
 * Whether `self` is the one of its team to go to `point` for an
 * objective (#2581): the living teammate with empty hands nearest to it,
 * ties to simulation order, a bot or, when `humans`, a human. A human
 * nearer, no bot goes.
 */
export function sentTo(context: BehaviourContext, point: Vec2, humans: boolean): boolean {
  const team = context.self.combatant.team;
  let best: Participant | undefined;
  let bestDistance = Infinity;
  for (const mate of context.participants) {
    if (
      mate.combatant.team !== team ||
      mate.combatant.dead ||
      mate.creature !== undefined ||
      (!humans && !context.isBot(mate.id)) ||
      carriedRelic(context.objectives.relics, mate.id) !== undefined
    ) {
      continue;
    }
    const away = distance(mate.position, point);
    if (away < bestDistance) {
      best = mate;
      bestDistance = away;
    }
  }
  return best?.id === context.self.id;
}

/** An escort (#2581): to `altar`, then waiting within half spell range of it. */
export function escort(self: Participant, altar: Vec2): BehaviourIntent {
  return distance(self.position, altar) <= RANGE_SPELL / 2
    ? NOTHING
    : { ...NOTHING, moveTo: altar };
}
