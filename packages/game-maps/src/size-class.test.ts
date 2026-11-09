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

  it("calls every arena today small, but Sandstone Steps, Frozen Crossing (#2604), Ashen Courtyard and Moss Vale (#2605) medium, Canthan Terraces and Sunken Bastion (#2607), Shiverpeak Pass and Elonian Plateau (#2609) large", () => {
    expect(Object.fromEntries(loadAllMaps().map((map) => [map.id, sizeClass(map)]))).toEqual({
      "ember-pits": "small",
      "jungle-ruins": "small",
      "arena-crossroads": "small",
      "arena-canyon": "small",
      "arena-long-hall": "small",
      "guild-hall-isle": "small",
      "broken-tower": "small",
      "cinder-sanctum": "small",
      "the-courtyard": "small",
      "hall-of-heroes-king": "small",
      "hall-of-heroes-relic": "small",
      "hall-of-heroes-capture": "small",
      "barrow-field": "small",
      "hollow-deep": "medium",
      "blackwater-ford": "small",
      "mosslit-cairns": "small",
      "scarred-earth": "small",
      "sandstone-steps": "medium",
      "frozen-crossing": "medium",
      "ashen-courtyard": "medium",
      "moss-vale": "medium",
      "canthan-terraces": "large",
      "sunken-bastion": "large",
      "shiverpeak-pass": "large",
      "elonian-plateau": "large",
    });
  });
});
