import type { BotLever } from "../../behaviour.js";
import { distance } from "../../../vec2.js";
import { countsForTeam } from "../../simulation.js";
import { nearJammedGoal, nearestTo, NOTHING, pressed } from "./shared.js";
import type { BotRule } from "./types.js";

/** How much cheaper a lever must make the team's way to the foes to walk, in units at base pace (#3521), to be worth the walk. */
export const LEVER_WORTH_UNITS = 300;

/** A lever anyone threw this recently is left alone, so two teams' bots don't strobe a gate. */
export const LEVER_SETTLE_SECONDS = 6;

/** A bot set on a lever gives up this long after its walk there should have ended (#3532). */
export const LEVER_GIVE_UP_SECONDS = 5;

/**
 * Levers (#3138): with no foe near, the bot of its team nearest the lever
 * that shortens the team's way to the foes most walks to it and throws it,
 * as a player clicking it does. Opening a gate and turning on a teleport
 * both count: either way the route gets shorter. Of two levers that win
 * the same, the team takes the one nearer its bots (#3532): on a mirrored
 * map, each team its own. After `gates`, so a foe in reach and a team's
 * own plate both come first.
 *
 * Setting out, it commits (#3532): `keep-lever` walks it on from then,
 * and no other bot of its team takes that lever while it does.
 */
const levers: BotRule = {
  order: 106,
  name: "levers",
  decide: (rule) => {
    const { context, self, allies, cursor } = rule;
    if (context.objectives.levers.length === 0 || pressed(rule)) {
      return undefined;
    }
    const team = self.combatant.team;
    const bots = allies.filter((ally) => countsForTeam(ally) && context.isBot(ally.id));
    /** How far `lever` is from the team's bot nearest it. */
    const reach = (lever: BotLever): number => {
      const nearest = nearestTo(lever.position, bots);
      return nearest === undefined
        ? Number.POSITIVE_INFINITY
        : distance(nearest.position, lever.position);
    };
    let best: BotLever | undefined;
    for (const lever of context.objectives.levers) {
      const gain = lever.gain[team] ?? 0;
      const bestGain = best?.gain[team] ?? 0;
      if (
        gain >= LEVER_WORTH_UNITS &&
        context.now >= lever.readyAt &&
        context.now - lever.flippedAt >= LEVER_SETTLE_SECONDS &&
        context.leverHolder(lever.targetId) === undefined &&
        !nearJammedGoal(context, lever.position, lever.layer) &&
        (best === undefined || gain > bestGain || (gain === bestGain && reach(lever) < reach(best)))
      ) {
        best = lever;
      }
    }
    if (best === undefined || nearestTo(best.position, bots) !== self) {
      return undefined;
    }
    const walk = context.routeLength(best.position, best.layer);
    const speed = context.stepUnits / context.dt;
    if (!Number.isFinite(walk)) {
      return undefined;
    }
    cursor.lever = {
      targetId: best.targetId,
      flippedAt: best.flippedAt,
      since: context.now,
      until: context.now + (speed > 0 ? walk / speed : 0) + LEVER_GIVE_UP_SECONDS,
      routedAt: context.now,
    };
    return { ...NOTHING, attackTargetId: best.targetId };
  },
};

export default levers;
