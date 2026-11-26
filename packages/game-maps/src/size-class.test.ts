import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { listMapIds } from "./loader.js";
import { sizeClass } from "./size-class.js";

/**
 * Each arena's id and bounds, read plainly from its `map.json`: validating
 * every map is the every-map tests' job, and too slow to repeat here (#3672).
 */
function arenaBounds(): { id: string; width: number; height: number }[] {
  return listMapIds().map((dir) => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL(`../maps/${dir}/map.json`, import.meta.url), "utf8"),
    );
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("id" in raw && typeof raw.id === "string") ||
      !("width" in raw && typeof raw.width === "number") ||
      !("height" in raw && typeof raw.height === "number")
    ) {
      throw new Error(`maps/${dir}/map.json has no id, width and height`);
    }
    return { id: raw.id, width: raw.width, height: raw.height };
  });
}

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

  it("calls every arena today small, but Crossroads and Long Hall (#3071) medium, Shiverpeak Pass and Elonian Plateau (#2609), Moss Vale (#3288), Ashen Courtyard (#3413), Barrow Field (#3433), Blackwater Ford (#3434), Jungle Ruins (#3436), Broken Tower (#3437), Cinder Sanctum (#3438), Mosslit Cairns (#3439), Scarred Earth (#3440), Guild Hall Isle (#3445), The Elite Zaishen Battle (#3446), The Hollow Deep (#3444) and Hall of Heroes (#3442) large", () => {
    expect(Object.fromEntries(arenaBounds().map((map) => [map.id, sizeClass(map)]))).toEqual({
      "ember-pits": "small",
      "jungle-ruins": "large",
      "arena-crossroads": "medium",
      "arena-canyon": "small",
      "arena-long-hall": "medium",
      "guild-hall-isle": "large",
      "broken-tower": "large",
      "cinder-sanctum": "large",
      "threefold-keep": "large",
      "hall-of-heroes-king": "large",
      "hall-of-heroes-relic": "large",
      "hall-of-heroes-capture": "large",
      "barrow-field": "large",
      "elite-zaishen-battle": "large",
      "hollow-deep": "large",
      "blackwater-ford": "large",
      "mosslit-cairns": "large",
      "wardens-gallery": "large",
      "brazen-causeway": "large",
      "scarred-earth": "large",
      "sandstone-steps": "small",
      "frozen-crossing": "small",
      "ashen-courtyard": "large",
      "moss-vale": "large",
      "canthan-terraces": "small",
      "sunken-bastion": "small",
      "shiverpeak-pass": "large",
      "elonian-plateau": "large",
    });
  });
});
