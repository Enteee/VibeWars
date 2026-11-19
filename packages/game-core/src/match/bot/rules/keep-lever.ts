import { distance } from "../../../vec2.js";
import { ELBOW_DISTANCE, NOTHING } from "./shared.js";
import type { BotRule } from "./types.js";

/** How often a bot set on a lever looks again for a route to it (#3532), in match seconds. */
export const LEVER_REROUTE_SECONDS = 1;

/**
 * A bot that set out to throw a lever (#3532, `levers` sets it out) keeps
 * walking to it, ahead of `fight`: it is not scored on gain again, so a
 * walk that leads toward the foes is not dropped halfway because the
 * teams closed in. It drops the lever once it is in combat (#460: it lost
 * health or began a cast at a foe) or a foe stands in its way, within
 * `ELBOW_DISTANCE`, once anyone throws it, once no route
 * leads there, or once its walk time at setting out plus
 * `LEVER_GIVE_UP_SECONDS` runs out.
 */
const keepLever: BotRule = {
  order: 99.7,
  name: "keep-lever",
  decide: ({ context, self, foes, cursor }) => {
    const held = cursor.lever;
    if (held === undefined) {
      return undefined;
    }
    const lever = context.objectives.levers.find((each) => each.targetId === held.targetId);
    let reachable = true;
    if (lever !== undefined && context.now - held.routedAt >= LEVER_REROUTE_SECONDS) {
      reachable = Number.isFinite(context.routeLength(lever.position, lever.layer));
      cursor.lever = { ...held, routedAt: context.now };
    }
    if (
      lever === undefined ||
      lever.flippedAt > held.flippedAt ||
      context.now >= held.until ||
      self.outOfCombatSeconds < context.now - held.since ||
      foes.some(
        (foe) =>
          foe.layer === self.layer && distance(foe.position, self.position) <= ELBOW_DISTANCE,
      ) ||
      !reachable
    ) {
      cursor.lever = undefined;
      return undefined;
    }
    return { ...NOTHING, attackTargetId: lever.targetId };
  },
};

export default keepLever;
