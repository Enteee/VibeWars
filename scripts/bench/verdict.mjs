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
 * @property {number} before calibration window just before the map, ms
 * @property {number} after calibration window just after the map, ms
 *
 * @typedef {object} Verdict
 * @property {string} mapId
 * @property {number} base mean of the two windows around the map, ms
 * @property {number} ratio the map's p50 over `base`
 * @property {number} spread the two windows' gap over `base`
 * @property {Ceiling | undefined} ceiling the map's entry in the ceilings, if it has one
 * @property {string[]} failures why the run fails on the map's own numbers (a breach)
 * @property {string | undefined} noisy why the runner was too noisy to judge the map, if it was
 */

/**
 * How far under `maxRatio` a listed map must measure to fail as stale: a
 * map just under the default keeps its ceiling, as runner noise is ±10 % and long-hall
 * measured 2.99-3.45 against a 3.5 gate (#3255).
 */
export const STALE_MARGIN = 1.25;

/**
 * Each map carries the two calibration windows that bracket it. A bracket
 * whose windows differ by more than `maxSpread` of their mean is `noisy`: the
 * runner was too noisy to judge the map. A map over
 * `maxRatio` times its base fails too, when a ratio is set.
 *
 * @param {object} input
 * @param {readonly MapRow[]} input.maps in run order
 * @param {number | undefined} input.maxRatio
 * @param {number} input.maxSpread
 * @param {readonly Ceiling[]} [input.ceilings] maps gated at their own ratio. A listed map
 *   at or under `maxRatio / STALE_MARGIN` fails as stale: the reference map moves with the
 *   runner as the maps do, so a ratio that far under the default is the map's own (#3255).
 * @returns {Verdict[]}
 */
export function verdict({ maps, maxRatio, maxSpread, ceilings = [] }) {
  return maps.map((map) => {
    const { before, after } = map;
    const base = (before + after) / 2;
    const spread = Math.abs(before - after) / base;
    const ratio = map.p50 / base;
    /** @type {string[]} */
    const failures = [];
    const noisy =
      spread <= maxSpread
        ? undefined
        : `calibration unstable around ${map.mapId} (${before.toFixed(1)} ms, ${after.toFixed(1)} ms, spread ${(spread * 100).toFixed(0)} % > ${String(maxSpread * 100)} %): the runner is too noisy to judge`;
    const ceiling = ceilings.find((c) => c.mapId === map.mapId);
    if (maxRatio !== undefined) {
      const limit = ceiling?.ratio ?? maxRatio;
      if (!(ratio <= limit)) {
        failures.push(
          `${map.mapId}: p50 is ${ratio.toFixed(2)}× the calibration's, over ${String(limit)}×${ceiling === undefined ? "" : ` (ceiling, #${String(ceiling.issue)})`}`,
        );
      }
      const stale = maxRatio / STALE_MARGIN;
      if (ceiling !== undefined && ratio <= stale) {
        failures.push(
          `${map.mapId} is under ${stale.toFixed(2)}× (${String(maxRatio)}× / ${String(STALE_MARGIN)}): delete its BENCH_CEILINGS entry (#${String(ceiling.issue)})`,
        );
      }
    }
    return { mapId: map.mapId, base, ratio, spread, ceiling, failures, noisy };
  });
}

/** EX_TEMPFAIL: the runner was too noisy to judge, and a rerun is the remedy. */
export const EXIT_TOO_NOISY = 75;

/**
 * The bench's exit code. A breach wins over noise: a regression is never
 * reported as a reason to rerun.
 *
 * Report-only (the hosted perf bench) prints a breach and passes, as its table
 * still has numbers; a warm-up that never settled leaves no table, so it still fails.
 *
 * @param {{ breach: boolean, noisy: boolean, unsettled: boolean, reportOnly: boolean }} outcome
 * @returns {number}
 */
export function exitCode({ breach, noisy, unsettled, reportOnly }) {
  if (reportOnly) return unsettled ? EXIT_TOO_NOISY : 0;
  if (breach) return 1;
  return noisy ? EXIT_TOO_NOISY : 0;
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

/**
 * This shard's share of a sorted list: every n-th entry from the i-th,
 * for `spec` "i/n" (1-based, #3509). No spec is the whole list. A spec that is
 * not two integers with 1 <= i <= n throws, and so does a shard left empty.
 *
 * @template T
 * @param {readonly T[]} list
 * @param {string | undefined} spec
 * @returns {T[]}
 */
export function shardOf(list, spec) {
  if (spec === undefined || spec === "") return [...list];
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  const i = Number(match?.[1]);
  const n = Number(match?.[2]);
  if (match === null || i < 1 || i > n) {
    throw new Error(`BENCH_SHARD must be i/n with 1 <= i <= n, got "${spec}"`);
  }
  const mine = list.filter((_, index) => index % n === i - 1);
  if (mine.length === 0) {
    throw new Error(
      `BENCH_SHARD ${spec} has no map: ${String(list.length)} maps for ${String(n)} shards`,
    );
  }
  return mine;
}
