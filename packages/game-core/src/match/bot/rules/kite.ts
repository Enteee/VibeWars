import { add, distance, normalize, scale, sub, ZERO } from "../../../vec2.js";
import { KITE_DISTANCE, NOTHING, nearestLiving, reachable } from "./shared.js";
import type { BotRule } from "./types.js";

/** A kite lasts at most this long (#2545). */
export const KITE_SECONDS = 2;

/**
 * After one, it does not kite again for this long: at equal speed a foe
 * on its heels stays there, and backing off would never end.
 */
export const KITE_REST_SECONDS = 3;

/**
 * A ranged bot or a healer with a foe at its elbow (#2545): it steps
 * away, to half as far again as it lets a foe come, bent toward its own
 * team. A spirit never walks, so it is never one to step away from.
 * Cornered, or resting from its last kite, it stays and fights.
 */
const kite: BotRule = {
  order: 45,
  name: "kite",
  decide: ({ context, self, foes, role, teamCentroid, mayKite }) => {
    if ((role !== "ranged" && role !== "healer") || !mayKite) {
      return undefined;
    }
    const foe = nearestLiving(
      self,
      foes.filter((other) => other.creature?.kind !== "spirit"),
    );
    if (foe === undefined || distance(foe.position, self.position) > KITE_DISTANCE) {
      return undefined;
    }
    const away = normalize(sub(self.position, foe.position));
    const home = teamCentroid === undefined ? ZERO : normalize(sub(teamCentroid, self.position));
    const bent = normalize(add(away, home));
    // Its team straight behind the foe: away it goes, as it would alone.
    const way = bent === ZERO ? away : bent;
    const spot = reachable(context, add(foe.position, scale(way, 1.5 * KITE_DISTANCE)));
    return spot === undefined ? undefined : { ...NOTHING, moveTo: spot };
  },
};

export default kite;
