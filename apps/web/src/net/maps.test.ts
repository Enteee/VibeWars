import { sizeClass } from "@vibewars/game-maps/size-class";
import { ASCENT_ROUNDS } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  ARENA_MAPS,
  ASCENT_PROGRESSION,
  ascentMapName,
  hostMap,
  mapFlagField,
  mapMode,
  mapRelicField,
  mapShrines,
  modeMapIds,
  queueMapPool,
  randomArenaMapPool,
} from "./maps.js";

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

  it("leaves no arena out of every pool but the Guild Battle's (#1222), the Relic Run's (#1374) and King of the Hill's (#1377)", () => {
    const pooled = new Set(
      (["random-arena-1v1", "random-arena-2v2", "random-arena-4v4"] as const).flatMap((mode) =>
        randomArenaMapPool(mode),
      ),
    );
    expect([...pooled].sort()).toEqual(
      ARENA_MAPS.map((map) => map.id)
        .filter(
          (id) =>
            ![
              "guild-hall-isle",
              "relic-temples",
              "hill-courtyard",
              "hall-of-heroes",
              "forgotten-shrines",
            ].includes(id),
        )
        .sort(),
    );
  });
});

describe("the Hall of Heroes (#1995)", () => {
  it("is a Hosted Game's pick, and a queued Ascent's last round alone (#1996)", () => {
    expect(modeMapIds()["hosted-game"]).toContain("hall-of-heroes");
    expect(modeMapIds()["heroes-ascent"]).not.toContain("hall-of-heroes");
    expect(queueMapPool("heroes-ascent", ASCENT_ROUNDS - 1)).toEqual(["hall-of-heroes"]);
    expect(modeMapIds()["team-arena"]).not.toContain("hall-of-heroes");
    expect(modeMapIds()["random-arena"]).toContain("hall-of-heroes");
  });
});

describe("queueMapPool (#1766)", () => {
  it("draws a team mode's match from its own maps, and a Random Arena's from its pool", () => {
    for (const mode of ["team-arena", "gvg"] as const) {
      expect(queueMapPool(mode, null)).toEqual(modeMapIds()[mode]);
      expect(queueMapPool(mode, null)).not.toHaveLength(0);
    }
    expect(queueMapPool("random-arena-2v2", null)).toEqual(randomArenaMapPool("random-arena-2v2"));
  });

  it("draws a Heroes' Ascent's match from its round's one map (#1996)", () => {
    expect(ASCENT_PROGRESSION.map((_, round) => queueMapPool("heroes-ascent", round))).toEqual(
      ASCENT_PROGRESSION.map((id) => [id]),
    );
    expect(() => queueMapPool("heroes-ascent", null)).toThrow();
    expect(() => queueMapPool("heroes-ascent", ASCENT_ROUNDS)).toThrow();
  });
});

describe("the Heroes' Ascent progression (#1996)", () => {
  it("is four rounds: Relic Run, Capture Points, King of the Hill, then the Hall", () => {
    expect(ASCENT_PROGRESSION).toHaveLength(ASCENT_ROUNDS);
    expect(ASCENT_PROGRESSION.map((id) => [id, hostMap(id)?.mode])).toEqual([
      ["relic-temples", "relic-run"],
      ["forgotten-shrines", "capture-points"],
      ["hill-courtyard", "king-of-the-hill"],
      ["hall-of-heroes", "king-of-the-hill"],
    ]);
    expect(ASCENT_PROGRESSION.map((_, round) => ascentMapName(round))).toEqual([
      "Relic Temples",
      "Forgotten Shrines",
      "Hill Courtyard",
      "Hall of Heroes",
    ]);
  });

  it("starts a coded Ascent lobby on its first round's map (#1994)", () => {
    expect(modeMapIds()["heroes-ascent"][0]).toBe(ASCENT_PROGRESSION[0]);
  });
});

describe("hostMap (#476)", () => {
  it("leaves Kill Count maps in the Random Arena pool: the map decides the mode", () => {
    expect(randomArenaMapPool("random-arena-1v1").map((id) => hostMap(id)?.mode)).toContain(
      "kill-count",
    );
  });

  it("carries the mode its map names: Kill Count on Pillar Hall, Priest Annihilation on Split Paths, Guild Battle on Guild Hall Isle, Relic Run on Relic Temples, King of the Hill on Hill Courtyard, Capture Points on Forgotten Shrines, Annihilation elsewhere", () => {
    expect(hostMap("arena-pillars")?.mode).toBe("kill-count");
    expect(hostMap("arena-split")?.mode).toBe("priest-annihilation");
    expect(hostMap("guild-hall-isle")?.mode).toBe("guild-battle");
    expect(hostMap("relic-temples")?.mode).toBe("relic-run");
    expect(hostMap("hill-courtyard")?.mode).toBe("king-of-the-hill");
    expect(hostMap("forgotten-shrines")?.mode).toBe("capture-points");
    expect(hostMap("forgotten-shrines")?.capturePoints).toHaveLength(5);
    for (const map of ARENA_MAPS.filter(
      (candidate) =>
        ![
          "arena-pillars",
          "arena-split",
          "guild-hall-isle",
          "relic-temples",
          "hill-courtyard",
          "hall-of-heroes",
          "forgotten-shrines",
        ].includes(candidate.id),
    )) {
      expect(hostMap(map.id)?.capturePoints).toEqual([]);
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

  it("carries a Guild Battle map's flag stand and flag spawns, and none elsewhere (#1225)", () => {
    expect(hostMap("guild-hall-isle")?.flagField).toEqual({
      stand: { x: 1500, y: 1000 },
      spawns: [
        { team: 0, position: { x: 560, y: 1000 } },
        { team: 1, position: { x: 2440, y: 1000 } },
      ],
    });
    expect(mapFlagField("guild-hall-isle")).toEqual(hostMap("guild-hall-isle")?.flagField);
    expect(hostMap("arena-split")?.flagField).toBeUndefined();
    expect(mapFlagField("training-hall")).toBeUndefined();
  });

  it("carries a Relic Run map's altar and relic spawns, and none elsewhere (#1374)", () => {
    expect(hostMap("relic-temples")?.relicField).toEqual({
      altar: { x: 1100, y: 700 },
      spawns: [
        { team: 0, position: { x: 110, y: 700 } },
        { team: 1, position: { x: 2090, y: 700 } },
      ],
    });
    expect(mapRelicField("relic-temples")).toEqual(hostMap("relic-temples")?.relicField);
    expect(hostMap("guild-hall-isle")?.relicField).toBeUndefined();
    expect(hostMap("hill-courtyard")?.relicField).toBeUndefined();
    expect(mapRelicField("training-hall")).toBeUndefined();
  });

  it("carries a King of the Hill map's altar and ghost spawns, and none elsewhere (#1377)", () => {
    expect(hostMap("hill-courtyard")?.hillField).toEqual({
      altar: { x: 1000, y: 700 },
      spawns: [
        { team: 0, position: { x: 200, y: 700 } },
        { team: 1, position: { x: 1800, y: 700 } },
      ],
    });
    expect(hostMap("relic-temples")?.hillField).toBeUndefined();
    expect(hostMap("arena-alpha")?.hillField).toBeUndefined();
  });

  it("carries a Guild Battle map's guards in its order, and none elsewhere (#1223)", () => {
    const guards = hostMap("guild-hall-isle")?.guards ?? [];
    expect(guards).toHaveLength(16);
    expect(guards[0]).toEqual({ team: 0, role: "bodyguard", position: { x: 170, y: 1000 } });
    expect(hostMap("arena-split")?.guards).toEqual([]);
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
