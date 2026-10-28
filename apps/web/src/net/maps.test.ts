import { sizeClass } from "@vibewars/game-maps/size-class";
import { describe, expect, it } from "vitest";

import { ARENA_MAPS, hostMap, randomArenaMapPool } from "./maps.js";

function sizesOf(ids: readonly string[]): string[] {
  return ids.map((id) => {
    const map = ARENA_MAPS.find((candidate) => candidate.id === id);
    if (map === undefined) {
      throw new Error(`no arena ${id}`);
    }
    return sizeClass(map);
  });
}

describe("randomArenaMapPool", () => {
  it("plays a 1v1 and a 2v2 on the small arenas", () => {
    for (const mode of ["random-arena-1v1", "random-arena-2v2"] as const) {
      const pool = randomArenaMapPool(mode);
      expect(pool).toEqual(["arena-alpha", "arena-open", "arena-pillars", "arena-split"]);
      expect(new Set(sizesOf(pool))).toEqual(new Set(["small"]));
    }
  });

  it("plays a 4v4 on every medium and large arena", () => {
    const pool = randomArenaMapPool("random-arena-4v4");
    expect(pool).toEqual(["arena-ring", "arena-crossroads", "arena-canyon", "arena-long-hall"]);
    expect(sizesOf(pool)).not.toContain("small");
  });

  it("leaves no arena out of every pool", () => {
    const pooled = new Set(
      (["random-arena-1v1", "random-arena-2v2", "random-arena-4v4"] as const).flatMap((mode) =>
        randomArenaMapPool(mode),
      ),
    );
    expect([...pooled].sort()).toEqual(ARENA_MAPS.map((map) => map.id).sort());
  });
});

describe("hostMap (#476)", () => {
  it("leaves Kill Count maps in the Random Arena pool: the map decides the mode", () => {
    expect(randomArenaMapPool("random-arena-1v1").map((id) => hostMap(id)?.mode)).toContain(
      "kill-count",
    );
  });

  it("carries the mode its map names: Kill Count on Pillar Hall, Annihilation elsewhere", () => {
    expect(hostMap("arena-pillars")?.mode).toBe("kill-count");
    for (const map of ARENA_MAPS.filter((candidate) => candidate.id !== "arena-pillars")) {
      expect(hostMap(map.id)?.mode).toBe("annihilation");
    }
  });
});
