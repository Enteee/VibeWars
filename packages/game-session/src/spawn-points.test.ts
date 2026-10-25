import { describe, expect, it } from "vitest";

import { spawnPoint } from "./spawn-points.js";

const SPAWNS = [
  { team: 0, position: { x: 0, y: 0 } },
  { team: 1, position: { x: 100, y: 0 } },
  { team: 0, position: { x: 0, y: 10 } },
  { team: 1, position: { x: 100, y: 10 } },
];

describe("spawnPoint", () => {
  it("cycles through the team's own points as players are seated", () => {
    expect(spawnPoint(SPAWNS, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(spawnPoint(SPAWNS, 1, 1)).toEqual({ x: 100, y: 10 });
    expect(spawnPoint(SPAWNS, 0, 2)).toEqual({ x: 0, y: 0 });
    expect(spawnPoint(SPAWNS, 0, 3)).toEqual({ x: 0, y: 10 });
  });

  it("uses every point for a team the map has none for, and the origin on a map with none", () => {
    expect(spawnPoint(SPAWNS, 2, 1)).toEqual({ x: 100, y: 0 });
    expect(spawnPoint([], 0, 5)).toEqual({ x: 0, y: 0 });
  });
});
