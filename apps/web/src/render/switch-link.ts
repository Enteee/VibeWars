import type { Vec2 } from "@vibewars/game-core";
import type { MapData } from "@vibewars/game-maps/schema";

/** What a lever's target is, as the target frame names it (#3236). */
export type SwitchTargetKind =
  "door" | "portcullis" | "passage" | "barrier" | "portal" | "bridge" | "lift";

/**
 * One thing a lever works (#3236): what it is, where it is drawn, and where
 * its state is in the snapshot, `at` among the map's gates, portals,
 * switched decks or lifts.
 */
export interface SwitchTarget {
  readonly id: string;
  readonly kind: SwitchTargetKind;
  readonly source: "gate" | "teleport" | "deck" | "lift";
  readonly at: number;
  readonly position: Vec2;
  readonly layer: number;
}

type Shape =
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "polygon"; readonly points: readonly Vec2[] };

/** The middle of `shape`: a rect's centre, a polygon's mean corner. */
function middleOf(shape: Shape): Vec2 {
  if (shape.kind === "rect") {
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  const { points } = shape;
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** The target `id` names on `map`, or `undefined` for none. */
function targetOf(map: MapData, id: string): SwitchTarget | undefined {
  for (const [at, { id: candidate, look, blocks, wall }] of map.gates.entries()) {
    if (candidate === id) {
      return {
        id,
        kind: look === "secret" ? "passage" : blocks === "bodies-and-shots" ? "barrier" : look,
        source: "gate",
        at,
        position: middleOf(wall),
        layer: wall.layer,
      };
    }
  }
  for (const [at, { id: candidate, from }] of (map.teleports ?? []).entries()) {
    if (candidate === id) {
      return {
        id,
        kind: "portal",
        source: "teleport",
        at,
        position: middleOf(from.area),
        layer: from.layer,
      };
    }
  }
  const decks = map.decks.filter((deck) => deck.switched !== null);
  for (const [at, { id: candidate, footprint, layer }] of decks.entries()) {
    if (candidate === id) {
      return { id, kind: "bridge", source: "deck", at, position: middleOf(footprint), layer };
    }
  }
  const lifts = map.transitions.filter((transition) => transition.lift !== null);
  for (const [at, { id: candidate, area, from }] of lifts.entries()) {
    if (candidate === id) {
      return { id, kind: "lift", source: "lift", at, position: middleOf(area), layer: from };
    }
  }
  return undefined;
}

/** What the lever `switchId` on `map` works, in its `targets`' order; `[]` for no such lever. */
export function linkTargets(switchId: string, map: MapData): SwitchTarget[] {
  const lever = (map.switches ?? []).find((candidate) => candidate.id === switchId);
  return (lever?.targets ?? []).flatMap((id) => {
    const target = targetOf(map, id);
    return target === undefined ? [] : [target];
  });
}
