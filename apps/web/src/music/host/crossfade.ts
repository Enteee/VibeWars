import * as core from "@strudel/core";

import { noteGain, type Envelope } from "./transitions.js";

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

/** `pattern` as loud as `gain` says for each note (see `noteGain`), on the scheduler's clock. */
export function withGain(pattern: core.Pattern, gain: Envelope): core.Pattern {
  return pattern.withHap((hap) => {
    const level = noteGain(gain, hap.wholeOrPart().begin.valueOf(), hap.duration.valueOf());
    return hap.withValue((value) => {
      const fields = record(value);
      if (fields === null) {
        return value;
      }
      const velocity = typeof fields.velocity === "number" ? fields.velocity : 1;
      return { ...fields, velocity: velocity * level };
    });
  });
}

/** What superdough plays past a note's release before it frees it, in seconds. */
const TAIL_SECONDS = 0.01;
/** The shortest release superdough plays, and its default. */
const MIN_RELEASE_SECONDS = 0.01;

/** The tempo either side of a switch, in cycles per second: up to its landing, and from it. */
export interface SwitchTempo {
  readonly before: number;
  readonly after: number;
}

/**
 * Whether a note plays to the end of its sample whatever it is held for:
 * superdough does that for a sample with no `release`, `clip` or `loop`.
 */
export type Rings = (fields: Readonly<Record<string, unknown>>) => boolean;

/**
 * The outgoing side of a switch, silent by `until` (#3530), at its own
 * tempo `cps` to the end (#3983): a note that would still sound then, by
 * its hold and release, is shortened to end in time, and one starting at
 * or after it is dropped. A long pad started just before the fade would
 * otherwise ring for seconds past it.
 */
function bounded(pattern: core.Pattern, until: number, cps: number, rings: Rings): core.Pattern {
  return new core.Pattern((state) =>
    pattern.query(state).flatMap((hap) => {
      if (hap.whole === undefined) {
        return [hap];
      }
      const begin = hap.whole.begin.valueOf();
      if (begin >= until) {
        return [];
      }
      const fields = record(hap.value);
      if (fields === null) {
        return [hap];
      }
      const room = (until - begin) / cps - TAIL_SECONDS;
      const hold = hap.duration.valueOf() / cps;
      const ringing = rings(fields);
      const release = Math.max(
        typeof fields.release === "number" ? fields.release : 0,
        MIN_RELEASE_SECONDS,
      );
      if (!ringing && hold + release <= room) {
        return [hap];
      }
      if (room <= 2 * MIN_RELEASE_SECONDS) {
        return [];
      }
      // A ringing sample fades out over all the time it has left; any
      // other note keeps its release while it fits in half of it.
      const shortened = ringing
        ? Math.min(hold, room - MIN_RELEASE_SECONDS)
        : Math.min(hold, room - Math.min(release, room / 2));
      return [
        hap.withValue(() => ({
          ...fields,
          // In cycles, as Strudel times a note; `clip` would scale it again.
          duration: shortened * cps,
          clip: 1,
          release: room - shortened,
        })),
      ];
    }),
  );
}

/** One side of a switch: a track placed on the scheduler's clock, and how loud it is. */
export interface SwitchSide {
  readonly pattern: core.Pattern;
  readonly gain: Envelope;
}

/**
 * A switch (#3983): `outgoing` playing, at its own tempo, until `lands`,
 * by when its gain must have fallen to 0, and `incoming` from `lands` on.
 * The tempo changes from `tempo.before` to `tempo.after` exactly on
 * `lands`, while nothing of the outgoing sounds: no song is ever played
 * at another's tempo.
 */
export function crossfade(
  outgoing: SwitchSide,
  incoming: SwitchSide,
  lands: number,
  tempo: SwitchTempo,
  rings: Rings,
): core.Pattern {
  // A `cps` on an event changes the scheduler's tempo on its onset.
  const mark = core
    .pure({ [TEMPO_MARK]: true, cps: tempo.after })
    .filterHaps((hap) => hap.wholeOrPart().begin.valueOf() === lands);
  return core.stack(
    withGain(bounded(outgoing.pattern, lands, tempo.before, rings), outgoing.gain),
    withGain(
      incoming.pattern.filterHaps((hap) => hap.wholeOrPart().begin.valueOf() >= lands),
      incoming.gain,
    ),
    // Last, so it is the last event of its slot.
    mark,
  );
}

/**
 * `sting` over `track` (#2523), stacked before it, so a crossfade's tempo
 * mark in `track` stays the last event of its slot: after it, a sting
 * landing on the switch would lose its downbeat as the track's did (#420).
 */
export function overTrack(track: core.Pattern, sting: core.Pattern): core.Pattern {
  return core.stack(sting, track);
}
