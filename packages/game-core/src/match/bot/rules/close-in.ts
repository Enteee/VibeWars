import { distance } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import { holdPoint } from "../plan.js";
import { NOTHING, REGROUP_JOINED, nearJammedGoal, nearestToWalk } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** How long close-in keeps a foe it priced walks to before pricing again (#3353). */
export const REPRICE_SECONDS = 0.5;

/**
 * Nothing to fight in reach: walk to the foe nearest to walk to, onto its
 * layer (#3353), whatever the weapon. Maps spawn teams beyond spell range.
 * A choice that cost route searches is kept `REPRICE_SECONDS` while that
 * foe lives: a search per candidate per think is a tick's cost in 8v8.
 * While its team's plan is `hold` (#3831), it walks to its hold spot
 * instead, and stands once within `REGROUP_JOINED` of the hold point.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: (rule) => {
    const { context, self, foes: all, cursor } = rule;
    const held = rule.plan === "hold" ? hold(rule) : undefined;
    if (held !== undefined) return held;
    const foes = all.filter((foe) => !nearJammedGoal(context, foe.position, foe.layer));
    const kept = cursor.walkFoe;
    let foe =
      kept !== undefined && context.now - kept.pricedAt < REPRICE_SECONDS
        ? foes.find((other) => other.id === kept.id)
        : undefined;
    if (foe === undefined) {
      const searched = { any: false };
      foe = nearestToWalk(self, foes, (to, layer) => {
        searched.any = true;
        return context.routeLength(to, layer);
      });
      cursor.walkFoe =
        searched.any && foe !== undefined ? { id: foe.id, pricedAt: context.now } : undefined;
    }
    return foe === undefined
      ? undefined
      : { ...NOTHING, moveTo: foe.position, moveToLayer: foe.layer };
  },
};

/**
 * Where a holding bot goes (#3831): to its spot, and nowhere once near
 * the hold point. Its hold point is placed once per foe team it faces.
 * `undefined`, so it pushes, where its team cannot hold.
 */
function hold({ context, self, foes, cursor }: RuleContext): BehaviourIntent | undefined {
  const foeTeam = cursor.front ?? foes.find((foe) => foe.creature === undefined)?.combatant.team;
  if (foeTeam === undefined) return undefined;
  if (cursor.holdPoint?.foeTeam !== foeTeam) {
    cursor.holdPoint = { foeTeam, at: holdPoint(context, self, foeTeam) };
  }
  const at = cursor.holdPoint.at;
  if (at === undefined) return undefined;
  return self.layer === at.layer && distance(self.position, at.centre) <= REGROUP_JOINED
    ? { ...NOTHING, targetId: self.targetId }
    : { ...NOTHING, moveTo: at.spot, moveToLayer: at.layer };
}

export default closeIn;
