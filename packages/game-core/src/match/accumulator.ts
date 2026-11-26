/**
 * The fixed-step accumulator, as a pure function (#375): how many ticks a
 * frame of wall time runs, and the time carried to the next one. Whoever
 * owns the clock (the Training Ground's frame loop, a P2P host's worker)
 * reads it and passes the elapsed time in, so the simulation itself stays
 * clock-free (ADR-0003).
 */

/**
 * The most wall time one frame may catch up on. A backgrounded tab comes
 * back with a delta of minutes; running every tick of it at once would
 * freeze the page and fast-forward the fight past anything worth seeing.
 */
export const MAX_CATCHUP_SECONDS = 0.25;

const TICK_EPSILON = 1e-9;

export function drainAccumulator(
  accumulator: number,
  elapsedSeconds: number,
  tickSeconds: number,
): { readonly ticks: number; readonly remainder: number } {
  let remainder = Math.min(
    accumulator + Math.max(0, elapsedSeconds),
    MAX_CATCHUP_SECONDS + tickSeconds,
  );
  let ticks = 0;
  // Within a hair of a whole tick counts as one: two half-tick frames
  // sum to 0.04999… in floating point, and must not wait a third frame.
  while (remainder >= tickSeconds - TICK_EPSILON) {
    remainder = Math.max(0, remainder - tickSeconds);
    ticks += 1;
  }
  return { ticks, remainder };
}
