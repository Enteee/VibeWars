import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { toPlayerBuild } from "./build-validation.js";
import { CharacterRepository, createMemoryStore } from "./repository.js";
import {
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
    });

    expect(rolled?.name).toBe(STARTER_BUILDS[0]?.name);
    expect(await characters.load("a")).toEqual(rolled);
    expect(key.value).toBe("a");
    expect(
      await rollStarterCharacter({ characters, key, random: () => 0, id: "b", now: 2 }),
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
    });
    const key = memoryKey();

    const rolled = await rollStarterCharacter({
      characters,
      key,
      random: () => 0.5,
      id: "new",
      now: 2,
    });

    expect(rolled?.id).toBe("new");
    expect((await characters.list()).characters).toHaveLength(2);
  });

  it("does not roll again for a rolled character since deleted", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    const key = memoryKey();
    await rollStarterCharacter({ characters, key, random: () => 0, id: "a", now: 1 });
    await characters.delete("a");

    expect(
      await rollStarterCharacter({ characters, key, random: () => 0, id: "b", now: 2 }),
    ).toBeUndefined();
  });

  it("leaves the key unset when the save fails, so the next start tries again", async () => {
    const key = memoryKey();
    const failing = {
      save: () => Promise.reject(new Error("quota")),
    };

    expect(
      await rollStarterCharacter({ characters: failing, key, random: () => 0, id: "a", now: 1 }),
    ).toBeUndefined();
    expect(key.value).toBeUndefined();
  });
});

describe("rerollStarterCharacter", () => {
  it("keeps the id and never yields the build it is named like", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    for (const build of STARTER_BUILDS) {
      for (const random of [0, 0.5, 0.999]) {
        const current = await rollStarterCharacter({
          characters,
          key: memoryKey(),
          random: () => STARTER_BUILDS.indexOf(build) / STARTER_BUILDS.length,
          id: "a",
          now: 1,
        });
        if (current === undefined) {
          throw new Error("no roll");
        }
        expect(current.name).toBe(build.name);

        const rerolled = await rerollStarterCharacter(characters, current, () => random, 2);

        expect(rerolled.id).toBe("a");
        expect(rerolled.name).not.toBe(current.name);
        expect(STARTER_BUILDS).toContainEqual(toPlayerBuild(rerolled));
        expect(await characters.load("a")).toEqual(rerolled);
      }
    }
  });
});
