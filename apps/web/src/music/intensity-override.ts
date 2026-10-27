import type { Intensity } from "./director.js";

/**
 * The player's intensity override (#425): `auto` lets the director decide,
 * a level holds the music there. One store for the whole page, read by the
 * music and written by Options → Sound, the HUD's ♪ popover and the beat
 * editor (#373), so there is never a second override to disagree with it.
 *
 * Session only (Q55): it lives in memory and is never saved, so every page
 * load starts on `auto`.
 */

export type IntensityOverride = "auto" | Intensity;

export interface IntensityOverrideStore {
  get(): IntensityOverride;
  set(value: IntensityOverride): void;
  /** Called after every change; returns the unsubscribe. */
  subscribe(listener: (value: IntensityOverride) => void): () => void;
}

export function createIntensityOverride(): IntensityOverrideStore {
  let value: IntensityOverride = "auto";
  const listeners = new Set<(value: IntensityOverride) => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) {
        return;
      }
      value = next;
      for (const listener of listeners) {
        listener(value);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's override. */
export const intensityOverride: IntensityOverrideStore = createIntensityOverride();

/** The level the music plays at: the override's, or on `auto` the director's. */
export function playedIntensity(override: IntensityOverride, directed: Intensity): Intensity {
  return override === "auto" ? directed : override;
}
