/**
 * A figure's body (#4250): its height and build. Free to pick, never
 * earned; a seat that picked none, or whose pick does not verify, gets
 * the one its key hashes to, the same for every viewer.
 */

import {
  BUILDS,
  fingerprint,
  HEIGHTS,
  type Build,
  type FigureBody,
  type Height,
} from "@vibewars/game-protocol";

export { BUILDS, HEIGHTS, type Build, type FigureBody, type Height };

/** What is picked, per axis; `null` for one never picked. */
export interface BodyChoice {
  readonly height: Height | null;
  readonly build: Build | null;
}

/** Nothing picked: every axis the key's. */
export const NO_BODY_CHOICE: BodyChoice = { height: null, build: null };

/**
 * The body `key`, a player key or a participant id, hashes to: each axis
 * from its own 16 bits of the hash, so each is even over its three
 * values and the two are independent.
 */
export function bodyFromKey(key: string): FigureBody {
  const hash = fingerprint(key);
  return {
    height: HEIGHTS[Number.parseInt(hash.slice(0, 4), 16) % HEIGHTS.length] ?? "average",
    build: BUILDS[Number.parseInt(hash.slice(4, 8), 16) % BUILDS.length] ?? "average",
  };
}

/** `choice`, each axis never picked filled in from `key`. */
export function bodyOf(choice: BodyChoice, key: string): FigureBody {
  const derived = bodyFromKey(key);
  return { height: choice.height ?? derived.height, build: choice.build ?? derived.build };
}
