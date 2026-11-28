/**
 * Maps the render bench gates above `BENCH_MAX_RATIO` until their perf
 * issue lands (#3243). A listed map at or under the default ratio / 1.25 fails
 * as stale, so its entry is deleted once the issue lands (#3255).
 *
 * Empty since #4130 brought every map under `BENCH_MAX_RATIO`. An entry is
 * its worst ratio of three CI runs on a bare reference map, plus 15 %
 * (#4129), as `BENCH_MAX_RATIO` is for the rest.
 *
 * @type {readonly import("./verdict.mjs").Ceiling[]}
 */
export const BENCH_CEILINGS = [];
