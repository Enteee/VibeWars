/**
 * `?stress=<ms>` (#420): the main thread busy-waits that long every
 * 100 ms, so a desktop browser with no CPU throttling, like Firefox, can
 * be loaded the way a phone's game frames load it. Only in the build
 * scripts/music-stress.mjs makes: anywhere else a shared link could make
 * a player's game busy-wait.
 */

/** Whether this build honours `?stress=`. */
export const STRESS_BUILD: boolean = import.meta.env.VITE_VIBEWARS_STRESS === "on";

/** How often the stressor takes the main thread. */
export const STRESS_PERIOD_MS = 100;

/** The busy wait `?stress=` asks for in a stress build, or `null`. Never the whole period. */
export function stressMs(search: string, stressBuild: boolean): number | null {
  if (!stressBuild) {
    return null;
  }
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

/** The longest `?audiostress=` busy wait per render quantum: a quantum is 2.67 ms at 48 kHz. */
export const MAX_AUDIO_STRESS_MS = 5;

/**
 * The busy wait per 128-frame render quantum `?audiostress=` asks for in a
 * stress build, or `null` (#519). 2.5 ms is about 95 % of the budget at
 * 48 kHz: the audio thread just keeps up, or just does not.
 */
export function audioStressMs(search: string, stressBuild: boolean): number | null {
  if (!stressBuild) {
    return null;
  }
  const asked = Number(new URLSearchParams(search).get("audiostress"));
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_AUDIO_STRESS_MS) : null;
}

/**
 * Whether `?musicrender=ahead` asks the host to render the music ahead
 * offline (#509, spike): in a stress build only, until ADR-0028 decides.
 */
export function renderAhead(search: string, stressBuild: boolean): boolean {
  return stressBuild && new URLSearchParams(search).get("musicrender") === "ahead";
}
