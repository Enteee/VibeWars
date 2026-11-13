/**
 * The render bench's judgement (#3243): each map against the two
 * calibration windows that bracket it.
 */

/**
 * @typedef {object} MapRow
 * @property {string} mapId
 * @property {number} p50 ms
 *
 * @typedef {object} Verdict
 * @property {string} mapId
 * @property {number} base mean of the two windows around the map, ms
 * @property {number} ratio the map's p50 over `base`
 * @property {number} spread the two windows' gap over `base`
 * @property {string[]} failures why the run fails, if it does
 */

/**
 * Map i is bracketed by windows i and i + 1, so `windows` is one longer than
 * `maps`. A bracket whose windows differ by more than `maxSpread` of their
 * mean fails: the runner was too noisy to judge the map. A map over
 * `maxRatio` times its base fails too, when a ratio is set.
 *
 * @param {object} input
 * @param {readonly number[]} input.windows calibration p50s, ms, in run order
 * @param {readonly MapRow[]} input.maps in run order
 * @param {number | undefined} input.maxRatio
 * @param {number} input.maxSpread
 * @returns {Verdict[]}
 */
export function verdict({ windows, maps, maxRatio, maxSpread }) {
  if (windows.length !== maps.length + 1) {
    throw new Error(`${String(maps.length)} maps need ${String(maps.length + 1)} windows`);
  }
  return maps.map((map, i) => {
    const before = windows[i] ?? NaN;
    const after = windows[i + 1] ?? NaN;
    const base = (before + after) / 2;
    const spread = Math.abs(before - after) / base;
    const ratio = map.p50 / base;
    /** @type {string[]} */
    const failures = [];
    if (!(spread <= maxSpread)) {
      failures.push(
        `calibration unstable around ${map.mapId} (w${String(i)} ${before.toFixed(1)} ms, w${String(i + 1)} ${after.toFixed(1)} ms, spread ${(spread * 100).toFixed(0)} % > ${String(maxSpread * 100)} %): the runner is too noisy to judge`,
      );
    }
    if (maxRatio !== undefined && !(ratio <= maxRatio)) {
      failures.push(
        `${map.mapId}: p50 is ${ratio.toFixed(2)}× the calibration's, over ${String(maxRatio)}×`,
      );
    }
    return { mapId: map.mapId, base, ratio, spread, failures };
  });
}

/**
 * How many warm-up windows it took before two consecutive ones agreed
 * within `tolerance` of their mean, or `undefined` if none did.
 *
 * @param {readonly number[]} windows calibration p50s, ms, in run order
 * @param {number} tolerance
 * @returns {number | undefined}
 */
export function settled(windows, tolerance) {
  for (let i = 1; i < windows.length; i++) {
    const a = windows[i - 1] ?? NaN;
    const b = windows[i] ?? NaN;
    if (Math.abs(a - b) / ((a + b) / 2) <= tolerance) {
      return i + 1;
    }
  }
  return undefined;
}
