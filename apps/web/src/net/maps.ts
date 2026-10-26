import { allWallSegments } from "@vibewars/game-maps/geometry";
import { validateMapData, type MapData } from "@vibewars/game-maps/schema";
import arenaAlpha from "@vibewars/game-maps/maps/arena-alpha/map.json" with { type: "json" };
import arenaOpen from "@vibewars/game-maps/maps/arena-open/map.json" with { type: "json" };
import arenaPillars from "@vibewars/game-maps/maps/arena-pillars/map.json" with { type: "json" };
import arenaSplit from "@vibewars/game-maps/maps/arena-split/map.json" with { type: "json" };
import type { HostMap } from "@vibewars/game-session";

/**
 * The arenas a lobby can be played on (#403), as the host's browser
 * builds them: the server used to load these from disk and serve the list
 * at `/api/maps`.
 *
 * Vite inlines the JSON, and it is validated here, at module load, as
 * `training/maps.ts` does for the training arenas.
 */
export const ARENA_MAPS: readonly MapData[] = [arenaAlpha, arenaOpen, arenaPillars, arenaSplit].map(
  (raw) => validateMapData(raw),
);

/** The arena a new lobby starts on, the server's default before (#403). */
export const DEFAULT_ARENA_ID = "arena-alpha";

/** The lobby's map ids, the default first, as `createLobbyHost` wants them. */
export function arenaIds(): string[] {
  return [
    DEFAULT_ARENA_ID,
    ...ARENA_MAPS.map((map) => map.id).filter((id) => id !== DEFAULT_ARENA_ID),
  ];
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
