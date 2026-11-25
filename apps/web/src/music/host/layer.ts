import type { Pattern } from "@strudel/core";

import { layerGain, type LevelChange } from "./transitions.js";

/** Where a track's cycle 0 plays on the scheduler's clock, once it is placed. */
export interface TrackClock {
  origin: number;
}

/**
 * `pattern` with its cycle 0 on `origin`, silent before it: a pattern is
 * endless both ways, and a track placed ahead of the scheduler would
 * otherwise play its negative cycles while it waits.
 */
export function placedAt(pattern: Pattern, origin: number): Pattern {
  return pattern.filterHaps((hap) => hap.wholeOrPart().begin.valueOf() >= 0).late(origin);
}

/**
 * The `layer(n, pat)` a source calls: `pat` is heard while the intensity
 * is at least `n`, fading in and out as it crosses it (#3983). A note's
 * level is its layer's at its onset; one at 0 is left out.
 *
 * A source's pattern is queried in its own time, before `late(origin)`
 * places it, but the intensity is scheduled on the scheduler's clock. So
 * each `layer` keeps the clock of the track being compiled when it was
 * called, and looks the level up at `begin + origin`. Both sides of a
 * switch play at once, each on its own clock.
 */
export function makeLayer(
  levels: () => readonly LevelChange[],
  compiling: () => TrackClock,
): (n: number, pattern: Pattern) => Pattern {
  return (n, pattern) => {
    const clock = compiling();
    const gainOf = (begin: number): number => layerGain(levels(), n, begin + clock.origin);
    return pattern
      .filterHaps((hap) => gainOf(hap.wholeOrPart().begin.valueOf()) > 0)
      .withHap((hap) => {
        const gain = gainOf(hap.wholeOrPart().begin.valueOf());
        return hap.withValue((value) => {
          if (typeof value !== "object" || value === null) {
            return value;
          }
          const fields = value as Record<string, unknown>;
          const velocity = typeof fields.velocity === "number" ? fields.velocity : 1;
          return { ...fields, velocity: velocity * gain };
        });
      });
  };
}
