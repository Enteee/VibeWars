import { pickStarterBuild } from "@vibewars/game-core";

import { fromPlayerBuild, toPlayerBuild } from "./build-validation.js";
import type { CharacterRepository } from "./repository.js";
import type { StoredCharacter } from "./schema.js";

/**
 * The character a browser's first start rolls (#853): one starter build at
 * random, saved as a character like any other, once per browser, under its
 * PvX build's name (#2636). Which one it is, is remembered by id, so its
 * roster row alone can be rerolled.
 */

/** Where the rolled character's id is kept: set means "rolled already". */
export interface StarterCharacterKey {
  readonly load: () => string | undefined;
  readonly save: (id: string) => void;
  readonly clear: () => void;
}

/**
 * Unsets `key` if the starter it names is one of `discarded`, the ids
 * a repository's `list` just deleted as stale (#2717): the key would
 * outlive its record and say "rolled already", so no starter is rolled
 * in its place and none has Clone or Reroll. A starter the player
 * deleted is not discarded, and stays rolled (#853). A team's key too.
 */
export function forgetDiscardedStarter(
  key: Pick<StarterCharacterKey, "load" | "clear">,
  discarded: readonly string[],
): void {
  const id = key.load();
  if (id !== undefined && discarded.includes(id)) {
    key.clear();
  }
}

export interface RollStarterOptions {
  readonly characters: Pick<CharacterRepository, "save">;
  readonly key: StarterCharacterKey;
  /** [0, 1), `Math.random` in the browser. */
  readonly random: () => number;
  readonly id: string;
  /** ms since the epoch. */
  readonly now: number;
  /** The roster's names: the rolled one is none of them (#1149), whatever their case. */
  readonly taken: readonly string[];
}

/** `name`, or the first of "`name` 2", "`name` 3"... that is none of `taken`. */
function freeName(name: string, taken: readonly string[]): string {
  const names = new Set(taken.map((n) => n.toLowerCase()));
  let free = name;
  for (let n = 2; names.has(free.toLowerCase()); n += 1) {
    free = `${name} ${String(n)}`;
  }
  return free;
}

/** A starter build by `random`, never like `not`, under its name, made free of `taken`. */
function rollCharacter(
  random: () => number,
  taken: readonly string[],
  id: string,
  now: number,
  not?: StoredCharacter,
): StoredCharacter {
  const build = pickStarterBuild(random, not === undefined ? undefined : toPlayerBuild(not));
  return { ...fromPlayerBuild(build, id, now), name: freeName(build.name, taken) };
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
 * the same id, and the new build's name, none of `taken` (the roster's
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
