import { ghostId, onHill } from "../../ghost.js";
import { escort, NOTHING, onErrand, pressed, sentTo, type Errand } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * King of the Hill (#2582), no foe in spell range: while its team does
 * not hold the altar, the team's bot nearest to its Ghostly Hero, standing
 * off the altar and following nobody, tells it to follow (Space on it),
 * unless a human teammate is about to take it. The others escort at the
 * altar. A foe behind it on the way that leaves it be does not count (#3749).
 */
const pickUpGhost: BotRule = {
  order: 114,
  name: "pick-up-ghost",
  decide: (rule) => {
    const errand = ghostErrand(rule);
    return errand === undefined || pressed(onErrand(rule, errand.at)) ? undefined : errand.intent;
  },
};

/** What `pick-up-ghost` has the bot do with no foe about, and where that takes it. */
export function ghostErrand(rule: RuleContext): Errand | undefined {
  const { context, self } = rule;
  const { altar, altarLayer, altarHolder } = context.objectives;
  const team = self.combatant.team;
  const id = ghostId(team);
  const ghost = context.participants.find((participant) => participant.id === id);
  if (altar === undefined || ghost === undefined) {
    return undefined;
  }
  const fetches =
    altarHolder !== team &&
    !ghost.combatant.dead &&
    ghost.creature?.leaderId === undefined &&
    !onHill(altar, altarLayer, ghost) &&
    sentTo(context, ghost.position, ghost.id, true, false);
  return fetches
    ? { intent: { ...NOTHING, attackTargetId: ghost.id }, at: ghost }
    : { intent: escort(self, altar, altarLayer), at: { position: altar, layer: altarLayer } };
}

export default pickUpGhost;
