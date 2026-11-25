import { describe, expect, it } from "vitest";

import { loadMap } from "../loader.js";
import { decorRefusal, mapDataSchema } from "../schema.js";
import { DECOR_SPACING, parseArea, scatterDecor, type ScatterRequest } from "./decor-scatter.js";

describe("decor scatter (#4013)", () => {
  const map = { ...loadMap("ashen-courtyard"), decor: [] };
  // The whole map, walls, pits and spawn bubbles included: the tool must avoid them.
  const request: ScatterRequest = {
    kind: "crates",
    area: { kind: "rect", x: 0, y: 0, width: map.width, height: map.height },
    count: 40,
    layer: map.groundLayer,
    seed: 4013,
  };

  it("gives the same props for the same seed, and others for another", () => {
    const first = scatterDecor(map, request);
    expect(scatterDecor(map, request)).toEqual(first);
    expect(scatterDecor(map, { ...request, seed: 4014 }).decor).not.toEqual(first.decor);
  });

  it("places only where the schema accepts a prop, spaced apart", () => {
    const { decor } = scatterDecor(map, request);
    expect(decor).toHaveLength(40);
    for (const prop of decor) {
      expect(decorRefusal(map, prop)).toBeUndefined();
      const near = decor.filter(
        (other) => Math.hypot(other.at.x - prop.at.x, other.at.y - prop.at.y) < DECOR_SPACING,
      );
      expect(near).toEqual([prop]);
    }
    expect(mapDataSchema.safeParse({ ...map, decor }).success).toBe(true);
  });

  it("keeps what is there and gives the new props fresh ids", () => {
    const once = scatterDecor(map, { ...request, count: 5 });
    const twice = scatterDecor(once, { ...request, count: 5, seed: 7 });
    expect(twice.decor.slice(0, 5)).toEqual(once.decor);
    expect(new Set(twice.decor.map((prop) => prop.id)).size).toBe(10);
  });

  it("stops at the animated cap rather than writing a map the schema refuses", () => {
    const { decor } = scatterDecor(map, { ...request, kind: "fern", count: 30 });
    expect(decor).toHaveLength(16);
  });

  it("places no brazier without a brazier- light beside it", () => {
    expect(scatterDecor(map, { ...request, kind: "brazier" }).decor).toEqual([]);
  });

  it("reads a rect and a polygon", () => {
    expect(parseArea("10,20,30,40")).toEqual({ kind: "rect", x: 10, y: 20, width: 30, height: 40 });
    expect(parseArea("0,0;100,0;0,100")).toEqual({
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
      ],
    });
    expect(() => parseArea("1,2,3")).toThrow();
    expect(() => parseArea("0,0;1,1")).toThrow();
  });
});
