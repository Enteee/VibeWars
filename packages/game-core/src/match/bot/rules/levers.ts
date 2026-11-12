import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import type { BotLever } from "../../behaviour.js";
import { countsForTeam } from "../../simulation.js";
import { NOTHING, nearestTo } from "./shared.js";
import type { BotRule } from "./types.js";

/** How much shorter a lever must make the team's way to the foes to be worth the walk. */
export const LEVER_WORTH_UNITS = 300;

/** A lever anyone threw this recently is left alone, so two teams' bots don't strobe a gate. */
export const LEVER_SETTLE_SECONDS = 6;

/**
 * Levers (#3138): with no foe near, the bot of its team nearest the lever
 * that shortens the team's way to the foes most walks to it and throws it,
 * as a player clicking it does. Opening a gate and turning on a teleport
 * both count: either way the route gets shorter. After `gates`, so a foe
 * in reach and a team's own plate both come first.
 */
const levers: BotRule = {
  order: 106,
  name: "levers",
  decide: ({ context, self, foes, allies }) => {
    if (
      context.objectives.levers.length === 0 ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    let best: BotLever | undefined;
    for (const lever of context.objectives.levers) {
      const gain = lever.gain[team] ?? 0;
      if (
        gain >= LEVER_WORTH_UNITS &&
        context.now >= lever.readyAt &&
        context.now - lever.flippedAt >= LEVER_SETTLE_SECONDS &&
        (best === undefined || gain > (best.gain[team] ?? 0))
      ) {
        best = lever;
      }
    }
    const bots = allies.filter((ally) => countsForTeam(ally) && context.isBot(ally.id));
    if (best === undefined || nearestTo(best.position, bots) !== self) {
      return undefined;
    }
    return { ...NOTHING, attackTargetId: best.targetId };
  },
};

export default levers;
