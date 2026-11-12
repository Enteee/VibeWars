import type { LobbySnapshot } from "@vibewars/game-session";
import { arenaMap, teamArenaMapIds } from "../net/maps.js";

/** A choice of `"random"`: Team Arena's, drawn from the maps that seat its size. */
export const RANDOM_MAP = "random";

/**
 * What the menu background fights on (#3119): the last Hosted lobby's map, or
 * `RANDOM_MAP`, and its team size. In memory only, never stored.
 */
export interface MenuBackgroundChoice {
  readonly mapId: string;
  readonly teamSize: number;
}

/** Before any lobby of this session: Random at 8v8, as the splash always was. */
export const FIRST_CHOICE: MenuBackgroundChoice = { mapId: RANDOM_MAP, teamSize: 8 };

/**
 * What a lobby makes the background fight on: a Hosted lobby its map and
 * size (#3131), every other mode nothing, leaving the fight as it is.
 */
export function hostedChoice(
  snapshot: Pick<LobbySnapshot, "mode" | "mapId" | "teamSize">,
): MenuBackgroundChoice | undefined {
  return snapshot.mode === "hosted-game"
    ? { mapId: snapshot.mapId, teamSize: snapshot.teamSize }
    : undefined;
}

/** The size every Team Arena seats, for a size none does. */
const FALLBACK_SIZE = 8;

/** Whether a fight on `shown` already shows `wanted`: only another map or size restarts it. */
export function sameChoice(shown: MenuBackgroundChoice, wanted: MenuBackgroundChoice): boolean {
  return shown.mapId === wanted.mapId && shown.teamSize === wanted.teamSize;
}

/**
 * The map and size a fight for `choice` is drawn on. `RANDOM_MAP` draws
 * from Team Arena's maps at its size with `rng`; so does a map that does
 * not seat two sides of that size, which is wrong data. A size no Team
 * Arena seats is 8.
 */
export function menuBackgroundMap(
  choice: MenuBackgroundChoice,
  rng: () => number,
): { readonly mapId: string; readonly teamSize: number } {
  const map = arenaMap(choice.mapId);
  if (map?.teams === 2 && map.teamSizes.some((size) => size === choice.teamSize)) {
    return { mapId: map.id, teamSize: choice.teamSize };
  }
  const sized = teamArenaMapIds(choice.teamSize);
  const teamSize = sized.length > 0 ? choice.teamSize : FALLBACK_SIZE;
  const pool = sized.length > 0 ? sized : teamArenaMapIds(FALLBACK_SIZE);
  const mapId = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  if (mapId === undefined) {
    throw new Error("no Team Arena map for the menu background");
  }
  return { mapId, teamSize };
}
