import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import {
  atElbow,
  FALL_BACK_FAR,
  FALL_BACK_NEAR,
  FINISH_FRACTION,
  healthFraction,
  NOTHING,
} from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * A caster or healer with a melee foe at its elbow (#4151) walks to its
 * nearest living frontliner, bot or human, rather than stand and fight
 * alone: it brings the diver to the one who peels it (#4141). It does
 * not outrun the foe, so the walk is bounded: it stops within
 * `FALL_BACK_NEAR` of the frontliner, and never starts for one farther
 * than `FALL_BACK_FAR`. Then `position` has it stand and fight.
 *
 * It finishes an elbow foe below `FINISH_FRACTION` instead, and never
 * starts a walk mid-cast, so it never cancels its own cast (#279).
 */
const fallBack: BotRule = {
  order: 97.5,
  name: "fall-back",
  decide: (rule) => {
    const { self, foes } = rule;
    if (rule.role !== "ranged" && rule.role !== "healer") {
      return undefined;
    }
    if (self.combatant.cast.activeCast !== undefined) {
      return undefined;
    }
    const elbow = foes.filter((foe) => atElbow(self, foe));
    if (elbow.length === 0 || elbow.some((foe) => healthFraction(foe) < FINISH_FRACTION)) {
      return undefined;
    }
    const mate = nearestFrontliner(rule);
    if (mate === undefined) {
      return undefined;
    }
    const away = distance(mate.position, self.position);
    if (away <= FALL_BACK_NEAR || away > FALL_BACK_FAR) {
      return undefined;
    }
    return { ...NOTHING, targetId: rule.targetId, moveTo: mate.position, moveToLayer: mate.layer };
  },
};

/** Its nearest living frontline teammate, ties by simulation order. */
function nearestFrontliner({ self, allies, roleOf }: RuleContext): Participant | undefined {
  let best: Participant | undefined;
  let bestAway = Number.POSITIVE_INFINITY;
  for (const ally of allies) {
    if (ally.id === self.id || ally.combatant.dead || roleOf(ally) !== "frontline") {
      continue;
    }
    const away = distance(ally.position, self.position);
    if (away < bestAway) {
      best = ally;
      bestAway = away;
    }
  }
  return best;
}

export default fallBack;
