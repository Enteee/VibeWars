import {
  UPHILL,
  type GateField,
  type MatchLayers,
  type MatchZone,
  type SwitchField,
} from "@vibewars/game-core";

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

/** `map`'s gates, as the simulation takes them (#2691, #3025), in its order, each on its wall's layer. */
export function matchGates(map: MapData): GateField[] {
  return map.gates.map(({ wall, opener }) => ({
    segments: wallToSegments(wall),
    layer: wall.layer,
    opener:
      opener.kind === "plate"
        ? { kind: "plate", plate: opener.plate, team: opener.team }
        : { kind: "switch" },
  }));
}

/** `map`'s switches, as the simulation takes them (#3025): each target as its gate's index. */
export function matchSwitches(map: MapData): SwitchField[] {
  const gates = map.gates.map(({ id }) => id);
  return (map.switches ?? []).map(({ id, layer, position, targets }) => ({
    id,
    layer,
    position,
    targets: targets.map((target) => gates.indexOf(target)),
  }));
}
