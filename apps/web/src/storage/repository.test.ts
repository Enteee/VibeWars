import { defaultBuildEquipment } from "@vibewars/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BLOCKED_NOTICE,
  CharacterRepository,
  MATCH_RECORD_CAP,
  MatchRecordRepository,
  TeamRepository,
  createMemoryStore,
  discardedCharactersNotice,
  discardedMatchRecordsNotice,
  discardedTeamsNotice,
  openIndexedDbStore,
} from "./repository.js";
import {
  CHARACTER_SCHEMA_VERSION,
  MATCH_RECORD_SCHEMA_VERSION,
  PersistenceError,
  TEAM_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredMatchRecord,
  type StoredTeam,
  type StoredTeamMember,
} from "./schema.js";

function character(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "char-1",
    name: "Test Character",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [{ attributeId: "warrior.strength", rank: 10 }],
    skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: 1000,
    ...overrides,
  };
}

/** A team member, its own copy of `character({ id })`. */
function member(id: string): StoredTeamMember {
  const { schemaVersion: _version, updatedAt: _updated, ...own } = character({ id });
  return { character: own };
}

function team(overrides: Partial<StoredTeam> = {}): StoredTeam {
  return {
    schemaVersion: TEAM_SCHEMA_VERSION,
    id: "team-1",
    name: "Test Team",
    members: [member("char-1")],
    rulesetId: "minimal-gw-inspired-pvp-v1",
    updatedAt: 1000,
    ...overrides,
  };
}

function played(overrides: Partial<StoredMatchRecord> = {}): StoredMatchRecord {
  return {
    schemaVersion: MATCH_RECORD_SCHEMA_VERSION,
    id: "match-1",
    characterId: "char-1",
    characterName: "Test Character",
    finishedAt: 1000,
    mapId: "arena-alpha",
    mode: "annihilation",
    result: "win",
    ...overrides,
  };
}

describe("CharacterRepository", () => {
  it("round-trips a saved character", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    await repo.save(character());
    const loaded = await repo.load("char-1");
    expect(loaded?.name).toBe("Test Character");
    expect(loaded?.attributes[0]?.rank).toBe(10);
  });

  it("returns undefined for an unknown id", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    expect(await repo.load("nope")).toBeUndefined();
  });

  it("overwrites on a second save with the same id", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    await repo.save(character({ name: "First" }));
    await repo.save(character({ name: "Second" }));
    const { characters } = await repo.list();
    expect(characters).toHaveLength(1);
    expect(characters[0]?.name).toBe("Second");
  });

  it("deletes a character", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    await repo.save(character());
    await repo.delete("char-1");
    expect(await repo.load("char-1")).toBeUndefined();
  });

  it("lists most-recently-updated first", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    await repo.save(character({ id: "old", updatedAt: 100 }));
    await repo.save(character({ id: "new", updatedAt: 900 }));
    const { characters } = await repo.list();
    expect(characters.map((c) => c.id)).toEqual(["new", "old"]);
  });

  it("refuses to save a record whose schema version is not current", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    await expect(repo.save(character({ schemaVersion: 99 }))).rejects.toThrow(PersistenceError);
  });

  it("discards a malformed stored record on load rather than returning garbage", async () => {
    const store = createMemoryStore();
    await store.put("characters", "broken", { not: "a character" });
    const repo = new CharacterRepository(store);
    expect(await repo.load("broken")).toBeUndefined();
    expect(await store.get("characters", "broken")).toBeUndefined();
  });

  it("discards a record at another schema version, and says so", async () => {
    const store = createMemoryStore();
    await store.put("characters", "stale", character({ id: "stale", schemaVersion: 99 }));
    await store.put("characters", "char-1", character());
    const repo = new CharacterRepository(store);

    const { characters, problems } = await repo.list();
    expect(characters.map((c) => c.id)).toEqual(["char-1"]);
    expect(problems).toEqual([discardedCharactersNotice(1)]);
  });

  it("does not bring a discarded record back on the next list", async () => {
    // The notice is shown once. A stale record that survived its own
    // discard would nag on every visit to the menu.
    const store = createMemoryStore();
    await store.put("characters", "stale", character({ id: "stale", schemaVersion: 99 }));
    const repo = new CharacterRepository(store);

    await repo.list();
    expect(await store.get("characters", "stale")).toBeUndefined();
    expect(await repo.list()).toEqual({ characters: [], problems: [] });
  });

  it("reports several discards in one line, not one line each", async () => {
    const store = createMemoryStore();
    for (const id of ["a", "b", "c"]) {
      await store.put("characters", id, character({ id, schemaVersion: 99 }));
    }
    const { problems } = await new CharacterRepository(store).list();
    expect(problems).toEqual([discardedCharactersNotice(3)]);
    expect(problems[0]).toMatch(/^3 saved characters/);
  });

  it("discards a pre-equipment character even though it carries the current schemaVersion", async () => {
    // A record can carry the current version number and still have an
    // old shape. The structural guard, not the number, is what turns
    // such a record away, and it must still be discarded, not upgraded.
    const store = createMemoryStore();
    const { equipment: _dropped, ...preEquipment } = character({ id: "old" });
    await store.put("characters", "old", preEquipment);

    const { characters, problems } = await new CharacterRepository(store).list();
    expect(characters).toEqual([]);
    expect(problems).toEqual([discardedCharactersNotice(1)]);
    expect(await store.get("characters", "old")).toBeUndefined();
  });

  it("discards a record that has no id at all", async () => {
    // Deleted by the key it is stored under, not by a field it may lack.
    const store = createMemoryStore();
    await store.put("characters", "junk", 42);
    const { problems } = await new CharacterRepository(store).list();
    expect(problems).toEqual([discardedCharactersNotice(1)]);
    expect(await store.list("characters")).toEqual([]);
  });

  it("isolates stored data from later mutation of the object that was saved", async () => {
    const repo = new CharacterRepository(createMemoryStore());
    const attribute = { attributeId: "warrior.strength", rank: 10 };
    await repo.save({ ...character(), attributes: [attribute] });
    attribute.rank = 99;

    const loaded = await repo.load("char-1");
    expect(loaded?.attributes[0]?.rank).toBe(10);
  });
});

