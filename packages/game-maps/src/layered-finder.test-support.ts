import {
  buildLayeredNavGraph,
  createLayeredPathFinder,
  navGraphFor,
  type LayeredPathFinder,
  rampRims,
  type NavLayer,
  walkableAreas,
} from "@vibewars/game-core";

import { matchLayers } from "./layers.js";
import type { MapData } from "./schema.js";

/** `map`'s walls, deep water, floors and ramps as the path finder reads them, every gate open. */
export function layeredFinder(map: MapData, clearance: number): LayeredPathFinder {
  const match = matchLayers(map);
  const rims = rampRims(match);
  const walkable = walkableAreas(match);
  const layers: NavLayer[] = match.walls.map((walls, layer) => ({
    walls: [...walls, ...(match.deepWater[layer] ?? [])],
    walkable: walkable[layer] ?? [],
    open: rims[layer] ?? [],
  }));
  const graphs = buildLayeredNavGraph(
    layers,
    [],
    { width: map.width, height: map.height },
    clearance,
  ).map((gated) => navGraphFor(gated, 0));
  return createLayeredPathFinder(graphs, match.transitions);
}
