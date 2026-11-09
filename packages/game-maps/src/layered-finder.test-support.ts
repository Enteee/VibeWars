import {
  buildLayeredNavGraph,
  createLayeredPathFinder,
  navGraphFor,
  type LayeredPathFinder,
  type NavLayer,
} from "@vibewars/game-core";

import { allWallSegments, shapeVertices, wallToSegments } from "./geometry.js";
import type { MapData } from "./schema.js";

/** `map`'s walls, deep water, decks and ramps as the path finder reads them, every gate open. */
export function layeredFinder(map: MapData, clearance: number): LayeredPathFinder {
  const layers: NavLayer[] = Array.from({ length: map.layers }, (_, layer) => ({
    walls: [
      ...allWallSegments(map.walls.filter((wall) => wall.layer === layer)),
      ...(map.water ?? [])
        .filter((water) => water.layer === layer && water.depth === "deep")
        .flatMap((water) => wallToSegments(water.area)),
    ],
    walkable:
      layer === 0
        ? []
        : [
            ...map.decks
              .filter((deck) => deck.layer === layer)
              .map((deck) => shapeVertices(deck.footprint)),
            ...map.transitions
              .filter((transition) => transition.from === layer || transition.to === layer)
              .map((transition) => shapeVertices(transition.area)),
          ],
  }));
  const graphs = buildLayeredNavGraph(
    layers,
    [],
    { width: map.width, height: map.height },
    clearance,
  ).map((gated) => navGraphFor(gated, 0));
  return createLayeredPathFinder(
    graphs,
    map.transitions.map((transition) => ({ ...transition, area: shapeVertices(transition.area) })),
  );
}
