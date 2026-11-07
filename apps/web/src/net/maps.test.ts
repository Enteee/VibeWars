import { ASCENT_ROUNDS, teamSizeOf } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  ARENA_MAPS,
  arenaIds,
  ASCENT_PROGRESSION,
  LOBBY_MODE_MATCH_MODES,
  ascentMapName,
  hostMap,
  mapFlagField,
  mapMode,
  mapRelicField,
  mapShrines,
  mapsForSize,
  modeMapIds,
  queueMapPool,
  randomArenaMapPool,
  teamArenaMapIds,
} from "./maps.js";

/** The team sizes the arena `id` declares. */
function sizesOf(id: string): readonly number[] {
  const map = ARENA_MAPS.find((candidate) => candidate.id === id);
  if (map === undefined) {
    throw new Error(`no arena ${id}`);
  }
  return map.teamSizes;
}

describe("randomArenaMapPool", () => {
  it("plays each size only on the arenas that declare it (#2108)", () => {
    expect(randomArenaMapPool("random-arena-1v1")).toEqual([
      "arena-pillars",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "sandstone-steps",
      "canthan-terraces",
    ]);
    expect(randomArenaMapPool("random-arena-2v2")).toEqual([
      "arena-pillars",
      "arena-split",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "frozen-crossing",
      "sunken-bastion",
    ]);
    expect(randomArenaMapPool("random-arena-4v4")).toEqual([
      "arena-pillars",
      "arena-split",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "ashen-courtyard",
      "shiverpeak-pass",
    ]);
  });

  it("never draws a 1v1 on an arena for 4 or 8", () => {
    for (const id of randomArenaMapPool("random-arena-1v1")) {
      expect(sizesOf(id), id).toContain(1);
    }
    expect(randomArenaMapPool("random-arena-1v1")).not.toContain("arena-split");
  });

  it("leaves no arena out of every pool but the Guild Battle's (#1222), the Relic Run's (#1374), King of the Hill's (#1377) and Moss Vale (#2605) and Elonian Plateau (#2609), for 8v8, which Random Arena does not play", () => {
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
              "broken-tower",
              "the-courtyard",
              "hall-of-heroes",
              "scarred-earth",
              "moss-vale",
              "elonian-plateau",
            ].includes(id),
        )
        .sort(),
    );
  });
});

