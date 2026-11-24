import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { nearestOnHull, teamBubble, type TeamBubble, type Vec2 } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

/** The most a side seats (#3930's edge case: up to 8). */
const LARGEST_TEAM = 8;

interface SpawnPoint {
  readonly team: number;
  readonly position: Vec2;
}

/** Every shipped map's spawns, read from its file: the loader plays no part. */
function shippedSpawns(): { readonly id: string; readonly spawns: readonly SpawnPoint[] }[] {
  const root = fileURLToPath(new URL("../maps/", import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const map = JSON.parse(readFileSync(join(root, entry.name, "map.json"), "utf8")) as {
        readonly spawnPoints: readonly SpawnPoint[];
      };
      return { id: entry.name, spawns: map.spawnPoints };
    });
}

/** Whether segments `a`–`b` and `c`–`d` cross. */
function cross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (o: Vec2, p: Vec2, q: Vec2): number =>
    Math.sign((p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** How far apart two hulls are: 0 when they meet. */
function gap(one: TeamBubble, other: TeamBubble): number {
  const sides = (hull: readonly Vec2[]): [Vec2, Vec2][] =>
    hull.map((point, index) => [point, hull[(index + 1) % hull.length] ?? point]);
  for (const [a, b] of sides(one.hull)) {
    for (const [c, d] of sides(other.hull)) {
      if (cross(a, b, c, d)) {
        return 0;
      }
    }
  }
  const off = (from: TeamBubble, to: TeamBubble): number[] =>
    from.hull.map((point) => {
      const on = nearestOnHull(point, to);
      return Math.hypot(point.x - on.x, point.y - on.y);
    });
  return Math.min(...off(one, other), ...off(other, one));
}

describe("the shipped maps' team bubbles (#3930)", () => {
  it("never let two teams' bubbles meet, at any team size", () => {
    const meeting: string[] = [];
    for (const { id, spawns } of shippedSpawns()) {
      const teams = [...new Set(spawns.map(({ team }) => team))];
      for (let size = 1; size <= LARGEST_TEAM; size += 1) {
        // A side of `size` takes its team's points in order, round again past the last (#375).
        const bubbles = teams.map((team) => {
          const own = spawns.filter((spawn) => spawn.team === team);
          return teamBubble(own.slice(0, size).map(({ position }) => position));
        });
        for (const [index, one] of bubbles.entries()) {
          for (const other of bubbles.slice(index + 1)) {
            if (gap(one, other) <= one.radius + other.radius) {
              meeting.push(`${id} at ${String(size)} a side`);
            }
          }
        }
      }
    }
    expect(shippedSpawns().length).toBeGreaterThan(10);
    expect(meeting).toEqual([]);
  });
});
