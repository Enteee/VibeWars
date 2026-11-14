import { describe, expect, it } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import { CANYON_ARRIVAL, CANYON_EXIT, CANYON_SITES, TUTORIAL_CANYON } from "./canyon-map.js";

describe("the tutorial canyon (#3245)", () => {
  it("is volcanic, 8400 by 4100, and in no arena or training list", () => {
    expect(TUTORIAL_CANYON.biome).toBe("volcanic");
    expect([TUTORIAL_CANYON.width, TUTORIAL_CANYON.height]).toEqual([8400, 4100]);
    expect(ARENA_MAPS.map(({ id }) => id)).not.toContain(TUTORIAL_CANYON.id);
    expect(TRAINING_MAPS.has(TUTORIAL_CANYON.id)).toBe(false);
  });

  it("reads the arrival, sites 4 to 14 and the exit from the map's marks", () => {
    expect([...CANYON_SITES.keys()]).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(CANYON_ARRIVAL).toEqual({ position: { x: 1000, y: 3500 }, layer: 1 });
    expect(CANYON_EXIT).toEqual({ position: { x: 7600, y: 700 }, layer: 1 });
    // The tunnel's site is below the ground.
    expect(CANYON_SITES.get(11)?.layer).toBe(0);
    // Each site is east of the last along a row, or a turn north of it.
    expect(CANYON_SITES.get(5)?.position.x).toBeGreaterThan(CANYON_SITES.get(4)?.position.x ?? 0);
    expect(CANYON_SITES.get(8)?.position.y).toBeLessThan(CANYON_SITES.get(7)?.position.y ?? 0);
  });
});
