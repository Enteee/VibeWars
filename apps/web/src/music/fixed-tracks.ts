/**
 * What Auto plays (#1993): one song for every menu, deeper menus louder,
 * and one song per map, the same every match. Results go by mood instead
 * (`map-moods.ts`).
 */

/** Every menu screen's song. */
export const MENU_TRACK = "first-light";

/** The splash screen's song (#2884): the game's own theme. */
export const SPLASH_TRACK = "vibe-wars";

/** Played on a map this table does not know: wrong data. */
export const UNKNOWN_MAP_TRACK = "hall-of-champions";

/**
 * Each arena's song, from its moods when the table was drawn up. The
 * builder's Training Ground keeps the menu's (#2020).
 */
export const MAP_TRACKS: ReadonlyMap<string, string> = new Map([
  ["broken-tower", "northern-pass"],
  ["cinder-sanctum", "ember-deep"],
  ["guild-hall-isle", "hall-of-champions"],
  ["ember-pits", "ember-deep"],
  ["arena-long-hall", "ember-deep"],
  ["jungle-ruins", "jungle-veil"],
  ["scarred-earth", "jungle-veil"],
  ["arena-crossroads", "last-stand"],
  ["the-courtyard", "last-stand"],
  ["arena-canyon", "glass-dunes"],
  ["sandstone-steps", "clash-of-banners"],
  ["frozen-crossing", "ashen-fields"],
  ["ashen-courtyard", "ashen-fields"],
  ["moss-vale", "jungle-veil"],
  ["canthan-terraces", "hall-of-champions"],
  ["sunken-bastion", "victors-hymn"],
  ["shiverpeak-pass", "northern-pass"],
  ["elonian-plateau", "glass-dunes"],
  ["hall-of-heroes", "hall-of-champions"],
  ["barrow-field", "jungle-veil"],
  ["hollow-deep", "ember-deep"],
  ["blackwater-ford", "jungle-veil"],
  ["mosslit-cairns", "jungle-veil"],
  ["wardens-gallery", "last-stand"],
  ["brazen-causeway", "clash-of-banners"],
  ["elite-zaishen-battle", "hall-of-champions"],
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
