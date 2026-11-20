import type { MapData } from "@vibewars/game-maps/schema";

/**
 * The maps the client ships with (#3679), as Vite inlines their JSON, typed
 * as `MapData` without running the schema over them on every page load.
 *
 * Safe because they are our own files, checked where they are written:
 * `net/maps.test.ts` validates every bundled map and requires the result to
 * equal the raw JSON, so a map that would fail, or that the schema would
 * reshape, fails CI rather than a player's page. A map from outside still
 * goes through `validateMapData` (`@vibewars/game-maps`' loader).
 */
export function bundledMaps<const Raws extends readonly unknown[]>(
  raws: Raws,
): { readonly [Index in keyof Raws]: MapData } {
  return raws as { readonly [Index in keyof Raws]: MapData };
}