describe("TeamRepository", () => {
  it("round-trips a saved team", async () => {
    const repo = new TeamRepository(createMemoryStore());
    await repo.save(team());
    const loaded = await repo.load("team-1");
    expect(loaded?.name).toBe("Test Team");
    expect(loaded?.members).toHaveLength(1);
  });

  it("keeps each member's own build (#1452)", async () => {
    const repo = new TeamRepository(createMemoryStore());
    const members = [member("char-1"), member("char-2")];
    await repo.save(team({ members }));
    const loaded = await repo.load("team-1");
    expect(loaded?.members).toEqual(members);
  });

  it("supports an arbitrary team size, not a hardcoded 8", async () => {
    const repo = new TeamRepository(createMemoryStore());
    const members = Array.from({ length: 12 }, (_unused, i) => member(`c${String(i)}`));
    await repo.save(team({ members }));
    expect((await repo.load("team-1"))?.members).toHaveLength(12);
  });

  it("deletes a team", async () => {
    const repo = new TeamRepository(createMemoryStore());
    await repo.save(team());
    await repo.delete("team-1");
    expect(await repo.load("team-1")).toBeUndefined();
  });

  it("discards a malformed stored team on load", async () => {
    const store = createMemoryStore();
    await store.put("teams", "broken", { nope: true });
    const repo = new TeamRepository(store);
    expect(await repo.load("broken")).toBeUndefined();
    expect(await store.get("teams", "broken")).toBeUndefined();
  });

  it("discards a team at another schema version, and says so", async () => {
    const store = createMemoryStore();
    await store.put("teams", "stale", team({ id: "stale", schemaVersion: 99 }));
    await store.put("teams", "team-1", team());
    const repo = new TeamRepository(store);

    const { teams, problems } = await repo.list();
    expect(teams.map((t) => t.id)).toEqual(["team-1"]);
    expect(problems).toEqual([discardedTeamsNotice(1)]);
    expect(await store.get("teams", "stale")).toBeUndefined();
  });
});

