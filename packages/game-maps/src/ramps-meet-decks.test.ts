import { distancePointToSegment, UPHILL, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  pointInShape,
  shapeInBounds,
  shapesOverlapInterior,
  shapeVertices,
  wallToSegments,
} from "./geometry.js";
import { loadAllMaps } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * A climbed transition meets the deck it climbs to and sits on its own
 * ground (#3813): ramps draw over decks, so a ramp reaching into a deck
 * hides the deck's lip, and one past a wall paints its side on the land
 * beyond. Ramps, stairs and rough steps are checked; ladders, landings,
 * lifts and ramps up out of a pit have other shapes and are not.
 */

/** How far off a deck a point may be and still count as on it. */
const TOLERANCE = 0.5;

const CLIMBED = new Set(["ramp", "stairs", "rough-steps"]);

type Shape = MapData["decks"][number]["footprint"];
type Transition = MapData["transitions"][number];

/** Whether `point` is in `shape` or within the tolerance of its outline. */
function onShape(point: Vec2, shape: Shape): boolean {
  return (
    pointInShape(point, shape) ||
    wallToSegments(shape).some((side) => distancePointToSegment(point, side) <= TOLERANCE)
  );
}

/** `shape` drawn in by the tolerance on every side: a rect only, as transitions' areas are. */
function shrunk(shape: Shape): Shape {
  return shape.kind === "rect"
    ? {
        kind: "rect",
        x: shape.x + TOLERANCE,
        y: shape.y + TOLERANCE,
        width: shape.width - 2 * TOLERANCE,
        height: shape.height - 2 * TOLERANCE,
      }
    : shape;
}

/** The transition's high edge: the side furthest uphill. */
function uphillEdge(transition: Transition): readonly [Vec2, Vec2] | undefined {
  const uphill = UPHILL[transition.uphill];
  const along = (point: Vec2): number => point.x * uphill.x + point.y * uphill.y;
  const high = Math.max(...shapeVertices(transition.area).map(along));
  const side = wallToSegments(transition.area).find(
    ({ a, b }) => along(a) === high && along(b) === high,
  );
  return side === undefined ? undefined : [side.a, side.b];
}

/** Whether the transition is a ramp up out of a pit to the pit's edge (#2973). */
function outOfPit(map: MapData, transition: Transition): boolean {
  const corners = shapeVertices(transition.area);
  return map.pits.some((pit) => corners.every((corner) => pointInShape(corner, pit.footprint)));
}

/** What is wrong with each climbed transition of `map`, one line each. */
function misplacedRamps(map: MapData): string[] {
  const problems: string[] = [];
  const onGround = (point: Vec2): boolean =>
    map.bounds.kind === "rect" || onShape(point, { kind: "polygon", points: map.bounds.outline });
  for (const transition of map.transitions) {
    if (!CLIMBED.has(transition.look) || transition.lift !== null || outOfPit(map, transition)) {
      continue;
    }
    const { id, area } = transition;
    const edge = uphillEdge(transition);
    const decks = map.decks.filter((deck) => deck.layer === transition.to);
    if (edge !== undefined) {
      const middle = { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 };
      const met = decks.filter((deck) => onShape(middle, deck.footprint));
      for (const deck of met) {
        if (shapesOverlapInterior(shrunk(area), deck.footprint)) {
          problems.push(`${id} reaches into deck ${deck.id}`);
        }
      }
      // Its whole top edge on a deck: two decks side by side may share it.
      if (
        met.length > 0 &&
        !edge.every((end) => decks.some((deck) => onShape(end, deck.footprint)))
      ) {
        problems.push(`${id}'s top edge runs past the deck's side`);
      }
    }
    if (!shapeInBounds(area, map.width, map.height) || !shapeVertices(area).every(onGround)) {
      problems.push(`${id} hangs off the map`);
    }
    for (const wall of map.walls) {
      if (wall.layer === transition.from && shapesOverlapInterior(area, wall)) {
        problems.push(`${id} overlaps a wall of layer ${String(wall.layer)}`);
      }
    }
  }
  return problems;
}

describe("ramps meet their decks (#3813)", () => {
  it("finds no ramp into a deck, past its side, over a wall or off the map", () => {
    expect(
      loadAllMaps().flatMap((map) => misplacedRamps(map).map((problem) => `${map.id}: ${problem}`)),
    ).toEqual([]);
  });
});
