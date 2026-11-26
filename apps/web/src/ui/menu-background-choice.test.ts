import { LOBBY_MODES } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { arenaMap, modeMapIds, teamArenaMapIds } from "../net/maps.js";
import {
  FIRST_CHOICE,
  RANDOM_MAP,
  hostedChoice,
  pinnedChoice,
  menuBackgroundMap,
  sameChoice,
} from "./menu-background-choice.js";

/** Always the same draw: `at` of the way through the pool. */
const seeded =
  (at: number): (() => number) =>
  () =>
    at;

describe("menuBackgroundMap (#3119)", () => {
  it("fights on a chosen map at a size it seats", () => {
    expect(menuBackgroundMap({ mapId: "jungle-ruins", teamSize: 4 }, seeded(0))).toEqual({
      mapId: "jungle-ruins",
      teamSize: 4,
    });
  });

  it.each([1, 2, 4, 8])("draws Random at %i a side from Team Arena's maps of that size", (size) => {
    const pool = teamArenaMapIds(size);
    expect(pool.length).toBeGreaterThan(0);
    for (const at of [0, 0.5, 0.999]) {
      const drawn = menuBackgroundMap({ mapId: RANDOM_MAP, teamSize: size }, seeded(at));
      expect(pool).toContain(drawn.mapId);
      expect(drawn.teamSize).toBe(size);
    }
    expect(menuBackgroundMap({ mapId: RANDOM_MAP, teamSize: size }, seeded(0)).mapId).toBe(pool[0]);
  });

  it("fights on a three-team map, never drawing (#3633)", () => {
    const rng = (): number => {
      throw new Error("drew for a map it can fight on");
    };
    expect(menuBackgroundMap({ mapId: "threefold-keep", teamSize: 8 }, rng)).toEqual({
      mapId: "threefold-keep",
      teamSize: 8,
    });
  });

  // #3633: a three-team Hosted map was drawn over with a random Team Arena one.
  it("fights on every Hosted map at every size it seats", () => {
    for (const mapId of modeMapIds()["hosted-game"]) {
      for (const teamSize of arenaMap(mapId)?.teamSizes ?? []) {
        expect(menuBackgroundMap({ mapId, teamSize }, seeded(0.5)).mapId).toBe(mapId);
      }
    }
  });

  it("draws for the size when the chosen map does not seat it, or is unknown", () => {
    for (const choice of [
      { mapId: "sandstone-steps", teamSize: 8 },
      { mapId: "no-such-map", teamSize: 8 },
    ]) {
      const drawn = menuBackgroundMap(choice, seeded(0.5));
      expect(teamArenaMapIds(8)).toContain(drawn.mapId);
      expect(drawn.teamSize).toBe(8);
    }
  });

  it("fights 8v8 at a size no Team Arena seats", () => {
    const drawn = menuBackgroundMap({ mapId: RANDOM_MAP, teamSize: 5 }, seeded(0));
    expect(drawn).toEqual({ mapId: teamArenaMapIds(8)[0], teamSize: 8 });
  });
});

describe("sameChoice (#3119)", () => {
  it("keeps the fight for the same choice, and restarts it for another map or size", () => {
    expect(sameChoice(FIRST_CHOICE, { mapId: RANDOM_MAP, teamSize: 8 })).toBe(true);
    expect(sameChoice(FIRST_CHOICE, { mapId: RANDOM_MAP, teamSize: 4 })).toBe(false);
    expect(sameChoice(FIRST_CHOICE, { mapId: "moss-vale", teamSize: 8 })).toBe(false);
  });
});

describe("hostedChoice (#3131)", () => {
  it("is a Hosted lobby's map and size, and nothing for every other mode", () => {
    for (const mode of LOBBY_MODES) {
      const choice = hostedChoice({ mode, mapId: "jungle-ruins", teamSize: 4 });
      expect(choice).toEqual(
        mode === "hosted-game" ? { mapId: "jungle-ruins", teamSize: 4 } : undefined,
      );
    }
  });
});

describe("pinnedChoice (#3248)", () => {
  it("fights on a pinned map at the largest size it seats, three-team ones too", () => {
    expect(pinnedChoice("?menu-background=threefold-keep")).toEqual({
      mapId: "threefold-keep",
      teamSize: 8,
    });
    expect(pinnedChoice("?splash&menu-background=arena-crossroads")).toEqual({
      mapId: "arena-crossroads",
      teamSize: 8,
    });
    expect(pinnedChoice("?menu-background=jungle-ruins")).toEqual({
      mapId: "jungle-ruins",
      teamSize: 8,
    });
  });

  it("is the first choice for a bare param, none, or a map it does not know", () => {
    for (const search of [
      "?menu-background",
      "?menu-background=",
      "",
      "?menu-background=no-such-map",
    ]) {
      expect(pinnedChoice(search)).toBe(FIRST_CHOICE);
    }
  });
});
