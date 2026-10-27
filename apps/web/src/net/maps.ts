import { allWallSegments } from "@vibewars/game-maps/geometry";
import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import { sizeClass, type SizeClass } from "@vibewars/game-maps/size-class";
import arenaAlpha from "@vibewars/game-maps/maps/arena-alpha/map.json" with { type: "json" };
import arenaCanyon from "@vibewars/game-maps/maps/arena-canyon/map.json" with { type: "json" };
import arenaCrossroads from "@vibewars/game-maps/maps/arena-crossroads/map.json" with { type: "json" };
import arenaLongHall from "@vibewars/game-maps/maps/arena-long-hall/map.json" with { type: "json" };
import arenaOpen from "@vibewars/game-maps/maps/arena-open/map.json" with { type: "json" };
import arenaPillars from "@vibewars/game-maps/maps/arena-pillars/map.json" with { type: "json" };
import arenaRing from "@vibewars/game-maps/maps/arena-ring/map.json" with { type: "json" };
import arenaSplit from "@vibewars/game-maps/maps/arena-split/map.json" with { type: "json" };
import { teamSizeOf, type QueueMode } from "@vibewars/game-protocol";
import type { HostMap } from "@vibewars/game-session";

/**
 * The arenas a lobby can be played on (#403), as the host's browser
 * builds them: the server used to load these from disk and serve the list
 * at `/api/maps`.
 *
 * Vite inlines the JSON, and it is validated here, at module load, as
 * `training/maps.ts` does for the training arenas.
 */
export const ARENA_MAPS: readonly MapData[] = [
  // The small four, then #444's, smallest first.
  arenaAlpha,
  arenaOpen,
  arenaPillars,
  arenaSplit,
  arenaRing,
  arenaCrossroads,
  arenaCanyon,
  arenaLongHall,
].map((raw) => validateMapData(raw));

/** The arena a new lobby starts on, the server's default before (#403). */
export const DEFAULT_ARENA_ID = "arena-alpha";

/** The lobby's map ids, the default first, as `createLobbyHost` wants them. */
export function arenaIds(): string[] {
  return [
    DEFAULT_ARENA_ID,
    ...ARENA_MAPS.map((map) => map.id).filter((id) => id !== DEFAULT_ARENA_ID),
  ];
}

/**
 * How many players an arena of each size class seats (#880): the small
 * four are tight for more than a 2v2, and a 1v1 on a large one is a walk.
 */
const PLAYERS_BY_SIZE: Readonly<Record<SizeClass, { readonly min: number; readonly max: number }>> =
  {
    small: { min: 2, max: 4 },
    medium: { min: 5, max: 8 },
    large: { min: 5, max: 8 },
  };

/**
 * The arenas a Random Arena of `mode` is drawn from (#854 A2): every one
 * whose size class seats both teams, so a map added later joins by its
 * size and not by a list. In `ARENA_MAPS`' order, as `formGroups` wants
 * the same pool on every client.
 */
export function randomArenaMapPool(mode: QueueMode): string[] {
  const players = 2 * teamSizeOf(mode);
  return ARENA_MAPS.filter((map) => {
    const { min, max } = PLAYERS_BY_SIZE[sizeClass(map)];
    return players >= min && players <= max;
  }).map((map) => map.id);
}

/** The map `mapId` names, built for a `MatchHost`; `undefined` for no such map. */
export function hostMap(mapId: string): HostMap | undefined {
  const map = ARENA_MAPS.find((candidate) => candidate.id === mapId);
  if (map === undefined) {
    return undefined;
  }
  return {
    descriptor: {
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      walls: map.walls.map((wall) =>
        wall.kind === "rect"
          ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
          : { kind: "polygon", points: wall.points },
      ),
    },
    walls: allWallSegments(map.walls),
    bounds: { width: map.width, height: map.height },
    spawns: map.spawnPoints,
  };
}