describe("team sizes (#2108)", () => {
  it("has a map for every mode at every size it plays", () => {
    const pools: Record<string, readonly string[]> = {
      "Random Arena 1v1": randomArenaMapPool("random-arena-1v1"),
      "Random Arena 2v2": randomArenaMapPool("random-arena-2v2"),
      "Random Arena 4v4": randomArenaMapPool("random-arena-4v4"),
      "Team Arena 2v2": queueMapPool("team-arena-2v2", null),
      "Team Arena 4v4": queueMapPool("team-arena-4v4", null),
      "Team Arena 8v8": queueMapPool("team-arena-8v8", null),
      "Heroes' Ascent 8v8": queueMapPool("heroes-ascent", 0),
      "GvG 8v8": queueMapPool("gvg", null),
      ...Object.fromEntries(
        [1, 2, 4, 8].map((size) => [
          `Hosted Game ${String(size)}v${String(size)}`,
          mapsForSize(ARENA_MAPS, size).filter((map) =>
            modeMapIds()["hosted-game"].includes(map.id),
          ),
        ]),
      ),
    };
    for (const [name, pool] of Object.entries(pools)) {
      expect(pool, name).not.toHaveLength(0);
    }
  });

  it("gives each team mode only the maps that suit its size", () => {
    for (const [mode, size] of [
      ["heroes-ascent", 8],
      ["gvg", 8],
    ] as const) {
      for (const id of modeMapIds()[mode]) {
        expect(sizesOf(id), `${mode} ${id}`).toContain(size);
      }
    }
    expect(modeMapIds()["heroes-ascent"]).toEqual([
      "broken-tower",
      "the-courtyard",
      "scarred-earth",
    ]);
  });

  it("has a Relic Run and a Capture Points map for 4 and for 8 a side (#2551)", () => {
    for (const mode of ["relic-run", "capture-points"] as const) {
      for (const size of [4, 8]) {
        expect(
          mapsForSize(ARENA_MAPS, size).some((map) => map.mode === mode),
          `${mode} ${String(size)}`,
        ).toBe(true);
      }
    }
  });

  it("lists every map for a Hosted Game until its host picks a size (#2104)", () => {
    expect(modeMapIds()["hosted-game"]).toHaveLength(ARENA_MAPS.length);
  });

  it("lists a Team Arena's maps of every size, which its lobby narrows to its own (#2107)", () => {
    const all = modeMapIds()["team-arena"];
    for (const mode of ["team-arena-2v2", "team-arena-4v4", "team-arena-8v8"] as const) {
      expect(all).toEqual(expect.arrayContaining(queueMapPool(mode, null)));
    }
    expect(queueMapPool("team-arena-8v8", null)).not.toContain("arena-pillars");
  });

  it("plays Team Arena and a Hosted Game at 1, 2, 4 and 8 a side on the large arenas (#2547)", () => {
    for (const size of [1, 2, 4, 8]) {
      expect(teamArenaMapIds(size), `Team Arena ${String(size)}`).toEqual(
        expect.arrayContaining(["arena-crossroads", "arena-canyon", "arena-long-hall"]),
      );
      expect(
        mapsForSize(ARENA_MAPS, size).filter((map) => modeMapIds()["hosted-game"].includes(map.id)),
        `Hosted Game ${String(size)}`,
      ).not.toHaveLength(0);
    }
  });

  it("draws each medium and large arena at its own size and no other: Sandstone Steps 1v1, Frozen Crossing 2v2 (#2604), Ashen Courtyard 4v4, Moss Vale 8v8 (#2605), Canthan Terraces 1v1, Sunken Bastion 2v2 (#2607), Shiverpeak Pass 4v4, Elonian Plateau 8v8 (#2609)", () => {
    for (const [id, size] of [
      ["sandstone-steps", 1],
      ["frozen-crossing", 2],
      ["ashen-courtyard", 4],
      ["moss-vale", 8],
      ["canthan-terraces", 1],
      ["sunken-bastion", 2],
      ["shiverpeak-pass", 4],
      ["elonian-plateau", 8],
    ] as const) {
      expect(sizesOf(id)).toEqual([size]);
      for (const other of [1, 2, 4, 8]) {
        expect(teamArenaMapIds(other).includes(id), `Team Arena ${String(other)} ${id}`).toBe(
          other === size,
        );
      }
      for (const [mode, other] of [
        ["random-arena-1v1", 1],
        ["random-arena-2v2", 2],
        ["random-arena-4v4", 4],
      ] as const) {
        expect(randomArenaMapPool(mode).includes(id), `${mode} ${id}`).toBe(other === size);
      }
    }
    expect(queueMapPool("team-arena-2v2", null)).toContain("frozen-crossing");
    expect(queueMapPool("team-arena-4v4", null)).toContain("ashen-courtyard");
    expect(queueMapPool("team-arena-8v8", null)).toContain("moss-vale");
    expect(queueMapPool("team-arena-4v4", null)).toContain("shiverpeak-pass");
    expect(queueMapPool("team-arena-8v8", null)).toContain("elonian-plateau");
    expect(modeMapIds()["hosted-game"]).toEqual(
      expect.arrayContaining([
        "sandstone-steps",
        "frozen-crossing",
        "ashen-courtyard",
        "moss-vale",
        "canthan-terraces",
        "sunken-bastion",
        "shiverpeak-pass",
        "elonian-plateau",
      ]),
    );
  });

  it("has no Arena Alpha, Open Field or The Ring, and starts a lobby on Crossroads (#2547)", () => {
    for (const id of ["arena-alpha", "arena-open", "arena-ring"]) {
      expect(arenaIds(), id).not.toContain(id);
    }
    expect(arenaIds()[0]).toBe("arena-crossroads");
  });

  it("picks the maps of a size in their order", () => {
    expect(mapsForSize(ARENA_MAPS, 8).map((map) => map.id)).toEqual([
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "moss-vale",
      "elonian-plateau",
      "guild-hall-isle",
      "broken-tower",
      "the-courtyard",
      "hall-of-heroes",
      "scarred-earth",
    ]);
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
  it("draws a Team Arena's match from its modes' maps that suit its size (#2107)", () => {
    for (const mode of ["team-arena-2v2", "team-arena-4v4", "team-arena-8v8"] as const) {
      for (const id of queueMapPool(mode, null)) {
        expect(sizesOf(id), `${mode} ${id}`).toContain(teamSizeOf(mode));
        expect(LOBBY_MODE_MATCH_MODES["team-arena"], id).toContain(mapMode(id));
      }
    }
  });

  it("draws a team mode's match from its own maps, and a Random Arena's from its pool", () => {
    expect(queueMapPool("gvg", null)).toEqual(modeMapIds().gvg);
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
      ["broken-tower", "relic-run"],
      ["scarred-earth", "capture-points"],
      ["the-courtyard", "king-of-the-hill"],
      ["hall-of-heroes", "king-of-the-hill"],
    ]);
    expect(ASCENT_PROGRESSION.map((_, round) => ascentMapName(round))).toEqual([
      "Broken Tower",
      "Scarred Earth",
      "The Courtyard",
      "Hall of Heroes",
    ]);
  });

  it("plays every round on a map made for its team size (#2108)", () => {
    for (const id of ASCENT_PROGRESSION) {
      expect(sizesOf(id), id).toContain(teamSizeOf("heroes-ascent"));
    }
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

  it("carries the mode its map names: Kill Count on Pillar Hall, Priest Annihilation on Split Paths, Guild Battle on Guild Hall Isle, Relic Run on Broken Tower, King of the Hill on The Courtyard, Capture Points on Scarred Earth, Annihilation elsewhere", () => {
    expect(hostMap("arena-pillars")?.mode).toBe("kill-count");
    expect(hostMap("arena-split")?.mode).toBe("priest-annihilation");
    expect(hostMap("guild-hall-isle")?.mode).toBe("guild-battle");
    expect(hostMap("broken-tower")?.mode).toBe("relic-run");
    expect(hostMap("the-courtyard")?.mode).toBe("king-of-the-hill");
    expect(hostMap("scarred-earth")?.mode).toBe("capture-points");
    expect(hostMap("scarred-earth")?.capturePoints).toHaveLength(5);
    for (const map of ARENA_MAPS.filter(
      (candidate) =>
        ![
          "arena-pillars",
          "arena-split",
          "guild-hall-isle",
          "broken-tower",
          "the-courtyard",
          "hall-of-heroes",
          "scarred-earth",
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
    expect(hostMap("broken-tower")?.relicField).toEqual({
      altar: { x: 1600, y: 900 },
      spawns: [
        { team: 0, position: { x: 120, y: 900 } },
        { team: 1, position: { x: 3080, y: 900 } },
      ],
    });
    expect(mapRelicField("broken-tower")).toEqual(hostMap("broken-tower")?.relicField);
    expect(hostMap("guild-hall-isle")?.relicField).toBeUndefined();
    expect(hostMap("the-courtyard")?.relicField).toBeUndefined();
    expect(mapRelicField("training-hall")).toBeUndefined();
  });

  it("carries a ghost map's level and ghost spawns, King of the Hill's altar, and none elsewhere (#1377, #2689)", () => {
    expect(hostMap("hall-of-heroes")?.ghostField?.level).toBe(28);
    expect(hostMap("the-courtyard")?.ghostField).toEqual({
      level: 24,
      altar: { x: 1500, y: 900 },
      spawns: [
        { team: 0, position: { x: 120, y: 900 } },
        { team: 1, position: { x: 2880, y: 900 } },
      ],
    });
    expect(hostMap("broken-tower")?.ghostField).toBeUndefined();
    expect(hostMap("arena-crossroads")?.ghostField).toBeUndefined();
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
    expect(mapMode("arena-crossroads")).toBe("annihilation");
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
    expect(mapShrines("arena-crossroads")).toEqual([]);
    expect(mapShrines("arena-nowhere")).toEqual([]);
  });
});
