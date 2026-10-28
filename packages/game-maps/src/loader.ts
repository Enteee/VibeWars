import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateArenaMap, type ArenaMapData } from "./schema.js";

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

/** Load and validate one arena by id. Throws if it does not exist or is invalid. */
export function loadMap(mapId: string): ArenaMapData {
  const file = resolve(mapsRoot(), mapId, "map.json");
  if (!existsSync(file)) {
    throw new MapNotFoundError(`No map named ${JSON.stringify(mapId)} (looked in ${file})`);
  }
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  return validateArenaMap(raw);
}

/** Load and validate every bundled map — used by CI-facing validation tests. */
export function loadAllMaps(): ArenaMapData[] {
  return listMapIds().map((id) => loadMap(id));
}
