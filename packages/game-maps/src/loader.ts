import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { teamIds } from "@vibewars/game-core";

import { MapValidationError, validateMapData, type MapData } from "./schema.js";

export class MapNotFoundError extends Error {
  public override readonly name = "MapNotFoundError";
}

/**
 * The `maps/` directory ships inside this package (`package.json`'s
 * `files`), one level up from the compiled `dist/loader.js` — true both in
 * a workspace checkout and once this package is copied whole into the
 * production container (ADR-0009's "ship the already-tested tree").
 */
function mapsRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../maps");
}

export function listMapIds(): string[] {
  const root = mapsRoot();
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Load and validate one map by id. Throws if it does not exist or is invalid. */
export function loadMap(mapId: string): MapData {
  const file = resolve(mapsRoot(), mapId, "map.json");
  if (!existsSync(file)) {
    throw new MapNotFoundError(`No map named ${JSON.stringify(mapId)} (looked in ${file})`);
  }
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  const map = validateMapData(raw);
  const short = unseatedTeams(map);
  if (short.length > 0) {
    throw new MapValidationError(
      `Invalid map data:\n${short.map((line) => `  - spawnPoints: ${line}`).join("\n")}`,
    );
  }
  return map;
}

/**
 * Each of an arena's `teams` (#2682) that has too few spawns for its
 * largest team size (#2108), as a line saying so; none when every team seats its own. A 1v1
 * or a 2v2 still has two spawns a team to start from, and nobody ever
 * shares one. Training grounds, outside `maps/`, seat one player against
 * a pack and are not held to it.
 */
export function unseatedTeams(map: MapData): string[] {
  const needed = Math.max(2, ...map.teamSizes);
  return teamIds(map.teams).flatMap((team) => {
    const count = map.spawnPoints.filter((spawn) => spawn.team === team).length;
    return count >= needed
      ? []
      : [
          `team ${String(team)} has ${String(count)} spawns, not the ${String(needed)} its team sizes need`,
        ];
  });
}

/** Load and validate every bundled map — used by CI-facing validation tests. */
export function loadAllMaps(): MapData[] {
  return listMapIds().map((id) => loadMap(id));
}
