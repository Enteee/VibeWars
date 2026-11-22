import { distance } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { flankParty, placedFlank, placedHold, planFoeTeam, planPhase } from "../plan.js";
import type { BotRole } from "../role.js";
import {
  NOTHING,
  POSITION_SLACK,
  REGROUP_JOINED,
  nearJammedGoal,
  nearestToWalk,
} from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** How long close-in keeps a foe it priced walks to before pricing again (#3353). */
export const REPRICE_SECONDS = 0.5;

/**
 * Nothing to fight in reach: walk to the foe nearest to walk to, onto its
 * layer (#3353), whatever the weapon. Maps spawn teams beyond spell range.
 * A choice that cost route searches is kept `REPRICE_SECONDS` while that
 * foe lives: a search per candidate per think is a tick's cost in 8v8.
 * While its team's plan is `hold` (#3831), it walks to its hold spot
 * instead, and stands once within `POSITION_SLACK` of it. While it is
 * `flank` (#3832), a bot of the flank party swings round to its flank
 * waypoint first, then makes for the foes' backline.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: (rule) => {
    const { context, self, foes: all, cursor } = rule;
    const held = rule.plan === "hold" ? hold(rule) : undefined;
    if (held !== undefined) return held;
    const flanked = rule.plan === "flank" ? flank(rule) : undefined;
    if (flanked !== undefined) return flanked;
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
 * Where a holding bot goes (#3831): to its spot, and nowhere once there.
 * Its hold point is placed once per foe team it faces; where it cannot
 * hold, once per plan phase, so one bad moment does not last the match.
 * `undefined`, so it pushes, where its team cannot hold.
 */
function hold({ context, self, foes, cursor }: RuleContext): BehaviourIntent | undefined {
  const foeTeam = planFoeTeam(cursor, foes);
  if (foeTeam === undefined) return undefined;
  const at = placedHold(context, self, cursor, foeTeam);
  if (at === undefined) return undefined;
  return self.layer === at.layer && distance(self.position, at.spot) <= POSITION_SLACK
    ? { ...NOTHING, targetId: self.targetId }
    : { ...NOTHING, moveTo: at.spot, moveToLayer: at.layer };
}

/** Whom a flanker makes for once round (#3832): the foes' healers, else their ranged, else anyone. */
const BACKLINE: readonly BotRole[] = ["healer", "ranged"];

/**
 * Where a flanker goes (#3832): to its flank waypoint, until within
 * `REGROUP_JOINED` of it, then to the nearest foe healer, else ranged,
 * else any foe. The waypoint is placed once per phase and foe team.
 * `undefined`, so it pushes, outside the flank party, or where its team
 * has no flank waypoint.
 */
function flank({ context, self, foes, cursor, roleOf }: RuleContext): BehaviourIntent | undefined {
  const phase = planPhase(context.now);
  if (!flankParty(context, self, phase)) return undefined;
  if (cursor.flankReached !== phase) {
    const foeTeam = planFoeTeam(cursor, foes);
    if (foeTeam === undefined) return undefined;
    const at = placedFlank(context, self, cursor, foeTeam);
    if (at === undefined) return undefined;
    if (self.layer !== at.layer || distance(self.position, at.point) > REGROUP_JOINED) {
      return { ...NOTHING, moveTo: at.point, moveToLayer: at.layer };
    }
    cursor.flankReached = phase;
  }
  const players = foes.filter((foe) => foe.creature === undefined);
  const pool =
    BACKLINE.map((role) => players.filter((foe) => roleOf(foe) === role)).find(
      (each) => each.length > 0,
    ) ?? foes;
  let foe: Participant | undefined;
  for (const each of pool) {
    if (
      foe === undefined ||
      distance(self.position, each.position) < distance(self.position, foe.position)
    ) {
      foe = each;
    }
  }
  return foe === undefined
    ? undefined
    : { ...NOTHING, moveTo: foe.position, moveToLayer: foe.layer };
}

export default closeIn;
