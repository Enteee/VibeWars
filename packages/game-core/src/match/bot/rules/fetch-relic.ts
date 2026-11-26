import { lyingPoint } from "../../carried.js";
import { carriesRelic, relicId } from "../../relics.js";
import { escort, NOTHING, onErrand, pressed, relicGoal, sentTo, type Errand } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/**
 * Relic Run (#2581), no foe in spell range: the team's bot nearest to a
 * relic on the ground that it sends home returns it; else the one nearest
 * to the relic it carries, lying at its spawn or on the ground, fetches
 * it, unless a human teammate is about to take it up. Both by GW1's
 * Interact. The others escort: they walk to the altar and wait there or,
 * carrying the foe's relic (#2695), go where it lies, and home with it.
 * A foe behind it on the way that leaves it be does not count (#3749).
 */
const fetchRelic: BotRule = {
  order: 116,
  name: "fetch-relic",
  decide: (rule) => {
    const errand = relicErrand(rule);
    return errand === undefined || pressed(onErrand(rule, errand.at)) ? undefined : errand.intent;
  },
};

/** What `fetch-relic` has the bot do with no foe about, and where that takes it. */
export function relicErrand(rule: RuleContext): Errand | undefined {
  const { context, self } = rule;
  const { relics, relicSpawns, relicCarry } = context.objectives;
  const goal = relicGoal(context, self);
  if (goal === undefined || relics.length === 0) {
    return undefined;
  }
  const team = self.combatant.team;
  for (const relic of relics) {
    if (
      !carriesRelic(relicCarry, relic.team, team) &&
      relic.place.kind === "ground" &&
      sentTo(context, relic.place.position, relicId(relic.team), false, false)
    ) {
      return { intent: { ...NOTHING, attackTargetId: relicId(relic.team) }, at: relic.place };
    }
  }
  for (const relic of relics) {
    if (!carriesRelic(relicCarry, relic.team, team)) {
      continue;
    }
    const lying = lyingPoint(relicSpawns, relic);
    if (lying !== undefined && sentTo(context, lying.position, relicId(relic.team), true, true)) {
      return { intent: { ...NOTHING, attackTargetId: relicId(relic.team) }, at: lying };
    }
    if (relicCarry === "foe" && lying !== undefined) {
      return { intent: escort(self, lying.position, lying.layer), at: lying };
    }
  }
  return { intent: escort(self, goal.position, goal.layer), at: goal };
}

export default fetchRelic;
