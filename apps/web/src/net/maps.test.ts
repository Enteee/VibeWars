import { sizeClass } from "@vibewars/game-maps/size-class";
import { describe, expect, it } from "vitest";

import { ARENA_MAPS, hostMap, mapMode, mapShrines, randomArenaMapPool } from "./maps.js";

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

  it("leaves no arena out of every pool but the Guild Battle's (#1222)", () => {
    const pooled = new Set(
      (["random-arena-1v1", "random-arena-2v2", "random-arena-4v4"] as const).flatMap((mode) =>
        randomArenaMapPool(mode),
      ),
    );
    expect([...pooled].sort()).toEqual(
      ARENA_MAPS.map((map) => map.id)
        .filter((id) => id !== "guild-hall-isle")
        .sort(),
    );
  });
});

describe("hostMap (#476)", () => {
  it("leaves Kill Count maps in the Random Arena pool: the map decides the mode", () => {
    expect(randomArenaMapPool("random-arena-1v1").map((id) => hostMap(id)?.mode)).toContain(
      "kill-count",
    );
  });

  it("carries the mode its map names: Kill Count on Pillar Hall, Priest Annihilation on Split Paths, Guild Battle on Guild Hall Isle, Annihilation elsewhere", () => {
    expect(hostMap("arena-pillars")?.mode).toBe("kill-count");
    expect(hostMap("arena-split")?.mode).toBe("priest-annihilation");
    expect(hostMap("guild-hall-isle")?.mode).toBe("guild-battle");
    for (const map of ARENA_MAPS.filter(
      (candidate) => !["arena-pillars", "arena-split", "guild-hall-isle"].includes(candidate.id),
    )) {
      expect(hostMap(map.id)?.mode).toBe("annihilation");
    }
  });

  it("carries a Guild Battle map's Guild Lords and shrines apart, and none elsewhere (#1222)", () => {
    expect(hostMap("guild-hall-isle")?.guildLords).toEqual([
      { team: 0, position: { x: 80, y: 1000 } },
      { team: 1, position: { x: 2920, y: 1000 } },
    ]);
    expect(hostMap("guild-hall-isle")?.shrines).toEqual([
      { team: 0, position: { x: 450, y: 1000 } },
      { team: 1, position: { x: 2550, y: 1000 } },
    ]);
    expect(hostMap("arena-split")?.guildLords).toEqual([]);
  });
});

describe("mapMode (#1200)", () => {
  it("reads an arena's mode and a training ground's", () => {
    expect(mapMode("arena-pillars")).toBe("kill-count");
    expect(mapMode("arena-alpha")).toBe("annihilation");
    expect(mapMode("training-hall")).toBe("annihilation");
  });

  it("gives a map this build does not have Annihilation's", () => {
    expect(mapMode("arena-nowhere")).toBe("annihilation");
  });
});

describe("mapShrines (#1199)", () => {
  it("reads each team's shrine from a priest map's file", () => {
    expect(mapShrines("arena-split")).toEqual([
      { team: 0, position: { x: 50, y: 350 } },
      { team: 1, position: { x: 950, y: 350 } },
    ]);
  });

  it("gives none on a map without them or one this build does not have", () => {
    expect(mapShrines("arena-alpha")).toEqual([]);
    expect(mapShrines("arena-nowhere")).toEqual([]);
  });
});
