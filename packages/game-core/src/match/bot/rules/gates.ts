import { distance } from "../../../vec2.js";
import { GATE_PLATE_REACH_UNITS } from "../../gates.js";
import { countsForTeam } from "../../simulation.js";
import { nearestTo, NOTHING, pressed } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Gates (#2691): with no foe near, the bot nearest its own team's plate
 * goes and stands on it, and holds its gate open for the team. After
 * `fight`, so a gate is never worth more than a foe in reach.
 */
const gates: BotRule = {
  order: 105,
  name: "gates",
  decide: (rule) => {
    const { context, self, allies } = rule;
    if (context.objectives.gates.length === 0 || pressed(rule)) {
      return undefined;
    }
    const team = self.combatant.team;
    const bots = allies.filter((ally) => countsForTeam(ally) && context.isBot(ally.id));
    const mine = context.objectives.gates
      .map(({ opener }) => opener)
      .find(
        (opener) =>
          opener.kind === "plate" && opener.team === team && nearestTo(opener.plate, bots) === self,
      );
    if (mine?.kind !== "plate") {
      return undefined;
    }
    return distance(mine.plate, self.position) <= GATE_PLATE_REACH_UNITS
      ? NOTHING
      : { ...NOTHING, moveTo: mine.plate };
  },
};

export default gates;
