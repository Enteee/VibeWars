import { pickStarterBuild, randomCharacterName } from "@vibewars/game-core";

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
  /** The roster's names: the rolled one is none of them (#1149). */
  readonly taken: readonly string[];
}

/** A starter build by `random`, never like `not`, under a random name not in `taken`. */
function rollCharacter(
  random: () => number,
  taken: readonly string[],
  id: string,
  now: number,
  not?: StoredCharacter,
): StoredCharacter {
  const build = pickStarterBuild(random, not === undefined ? undefined : toPlayerBuild(not));
  const name = randomCharacterName(random, new Set(taken.map((n) => n.toLowerCase())));
  return { ...fromPlayerBuild(build, id, now), name };
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
  const { characters, key, random, id, now, taken } = options;
  if (key.load() !== undefined) {
    return undefined;
  }
  const character = rollCharacter(random, taken, id, now);
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
 * `current` as another starter build, never one with its professions:
 * the same id, and a new random name, none of `taken` (the roster's
 * names, its own among them). Edits made to it are lost.
 */
export async function rerollStarterCharacter(
  characters: Pick<CharacterRepository, "save">,
  current: StoredCharacter,
  random: () => number,
  now: number,
  taken: readonly string[],
): Promise<StoredCharacter> {
  const character = rollCharacter(random, taken, current.id, now, current);
  await characters.save(character);
  return character;
}
