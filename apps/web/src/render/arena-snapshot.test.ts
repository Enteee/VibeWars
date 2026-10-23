import { describe, expect, it } from "vitest";

import { vec2 } from "@vibewars/game-core";

import {
  actorAtPoint,
  teamColour,
  type ArenaSnapshot,
  type RenderableActor,
} from "./arena-snapshot.js";

describe("teamColour", () => {
  it("returns a distinct colour for every team", () => {
    const colours = new Set((["self", "ally", "enemy"] as const).map((team) => teamColour(team)));
    expect(colours.size).toBe(3);
  });
});

function actor(id: string, x: number, y: number, radius = 14): RenderableActor {
  return { id, position: vec2(x, y), radius, team: "ally" };
}

describe("actorAtPoint", () => {
  it("returns undefined when there are no actors", () => {
    const snapshot: ArenaSnapshot = { actors: [], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(0, 0))).toBeUndefined();
  });

  it("hits an actor when the point is within its radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(105, 100))?.id).toBe("a");
  });

  it("misses when the point is outside every actor's radius", () => {
    const self = actor("a", 100, 100, 14);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(200, 200))).toBeUndefined();
  });

  it("hits exactly at the radius boundary", () => {
    const self = actor("a", 0, 0, 10);
    const snapshot: ArenaSnapshot = { actors: [self], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(10, 0))?.id).toBe("a");
  });

  it("picks the closest actor when two overlap the point", () => {
    const near = actor("near", 100, 100, 20);
    const far = actor("far", 110, 100, 20);
    const snapshot: ArenaSnapshot = { actors: [far, near], walls: [], targetId: undefined };
    expect(actorAtPoint(snapshot, vec2(100, 100))?.id).toBe("near");
  });
});
