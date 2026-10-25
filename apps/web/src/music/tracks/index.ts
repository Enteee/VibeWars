import type { Mood } from "../mood.js";
import manifest from "./manifest.json" with { type: "json" };

export interface Track {
  /** Kebab-case, matches the file name. */
  id: string;
  /** Shown in the jukebox, e.g. "Hall of Champions". */
  title: string;
  /** The first entry is the primary mood. */
  moods: readonly Mood[];
  /** Must equal `setcpm(bpm / 4)` in the source. */
  bpm: number;
  /** A tonal scale name, e.g. "D aeolian"; CI asserts every note is in it. */
  key: string;
  /** Pitch classes allowed outside `key` on purpose, e.g. `["C#"]`. */
  colour: readonly string[];
  /** Highest intensity the track responds to, plus one. */
  layers: 1 | 2 | 3 | 4;
  /** Where a track switch may land (4 or 8). */
  phraseCycles: number;
  /** The Strudel source, imported with `?raw`. */
  source: string;
}

type Entry = Omit<Track, "source">;

const sources = import.meta.glob<string>("./*.strudel.js", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const TRACKS: readonly Track[] = (manifest as Entry[]).map((entry) => {
  const source = sources[`./${entry.id}.strudel.js`];
  if (source === undefined) throw new Error(`track ${entry.id} has no ${entry.id}.strudel.js`);
  return { ...entry, source };
});
