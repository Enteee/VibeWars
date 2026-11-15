import { AREA_EARSHOT, SKILLS_BY_ID, beaconStrikeArea } from "@vibewars/game-core";
import { MAX_WIRE_RADIUS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

/**
 * Every `area: { radius }` under `value`, with where it sits: a skill's own
 * area and the areas of what it leaves behind (a pulse's end, a trap), the
 * ones the simulation logs on a combat entry.
 */
function areaRadii(value: unknown, path: string): { path: string; radius: number }[] {
  if (Array.isArray(value)) {
    return value.flatMap((each, at) => areaRadii(each, `${path}[${String(at)}]`));
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, each]) => {
    const here = `${path}.${key}`;
    const own =
      key === "area" &&
      each !== null &&
      typeof each === "object" &&
      "radius" in each &&
      typeof each.radius === "number"
        ? [{ path: here, radius: each.radius }]
        : [];
    return [...own, ...areaRadii(each, here)];
  });
}

// A combat entry wider than the wire allows fails to parse, and the client
// drops that tick's whole batch with it (#3301): every shout went that way.
describe("MAX_WIRE_RADIUS", () => {
  const areas = [...SKILLS_BY_ID.values()].flatMap((skill) => areaRadii(skill, skill.id));

  it("holds every area a skill in the catalog draws", () => {
    expect(areas.map(({ radius }) => radius)).toContain(AREA_EARSHOT);
    expect(areas.filter(({ radius }) => radius > MAX_WIRE_RADIUS)).toEqual([]);
  });

  it("holds a beacon strike's area", () => {
    expect(beaconStrikeArea({ x: 0, y: 0 }).radius).toBeLessThanOrEqual(MAX_WIRE_RADIUS);
  });
});
