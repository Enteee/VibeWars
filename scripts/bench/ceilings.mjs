/**
 * Maps the render bench gates above `BENCH_MAX_RATIO` until their perf
 * issue lands (#3243). A listed map at or under the default ratio warns to
 * delete its entry; it does not fail, as runner hardware moves the ratio.
 *
 * @type {readonly import("./verdict.mjs").Ceiling[]}
 */
export const BENCH_CEILINGS = [{ mapId: "arena-long-hall", ratio: 4.1, issue: 3254 }];
