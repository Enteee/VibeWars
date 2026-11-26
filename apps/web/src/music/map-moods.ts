import type { Mood } from "./mood.js";

/**
 * Which moods fit a match's result (#366 §3.5); the director picks a track
 * with one of them. Menus and maps have fixed songs (`fixed-tracks.ts`).
 */
const MOODS: ReadonlyMap<string, readonly Mood[]> = new Map<string, readonly Mood[]>([
  ["result-victory", ["triumphant"]],
  ["result-defeat", ["melancholy"]],
]);

/** Played where the table has nothing: a draw. */
const UNKNOWN: readonly Mood[] = ["epic"];

/** The moods for `result-victory` or `result-defeat`; any other key gets the `epic` set. */
export function moodsFor(key: string): readonly Mood[] {
  return MOODS.get(key) ?? UNKNOWN;
}
