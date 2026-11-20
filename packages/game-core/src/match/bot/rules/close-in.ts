import { NOTHING, nearJammedGoal, nearestToWalk } from "./shared.js";
import type { BotRule } from "./types.js";

/** How long close-in keeps a foe it priced walks to before pricing again (#3353). */
export const REPRICE_SECONDS = 0.5;

/**
 * Nothing to fight in reach: walk to the foe nearest to walk to, onto its
 * layer (#3353), whatever the weapon. Maps spawn teams beyond spell range.
 * A choice that cost route searches is kept `REPRICE_SECONDS` while that
 * foe lives: a search per candidate per think is a tick's cost in 8v8.
 */
const closeIn: BotRule = {
  order: 120,
  name: "close-in",
  decide: ({ context, self, foes: all, cursor }) => {
    const foes = all.filter((foe) => !nearJammedGoal(context, foe.position, foe.layer));
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
  },
};

export default closeIn;
