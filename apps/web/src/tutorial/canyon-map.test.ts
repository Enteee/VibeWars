import { describe, expect, it } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import {
  CANYON_ARRIVAL,
  CANYON_BAY,
  CANYON_EXIT,
  CANYON_NORTH_ARM,
  CANYON_REJOIN,
  CANYON_SITES,
  CANYON_SOUTH_ARM,
  TUTORIAL_CANYON,
} from "./canyon-map.js";

describe("the tutorial canyon (#3245)", () => {
  it("is one volcanic map (#3792), in no arena or training list", () => {
    expect(TUTORIAL_CANYON.id).toBe("tutorial-canyon");
    expect(TUTORIAL_CANYON.biome).toBe("volcanic");
    expect(ARENA_MAPS.map(({ id }) => id)).not.toContain(TUTORIAL_CANYON.id);
    expect(TRAINING_MAPS.has(TUTORIAL_CANYON.id)).toBe(false);
  });

  it("reads the arrival, sites 4 to 14 but 10, the junction and the exit from the map's marks", () => {
    expect([...CANYON_SITES.keys()]).toEqual([4, 5, 6, 7, 8, 9, 11, 12, 13, 14]);
    expect(CANYON_ARRIVAL).toEqual({ position: { x: 1000, y: 3500 }, layer: 1 });
    expect(CANYON_EXIT).toEqual({ position: { x: 7600, y: 700 }, layer: 1 });
    // The tunnel's site is below the ground.
    expect(CANYON_SITES.get(11)?.layer).toBe(0);
    expect(CANYON_SITES.get(5)?.position.x).toBeGreaterThan(CANYON_SITES.get(4)?.position.x ?? 0);
    // The second row walks west, the third east.
    expect(CANYON_SITES.get(9)?.position.x).toBeLessThan(CANYON_SITES.get(8)?.position.x ?? 0);
    expect(CANYON_SITES.get(12)?.position.x).toBeGreaterThan(CANYON_SITES.get(11)?.position.x ?? 0);
    // The junction: an arm north and one south of its fork, rejoining east of both.
    const fork = CANYON_SITES.get(13)?.position ?? { x: 0, y: 0 };
    expect(CANYON_NORTH_ARM.position.y).toBeLessThan(fork.y);
    expect(CANYON_SOUTH_ARM.position.y).toBeGreaterThan(fork.y);
    expect(CANYON_REJOIN.position.x).toBeGreaterThan(CANYON_NORTH_ARM.position.x);
    expect(CANYON_REJOIN.position.y).toBe(fork.y);
    expect(CANYON_BAY.position.y).toBeGreaterThan(CANYON_SOUTH_ARM.position.y);
  });
});
