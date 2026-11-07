import { describe, expect, it } from "vitest";

import { loadAllMaps } from "./loader.js";
import { sizeClass } from "./size-class.js";

describe("sizeClass (#444, #2547)", () => {
  it("is small up to 3200, medium up to 4800, large beyond, by the longer side", () => {
    expect(sizeClass({ width: 2600, height: 2600 })).toBe("small");
    expect(sizeClass({ width: 2800, height: 1800 })).toBe("small");
    expect(sizeClass({ width: 3000, height: 2000 })).toBe("small");
    expect(sizeClass({ width: 3200, height: 1100 })).toBe("small");
    expect(sizeClass({ width: 900, height: 3201 })).toBe("medium");
    expect(sizeClass({ width: 4800, height: 4800 })).toBe("medium");
    expect(sizeClass({ width: 4801, height: 100 })).toBe("large");
  });

  it("calls every arena today small, but Sandstone Steps and Frozen Crossing medium (#2604), Canthan Terraces and Sunken Bastion large (#2607)", () => {
    expect(Object.fromEntries(loadAllMaps().map((map) => [map.id, sizeClass(map)]))).toEqual({
      "arena-pillars": "small",
      "arena-split": "small",
      "arena-crossroads": "small",
      "arena-canyon": "small",
      "arena-long-hall": "small",
      "guild-hall-isle": "small",
      "broken-tower": "small",
      "hill-courtyard": "small",
      "hall-of-heroes": "small",
      "scarred-earth": "small",
      "sandstone-steps": "medium",
      "frozen-crossing": "medium",
      "canthan-terraces": "large",
      "sunken-bastion": "large",
    });
  });
});
