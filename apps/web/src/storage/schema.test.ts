import { MINIMAL_GW_INSPIRED_PVP_V1, validatePlayerBuild } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { toPlayerBuild } from "./build-validation.js";
import {
  CHARACTER_SCHEMA_VERSION,
  PersistenceError,
  TEAM_SCHEMA_VERSION,
  isStoredCharacter,
  migrateCharacter,
  migrateTeam,
} from "./schema.js";

/**
 * The migration registry (ADR-0005, ADR-0013).
 *
 * These tests stand between a schema bump and every build anyone has
 * ever saved. The fixtures below are **frozen JSON literals**, not
 * objects built from the current types — a fixture built from
 * `StoredCharacter` would silently track every future refactor and stop
 * being a v1 record, which is precisely when it would stop testing
 * anything.
 */

/** Exactly what a schema 1 character looked like on disk. Do not update. */
const V1_CHARACTER = {
  schemaVersion: 1,
  id: "local-1",
  name: "Old Timer",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "warrior.swordsmanship", rank: 12 },
    { attributeId: "monk.healing-prayers", rank: 8 },
  ],
  skillBar: [
    "warrior.sever-artery-lite",
    "monk.orison-of-healing",
    null,
    null,
    null,
    null,
    null,
    null,
  ],
  updatedAt: 1_700_000_000_000,
} as const;

const V1_TEAM = {
  schemaVersion: 1,
  id: "team-1",
  name: "Old Team",
  members: [{ characterId: "local-1" }],
  rulesetId: "minimal-gw-inspired-pvp-v1",
  updatedAt: 1_700_000_000_000,
} as const;

describe("migrateCharacter", () => {
  it("brings a schema 1 character forward instead of refusing it", () => {
    const migrated = migrateCharacter(V1_CHARACTER);
    expect(migrated.schemaVersion).toBe(CHARACTER_SCHEMA_VERSION);
    expect(migrated.id).toBe("local-1");
    expect(migrated.name).toBe("Old Timer");
  });

  it("preserves everything the old record already said", () => {
    const migrated = migrateCharacter(V1_CHARACTER);
    expect(migrated.primaryProfession).toBe("warrior");
    expect(migrated.secondaryProfession).toBe("monk");
    expect(migrated.attributes).toEqual(V1_CHARACTER.attributes);
    expect(migrated.skillBar).toEqual(V1_CHARACTER.skillBar);
    expect(migrated.updatedAt).toBe(V1_CHARACTER.updatedAt);
  });

  it("arms the character for the profession they were actually built as", () => {
    // Not fists, and not an empty slot. A warrior who saved their build
    // before weapons existed should open the editor and find a sword.
    const migrated = migrateCharacter(V1_CHARACTER);
    expect(migrated.equipment.mainHand.weaponId).toBe("sword");
    expect(migrated.equipment.offHand?.offhandId).toBe("shield");
  });

  it("arms a caster with a caster's weapon", () => {
    const migrated = migrateCharacter({ ...V1_CHARACTER, primaryProfession: "elementalist" });
    expect(migrated.equipment.mainHand.weaponId).toBe("wand");
  });

  it("invents no runes or insignias, because nobody chose them", () => {
    const { armor } = migrateCharacter(V1_CHARACTER).equipment;
    for (const piece of Object.values(armor)) {
      expect(piece.rune).toBeNull();
      expect(piece.insigniaId).toBeNull();
    }
  });

  it("produces a build that is still legal to take into a match", () => {
    // The assertion that protects every saved build in the wild: a
    // migration that hands someone an invalid character has destroyed
    // it just as surely as deleting it.
    const migrated = migrateCharacter(V1_CHARACTER);
    const problems = validatePlayerBuild(
      toPlayerBuild(migrated),
      MINIMAL_GW_INSPIRED_PVP_V1.attributes,
    );
    expect(problems).toEqual([]);
  });

  it("satisfies the current structural guard afterwards, never before", () => {
    expect(isStoredCharacter(V1_CHARACTER)).toBe(false);
    expect(isStoredCharacter(migrateCharacter(V1_CHARACTER))).toBe(true);
  });

  it("leaves a current record alone", () => {
    const current = migrateCharacter(V1_CHARACTER);
    expect(migrateCharacter(current)).toEqual(current);
  });

  it("is idempotent, so a double-read cannot double-apply anything", () => {
    const once = migrateCharacter(V1_CHARACTER);
    const twice = migrateCharacter(migrateCharacter(V1_CHARACTER));
    expect(twice).toEqual(once);
  });

  it("refuses a record from a newer game and says so in those words", () => {
    expect(() => migrateCharacter({ ...V1_CHARACTER, schemaVersion: 99 })).toThrow(
      PersistenceError,
    );
    expect(() => migrateCharacter({ ...V1_CHARACTER, schemaVersion: 99 })).toThrow(
      /newer version of the game/,
    );
  });

  it("refuses a version it has no path from, rather than guessing", () => {
    expect(() => migrateCharacter({ ...V1_CHARACTER, schemaVersion: 0 })).toThrow(PersistenceError);
  });

  it.each([
    ["not an object", 42],
    ["null", null],
    ["no version", { id: "x" }],
    ["a text version", { ...V1_CHARACTER, schemaVersion: "1" }],
    ["a fractional version", { ...V1_CHARACTER, schemaVersion: 1.5 }],
  ])("refuses %s without throwing something unrecognisable", (_label, value) => {
    expect(() => migrateCharacter(value)).toThrow(PersistenceError);
  });

  it("refuses a v1 record that was itself malformed", () => {
    const { name: _name, ...withoutName } = V1_CHARACTER;
    expect(() => migrateCharacter(withoutName)).toThrow(PersistenceError);
  });
});

describe("migrateTeam", () => {
  it("passes a team through, because teams have not changed shape", () => {
    const migrated = migrateTeam(V1_TEAM);
    expect(migrated.schemaVersion).toBe(TEAM_SCHEMA_VERSION);
    expect(migrated.members).toEqual([{ characterId: "local-1" }]);
  });

  it("is unaffected by the character version moving", () => {
    // The reason the two constants are separate: a character change must
    // not force a no-op re-version of every team on disk.
    expect(TEAM_SCHEMA_VERSION).toBeLessThan(CHARACTER_SCHEMA_VERSION);
    expect(migrateTeam(V1_TEAM).schemaVersion).toBe(1);
  });

  it("still refuses a team from a newer game", () => {
    expect(() => migrateTeam({ ...V1_TEAM, schemaVersion: 7 })).toThrow(
      /newer version of the game/,
    );
  });
});
