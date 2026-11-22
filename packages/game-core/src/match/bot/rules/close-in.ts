import { distance } from "../../../vec2.js";
import type { BehaviourIntent } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { flankParty, flankWaypoint, holdPoint, planPhase } from "../plan.js";
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
 * `flank` and it is in the flank party (#3832), it walks to the flank
 * waypoint first, then at the foes' backline.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: (rule) => {
    const held = rule.plan === "hold" ? hold(rule) : undefined;
    if (held !== undefined) return held;
    const flanked = rule.plan === "flank" ? flank(rule) : undefined;
    if (flanked !== undefined) return flanked;
    return walkAt(rule, rule.foes);
  },
};

/** Walk to the foe among `among` nearest to walk to, its price kept a while (#3353). */
function walkAt(
  { context, self, cursor }: RuleContext,
  among: readonly Participant[],
): BehaviourIntent | undefined {
  const foes = among.filter((foe) => !nearJammedGoal(context, foe.position, foe.layer));
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
}

/** The foe team it faces: the one it fights, else the first a player of which it sees. */
function foeTeamOf({ foes, cursor }: RuleContext): number | undefined {
  return cursor.front ?? foes.find((foe) => foe.creature === undefined)?.combatant.team;
}

/**
 * Where a holding bot goes (#3831): to its spot, and nowhere once there.
 * Its hold point is placed once per foe team it faces; where it cannot
 * hold, once per plan phase, so one bad moment does not last the match.
 * `undefined`, so it pushes, where its team cannot hold.
 */
function hold(rule: RuleContext): BehaviourIntent | undefined {
  const { context, self, cursor } = rule;
  const foeTeam = foeTeamOf(rule);
  if (foeTeam === undefined) return undefined;
  const phase = planPhase(context.now);
  const kept = cursor.holdPoint;
  if (kept?.foeTeam !== foeTeam || (kept.at === undefined && kept.phase !== phase)) {
    cursor.holdPoint = { foeTeam, at: holdPoint(context, self, foeTeam), phase };
  }
  const at = cursor.holdPoint?.at;
  if (at === undefined) return undefined;
  return self.layer === at.layer && distance(self.position, at.spot) <= POSITION_SLACK
    ? { ...NOTHING, targetId: self.targetId }
    : { ...NOTHING, moveTo: at.spot, moveToLayer: at.layer };
}

/**
 * Where a flanker goes (#3832): to its party's waypoint, placed once per
 * phase and foe team, then, once within `REGROUP_JOINED` of it, at the
 * nearest foe healer, else ranged, else any. `undefined`, so it pushes,
 * when it is not in the party or the party cannot flank.
 */
function flank(rule: RuleContext): BehaviourIntent | undefined {
  const { context, self, cursor, foes, roleOf } = rule;
  const phase = planPhase(context.now);
  if (cursor.flankReached !== phase) {
    if (!flankParty(context, self, phase)) return undefined;
    const foeTeam = foeTeamOf(rule);
    if (foeTeam === undefined) return undefined;
    const kept = cursor.flankPoint;
    if (kept?.foeTeam !== foeTeam || kept.phase !== phase) {
      cursor.flankPoint = { foeTeam, at: flankWaypoint(context, self, foeTeam), phase };
    }
    const at = cursor.flankPoint?.at;
    if (at === undefined) return undefined;
    if (self.layer !== at.layer || distance(self.position, at.point) > REGROUP_JOINED) {
      return { ...NOTHING, moveTo: at.point, moveToLayer: at.layer };
    }
    cursor.flankReached = phase;
  }
  const players = foes.filter((foe) => foe.creature === undefined);
  for (const role of ["healer", "ranged"] as const) {
    const backline = players.filter((foe) => roleOf(foe) === role);
    if (backline.length > 0) return walkAt(rule, backline);
  }
  return walkAt(rule, foes);
}

export default closeIn;
