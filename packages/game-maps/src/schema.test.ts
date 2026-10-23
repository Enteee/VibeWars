import { describe, expect, it } from "vitest";

import { MapValidationError, validateMapData } from "./schema.js";

const validMap = {
  id: "arena-test",
  name: "Arena Test",
  width: 100,
  height: 100,
  walls: [
    { kind: "rect", x: 10, y: 10, width: 5, height: 5 },
    {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    },
  ],
  spawnPoints: [{ team: 0, position: { x: 1, y: 1 } }],
};

describe("validateMapData", () => {
  it("accepts a well-formed map", () => {
    const parsed = validateMapData(validMap);
    expect(parsed.id).toBe("arena-test");
    expect(parsed.walls).toHaveLength(2);
  });

  it("rejects a non-kebab-case id", () => {
    expect(() => validateMapData({ ...validMap, id: "Arena Test" })).toThrow(MapValidationError);
  });

  it("rejects an empty name", () => {
    expect(() => validateMapData({ ...validMap, name: "" })).toThrow(MapValidationError);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => validateMapData({ ...validMap, width: 0 })).toThrow(MapValidationError);
    expect(() => validateMapData({ ...validMap, height: -10 })).toThrow(MapValidationError);
  });

  it("rejects a rect wall with a non-positive size", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [{ kind: "rect", x: 0, y: 0, width: 0, height: 5 }],
      }),
    ).toThrow(MapValidationError);
  });

  it("rejects a polygon wall with fewer than 3 points", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [
          {
            kind: "polygon",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
            ],
          },
        ],
      }),
    ).toThrow(MapValidationError);
  });

  it("rejects an unrecognized wall kind rather than silently dropping it", () => {
    expect(() =>
      validateMapData({
        ...validMap,
        walls: [{ kind: "circle", x: 0, y: 0, radius: 5 }],
      }),
    ).toThrow(MapValidationError);
  });

  it("requires at least one spawn point", () => {
    expect(() => validateMapData({ ...validMap, spawnPoints: [] })).toThrow(MapValidationError);
  });

  it("rejects a negative team index", () => {
    expect(() =>
      validateMapData({ ...validMap, spawnPoints: [{ team: -1, position: { x: 0, y: 0 } }] }),
    ).toThrow(MapValidationError);
  });

  it("rejects a completely malformed value rather than throwing an unhelpful native error", () => {
    expect(() => validateMapData(null)).toThrow(MapValidationError);
    expect(() => validateMapData("not a map")).toThrow(MapValidationError);
    expect(() => validateMapData(42)).toThrow(MapValidationError);
  });

  it("names the failing field(s) in the error message", () => {
    try {
      validateMapData({ ...validMap, width: -1 });
      expect.fail("expected validateMapData to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MapValidationError);
      expect((error as Error).message).toContain("width");
    }
  });
});
