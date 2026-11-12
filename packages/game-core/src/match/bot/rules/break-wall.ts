import { RANGE_SPELL } from "../../../distances.js";
import { preventsAttacks } from "../../../skills/status.js";
import { distance } from "../../../vec2.js";
import type { BotBreakable } from "../../behaviour.js";
import { strikePointOf } from "../../breakables.js";
import { carriedRelic } from "../../relics.js";
import { countsForTeam, type Participant } from "../../simulation.js";
import { NOTHING, shotAt } from "./shared.js";
import type { BotRule } from "./types.js";

/** How much shorter a wall's fall must make the team's way to the foes: more than a lever's, as felling it takes time. */
export const BREAK_WORTH_UNITS = 500;

/** How many of a team's bots strike one wall. */
export const BREAKERS = 2;

/** How far `body` stands from `wall`'s nearest point. */
function reachOf(wall: BotBreakable, body: Participant): number {
  return distance(body.position, strikePointOf(wall.field, body.position, 0));
}

/**
 * Break a wall (#3140): with no foe near, the two bots of its team
 * nearest the standing breakable wall whose fall shortens the team's way
 * to the foes most walk up to it and strike it with their weapons until
 * it crumbles, as a player clicking it does. Never a skill: only blows.
 * A bot that cannot swing (a relic in its hands, or a status that stops
 * attacks) is no breaker, and the next nearest goes. Only a foe it
 * sees counts: one across the wall is no fight yet. Just before `fight`,
 * which would otherwise chase that foe into the wall for good.
 */
const breakWall: BotRule = {
  order: 99.5,
  name: "break-wall",
  decide: (rule) => {
    const { context, self, foes, allies } = rule;
    // A foe in reach it can see, or one shooting at it from further (#3150):
    // one behind the wall is no fight yet.
    const threatens = (breaker: Participant): boolean =>
      foes.some(
        (foe) =>
          distance(foe.position, breaker.position) <= RANGE_SPELL &&
          context.seesBetween(breaker.position, foe.position, breaker.layer, foe.layer),
      ) || shotAt(rule, breaker);
    if (context.objectives.breakables.length === 0 || threatens(self)) {
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
    const wall = best;
    const breakers = allies
      .filter(
        (ally) =>
          countsForTeam(ally) &&
          context.isBot(ally.id) &&
          !preventsAttacks(ally.combatant.statuses.active) &&
          carriedRelic(context.objectives.relics, ally.id) === undefined,
      )
      .sort((a, b) => reachOf(wall, a) - reachOf(wall, b))
      .slice(0, BREAKERS);
    // A foe near either striker: both drop the wall and fight.
    if (!breakers.includes(self) || breakers.some(threatens)) {
      return undefined;
    }
    return { ...NOTHING, attackTargetId: wall.targetId };
  },
};

export default breakWall;
