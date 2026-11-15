/**
 * What the per-frame passes that grow with 2.5D geometry cost (#3368), for
 * `scripts/bench/render-bench.mjs`. Only the bench's build measures: there
 * `window.__passTiming` holds each pass's total ms and call count, which the
 * bench reads and resets. In a player build the flag folds to false, the
 * `performance.now` calls go with it, and the pair below does nothing.
 */

/** The passes timed, in the order the bench prints them. */
export const TIMED_PASSES = [
  "cutAwayTunnels",
  "drawHiddenOutlines",
  "fadeOverhangs",
  "lighting",
] as const;

export type TimedPass = (typeof TIMED_PASSES)[number];

export type PassTiming = Record<TimedPass, { ms: number; calls: number }>;

const MEASURING =
  typeof __VIBEWARS_BENCH_REFERENCE__ !== "undefined" && __VIBEWARS_BENCH_REFERENCE__;

function stats(): PassTiming {
  const shown: unknown = Reflect.get(window, "__passTiming");
  if (typeof shown === "object" && shown !== null) {
    return shown as PassTiming;
  }
  const fresh = Object.fromEntries(
    TIMED_PASSES.map((pass) => [pass, { ms: 0, calls: 0 }]),
  ) as PassTiming;
  Object.assign(window, { __passTiming: fresh });
  return fresh;
}

/** The time a pass starts; 0 outside the bench's build. */
export function passStart(): number {
  return MEASURING ? performance.now() : 0;
}

/** Add the time since `start` to `pass`. */
export function passEnd(pass: TimedPass, start: number): void {
  if (MEASURING) {
    const total = stats()[pass];
    total.ms += performance.now() - start;
    total.calls += 1;
  }
}
