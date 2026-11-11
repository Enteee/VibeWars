import {
  buildLayeredNavGraph,
  createLayeredPathFinder,
  navGraphFor,
  type LayeredPathFinder,
  rampRims,
  type NavLayer,
  walkableAreas,
} from "@vibewars/game-core";

import { matchLayers, matchTeleports } from "./layers.js";
import type { MapData } from "./schema.js";

/**
 * `map`'s walls, deep water, floors, ramps and teleports as the path
 * finder reads them, every gate open and every teleport on (#3030).
 */
export function layeredFinder(map: MapData, clearance: number): LayeredPathFinder {
  const match = matchLayers(map);
  const rims = rampRims(match);
  const walkable = walkableAreas(match);
  const layers: NavLayer[] = match.walls.map((walls, layer) => ({
    walls: [...walls, ...(match.deepWater[layer] ?? [])],
    walkable: walkable[layer] ?? [],
    open: rims[layer] ?? [],
  }));
  const fields = matchTeleports(map);
  const graphs = buildLayeredNavGraph(
    layers,
    [],
    { width: map.width, height: map.height },
    clearance,
    fields.map(({ from }) => ({ layer: from.layer, polygon: from.area })),
  ).map((gated) => navGraphFor(gated, 0));
  const teleports = fields.map(({ from, to }) => ({
    from: from.layer,
    area: from.area,
    to: to.layer,
    exit: to.position,
  }));
  return createLayeredPathFinder(graphs, match.transitions, teleports);
}
