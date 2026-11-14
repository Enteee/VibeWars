import { describe, expect, it } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import {
  CANYON_ARRIVAL,
  CANYON_ARRIVALS,
  CANYON_EXIT,
  CANYON_EXITS,
  CANYON_SITES,
  TUTORIAL_CANYON,
} from "./canyon-map.js";

describe("the tutorial canyon (#3245)", () => {
  it("is two volcanic maps, in no arena or training list", () => {
    for (const map of TUTORIAL_CANYON) {
      expect(map.biome).toBe("volcanic");
      expect(ARENA_MAPS.map(({ id }) => id)).not.toContain(map.id);
      expect(TRAINING_MAPS.has(map.id)).toBe(false);
    }
  });

  it("reads the arrivals, sites 4 to 14 and the exits from the maps' marks", () => {
    const [first, second] = TUTORIAL_CANYON;
    expect([...CANYON_SITES.keys()]).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(CANYON_ARRIVAL).toEqual({ map: first, position: { x: 1000, y: 1800 }, layer: 0 });
    expect(CANYON_EXIT).toEqual({ map: second, position: { x: 7600, y: 700 }, layer: 1 });
    expect(CANYON_ARRIVALS.map(({ map }) => map)).toEqual([first, second]);
    expect(CANYON_EXITS.map(({ map }) => map)).toEqual([first, second]);
    // Stations 4 to 7 are on the first map, 8 to 14 on the second.
    expect([...CANYON_SITES.values()].map(({ map }) => map.id)).toEqual([
      ...Array<string>(4).fill(first.id),
      ...Array<string>(7).fill(second.id),
    ]);
    // The tunnel's site is below the ground.
    expect(CANYON_SITES.get(11)?.layer).toBe(0);
    expect(CANYON_SITES.get(5)?.position.x).toBeGreaterThan(CANYON_SITES.get(4)?.position.x ?? 0);
    // The second map starts at the east end of its row and walks west.
    expect(CANYON_SITES.get(8)?.position.x).toBeLessThan(CANYON_ARRIVALS[1].position.x);
  });
});
