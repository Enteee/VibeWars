import { describe, expect, it } from "vitest";

import { spawnPoint } from "./spawn-points.js";

const SPAWNS = [
  { team: 0, position: { x: 0, y: 0 }, layer: 1 },
  { team: 1, position: { x: 100, y: 0 }, layer: 1 },
  { team: 0, position: { x: 0, y: 10 }, layer: 2 },
  { team: 1, position: { x: 100, y: 10 }, layer: 1 },
];

describe("spawnPoint", () => {
  it("cycles through the team's own points as players are seated", () => {
    expect(spawnPoint(SPAWNS, 0, 0, 1).position).toEqual({ x: 0, y: 0 });
    expect(spawnPoint(SPAWNS, 1, 1, 1).position).toEqual({ x: 100, y: 10 });
    expect(spawnPoint(SPAWNS, 0, 2, 1).position).toEqual({ x: 0, y: 0 });
    expect(spawnPoint(SPAWNS, 0, 3, 1).position).toEqual({ x: 0, y: 10 });
  });

  it("seats the player on the point's own layer (#3344)", () => {
    expect(spawnPoint(SPAWNS, 0, 0, 1).layer).toBe(1);
    expect(spawnPoint(SPAWNS, 0, 1, 1).layer).toBe(2);
  });

  it("uses every point for a team the map has none for, and the ground's origin on a map with none", () => {
    expect(spawnPoint(SPAWNS, 2, 1, 1)).toEqual({ position: { x: 100, y: 0 }, layer: 1 });
    expect(spawnPoint([], 0, 5, 3)).toEqual({ position: { x: 0, y: 0 }, layer: 3 });
  });
});
