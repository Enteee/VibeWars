import { createLayeredPathFinder, type LayeredPathFinder } from "@vibewars/game-core";

import { matchLayers, matchTeleports } from "./layers.js";
import { mapNavGraphs } from "./nav-graphs.js";
import type { MapData } from "./schema.js";

/**
 * `map`'s walls, deep water, floors, ramps and teleports as the path
 * finder reads them, every gate open and every teleport on (#3030); with
 * `harmful`, round harmful zones as the match's routes go (#3521).
 */
export function layeredFinder(
  map: MapData,
  clearance: number,
  options: { readonly harmful?: boolean } = {},
): LayeredPathFinder {
  const teleports = matchTeleports(map).map(({ from, to }) => ({
    from: from.layer,
    area: from.area,
    to: to.layer,
    exit: to.position,
  }));
  return createLayeredPathFinder(
    mapNavGraphs(map, clearance, options),
    matchLayers(map).transitions,
    teleports,
  );
}
