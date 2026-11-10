import {
  buildLayeredNavGraph,
  createLayeredPathFinder,
  navGraphFor,
  type LayeredPathFinder,
  rampRims,
  type NavLayer,
} from "@vibewars/game-core";

import { allWallSegments, shapeVertices } from "./geometry.js";
import type { MapData } from "./schema.js";

/** `map`'s walls, decks and ramps as the path finder reads them, every gate open. */
export function layeredFinder(map: MapData, clearance: number): LayeredPathFinder {
  const rims = rampRims(
    map.transitions.map((transition) => ({ ...transition, area: shapeVertices(transition.area) })),
    map.decks.map((deck) => ({ layer: deck.layer, footprint: shapeVertices(deck.footprint) })),
    map.layers,
  );
  const layers: NavLayer[] = Array.from({ length: map.layers }, (_, layer) => ({
    walls: allWallSegments(map.walls.filter((wall) => wall.layer === layer)),
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
    open: rims[layer] ?? [],
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
