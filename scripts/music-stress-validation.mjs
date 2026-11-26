/**
 * Whether a browser's underrun readings can be trusted (#519). Pure, so
 * it is tested on recorded totals; scripts/music-stress.mjs applies it.
 */

/** Underrun time with no load added up to this is clock noise, not crackle. */
export const BASELINE_MAX_MS = 10;
/** Full stress must add at least this much underrun time to the baseline. */
export const CLEARLY_MORE_MS = 50;

/**
 * @typedef {{ audioStress: number, underrunMs: number | null }} StressReading
 *   one load's total `underrunMs` over the run, `null` where the browser cannot say
 */

/**
 * A browser is **validated** when, in one run, no audio stress gives about no
 * underrun time, full stress (2.5 ms) gives clearly more, and 1.5 ms gives no
 * more than 2.5 ms. Anything else, including a missing load or a `null`, is
 * unvalidated: its numbers are printed but nobody tunes from them.
 *
 * @param {StressReading[]} readings
 * @returns {boolean}
 */
export function validated(readings) {
  const at = (/** @type {number} */ audioStress) =>
    readings.find((reading) => reading.audioStress === audioStress)?.underrunMs;
  const none = at(0);
  const some = at(1.5);
  const full = at(2.5);
  if (typeof none !== "number" || typeof some !== "number" || typeof full !== "number") {
    return false;
  }
  return none <= BASELINE_MAX_MS && full >= none + CLEARLY_MORE_MS && some <= full;
}
