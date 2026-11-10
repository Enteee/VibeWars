import { MAX_CAPTURE_POINTS } from "@vibewars/game-maps/schema";
import { ASCENT_ROUNDS, MAX_WIRE_CAPTURE_POINTS, teamSizeOf } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { mapName } from "../i18n/game-names.js";
import { TRAINING_MAPS } from "../training/maps.js";
import {
  ARENA_MAPS,
  arenaIds,
  ascentMapId,
  HALL_OF_HEROES_MAPS,
  mapMatchRules,
  ascentRoundOf,
  ASCENT_PROGRESSION,
  LOBBY_MODE_MATCH_MODES,
  hostMap,
  mapFlagField,
  mapMode,
  mapRelicField,
  mapShrines,
  mapsForSize,
  modeMapIds,
  queueMapPool,
  queueSkipping,
  structureOf,
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

describe("the wire and the map schema (#2698)", () => {
  it("carries every capture point a map may have", () => {
    expect(MAX_WIRE_CAPTURE_POINTS).toBe(MAX_CAPTURE_POINTS);
  });
});

describe("randomArenaMapPool", () => {
  it("plays each size only on the arenas that declare it (#2108)", () => {
    expect(randomArenaMapPool("random-arena-1v1")).toEqual([
      "ember-pits",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "sandstone-steps",
      "canthan-terraces",
    ]);
    expect(randomArenaMapPool("random-arena-2v2")).toEqual([
      "ember-pits",
      "jungle-ruins",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "frozen-crossing",
      "sunken-bastion",
    ]);
    expect(randomArenaMapPool("random-arena-4v4")).toEqual([
      "ember-pits",
      "jungle-ruins",
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
    expect(randomArenaMapPool("random-arena-1v1")).not.toContain("jungle-ruins");
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
              "cinder-sanctum",
              "threefold-keep",
              "hall-of-heroes-king",
              "hall-of-heroes-relic",
              "hall-of-heroes-capture",
              "barrow-field",
              "elite-zaishen-battle",
              "hollow-deep",
              "blackwater-ford",
              "mosslit-cairns",
              "wardens-gallery",
              "brazen-causeway",
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
      "hollow-deep",
      "blackwater-ford",
      "barrow-field",
      "cinder-sanctum",
      "mosslit-cairns",
      "brazen-causeway",
      "threefold-keep",
      "wardens-gallery",
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
    // But the Elite Zaishen Battle, which only a run starts (#2692).
    expect(modeMapIds()["hosted-game"]).toHaveLength(ARENA_MAPS.length - 1);
  });

  it("lists a Team Arena's maps of every size, which its lobby narrows to its own (#2107)", () => {
    const all = modeMapIds()["team-arena"];
    for (const mode of ["team-arena-2v2", "team-arena-4v4", "team-arena-8v8"] as const) {
      expect(all).toEqual(expect.arrayContaining(queueMapPool(mode, null)));
    }
    for (const id of queueMapPool("team-arena-8v8", null)) {
      expect(sizesOf(id), id).toContain(8);
    }
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
      "ember-pits",
      "jungle-ruins",
      "arena-crossroads",
      "arena-canyon",
      "arena-long-hall",
      "moss-vale",
      "elonian-plateau",
      "guild-hall-isle",
      "cinder-sanctum",
      "broken-tower",
      "threefold-keep",
      "hall-of-heroes-king",
      "hall-of-heroes-relic",
      "hall-of-heroes-capture",
      "barrow-field",
      "elite-zaishen-battle",
      "hollow-deep",
      "blackwater-ford",
      "mosslit-cairns",
      "wardens-gallery",
      "brazen-causeway",
      "scarred-earth",
    ]);
  });
});

describe("the Hall of Heroes (#1995)", () => {
  it("skips ahead only between The Underworld and the Hall (#2687)", () => {
    const hall = ASCENT_PROGRESSION.length - 1;
    expect(queueSkipping("heroes-ascent", 0)).toBe(false);
    expect(queueSkipping("heroes-ascent", 1)).toBe(true);
    expect(queueSkipping("heroes-ascent", hall - 1)).toBe(true);
    expect(queueSkipping("heroes-ascent", hall)).toBe(false);
    expect(queueSkipping("gvg", null)).toBe(false);
  });

  it("finds the round a map is played at, and refuses one that is none (#2687)", () => {
    expect(ascentRoundOf(ascentMapId(3))).toBe(3);
    expect(() => ascentRoundOf("nowhere")).toThrow(RangeError);
  });

  it("finds the Hall's round for every map the Hall draws (#2700)", () => {
    for (const id of HALL_OF_HEROES_MAPS) {
      expect(ascentRoundOf(id)).toBe(ASCENT_PROGRESSION.length - 1);
    }
  });

  it("is a Hosted Game's pick, and a queued Ascent's last round alone (#1996)", () => {
    expect(modeMapIds()["hosted-game"]).toContain("hall-of-heroes-king");
    for (const id of HALL_OF_HEROES_MAPS) {
      expect(modeMapIds()["heroes-ascent"]).not.toContain(id);
    }
    expect(queueMapPool("heroes-ascent", ASCENT_PROGRESSION.length - 1)).toEqual([
      "hall-of-heroes-king",
      "hall-of-heroes-relic",
      "hall-of-heroes-capture",
    ]);
    expect(modeMapIds()["team-arena"]).not.toContain("hall-of-heroes-king");
    expect(modeMapIds()["team-arena"]).not.toContain("barrow-field");
    expect(modeMapIds()["hosted-game"]).toContain("barrow-field");
    expect(modeMapIds()["hosted-game"]).not.toContain("elite-zaishen-battle");
    expect(modeMapIds()["team-arena"]).not.toContain("hollow-deep");
    expect(modeMapIds()["hosted-game"]).toContain("blackwater-ford");
    expect(modeMapIds()["random-arena"]).toContain("hall-of-heroes-king");
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

  it("draws a Heroes' Ascent's match from its round's one map, the Hall's from its three (#1996, #2700)", () => {
    expect(ASCENT_PROGRESSION.map((_, round) => queueMapPool("heroes-ascent", round))).toEqual(
      ASCENT_PROGRESSION.map((id) =>
        HALL_OF_HEROES_MAPS.includes(id) ? HALL_OF_HEROES_MAPS : [id],
      ),
    );
    expect(() => queueMapPool("heroes-ascent", null)).toThrow();
    expect(() => queueMapPool("heroes-ascent", ASCENT_PROGRESSION.length)).toThrow();
  });
});

describe("the Heroes' Ascent progression (#1996)", () => {
  it("is the maps built so far in GW1's order, the stand-ins in their slots (#2686)", () => {
    expect(ASCENT_PROGRESSION.length).toBeLessThanOrEqual(ASCENT_ROUNDS);
    expect(ASCENT_PROGRESSION.map((id) => [id, hostMap(id)?.mode])).toEqual([
      ["hollow-deep", "annihilation"],
      ["blackwater-ford", "priest-annihilation"],
      ["barrow-field", "priest-annihilation"],
      ["cinder-sanctum", "relic-run"],
      ["mosslit-cairns", "capture-points"],
      ["brazen-causeway", "priest-annihilation"],
      ["threefold-keep", "king-of-the-hill"],
      ["wardens-gallery", "capture-points"],
      ["hall-of-heroes-king", "king-of-the-hill"],
    ]);
    expect(ASCENT_PROGRESSION.map((_, round) => mapName(ascentMapId(round)))).toEqual([
      "The Hollow Deep",
      "Blackwater Ford",
      "Barrow Field",
      "Cinder Sanctum",
      "Mosslit Cairns",
      "The Brazen Causeway",
      "Threefold Keep",
      "The Warden's Gallery",
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

  it("carries the mode its map names: Kill Count on Ember Pits, Priest Annihilation on Jungle Ruins, Guild Battle on Guild Hall Isle, Relic Run on Broken Tower, King of the Hill on The Courtyard, Capture Points on Scarred Earth, Annihilation elsewhere", () => {
    expect(hostMap("ember-pits")?.mode).toBe("kill-count");
    expect(hostMap("jungle-ruins")?.mode).toBe("priest-annihilation");
    expect(hostMap("guild-hall-isle")?.mode).toBe("guild-battle");
    expect(hostMap("broken-tower")?.mode).toBe("relic-run");
    expect(hostMap("threefold-keep")?.mode).toBe("king-of-the-hill");
    expect(hostMap("scarred-earth")?.mode).toBe("capture-points");
    expect(hostMap("scarred-earth")?.capturePoints).toHaveLength(5);
    for (const map of ARENA_MAPS.filter(
      (candidate) =>
        ![
          "ember-pits",
          "jungle-ruins",
          "barrow-field",
          "blackwater-ford",
          "mosslit-cairns",
          "wardens-gallery",
          "brazen-causeway",
          "guild-hall-isle",
          "broken-tower",
          "cinder-sanctum",
          "threefold-keep",
          "hall-of-heroes-king",
          "hall-of-heroes-relic",
          "hall-of-heroes-capture",
          "scarred-earth",
        ].includes(candidate.id),
    )) {
      expect(hostMap(map.id)?.capturePoints).toEqual([]);
      expect(hostMap(map.id)?.mode).toBe("annihilation");
    }
  });

  it("carries a flat arena's one layer, its walls all on the ground (#3017)", () => {
    for (const map of ARENA_MAPS.filter((candidate) => candidate.layers === 1)) {
      const host = hostMap(map.id);
      expect(host?.layers.count).toBe(1);
      expect(host?.layers.walls[0]).toEqual(host?.walls);
    }
  });

  it("carries a Guild Battle map's Guild Lords and shrines apart, and none elsewhere (#1222)", () => {
    expect(hostMap("guild-hall-isle")?.guildLords).toEqual([
      { team: 0, position: { x: 80, y: 1000 }, layer: 0 },
      { team: 1, position: { x: 2920, y: 1000 }, layer: 0 },
    ]);
    expect(hostMap("guild-hall-isle")?.shrines).toEqual([
      { team: 0, position: { x: 450, y: 1000 }, layer: 0 },
      { team: 1, position: { x: 2550, y: 1000 }, layer: 0 },
    ]);
    expect(hostMap("jungle-ruins")?.guildLords).toEqual([]);
  });

  it("carries a Guild Battle map's flag stand and flag spawns, and none elsewhere (#1225)", () => {
    expect(hostMap("guild-hall-isle")?.flagField).toEqual({
      stand: { x: 1500, y: 1000 },
      standLayer: 0,
      beacon: false,
      spawns: [
        { team: 0, position: { x: 560, y: 1000 }, layer: 0 },
        { team: 1, position: { x: 2440, y: 1000 }, layer: 0 },
      ],
    });
    expect(mapFlagField("guild-hall-isle")).toEqual(hostMap("guild-hall-isle")?.flagField);
    expect(hostMap("barrow-field")?.flagField?.beacon).toBe(true);
    expect(hostMap("jungle-ruins")?.flagField).toBeUndefined();
    expect(mapFlagField("training-hall")).toBeUndefined();
  });

  it("carries a Relic Run map's altar and relic spawns, and none elsewhere (#1374)", () => {
    expect(hostMap("broken-tower")?.relicField).toEqual({
      altar: { x: 1600, y: 900 },
      altarLayer: 0,
      relicTarget: "altar",
      relicCarry: "own",
      spawns: [
        { team: 0, position: { x: 120, y: 900 }, layer: 0 },
        { team: 1, position: { x: 3080, y: 900 }, layer: 0 },
      ],
    });
    expect(mapRelicField("broken-tower", 2)).toEqual(hostMap("broken-tower")?.relicField);
    expect(hostMap("guild-hall-isle")?.relicField).toBeUndefined();
    expect(hostMap("threefold-keep")?.relicField).toBeUndefined();
    expect(mapRelicField("training-hall", 2)).toBeUndefined();
  });

  it("carries a ghost map's level and ghost spawns, King of the Hill's altar, and none elsewhere (#1377, #2689)", () => {
    expect(hostMap("hall-of-heroes-king")?.ghostField?.level).toBe(28);
    expect(hostMap("threefold-keep")?.ghostField).toEqual({
      level: 24,
      altar: { x: 1600, y: 1100 },
      altarLayer: 0,
      spawns: [
        { team: 0, position: { x: 120, y: 1100 }, layer: 0 },
        { team: 1, position: { x: 3080, y: 1100 }, layer: 0 },
        { team: 2, position: { x: 1600, y: 120 }, layer: 0 },
      ],
    });
    expect(hostMap("broken-tower")?.ghostField).toBeUndefined();
    expect(hostMap("arena-crossroads")?.ghostField).toBeUndefined();
  });

  it("carries a Guild Battle map's guards in its order, and none elsewhere (#1223)", () => {
    const guards = hostMap("guild-hall-isle")?.guards ?? [];
    expect(guards).toHaveLength(16);
    expect(guards[0]).toEqual({
      team: 0,
      role: "bodyguard",
      position: { x: 170, y: 1000 },
      layer: 0,
    });
    expect(hostMap("jungle-ruins")?.guards).toEqual([]);
  });
});

describe("mapMode (#1200)", () => {
  it("reads an arena's mode and a training ground's", () => {
    expect(mapMode("ember-pits")).toBe("kill-count");
    expect(mapMode("arena-crossroads")).toBe("annihilation");
    expect(mapMode("training-hall")).toBe("annihilation");
  });

  it("gives a map this build does not have Annihilation's", () => {
    expect(mapMode("arena-nowhere")).toBe("annihilation");
  });
});

describe("a Hall match of two teams (#2700)", () => {
  it("goes without the third base: its spawns, ghost, relic, shrine and point", () => {
    expect(hostMap("hall-of-heroes-king", 2)?.ghostField?.spawns.map((s) => s.team)).toEqual([
      0, 1,
    ]);
    expect(hostMap("hall-of-heroes-relic", 2)?.relicField?.spawns).toHaveLength(2);
    expect(hostMap("hall-of-heroes-capture", 2)?.capturePoints).toHaveLength(3);
    expect(hostMap("hall-of-heroes-capture", 2)?.shrines).toHaveLength(2);
    expect(hostMap("hall-of-heroes-capture", 2)?.spawns.every((s) => s.team < 2)).toBe(true);
    expect(mapRelicField("hall-of-heroes-relic", 2)?.spawns).toHaveLength(2);
    expect(mapShrines("hall-of-heroes-capture", 2)).toHaveLength(2);
  });

  it("keeps it with three", () => {
    expect(hostMap("hall-of-heroes-capture", 3)?.capturePoints).toHaveLength(4);
    expect(hostMap("hall-of-heroes-capture")?.descriptor.teamCount).toBe(3);
  });

  it("plays the Halls' rules on the Halls' maps only", () => {
    expect(mapMatchRules("hall-of-heroes-relic", "relic-run").respawnOnWave).toBe(true);
    expect(mapMatchRules("broken-tower", "relic-run").respawnOnWave).toBe(false);
    expect(mapMatchRules("cinder-sanctum", "relic-run").wipeSurvived).toBe(true);
  });
});

describe("mapShrines (#1199)", () => {
  it("reads each team's shrine from a priest map's file", () => {
    expect(mapShrines("jungle-ruins", 2)).toEqual([
      { team: 0, position: { x: 170, y: 800 }, layer: 0 },
      { team: 1, position: { x: 2830, y: 800 }, layer: 0 },
    ]);
  });

  it("gives none on a map without them or one this build does not have", () => {
    expect(mapShrines("arena-crossroads", 2)).toEqual([]);
    expect(mapShrines("arena-nowhere", 2)).toEqual([]);
  });
});

describe("structureOf's water (#2984)", () => {
  const area = { kind: "rect", x: 10, y: 10, width: 20, height: 20 } as const;
  const water = [
    { id: "pond", layer: 0, depth: "deep", area },
    { id: "ford", layer: 0, depth: "shallow", area: { ...area, x: 50 } },
  ] as const;

  it("hands the renderer every body of water, deep and shallow, on a map of one layer", () => {
    const [flat] = ARENA_MAPS.filter((map) => map.layers === 1);
    if (flat === undefined) throw new Error("no flat arena");
    expect(structureOf(flat).structure.water).toEqual([]);
    expect(structureOf({ ...flat, water: [...water] }).structure).toMatchObject({
      layerCount: 1,
      water: [
        { layer: 0, depth: "deep", area },
        { layer: 0, depth: "shallow", area: { ...area, x: 50 } },
      ],
    });
  });

  it("and on a layered one, next to its decks", () => {
    const layered = TRAINING_MAPS.get("training-heights");
    if (layered === undefined) throw new Error("no training-heights");
    const { structure } = structureOf({ ...layered, water: [...water] });
    expect(structure.decks).toBe(layered.decks);
    expect(structure.water).toHaveLength(2);
  });

  it("hands it the ground's layer and the pits and tunnels under it (#2973)", () => {
    const layered = TRAINING_MAPS.get("training-heights");
    if (layered === undefined) throw new Error("no training-heights");
    const { structure } = structureOf(layered);
    expect(structure.ground).toBe(1);
    expect(structure.pits).toBe(layered.pits);
    expect(structure.tunnels).toBe(layered.tunnels);
    expect(structure.transitions.map(({ uphill }) => uphill)).toEqual(
      layered.transitions.map(({ uphill }) => uphill),
    );
  });
  it("hands it a flat map's effect zones, so a map of one layer with a zone is not flat (#3024)", () => {
    const wilds = TRAINING_MAPS.get("training-wilds");
    if (wilds === undefined) throw new Error("no training-wilds");
    const { structure } = structureOf(wilds);
    expect(structure.layerCount).toBe(1);
    expect(structure.zones).toEqual(
      (wilds.zones ?? []).map(({ kind, layer, area }) => ({ kind, layer, area })),
    );
    expect(structure.zones).toHaveLength(1);
  });
});
