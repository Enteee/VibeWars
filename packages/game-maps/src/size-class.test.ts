import { describe, expect, it } from "vitest";

import { loadAllMaps } from "./loader.js";
import { sizeClass } from "./size-class.js";

describe("sizeClass (#444)", () => {
  it("is small up to 1200, medium up to 2400, large beyond, by the longer side", () => {
    expect(sizeClass({ width: 1200, height: 700 })).toBe("small");
    expect(sizeClass({ width: 900, height: 1201 })).toBe("medium");
    expect(sizeClass({ width: 2400, height: 2400 })).toBe("medium");
    expect(sizeClass({ width: 2401, height: 100 })).toBe("large");
  });

  it("calls today's four small and sorts the rest by size", () => {
    expect(Object.fromEntries(loadAllMaps().map((map) => [map.id, sizeClass(map)]))).toEqual({
      "arena-alpha": "small",
      "arena-open": "small",
      "arena-pillars": "small",
      "arena-split": "small",
      "arena-ring": "medium",
      "arena-crossroads": "large",
      "arena-canyon": "large",
      "arena-long-hall": "large",
      "guild-hall-isle": "large",
      "relic-temples": "medium",
      "hill-courtyard": "medium",
      "hall-of-heroes": "medium",
      "forgotten-shrines": "medium",
    });
  });
});
