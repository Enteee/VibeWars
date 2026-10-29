import type { Mood } from "./mood.js";

/**
 * Which moods fit where the player is (#366 §3.5): a screen, a map, or a
 * match's result. The director picks a track with one of them.
 */
const MOODS: ReadonlyMap<string, readonly Mood[]> = new Map<string, readonly Mood[]>([
  ["menu", ["atmospheric", "melancholy"]],
  ["lobby", ["adventurous"]],
  ["result-victory", ["triumphant"]],
  ["result-defeat", ["melancholy"]],
  ["training-hall", ["adventurous", "atmospheric"]],
  ["training-pillars", ["adventurous", "atmospheric"]],
  ["arena-alpha", ["epic"]],
  ["arena-open", ["action", "adventurous"]],
  ["arena-pillars", ["dark"]],
  ["arena-split", ["mysterious"]],
  // #444's arenas (asset-designer).
  ["arena-ring", ["epic", "action"]],
  ["arena-crossroads", ["action"]],
  ["arena-long-hall", ["dark", "mysterious"]],
  ["arena-canyon", ["adventurous", "epic"]],
  // The Guild Battle's (#1222): a siege.
  ["guild-hall-isle", ["epic", "dark"]],
  // Heroes' Ascent's Relic Run (#1374): a race.
  ["relic-temples", ["action", "adventurous"]],
  // King of the Hill's (#1377): a hill held against all comers.
  ["hill-courtyard", ["epic", "action"]],
  // Capture Points (#1378): old ground, held.
  ["forgotten-shrines", ["mysterious", "epic"]],
]);

/** Played where the table has nothing: a map this client does not know. */
const UNKNOWN: readonly Mood[] = ["epic"];

/**
 * The moods for a context key: `menu`, `lobby`, `result-victory`,
 * `result-defeat`, or a map id. An unknown key is wrong data and gets the
 * `epic` set.
 */
export function moodsFor(key: string): readonly Mood[] {
  return MOODS.get(key) ?? UNKNOWN;
}
