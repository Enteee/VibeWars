import {
  buildLayeredNavGraph,
  navGraphFor,
  rampIsLinked,
  rampRims,
  type NavGraph,
  type NavLayer,
  walkableAreas,
} from "@vibewars/game-core";

import { matchLayers, matchTeleports } from "./layers.js";
import type { MapData } from "./schema.js";

/**
 * `map`'s walls, deep water, floors and ramps as the path finder reads
 * them, one graph a layer, every gate open, for a body of `clearance`.
 */
export function mapNavGraphs(map: MapData, clearance: number): readonly NavGraph[] {
  const match = matchLayers(map);
  const rims = rampRims(match);
  const walkable = walkableAreas(match);
  const layers: NavLayer[] = match.walls.map((walls, layer) => ({
    walls: [...walls, ...(match.deepWater[layer] ?? [])],
    walkable: walkable[layer] ?? [],
    open: rims[layer] ?? [],
  }));
  return buildLayeredNavGraph(
    layers,
    [],
    { width: map.width, height: map.height },
    clearance,
    matchTeleports(map).map(({ from }) => ({ layer: from.layer, polygon: from.area })),
  ).map((gated) => navGraphFor(gated, 0));
}

/**
 * Each of `map`'s transitions that joins no layers, because a body of
 * `clearance` does not fit on both at its centre (#3177), as a line
 * saying so: paths would skip it, and nobody could tell why. A map with
 * no transitions builds no graphs: most maps are one layer.
 */
export function unlinkedTransitions(map: MapData, clearance: number): string[] {
  if (map.transitions.length === 0) return [];
  const graphs = mapNavGraphs(map, clearance);
  const match = matchLayers(map);
  return map.transitions.flatMap((transition, index) => {
    const nav = match.transitions[index];
    return nav === undefined || rampIsLinked(graphs, nav)
      ? []
      : [
          `transitions.${String(index)}: transition ${transition.id} has no spot at its centre where a body fits on both layer ${String(transition.from)} and layer ${String(transition.to)}`,
        ];
  });
}
