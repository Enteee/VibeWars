import type { StatsMeter } from "./stats.js";

/** How superdough is handed a note: the cyclist's `onTrigger`. */
export type NoteOutput<Hap, Result> = (
  hap: Hap,
  deadline: number,
  duration: number,
  cps: number,
  t: number,
) => Result | undefined;

/**
 * `output`, but a note due to start less than `margin` after the audio
 * clock is left out (#1991). Started, its envelope would begin in the
 * past: a truncated attack, which is a click. Left out, it is a gap. Each
 * note is counted on the meter, if there is one, as played or dropped.
 */
export function dropLate<Hap, Result>(
  output: NoteOutput<Hap, Result>,
  now: () => number,
  margin: number,
  meter: () => StatsMeter | undefined,
): NoteOutput<Hap, Result> {
  return (hap, deadline, duration, cps, t) => {
    if (t < now() + margin) {
      meter()?.dropped();
      return undefined;
    }
    meter()?.event();
    return output(hap, deadline, duration, cps, t);
  };
}
