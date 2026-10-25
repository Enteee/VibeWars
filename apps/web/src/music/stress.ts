/**
 * `?stress=<ms>` (#420): the main thread busy-waits that long every
 * 100 ms, so a desktop browser with no CPU throttling, like Firefox, can
 * be loaded the way a phone's game frames load it. For
 * scripts/music-stress.mjs; nothing else sets it.
 */

/** How often the stressor takes the main thread. */
export const STRESS_PERIOD_MS = 100;

/** The busy wait `?stress=` asks for, or `null`. Never the whole period. */
export function stressMs(search: string): number | null {
  const asked = Number(new URLSearchParams(search).get("stress"));
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, STRESS_PERIOD_MS - 10) : null;
}

export function startStress(ms: number): void {
  window.setInterval(() => {
    const until = performance.now() + ms;
    while (performance.now() < until) {
      // Busy: this is the load.
    }
  }, STRESS_PERIOD_MS);
}
