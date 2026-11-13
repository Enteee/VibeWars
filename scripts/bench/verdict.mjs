/**
 * The render bench's judgement (#3243): each map against the two
 * calibration windows that bracket it.
 */

/**
 * @typedef {object} Ceiling a map gated above `maxRatio` until its perf issue lands
 * @property {string} mapId
 * @property {number} ratio
 * @property {number} issue
 *
 * @typedef {object} MapRow
 * @property {string} mapId
 * @property {number} p50 ms
 *
 * @typedef {object} Verdict
 * @property {string} mapId
 * @property {number} base mean of the two windows around the map, ms
 * @property {number} ratio the map's p50 over `base`
 * @property {number} spread the two windows' gap over `base`
 * @property {Ceiling | undefined} ceiling the map's entry in the ceilings, if it has one
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
 * @param {readonly Ceiling[]} [input.ceilings] maps gated at their own ratio. A listed map
 *   at or under `maxRatio` fails as stale, so the list only shrinks.
 * @returns {Verdict[]}
 */
export function verdict({ windows, maps, maxRatio, maxSpread, ceilings = [] }) {
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
    const ceiling = ceilings.find((c) => c.mapId === map.mapId);
    if (maxRatio !== undefined) {
      const limit = ceiling?.ratio ?? maxRatio;
      if (!(ratio <= limit)) {
        failures.push(
          `${map.mapId}: p50 is ${ratio.toFixed(2)}× the calibration's, over ${String(limit)}×${ceiling === undefined ? "" : ` (ceiling, #${String(ceiling.issue)})`}`,
        );
      }
      if (ceiling !== undefined && ratio <= maxRatio) {
        failures.push(
          `${map.mapId} is under ${String(maxRatio)}×: delete its BENCH_CEILINGS entry (#${String(ceiling.issue)})`,
        );
      }
    }
    return { mapId: map.mapId, base, ratio, spread, ceiling, failures };
  });
}

/**
 * The warm-up window at which the runner counts as settled: the first one
 * that ends at least `minMs` into the warm-up and agrees with the one before
 * within `tol` of their mean. Agreement alone cannot tell the slow plateau
 * from the settled one; time can (#3243). `undefined` if there is none.
 *
 * @param {readonly number[]} windows calibration p50s, ms, in run order
 * @param {readonly number[]} times ms from the warm-up's start to the end of each window
 * @param {{ minMs: number, tol: number }} rule
 * @returns {number | undefined} how many windows it took
 */
export function settled(windows, times, { minMs, tol }) {
  for (let i = 1; i < windows.length; i++) {
    const a = windows[i - 1] ?? NaN;
    const b = windows[i] ?? NaN;
    if ((times[i] ?? 0) >= minMs && Math.abs(a - b) / ((a + b) / 2) <= tol) {
      return i + 1;
    }
  }
  return undefined;
}
