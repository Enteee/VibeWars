import type { GateBlocks, Vec2 } from "@vibewars/game-core";
import { wallToSegments } from "@vibewars/game-maps/geometry";
import type { MapDescriptor, WallDescriptor } from "@vibewars/game-protocol";

/**
 * Where a map's levers, gates and breakable walls stand (#3139), so the
 * sounds can tell which are near you. Each index is the snapshot's
 * index for the same element.
 */
export interface WorldPlaces {
  readonly gates: readonly { readonly at: Vec2; readonly blocks: GateBlocks }[];
  readonly switches: readonly Vec2[];
  readonly breakables: readonly Vec2[];
}

export function worldPlacesOf(map: MapDescriptor): WorldPlaces {
  return {
    gates: map.gates.map((gate) => ({ at: middleOf(gate.wall), blocks: gate.blocks })),
    switches: map.switches.map((lever) => lever.position),
    breakables: map.breakables.map((breakable) => middleOf(breakable.wall)),
  };
}

/** The mean of a wall's segments' end points. */
function middleOf(wall: WallDescriptor): Vec2 {
  const points = wallToSegments(wall).flatMap((side) => [side.a, side.b]);
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
