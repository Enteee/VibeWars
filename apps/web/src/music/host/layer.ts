import type { Pattern } from "@strudel/core";

import { levelAt, type LevelChange } from "./transitions.js";

/** Where a track's cycle 0 plays on the scheduler's clock, once it is placed. */
export interface TrackClock {
  origin: number;
}

/**
 * The `layer(n, pat)` a source calls: `pat` plays only while the
 * intensity is at least `n`.
 *
 * A source's pattern is queried in its own time, before `late(origin)`
 * places it, but the intensity is scheduled on the scheduler's clock. So
 * each `layer` keeps the clock of the track being compiled when it was
 * called, and looks the level up at `begin + origin`. Both sides of a
 * crossfade play at once, each on its own clock.
 */
export function makeLayer(
  levels: () => readonly LevelChange[],
  compiling: () => TrackClock,
): (n: number, pattern: Pattern) => Pattern {
  return (n, pattern) => {
    const clock = compiling();
    return pattern.filterHaps(
      (hap) => levelAt(levels(), hap.wholeOrPart().begin.valueOf() + clock.origin) >= n,
    );
  };
}