describe("MatchRecordRepository (#1404)", () => {
  it("round-trips a record, newest first", async () => {
    const repo = new MatchRecordRepository(createMemoryStore());
    await repo.save(played({ id: "old", finishedAt: 1 }));
    await repo.save(played({ id: "new", finishedAt: 3, result: "loss" }));
    await repo.save(played({ id: "mid", finishedAt: 2 }));
    const { records, problems } = await repo.list();
    expect(records.map((r) => r.id)).toEqual(["new", "mid", "old"]);
    expect(records[0]).toEqual(played({ id: "new", finishedAt: 3, result: "loss" }));
    expect(problems).toEqual([]);
  });

  it("drops the oldest once past the cap, across characters", async () => {
    const repo = new MatchRecordRepository(createMemoryStore());
    for (let i = 0; i <= MATCH_RECORD_CAP; i += 1) {
      await repo.save(
        played({ id: `m${String(i)}`, finishedAt: i, characterId: i % 2 === 0 ? "a" : "b" }),
      );
    }
    const { records } = await repo.list();
    expect(records).toHaveLength(MATCH_RECORD_CAP);
    expect(records.map((r) => r.id)).not.toContain("m0");
    expect(records[0]?.id).toBe(`m${String(MATCH_RECORD_CAP)}`);
  });

  it("refuses to save a record whose schema version is not current", async () => {
    const repo = new MatchRecordRepository(createMemoryStore());
    await expect(repo.save(played({ schemaVersion: 99 }))).rejects.toBeInstanceOf(PersistenceError);
  });

  it("discards a record at another schema version, or with an unknown result, and says so", async () => {
    const store = createMemoryStore();
    await store.put("matches", "stale", played({ id: "stale", schemaVersion: 99 }));
    await store.put("matches", "odd", { ...played({ id: "odd" }), result: "forfeit" });
    await store.put("matches", "match-1", played());
    const repo = new MatchRecordRepository(store);

    const { records, problems } = await repo.list();
    expect(records.map((r) => r.id)).toEqual(["match-1"]);
    expect(problems).toEqual([discardedMatchRecordsNotice(2)]);
    expect(await store.get("matches", "stale")).toBeUndefined();
  });

  it("deletes a character's records and keeps the others'", async () => {
    const repo = new MatchRecordRepository(createMemoryStore());
    await repo.save(played({ id: "a1", characterId: "a" }));
    await repo.save(played({ id: "b1", characterId: "b" }));
    await repo.save(played({ id: "a2", characterId: "a" }));
    await repo.deleteFor("a");
    const { records } = await repo.list();
    expect(records.map((r) => r.id)).toEqual(["b1"]);
  });
});

describe("openIndexedDbStore and other tabs (#1404)", () => {
  /** The handlers the store sets on an open request and its database. */
  interface FakeOpen {
    onblocked: (() => void) | null;
    onsuccess: (() => void) | null;
    onupgradeneeded: (() => void) | null;
    onerror: (() => void) | null;
    result: { onversionchange: (() => void) | null; close: () => void };
  }

  function stubOpen(): FakeOpen {
    const request: FakeOpen = {
      onblocked: null,
      onsuccess: null,
      onupgradeneeded: null,
      onerror: null,
      result: { onversionchange: null, close: vi.fn() },
    };
    vi.stubGlobal("indexedDB", { open: () => request });
    return request;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says so when another tab's older build holds the store open", () => {
    const request = stubOpen();
    const onBlocked = vi.fn();
    void openIndexedDbStore(onBlocked);
    request.onblocked?.();
    expect(onBlocked).toHaveBeenCalledOnce();
    expect(BLOCKED_NOTICE).toBe("Close your other VibeWars tabs to continue.");
  });

  it("closes when a newer build's tab opens it, so that tab never waits", async () => {
    const request = stubOpen();
    const opened = openIndexedDbStore(() => undefined);
    request.onsuccess?.();
    await opened;
    request.result.onversionchange?.();
    expect(request.result.close).toHaveBeenCalledOnce();
  });
});
