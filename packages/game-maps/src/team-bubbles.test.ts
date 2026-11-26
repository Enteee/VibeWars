import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALL_WEAPONS,
  IMPLEMENTED_SKILLS,
  nearestOnHull,
  RANGE_NATURE_RITUAL,
  teamBubble,
  type TargetRule,
  type TeamBubble,
  type Vec2,
} from "@vibewars/game-core";
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

/** The target rules that pick a foe, from as far as the skill's range. */
const AT_A_FOE: ReadonlySet<TargetRule> = new Set([
  "single-enemy",
  "single-any",
  "enemy-spirit",
  "enemy-minion",
]);

/** Whether `object` is about the caster's own side only: its allies, party, minions or spirits. */
function ownSide(object: object): boolean {
  return Object.entries(object).some(
    ([key, inner]) =>
      (key === "affects" || key === "hits" || key === "kind") &&
      typeof inner === "string" &&
      /all(?:y|ies|ied)|party|own-/.test(inner),
  );
}

/**
 * Every finite `radius` in `value` that may reach a foe: an area's, a
 * splash's, a ground effect's, a spirit's. One on the caster's own side
 * only is left out.
 */
function radii(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.flatMap(radii);
  }
  if (typeof value !== "object" || value === null || ownSide(value)) {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "radius" && typeof inner === "number" && Number.isFinite(inner)
      ? [inner]
      : radii(inner),
  );
}

/**
 * The farthest anything reaches a foe from where its user stands: a
 * weapon's attack, or a skill's range when it picks a foe, with the
 * widest area in it on top. Generous, so it stays a bound.
 */
function longestReach(): number {
  return Math.max(
    ...ALL_WEAPONS.map(({ range }) => range),
    ...IMPLEMENTED_SKILLS.map(
      (skill) => (AT_A_FOE.has(skill.target) ? skill.range : 0) + Math.max(0, ...radii(skill)),
    ),
  );
}

describe("the shipped maps' held teams (#3931)", () => {
  it("are out of every skill's and weapon's reach of each other, at any team size", () => {
    const reach = longestReach();
    const inReach: string[] = [];
    for (const { id, spawns } of shippedSpawns()) {
      const teams = [...new Set(spawns.map(({ team }) => team))];
      for (let size = 1; size <= LARGEST_TEAM; size += 1) {
        const bubbles = teams.map((team) => {
          const own = spawns.filter((spawn) => spawn.team === team);
          return teamBubble(own.slice(0, size).map(({ position }) => position));
        });
        for (const [index, one] of bubbles.entries()) {
          for (const other of bubbles.slice(index + 1)) {
            const apart = gap(one, other) - one.radius - other.radius;
            if (apart <= reach) {
              inReach.push(`${id} at ${String(size)} a side: ${apart.toFixed(0)}`);
            }
          }
        }
      }
    }
    expect(reach).toBeGreaterThanOrEqual(RANGE_NATURE_RITUAL);
    expect(inReach).toEqual([]);
  });
});
