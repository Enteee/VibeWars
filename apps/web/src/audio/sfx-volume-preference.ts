import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** How loud the sound effects play (#424), 0 to 1, across reloads. */

const SFX_VOLUME_KEY = `${STORAGE_NAMESPACE}.sfxVolume`;

/** A stored volume, or full volume for anything that is not a number in 0–1. */
export function parseSfxVolume(text: string | null): number {
  if (text === null || text.trim() === "") {
    return 1;
  }
  const volume = Number(text);
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : 1;
}

export function loadSfxVolume(): number {
  try {
    return parseSfxVolume(localStorage.getItem(SFX_VOLUME_KEY));
  } catch {
    // Private browsing can throw on localStorage access; full volume is the default.
    return 1;
  }
}

export function saveSfxVolume(volume: number): void {
  try {
    localStorage.setItem(SFX_VOLUME_KEY, String(volume));
  } catch {
    // The slider still works for this session; it just is not remembered.
  }
}
