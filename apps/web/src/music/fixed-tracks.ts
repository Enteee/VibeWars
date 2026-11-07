/**
 * What Auto plays (#1993): one song for every menu, deeper menus louder,
 * and one song per map, the same every match. Results go by mood instead
 * (`map-moods.ts`).
 */

/** Every menu screen's song. */
export const MENU_TRACK = "first-light";

/** Played on a map this table does not know: wrong data. */
export const UNKNOWN_MAP_TRACK = "hall-of-champions";

/**
 * Each arena's song, from its moods when the table was drawn up. The
 * builder's Training Ground keeps the menu's (#2020).
 */
export const MAP_TRACKS: ReadonlyMap<string, string> = new Map([
  ["broken-tower", "northern-pass"],
  ["guild-hall-isle", "hall-of-champions"],
  ["arena-pillars", "ember-deep"],
  ["arena-long-hall", "ember-deep"],
  ["arena-split", "jungle-veil"],
  ["scarred-earth", "jungle-veil"],
  ["arena-crossroads", "last-stand"],
  ["the-courtyard", "last-stand"],
  ["arena-canyon", "glass-dunes"],
  ["sandstone-steps", "clash-of-banners"],
  ["frozen-crossing", "ashen-fields"],
  ["canthan-terraces", "hall-of-champions"],
  ["sunken-bastion", "victors-hymn"],
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
