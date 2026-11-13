/**
 * Maps the render bench gates above `BENCH_MAX_RATIO` until their perf
 * issue lands (#3243). A listed map at or under the default ratio fails, so
 * its entry is deleted once the issue lands (#3255).
 *
 * @type {readonly import("./verdict.mjs").Ceiling[]}
 */
export const BENCH_CEILINGS = [{ mapId: "arena-long-hall", ratio: 4.1, issue: 3254 }];
