import { RANGE_SPELL } from "../../../distances.js";
import { preventsAttacks } from "../../../skills/status.js";
import { distance } from "../../../vec2.js";
import type { BotBreakable } from "../../behaviour.js";
import { strikePointOf } from "../../breakables.js";
import { carriedRelic } from "../../relics.js";
import { countsForTeam, type Participant } from "../../simulation.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/** How much shorter a wall's crumbling must make the team's way to the foes: more than a lever, as it costs time. */
export const BREAK_WORTH_UNITS = 500;

/** How many of a team's bots strike a wall. */
export const BREAKERS = 2;

/**
 * Breaking walls (#3140): with no foe near, the two bots of a team
 * nearest the standing wall whose crumbling shortens the team's way to
 * the foes most walk up and strike it with their weapons until it
 * falls, as a player clicking it does. Never a skill. A foe a striker
 * sees within spell range makes both drop it and fight. Just before
 * `fight`, as the target a bot fights is picked by distance alone: a
 * foe just behind the wall would otherwise be swung at through it, by
 * both teams, for good.
 */
const breakWall: BotRule = {
  order: 99.5,
  name: "break-wall",
  decide: ({ context, self, foes, allies }) => {
    if (context.objectives.breakables.length === 0) {
      return undefined;
    }
    const team = self.combatant.team;
    let best: BotBreakable | undefined;
    for (const wall of context.objectives.breakables) {
      const gain = wall.gain[team] ?? 0;
      if (gain >= BREAK_WORTH_UNITS && (best === undefined || gain > (best.gain[team] ?? 0))) {
        best = wall;
      }
    }
    if (best === undefined) {
      return undefined;
    }
    const { field } = best;
    const reach = (bot: Participant): number =>
      distance(bot.position, strikePointOf(field, bot.position, 0));
    const breakers = allies
      .filter(
        (ally) =>
          countsForTeam(ally) &&
          context.isBot(ally.id) &&
          !ally.combatant.dead &&
          carriedRelic(context.objectives.relics, ally.id) === undefined &&
          !preventsAttacks(ally.combatant.statuses.active),
      )
      .sort((a, b) => reach(a) - reach(b))
      .slice(0, BREAKERS);
    // A foe behind the wall itself is out of reach, however near: only
    // one a striker sees makes both drop it and fight.
    if (
      !breakers.includes(self) ||
      breakers.some((bot) =>
        foes.some(
          (foe) =>
            distance(foe.position, bot.position) <= RANGE_SPELL &&
            context.seesBetween(bot.position, foe.position, bot.layer, foe.layer),
        ),
      )
    ) {
      return undefined;
    }
    return { ...NOTHING, targetId: best.targetId, attackTargetId: best.targetId };
  },
};

export default breakWall;
