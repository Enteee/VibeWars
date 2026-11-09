import { describe, expect, it } from "vitest";

import { loadMap } from "./loader.js";
import type { MapData, Wall } from "./schema.js";

/**
 * The bigger maps (#2544) are point-symmetric: rotated 180° about its
 * centre, a map's walls, spawns and objectives land on their twins, team 0
 * on team 1, so neither side is favoured. Each new map of the epic joins
 * this list.
 */
const SYMMETRIC = [
  "ember-pits",
  "jungle-ruins",
  "broken-tower",
  "cinder-sanctum",
  "scarred-earth",
  "the-courtyard",
  "hall-of-heroes",
  "barrow-field",
  "hollow-deep",
  "blackwater-ford",
  "mosslit-cairns",
  "brazen-causeway",
  "ashen-courtyard",
  "moss-vale",
  "canthan-terraces",
  "sunken-bastion",
  "shiverpeak-pass",
  "elonian-plateau",
];

/** How far apart a thing and its twin's rotation may be. */
const TOLERANCE = 1;

interface Point {
  readonly x: number;
  readonly y: number;
}

const near = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE;

/** Every corner of `wall`, as a polygon's points. */
function corners(wall: Wall): readonly Point[] {
  if (wall.kind === "polygon") {
    return wall.points;
  }
  return [
    { x: wall.x, y: wall.y },
    { x: wall.x + wall.width, y: wall.y },
    { x: wall.x + wall.width, y: wall.y + wall.height },
    { x: wall.x, y: wall.y + wall.height },
  ];
}

/** Whether `a` rotated is `b`: the same corners, in any order. */
function twins(a: readonly Point[], b: readonly Point[], turn: (p: Point) => Point): boolean {
  return a.length === b.length && a.every((corner) => b.some((each) => near(turn(corner), each)));
}

/** The other team's number, for a two-team map; no team stays none. */
const otherTeam = (team: number | undefined): number | undefined =>
  team === undefined ? undefined : 1 - team;

describe.each(SYMMETRIC)("%s (#2544)", (id) => {
  const map: MapData = loadMap(id);
  const turn = (p: Point): Point => ({ x: map.width - p.x, y: map.height - p.y });

  it("has every wall's 180° twin", () => {
    for (const wall of map.walls) {
      expect(
        map.walls.some((other) => twins(corners(wall), corners(other), turn)),
        JSON.stringify(wall),
      ).toBe(true);
    }
  });

  it("has every spawn's 180° twin on the other team", () => {
    for (const spawn of map.spawnPoints) {
      expect(
        map.spawnPoints.some(
          (other) => other.team === 1 - spawn.team && near(turn(spawn.position), other.position),
        ),
        JSON.stringify(spawn),
      ).toBe(true);
    }
  });

  it("has every objective's 180° twin, of the other team if it has one", () => {
    const placed = map.objectives.filter((objective) => objective.kind !== "start-line");
    for (const objective of placed) {
      const team = "team" in objective ? objective.team : undefined;
      expect(
        placed.some(
          (other) =>
            other.kind === objective.kind &&
            ("team" in other ? other.team : undefined) === otherTeam(team) &&
            near(turn(objective.position), other.position),
        ),
        JSON.stringify(objective),
      ).toBe(true);
    }
  });
});
