/**
 * `@vibewars/game-maps` — declarative map data plus its loader and
 * validator (ADR-0006). The runtime consumes `MapData`; it never guesses at
 * raw JSON shape.
 */

export type { MapData, PolygonWall, RectWall, SpawnPoint, Vec2Data, Wall } from "./schema.js";
export { MapValidationError, mapDataSchema, validateMapData } from "./schema.js";

export { allWallSegments, wallToSegments } from "./geometry.js";

export { MapNotFoundError, listMapIds, loadAllMaps, loadMap } from "./loader.js";
