/**
 * Maps the render bench gates above `BENCH_MAX_RATIO` until their perf
 * issue lands (#3243). A listed map at or under the default ratio / 1.25 fails
 * as stale, so its entry is deleted once the issue lands (#3255).
 *
 * Each is its worst ratio of three CI runs on a bare reference map, plus 15 %
 * (#4129), as `BENCH_MAX_RATIO` is for the rest: a whole-screen cost of
 * #4057's size fails it. Making them cheaper is #4130.
 *
 * @type {readonly import("./verdict.mjs").Ceiling[]}
 */
export const BENCH_CEILINGS = [
  { mapId: "elonian-plateau", ratio: 3.2, issue: 4130 },
  { mapId: "cinder-sanctum", ratio: 3.1, issue: 4130 },
  { mapId: "hollow-deep", ratio: 3.1, issue: 4130 },
  { mapId: "brazen-causeway", ratio: 3.3, issue: 4130 },
  { mapId: "arena-long-hall", ratio: 3.45, issue: 4130 },
];
