/**
 * Maps the render bench gates above `BENCH_MAX_RATIO` until their perf
 * issue lands (#3243). The list only shrinks: a listed map at or under the
 * default ratio fails the bench until its entry is deleted.
 *
 * @type {readonly import("./verdict.mjs").Ceiling[]}
 */
export const BENCH_CEILINGS = [{ mapId: "arena-long-hall", ratio: 4, issue: 3254 }];
