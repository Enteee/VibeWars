import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CHARACTER_SCHEMA_VERSION,
  TEAM_SCHEMA_VERSION,
  isStoredCharacter,
  isStoredTeam,
  type StoredCharacter,
  type StoredTeam,
} from "./schema.js";

const CHARACTER: StoredCharacter = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "local-1",
  name: "Guard Test",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 12 }],
  skillBar: ["warrior.sever-artery", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("warrior"),
  updatedAt: 1000,
};

const TEAM: StoredTeam = {
  schemaVersion: TEAM_SCHEMA_VERSION,
  id: "team-1",
  name: "Guard Team",
  members: [{ characterId: "local-1" }],
  rulesetId: "minimal-gw-inspired-pvp-v1",
  updatedAt: 1000,
};

describe("isStoredCharacter", () => {
  it("accepts a record in the current shape", () => {
    expect(isStoredCharacter(CHARACTER)).toBe(true);
  });

  it("rejects a record at any other schema version", () => {
    // Older and newer alike: a version only ever rejects (ADR-0016).
    for (const schemaVersion of [0, CHARACTER_SCHEMA_VERSION + 1, 99, "1", undefined]) {
      expect(isStoredCharacter({ ...CHARACTER, schemaVersion }), String(schemaVersion)).toBe(false);
    }
  });

  it("rejects a record with no equipment", () => {
    const { equipment: _dropped, ...withoutGear } = CHARACTER;
    expect(isStoredCharacter(withoutGear)).toBe(false);
  });

  it("rejects values that are not records at all", () => {
    for (const value of [null, undefined, 42, "character", []]) {
      expect(isStoredCharacter(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("isStoredTeam", () => {
  it("accepts a record in the current shape", () => {
    expect(isStoredTeam(TEAM)).toBe(true);
  });

  it("rejects a record at any other schema version", () => {
    expect(isStoredTeam({ ...TEAM, schemaVersion: TEAM_SCHEMA_VERSION + 1 })).toBe(false);
  });

  it("rejects a malformed record", () => {
    expect(isStoredTeam({ ...TEAM, members: "everyone" })).toBe(false);
    expect(isStoredTeam(null)).toBe(false);
  });
});
