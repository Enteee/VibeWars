import {
  CLIMB_PACE,
  UPHILL,
  type BreakableField,
  type GateField,
  type MatchLayers,
  type MatchZone,
  type LiftField,
  type SwitchedDeckField,
  type SwitchField,
  type TeleportField,
} from "@vibewars/game-core";

import { shapeVertices, wallToSegments } from "./geometry.js";
import { dropOffOutward, type MapData } from "./schema.js";

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
      pace: CLIMB_PACE[transition.look],
    })),
    dropOffs: map.dropOffs.flatMap((dropOff) => {
      const outward = dropOffOutward(map, dropOff);
      return outward === undefined
        ? []
        : [{ layer: dropOff.layer, edge: { a: dropOff.from, b: dropOff.to }, outward }];
    }),
    deepWater: Array.from({ length: map.layers }, (_, layer) =>
      (map.water ?? [])
        .filter((water) => water.layer === layer && water.depth === "deep")
        .flatMap((water) => wallToSegments(water.area)),
    ),
    outline:
      map.bounds.kind === "rect"
        ? undefined
        : {
            polygon: map.bounds.outline,
            // A cliff or deep water is seen and shot across; rock, forest and basalt are not.
            blocksSight: ["rock", "forest", "basalt"].includes(map.bounds.outside),
          },
  };
}

/**
 * `map`'s effect zones, as the simulation takes them (ADR-0053): each area
 * as one polygon, with its schedule or path if it has one (#3029).
 */
export function matchZones(map: MapData): MatchZone[] {
  return (map.zones ?? []).map(({ id, kind, layer, area, schedule, path }) => ({
    id,
    kind,
    layer,
    polygon: shapeVertices(area),
    ...(schedule === undefined ? {} : { schedule }),
    ...(path === undefined ? {} : { path }),
  }));
}

/** `map`'s gates, as the simulation takes them (#2691, #3025), in its order, each on its wall's layer. */
export function matchGates(map: MapData): GateField[] {
  return map.gates.map(({ wall, opener, blocks }) => ({
    segments: wallToSegments(wall),
    layer: wall.layer,
    blocks,
    opener:
      opener.kind === "plate"
        ? { kind: "plate", plate: opener.plate, team: opener.team }
        : { kind: "switch" },
  }));
}

/**
 * `map`'s switches, as the simulation takes them (#3025): each target as
 * its gate's index, its teleport's (#3030), its switched deck's (#3068) or
 * its lift's (#3079).
 */
export function matchSwitches(map: MapData): SwitchField[] {
  const gates = map.gates.map(({ id }) => id);
  const teleports = (map.teleports ?? []).map(({ id }) => id);
  const decks = matchSwitchedDecks(map).map(({ id }) => id);
  const lifts = matchLifts(map).map(({ id }) => id);
  return (map.switches ?? []).map(({ id, layer, position, targets }) => ({
    id,
    layer,
    position,
    gates: targets.flatMap((target) => (gates.includes(target) ? [gates.indexOf(target)] : [])),
    teleports: targets.flatMap((target) =>
      teleports.includes(target) ? [teleports.indexOf(target)] : [],
    ),
    decks: targets.flatMap((target) => (decks.includes(target) ? [decks.indexOf(target)] : [])),
    lifts: targets.flatMap((target) => (lifts.includes(target) ? [lifts.indexOf(target)] : [])),
  }));
}

/**
 * `map`'s switched decks, as the simulation takes them (#3068), in its
 * order, each with its index among the match's decks (`matchLayers`).
 */
export function matchSwitchedDecks(map: MapData): SwitchedDeckField[] {
  return map.decks.flatMap(({ id, layer, footprint, switched }, deck) =>
    switched === null
      ? []
      : [{ id, deck, layer, footprint: shapeVertices(footprint), ...switched }],
  );
}

/**
 * `map`'s lifts, as the simulation takes them (#3079), in its order, each
 * with its index among the match's transitions (`matchLayers`).
 */
export function matchLifts(map: MapData): LiftField[] {
  return map.transitions.flatMap(({ id, from, to, area, lift }, transition) =>
    lift === null ? [] : [{ id, transition, from, to, area: shapeVertices(area), run: lift }],
  );
}

/** `map`'s teleports, as the simulation takes them (#3030), in its order, each entry one polygon. */
export function matchTeleports(map: MapData): TeleportField[] {
  return (map.teleports ?? []).map(({ id, from, to, enabled }) => ({
    id,
    from: { layer: from.layer, area: shapeVertices(from.area) },
    to,
    enabled,
  }));
}

/** `map`'s breakable walls, as the simulation takes them (#3031), in its order. */
export function matchBreakables(map: MapData): BreakableField[] {
  return (map.breakables ?? []).map(({ id, wall, health }) => ({
    id,
    segments: wallToSegments(wall),
    layer: wall.layer,
    maxHealth: health,
  }));
}
