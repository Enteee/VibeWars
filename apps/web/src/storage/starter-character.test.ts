import { FIRST_NAMES, STARTER_BUILDS, SURNAMES } from "@vibewars/game-core";
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

/** The name drawn as the `first`th first name and the `last`th surname. */
function fullName(first: number, last: number): string {
  return [FIRST_NAMES[first], SURNAMES[last]].join(" ");
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

    expect(rolled?.name).toBe(fullName(0, 0));
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

  it("is named none of the roster's names, whatever their case (#1149)", async () => {
    const characters = new CharacterRepository(createMemoryStore());
    const first = fullName(0, 0);
    // The build, then two names: the first one taken.
    const draws = [0, 0, 0, 0.5, 0.5];
    let i = 0;

    const rolled = await rollStarterCharacter({
      characters,
      key: memoryKey(),
      random: () => draws[i++ % draws.length] ?? 0,
      id: "a",
      now: 1,
      taken: [first.toUpperCase()],
    });

    expect(rolled?.name).toBe(fullName(16, 16));
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
  it("keeps the id, never yields the same professions, and draws a new name", async () => {
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

        // Stepping from `random`: a constant would draw the taken name 20 times.
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
        expect(rerolled.name).not.toBe(current.name);
        expect([rerolled.primaryProfession, rerolled.secondaryProfession]).not.toEqual([
          current.primaryProfession,
          current.secondaryProfession,
        ]);
        const picked = toPlayerBuild(rerolled);
        expect(STARTER_BUILDS).toContainEqual({
          ...picked,
          name: STARTER_BUILDS.find((b) => b.primaryProfession === picked.primaryProfession)?.name,
        });
        expect(await characters.load("a")).toEqual(rerolled);
      }
    }
  });
});
