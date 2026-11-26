import type { MapStructure } from "./arena-snapshot.js";

/**
 * The passes every map pays over the whole screen, whatever is on it
 * (#4129): the vignette (#4057) and its deck tops' (#4070). A new
 * whole-screen pass is added here, and the scene draws it only where
 * `wholeScreenPasses` keeps it.
 *
 * The render bench is calibrated on its reference map. Drawn with these, a
 * cost every map pays lands in the yardstick as well, and the ratio hides
 * it. So the bench's build (`VIBEWARS_BENCH_BARE_REFERENCE=1`) draws the
 * reference map without any: the calibration measures the machine, not our
 * post-processing. A player build folds the flag to false; Node has no define.
 */
export const WHOLE_SCREEN_PASSES = ["vignette", "deck-vignette"] as const;

export type WholeScreenPass = (typeof WHOLE_SCREEN_PASSES)[number];

const BARE_REFERENCE =
  typeof __VIBEWARS_BENCH_BARE_REFERENCE__ !== "undefined" && __VIBEWARS_BENCH_BARE_REFERENCE__;

/** Whether map `mapId` is drawn bare: the bench's reference map, in the bench's build only. */
export function drawnBare(mapId: string): boolean {
  return BARE_REFERENCE && mapId === "bench-reference";
}

/** The whole-screen passes `structure` is drawn with: none when bare, every one elsewhere. */
export function wholeScreenPasses(structure: MapStructure): readonly WholeScreenPass[] {
  return structure.bare === true ? [] : WHOLE_SCREEN_PASSES;
}
