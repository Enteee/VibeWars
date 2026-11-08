import { RANGE_SPELL } from "../../../distances.js";
import { distance, type Vec2 } from "../../../vec2.js";
import { GATE_PLATE_REACH_UNITS } from "../../gates.js";
import { countsForTeam, type Participant } from "../../simulation.js";
import { NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Gates (#2691): with no foe near, the bot nearest its own team's plate
 * goes and stands on it, and holds its gate open for the team. After
 * `fight`, so a gate is never worth more than a foe in reach.
 */
const gates: BotRule = {
  order: 105,
  name: "gates",
  decide: ({ context, self, foes, allies }) => {
    if (
      context.objectives.gates.length === 0 ||
      foes.some((foe) => distance(foe.position, self.position) <= RANGE_SPELL)
    ) {
      return undefined;
    }
    const team = self.combatant.team;
    const bots = allies.filter((ally) => countsForTeam(ally) && context.isBot(ally.id));
    const mine = context.objectives.gates.find(
      (gate) => gate.team === team && nearestTo(gate.plate, bots) === self,
    );
    if (mine === undefined) {
      return undefined;
    }
    return distance(mine.plate, self.position) <= GATE_PLATE_REACH_UNITS
      ? NOTHING
      : { ...NOTHING, moveTo: mine.plate };
  },
};

/** The one of `bots` nearest to `point`, ties to the first. */
function nearestTo(point: Vec2, bots: readonly Participant[]): Participant | undefined {
  let best: Participant | undefined;
  for (const bot of bots) {
    if (best === undefined || distance(bot.position, point) < distance(best.position, point)) {
      best = bot;
    }
  }
  return best;
}

export default gates;
