import { UPHILL, type MatchLayers, type MatchZone } from "@vibewars/game-core";

import { shapeVertices, wallToSegments } from "./geometry.js";
import type { MapData } from "./schema.js";

/**
 * `map`'s layers, as the simulation and its path finder take them
 * (ADR-0051): a tunnel is a deck of the ground, over the layer under it
 * (#2973).
 */
export function matchLayers(map: MapData): MatchLayers {
  return {
    count: map.layers,
    ground: map.groundLayer,
    walls: Array.from({ length: map.layers }, (_, layer) =>
      map.walls.filter((wall) => wall.layer === layer).flatMap(wallToSegments),
    ),
    decks: [
      ...map.decks.map((deck) => ({ layer: deck.layer, footprint: shapeVertices(deck.footprint) })),
      ...map.tunnels.map((tunnel) => ({
        layer: map.groundLayer,
        footprint: shapeVertices(tunnel.footprint),
      })),
    ],
    pits: map.pits.map((pit) => shapeVertices(pit.footprint)),
    transitions: map.transitions.map((transition) => ({
      from: transition.from,
      to: transition.to,
      area: shapeVertices(transition.area),
      uphill: UPHILL[transition.uphill],
    })),
    deepWater: Array.from({ length: map.layers }, (_, layer) =>
      (map.water ?? [])
        .filter((water) => water.layer === layer && water.depth === "deep")
        .flatMap((water) => wallToSegments(water.area)),
    ),
  };
}

/** `map`'s effect zones, as the simulation takes them (ADR-0053): each area as one polygon. */
export function matchZones(map: MapData): MatchZone[] {
  return (map.zones ?? []).map(({ id, kind, layer, area }) => ({
    id,
    kind,
    layer,
    polygon: shapeVertices(area),
  }));
}
