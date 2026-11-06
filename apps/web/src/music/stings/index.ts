import manifest from "./manifest.json" with { type: "json" };
import { STING_IDS, type StingId } from "./ids.js";

export { STING_IDS, isStingId, type StingId } from "./ids.js";

/**
 * A short phrase played once on top of the track (#2523), in the track's
 * key: written in scale degrees over `KEY`, with no tempo of its own.
 */
export interface Sting {
  readonly id: StingId;
  /** How long it plays, 1 to 4 cycles of the track. */
  readonly cycles: number;
  /** The Strudel source, imported with `?raw`. */
  readonly source: string;
}

const sources = import.meta.glob<string>("./*.strudel.js", {
  query: "?raw",
  import: "default",
  eager: true,
});

const entries: Readonly<Record<string, { readonly cycles: number }>> = manifest;

export const STINGS: Readonly<Record<StingId, Sting>> = Object.fromEntries(
  STING_IDS.map((id) => {
    const source = sources[`./${id}.strudel.js`];
    const entry = entries[id];
    if (source === undefined || entry === undefined) {
      throw new Error(`sting ${id} has no ${id}.strudel.js or manifest entry`);
    }
    return [id, { id, cycles: entry.cycles, source }];
  }),
) as Record<StingId, Sting>;
