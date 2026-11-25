/**
 * `@vibewars/game-maps` — declarative map data plus its loader and
 * validator (ADR-0006). The runtime consumes `MapData`; it never guesses at
 * raw JSON shape.
 */

export type {
  Decor,
  DecorKind,
  MapData,
  MapLighting,
  TeamSize,
  PolygonWall,
  RectWall,
  SpawnPoint,
  Vec2Data,
  Wall,
} from "./schema.js";
export {
  ANIMATED_DECOR_KINDS,
  DECOR_KINDS,
  MAX_ANIMATED_DECOR,
  MAX_DECOR,
  MapValidationError,
  TEAM_SIZES_ALL,
  decorRefusal,
  mapDataSchema,
  validateMapData,
} from "./schema.js";

export { allWallSegments, wallToSegments } from "./geometry.js";
export { sizeClass, type SizeClass } from "./size-class.js";

export { MapNotFoundError, listMapIds, loadAllMaps, loadMap, unseatedTeams } from "./loader.js";
