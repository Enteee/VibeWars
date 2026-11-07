import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { toPlayerBuild } from "./build-validation.js";
import { CharacterRepository, createMemoryStore } from "./repository.js";
import { CHARACTER_SCHEMA_VERSION } from "./schema.js";
import {
  forgetDiscardedStarter,
  rerollStarterCharacter,
  rollStarterCharacter,
  type StarterCharacterKey,
} from "./starter-character.js";

/** The first start's roll (#853): once per browser, kept by id, rerolled in place. */

function memoryKey(): StarterCharacterKey & { value: string | undefined } {
  const key = {
    value: undefined as string | undefined,
    load: () => key.value,
    save: (id: string) => {
      key.value = id;
    },
    clear: () => {
      key.value = undefined;
    },
  };
  return key;
}

describe("rollStarterCharacter", () => {
  it("rolls and saves a starter build once, then never again", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    const key = memoryKey();

    const rolled = await rollStarterCharacter({
      characters,
      key,
      random: () => 0,
      id: "a",
      now: 1,
      taken: [],
    });

    // Named after its PvX build (#2636), professions and all.
    expect(rolled?.name).toBe(STARTER_BUILDS[0]?.name);
    expect(rolled?.name).toBe("Gust (A/E)");
    expect(rolled?.primaryProfession).toBe(STARTER_BUILDS[0]?.primaryProfession);
    expect(await characters.load("a")).toEqual(rolled);
    expect(key.value).toBe("a");
    expect(
      await rollStarterCharacter({ characters, key, random: () => 0, id: "b", now: 2, taken: [] }),
    ).toBeUndefined();
    expect((await characters.list()).characters.map((c) => c.id)).toEqual(["a"]);
  });

  it("rolls beside an existing roster: it never reads it", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    await rollStarterCharacter({
      characters,
      key: memoryKey(),
      random: () => 0,
      id: "old",
      now: 1,
      taken: [],
    });
    const key = memoryKey();

    const rolled = await rollStarterCharacter({
      characters,
      key,
      random: () => 0.5,
      id: "new",
      now: 2,
      taken: [],
    });

    expect(rolled?.id).toBe("new");
    expect((await characters.list()).characters).toHaveLength(2);
  });

  it("does not roll again for a rolled character since deleted", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    const key = memoryKey();
    await rollStarterCharacter({ characters, key, random: () => 0, id: "a", now: 1, taken: [] });
    await characters.delete("a");

    expect(
      await rollStarterCharacter({ characters, key, random: () => 0, id: "b", now: 2, taken: [] }),
    ).toBeUndefined();
  });

  it("is named none of the roster's names, whatever their case (#1149, #2636)", async () => {
    const roll = (taken: readonly string[]) =>
      rollStarterCharacter({
        characters: new CharacterRepository(createMemoryStore()),
        key: memoryKey(),
        random: () => 0,
        id: "a",
        now: 1,
        taken,
      });

    expect((await roll(["GUST (A/E)"]))?.name).toBe("Gust (A/E) 2");
    expect((await roll(["Gust (A/E)", "gust (a/e) 2", "Gust (A/E) 4"]))?.name).toBe("Gust (A/E) 3");
    expect((await roll(["Gust (E/Me)"]))?.name).toBe("Gust (A/E)");
  });

  it("leaves the key unset when the save fails, so the next start tries again", async () => {
    const key = memoryKey();
    const failing = {
      save: () => Promise.reject(new Error("quota")),
    };

    expect(
      await rollStarterCharacter({
        characters: failing,
        key,
        random: () => 0,
        id: "a",
        now: 1,
        taken: [],
      }),
    ).toBeUndefined();
    expect(key.value).toBeUndefined();
  });
});

describe("rerollStarterCharacter", () => {
  it("keeps the id, never yields the same professions, and takes the new build's name", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    for (const build of STARTER_BUILDS) {
      for (const random of [0, 0.5, 0.999]) {
        const current = await rollStarterCharacter({
          characters,
          key: memoryKey(),
          random: () => STARTER_BUILDS.indexOf(build) / STARTER_BUILDS.length,
          id: "a",
          now: 1,
          taken: [],
        });
        if (current === undefined) {
          throw new Error("no roll");
        }
        expect(current.primaryProfession).toBe(build.primaryProfession);

        // Stepping from `random`, so each case draws a different build.
        let next = random;
        const stepping = (): number => {
          const value = next;
          next = (next + 0.37) % 1;
          return value;
        };
        const rerolled = await rerollStarterCharacter(characters, current, stepping, 2, [
          current.name,
        ]);

        expect(rerolled.id).toBe("a");
        expect([rerolled.primaryProfession, rerolled.secondaryProfession]).not.toEqual([
          current.primaryProfession,
          current.secondaryProfession,
        ]);
        // The whole character is a starter build's, its name too (#2636).
        expect(STARTER_BUILDS).toContainEqual(toPlayerBuild(rerolled));
        expect(await characters.load("a")).toEqual(rerolled);
      }
    }
  });
});

describe("forgetDiscardedStarter (#2717)", () => {
  it("rolls a new starter at the next start when a new version discarded the old one", async () => {
    const store = createMemoryStore();
    const characters = new CharacterRepository(store);
    const key = memoryKey();
    const old = await rollStarterCharacter({
      characters,
      key,
      random: () => 0,
      id: "old",
      now: 1,
      taken: [],
    });
    // A new version's schema: the record is stale, its key is not.
    await store.put("characters", "old", {
      ...old,
      schemaVersion: CHARACTER_SCHEMA_VERSION - 1,
    });

    // The startup sequence: list, forget, roll.
    const { characters: roster, discarded } = await characters.list();
    forgetDiscardedStarter(key, discarded);
    const rolled = await rollStarterCharacter({
      characters,
      key,
      random: () => 0,
      id: "new",
      now: 2,
      taken: roster.map((c) => c.name),
    });

    expect(rolled?.id).toBe("new");
    expect(key.value).toBe("new");
    expect((await characters.list()).characters.map((c) => c.id)).toEqual(["new"]);
  });

  it("keeps a key whose starter was not discarded, deleted by the player or not", () => {
    const key = memoryKey();
    key.save("mine");
    forgetDiscardedStarter(key, ["other"]);
    expect(key.value).toBe("mine");
    forgetDiscardedStarter(key, []);
    expect(key.value).toBe("mine");
  });

  it("leaves an unset key unset", () => {
    const key = memoryKey();
    forgetDiscardedStarter(key, ["other"]);
    expect(key.value).toBeUndefined();
  });
});
