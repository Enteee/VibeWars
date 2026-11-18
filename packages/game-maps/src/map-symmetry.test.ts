import { describe, expect, it } from "vitest";

import { loadMap } from "./loader.js";
import type { MapData } from "./schema.js";

/**
 * The bigger maps (#2544) are point-symmetric: rotated 180° about its
 * centre, a map's walls, spawns and objectives land on their twins, team 0
 * on team 1, so neither side is favoured. Each new map of the epic joins
 * this list.
 */
const SYMMETRIC = [
  "threefold-keep",
  "hall-of-heroes-king",
  "hall-of-heroes-relic",
  "hall-of-heroes-capture",
  "hollow-deep",
  "mosslit-cairns",
];

/** How far apart a thing and its twin's rotation may be. */
const TOLERANCE = 1;

interface Point {
  readonly x: number;
  readonly y: number;
}

const near = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE;

/** A wall's or a fog bank's outline. */
type Area =
  | {
      readonly kind: "rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: "polygon"; readonly points: readonly Point[] };

/** Every corner of `wall`, as a polygon's points. */
function corners(wall: Area): readonly Point[] {
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

/** What a two-team match keeps (#2700): a third team's base has no twin, and is no one's edge. */
const twoTeamObjectives = (map: MapData): MapData["objectives"] =>
  map.objectives.filter(
    (objective) =>
      !("team" in objective && objective.team === 2) &&
      !(objective.kind === "capture-point" && objective.base === 2),
  );

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
    for (const spawn of map.spawnPoints.filter((each) => each.team < 2)) {
      expect(
        map.spawnPoints.some(
          (other) => other.team === 1 - spawn.team && near(turn(spawn.position), other.position),
        ),
        JSON.stringify(spawn),
      ).toBe(true);
    }
  });

  it("has every objective's 180° twin, of the other team if it has one", () => {
    const placed = twoTeamObjectives(map).filter((objective) => objective.kind !== "start-line");
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

/**
 * Ascent maps relit for their act (#3590): their layout is only roughly
 * point-symmetric, so their lights stay where they light it, but neither
 * team gets the brighter side. Each fog bank and light shaft has its 180°
 * twin about the map's centre, and each light colour is as strong on one
 * half of the map as on the other.
 */
const RELIT = ["barrow-field", "blackwater-ford", "brazen-causeway"];

describe.each(RELIT)("%s lit for its act (#3590)", (id) => {
  const map: MapData = loadMap(id);
  const { lighting, atmosphere } = map;
  if (lighting === undefined || atmosphere === undefined) {
    throw new Error(`${id} has no lighting or atmosphere`);
  }
  const turn = (p: Point): Point => ({ x: map.width - p.x, y: map.height - p.y });

  it("has every fog bank's 180° twin", () => {
    for (const bank of atmosphere.fog) {
      const points = corners(bank.area);
      const twinned = atmosphere.fog.some(
        (other) => other.layer === bank.layer && twins(points, corners(other.area), turn),
      );
      expect(twinned, JSON.stringify(points[0])).toBe(true);
    }
  });

  it("has every light shaft's 180° twin", () => {
    for (const shaft of atmosphere.shafts) {
      const twinned = atmosphere.shafts.some(
        (other) =>
          other.layer === shaft.layer &&
          other.radius === shaft.radius &&
          near(turn(shaft.position), other.position),
      );
      expect(twinned, shaft.id).toBe(true);
    }
  });

  it("lights both halves of the map alike, colour by colour", () => {
    const half = new Map<number, number>();
    for (const light of lighting.lights) {
      const side = Math.sign(light.position.x - map.width / 2);
      const strength = light.intensity * light.radius ** 2;
      half.set(light.colour, (half.get(light.colour) ?? 0) + side * strength);
    }
    for (const [colour, imbalance] of half) {
      expect(Math.abs(imbalance), colour.toString(16)).toBeLessThan(1e-6);
    }
  });
});
