import { pickStarterBuild } from "@vibewars/game-core";

import { fromPlayerBuild, toPlayerBuild } from "./build-validation.js";
import type { CharacterRepository } from "./repository.js";
import type { StoredCharacter } from "./schema.js";

/**
 * The character a browser's first start rolls (#853): one starter build at
 * random, saved as a character like any other, once per browser. Which one
 * it is, is remembered by id, so its roster row alone can be rerolled.
 */

/** Where the rolled character's id is kept: set means "rolled already". */
export interface StarterCharacterKey {
  readonly load: () => string | undefined;
  readonly save: (id: string) => void;
}

export interface RollStarterOptions {
  readonly characters: Pick<CharacterRepository, "save">;
  readonly key: StarterCharacterKey;
  /** [0, 1), `Math.random` in the browser. */
  readonly random: () => number;
  readonly id: string;
  /** ms since the epoch. */
  readonly now: number;
}

/**
 * Roll and save a starter character, unless this browser rolled one
 * already: the roster is never read, so an existing one gets its roll
 * too, and a deleted one does not come back. A save that fails leaves
 * the key unset, to be tried again next start. The new character, or
 * `undefined` when there is none.
 */
export async function rollStarterCharacter(
  options: RollStarterOptions,
): Promise<StoredCharacter | undefined> {
  const { characters, key, random, id, now } = options;
  if (key.load() !== undefined) {
    return undefined;
  }
  const character = fromPlayerBuild(pickStarterBuild(random), id, now);
  try {
    await characters.save(character);
  } catch (error) {
    console.warn("[web] could not save the starter character", error);
    return undefined;
  }
  key.save(id);
  return character;
}

/**
 * `current` as another starter build, never the one it is named like:
 * the same id, and the build's name. Edits made to it are lost.
 */
export async function rerollStarterCharacter(
  characters: Pick<CharacterRepository, "save">,
  current: StoredCharacter,
  random: () => number,
  now: number,
): Promise<StoredCharacter> {
  const character = fromPlayerBuild(
    pickStarterBuild(random, toPlayerBuild(current)),
    current.id,
    now,
  );
  await characters.save(character);
  return character;
}
