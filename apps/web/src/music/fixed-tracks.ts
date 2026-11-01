/**
 * What Auto plays (#1993): one song for every menu, deeper menus louder,
 * and one song per map, the same every match. Results go by mood instead
 * (`map-moods.ts`).
 */

/** Every menu screen's song. */
export const MENU_TRACK = "first-light";

/** Played on a map this table does not know: wrong data. */
export const UNKNOWN_MAP_TRACK = "hall-of-champions";

/** Each map's song, from its moods when the table was drawn up. */
export const MAP_TRACKS: ReadonlyMap<string, string> = new Map([
  ["training-field", "northern-pass"],
  ["training-hall", "northern-pass"],
  ["training-pillars", "northern-pass"],
  ["relic-temples", "northern-pass"],
  ["arena-alpha", "hall-of-champions"],
  ["guild-hall-isle", "hall-of-champions"],
  ["arena-open", "clash-of-banners"],
  ["arena-ring", "clash-of-banners"],
  ["arena-pillars", "ember-deep"],
  ["arena-long-hall", "ember-deep"],
  ["arena-split", "jungle-veil"],
  ["forgotten-shrines", "jungle-veil"],
  ["arena-crossroads", "last-stand"],
  ["hill-courtyard", "last-stand"],
  ["arena-canyon", "glass-dunes"],
  ["hall-of-heroes", "hall-of-champions"],
]);

export type MenuScreen =
  "main" | "character-builder" | "team-builder" | "member-editor" | "team-lobby" | "queue";

/** How deep in the menus a screen is: the menu song's intensity there, up to its top layer. */
export const MENU_DEPTH: Readonly<Record<MenuScreen, 0 | 1>> = {
  main: 0,
  "character-builder": 1,
  "team-builder": 1,
  "member-editor": 1,
  "team-lobby": 1,
  queue: 1,
};

/** The song Auto plays on `mapId`. */
export function mapTrack(mapId: string): string {
  return MAP_TRACKS.get(mapId) ?? UNKNOWN_MAP_TRACK;
}
