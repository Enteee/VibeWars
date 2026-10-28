/**
 * `@vibewars/game-maps` — declarative map data plus its loader and
 * validator (ADR-0006). The runtime consumes `MapData`; it never guesses at
 * raw JSON shape.
 */

export type {
  ArenaMapData,
  MapData,
  PolygonWall,
  RectWall,
  SpawnPoint,
  Vec2Data,
  Wall,
} from "./schema.js";
export {
  MAP_MODES,
  MapValidationError,
  arenaMapSchema,
  mapDataSchema,
  validateArenaMap,
  validateMapData,
} from "./schema.js";

export { allWallSegments, wallToSegments } from "./geometry.js";
export { sizeClass, type SizeClass } from "./size-class.js";

export { MapNotFoundError, listMapIds, loadAllMaps, loadMap } from "./loader.js";
