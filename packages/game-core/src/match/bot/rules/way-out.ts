import { AREA_IN_THE_AREA } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { botUses } from "../skill-intent.js";
import { healthFraction, nearestLiving } from "./shared.js";
import type { BotRule } from "./types.js";

/** Below this share of its own health, a bot with a foe at hand steps away (#1930). */
const ESCAPE_FRACTION = 0.5;

/** A foe this near is at hand (#1930): GW1's "in the area". */
const ESCAPE_THREAT_UNITS = AREA_IN_THE_AREA;

/**
 * Hurt with a foe at hand, and nothing to heal it (#1930): step away to
 * the creature of its side farthest from that foe, one farther than it
 * stands, in reach now; never a walk towards one.
 */
const wayOut: BotRule = {
  order: 30,
  name: "way-out",
  decide: ({ context, self, bar, foes, use }) => {
    const threat = nearestLiving(self, foes);
    if (
      healthFraction(self) >= ESCAPE_FRACTION ||
      threat === undefined ||
      distance(threat.position, self.position) > ESCAPE_THREAT_UNITS
    ) {
      return undefined;
    }
    const fromThreat = (body: Participant): number => distance(body.position, threat.position);
    const havens = context.participants
      .filter(
        (other) =>
          !other.combatant.dead &&
          other.combatant.team === self.combatant.team &&
          other.creature !== undefined &&
          fromThreat(other) > fromThreat(self),
      )
      .sort((a, b) => fromThreat(b) - fromThreat(a));
    for (const skill of bar.filter((held) => botUses(held).includes("escape"))) {
      const haven = havens.find((other) => context.check(skill.id, other.id).ok);
      if (haven !== undefined) {
        return use(skill, haven.id);
      }
    }
    return undefined;
  },
};

export default wayOut;
