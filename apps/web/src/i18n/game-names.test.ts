import {
  INSIGNIAS,
  OFFHANDS,
  PROFESSIONS,
  SKILLS_BY_ID,
  STATUS_DEFINITIONS,
  UNIVERSAL_RUNES,
  WEAPONS,
  WEAPON_MODS,
  getAttribute,
} from "@vibewars/game-core";
import { afterEach, describe, expect, it } from "vitest";

import { ARENA_MAPS } from "../net/maps.js";
import { TRAINING_MAPS } from "../training/maps.js";
import {
  ENGLISH_NAMES,
  attributeName,
  itemName,
  mapName,
  professionName,
  runeName,
  setGameNames,
  skillName,
  statusName,
  type GameNames,
} from "./game-names.js";

afterEach(() => {
  setGameNames(ENGLISH_NAMES);
});

describe("game-data names (#2663)", () => {
  it("are the game data's own names in English", () => {
    for (const skill of SKILLS_BY_ID.values()) {
      expect(skillName(skill.id)).toBe(skill.name);
    }
    for (const status of Object.values(STATUS_DEFINITIONS)) {
      expect(statusName(status.id)).toBe(status.name);
    }
    for (const profession of Object.values(PROFESSIONS)) {
      expect(professionName(profession.id)).toBe(profession.name);
      for (const attribute of profession.attributes) {
        expect(attributeName(attribute.id)).toBe(attribute.name);
      }
    }
    expect(professionName("common")).toBe("Common");
    for (const item of [
      ...Object.values(WEAPONS),
      ...Object.values(OFFHANDS),
      ...Object.values(INSIGNIAS),
      ...Object.values(UNIVERSAL_RUNES),
      ...WEAPON_MODS,
    ]) {
      expect(itemName(item.id)).toBe(item.name);
    }
    for (const map of [...ARENA_MAPS, ...TRAINING_MAPS.values()]) {
      expect(mapName(map.id)).toBe(map.name);
    }
  });

  it("give every item its own id: one table holds them all", () => {
    const ids = [
      ...Object.keys(WEAPONS),
      ...Object.keys(OFFHANDS),
      ...Object.keys(INSIGNIAS),
      ...Object.keys(UNIVERSAL_RUNES),
      ...WEAPON_MODS.map((mod) => mod.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("show an id the data lacks as itself", () => {
    expect(skillName("no-such-skill")).toBe("no-such-skill");
    expect(mapName("no-such-map")).toBe("no-such-map");
  });

  it("come from the picked language's table", () => {
    const de: GameNames = {
      ...ENGLISH_NAMES,
      skills: { ...ENGLISH_NAMES.skills, "monk.healing-breeze": "Heilende Brise" },
      maps: { ...ENGLISH_NAMES.maps, "arena-long-hall": "Lange Halle" },
    };
    setGameNames(de);
    expect(skillName("monk.healing-breeze")).toBe("Heilende Brise");
    expect(mapName("arena-long-hall")).toBe("Lange Halle");
  });

  it("name a rune with its tier", () => {
    expect(runeName({ kind: "universal", runeId: "vigor", tier: "superior" })).toBe(
      "Superior Rune of Vigor",
    );
    expect(runeName({ kind: "universal", runeId: "vitae", tier: "minor" })).toBe("Rune of Vitae");
    const attribute = Object.values(PROFESSIONS)[0]?.attributes[0];
    expect(attribute).toBeDefined();
    if (attribute !== undefined) {
      expect(runeName({ kind: "attribute", attributeId: attribute.id, tier: "major" })).toBe(
        `Major Rune of ${getAttribute(attribute.id)?.name ?? ""}`,
      );
    }
  });
});
