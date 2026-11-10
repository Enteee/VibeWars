import { distance } from "../../../vec2.js";
import { onCapturePoint } from "../../capture-points.js";
import { zoneExit } from "./leave-zone.js";
import type { BotRule } from "./types.js";

/**
 * Harmful ground in a fight (#3026): a bot in it with a foe in reach
 * steps out to the nearest spot outside and fights from there, rather
 * than burn where it stands: a spot no farther from its foe than it is
 * now, or that its weapon still reaches from. With none, as a melee bot
 * whose foe stands deep in the fire, it fights in it, or it would step
 * out and walk back in on every think. On a shrine its team has not filled,
 * it stays, as `shrines` would walk it back on. Before the fighting rules,
 * which answer whenever a foe is in reach; `zoneExit` keeps the rest of
 * `leave-zone`'s holds.
 */
const clearGround: BotRule = {
  order: 38,
  name: "clear-ground",
  decide: (rule) => {
    const { context, self, foes, targetId } = rule;
    const target = foes.find((foe) => foe.id === targetId);
    if (
      target === undefined ||
      context.objectives.capturePoints.some(
        (point) =>
          onCapturePoint(point, self) &&
          (point.owner !== self.combatant.team || point.progress < 1),
      )
    ) {
      return undefined;
    }
    const reach = Math.max(
      distance(self.position, target.position),
      self.combatant.equipment.mainHand.weapon.range,
    );
    return zoneExit(rule, (exit) => distance(exit, target.position) <= reach);
  },
};

export default clearGround;
