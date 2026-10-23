import { describe, expect, it } from "vitest";

import { CharacterRepository, TeamRepository, createMemoryStore } from "./repository.js";
import {
  CURRENT_SCHEMA_VERSION,
  PersistenceError,
  type StoredCharacter,
  type StoredTeam,
} from "./schema.js";

function character(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "char-1",
    name: "Test Character",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [{ attributeId: "warrior.strength", rank: 10 }],
    skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
    updatedAt: 1000,
    ...overrides,
  };
}

function team(overrides: Partial<StoredTeam> = {}): StoredTeam {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: "team-1",
    name: "Test Team",
    members: [{ characterId: "char-1" }],
    rulesetId: "minimal-gw-inspired-pvp-v1",
    updatedAt: 1000,
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

  it("rejects a malformed stored record rather than returning garbage", async () => {
    const store = createMemoryStore();
    await store.put("characters", "broken", { not: "a character" });
    const repo = new CharacterRepository(store);
    await expect(repo.load("broken")).rejects.toThrow(PersistenceError);
  });

  it("reports a future-version record as a problem instead of dropping it silently", async () => {
    const store = createMemoryStore();
    await store.put("characters", "future", character({ id: "future", schemaVersion: 99 }));
    await store.put("characters", "char-1", character());
    const repo = new CharacterRepository(store);

    const { characters, problems } = await repo.list();
    expect(characters.map((c) => c.id)).toEqual(["char-1"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("newer version");
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

  it("references characters by id rather than copying their builds", async () => {
    const repo = new TeamRepository(createMemoryStore());
    await repo.save(team({ members: [{ characterId: "char-1" }, { characterId: "char-2" }] }));
    const loaded = await repo.load("team-1");
    expect(loaded?.members.map((m) => m.characterId)).toEqual(["char-1", "char-2"]);
  });

  it("supports an arbitrary team size, not a hardcoded 8", async () => {
    const repo = new TeamRepository(createMemoryStore());
    const members = Array.from({ length: 12 }, (_unused, i) => ({ characterId: `c${String(i)}` }));
    await repo.save(team({ members }));
    expect((await repo.load("team-1"))?.members).toHaveLength(12);
  });

  it("deletes a team", async () => {
    const repo = new TeamRepository(createMemoryStore());
    await repo.save(team());
    await repo.delete("team-1");
    expect(await repo.load("team-1")).toBeUndefined();
  });

  it("rejects a malformed stored team", async () => {
    const store = createMemoryStore();
    await store.put("teams", "broken", { nope: true });
    const repo = new TeamRepository(store);
    await expect(repo.load("broken")).rejects.toThrow(PersistenceError);
  });
});
