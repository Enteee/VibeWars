import * as core from "@strudel/core";

import { fadeGain } from "./transitions.js";

/**
 * Marks the one silent event that changes the tempo on a switch's
 * boundary (#420). It is the last event of its slot: Strudel's cyclist
 * times the rest of a slot by the tempo it started with, so a tempo change
 * earlier in the slot would put every event after it seconds in the past,
 * and superdough drops those. The new track's downbeat went silent that way.
 */
export const TEMPO_MARK = "vibewarsTempo";

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Whether `value` is the tempo change, which makes no sound. */
export function isTempoMark(value: unknown): boolean {
  return record(value)?.[TEMPO_MARK] === true;
}

/** A side of a crossfade: louder or quieter by cycle. */
function faded(
  pattern: core.Pattern,
  from: number,
  cycles: number,
  side: "in" | "out",
): core.Pattern {
  return pattern.withHap((hap) => {
    const begin = hap.wholeOrPart().begin.valueOf();
    return hap.withValue((value) => {
      const fields = record(value);
      if (fields === null) {
        return value;
      }
      const velocity = typeof fields.velocity === "number" ? fields.velocity : 1;
      return { ...fields, velocity: velocity * fadeGain(begin, from, cycles, side) };
    });
  });
}

/**
 * `playing` fading out and `incoming`, started on cycle `from`, fading in
 * over `cycles`, with the tempo changing to `cps` exactly on `from`.
 * `playing` may itself be a crossfade still under way.
 */
export function crossfade(
  playing: core.Pattern,
  incoming: core.Pattern,
  from: number,
  cycles: number,
  cps: number,
): core.Pattern {
  const until = from + cycles;
  // A `cps` on an event changes the scheduler's tempo on its onset.
  const tempo = core
    .pure({ [TEMPO_MARK]: true, cps })
    .filterHaps((hap) => hap.wholeOrPart().begin.valueOf() === from);
  return core.stack(
    faded(
      playing.filterHaps((hap) => hap.wholeOrPart().begin.valueOf() < until),
      from,
      cycles,
      "out",
    ),
    faded(
      incoming.late(from).filterHaps((hap) => hap.wholeOrPart().begin.valueOf() >= from),
      from,
      cycles,
      "in",
    ),
    // Last, so it is the last event of its slot.
    tempo,
  );
}
