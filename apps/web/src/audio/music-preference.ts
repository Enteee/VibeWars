import type { MusicMode } from "../music/director.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/**
 * What the player chose to hear (#372, #366 §3.6), across reloads: Auto,
 * Shuffle, a pinned track or Off, and the music's own volume and mute,
 * apart from the sound effects'.
 */

export type MusicModeKind = MusicMode["kind"];

export interface MusicPreference {
  readonly mode: MusicModeKind;
  /** The track `pinned` plays; kept while another mode is chosen. */
  readonly pinnedTrackId: string | null;
  /** 0 to 1. */
  readonly musicVolume: number;
  readonly musicMuted: boolean;
}

export const DEFAULT_MUSIC_PREFERENCE: MusicPreference = {
  mode: "auto",
  pinnedTrackId: null,
  musicVolume: 0.6,
  musicMuted: false,
};

const MUSIC_KEY = `${STORAGE_NAMESPACE}.music`;

/** In the order the jukebox lists them. */
export const MUSIC_MODES: readonly MusicModeKind[] = ["auto", "shuffle", "pinned", "off"];

function isMode(value: unknown): value is MusicModeKind {
  return MUSIC_MODES.some((mode) => mode === value);
}

/** A stored preference, or the defaults for anything that is not exactly one. */
export function parseMusicPreference(text: string | null): MusicPreference {
  if (text === null) {
    return DEFAULT_MUSIC_PREFERENCE;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return DEFAULT_MUSIC_PREFERENCE;
  }
  if (typeof value !== "object" || value === null) {
    return DEFAULT_MUSIC_PREFERENCE;
  }
  const { mode, pinnedTrackId, musicVolume, musicMuted } = value as Record<string, unknown>;
  const valid =
    isMode(mode) &&
    (pinnedTrackId === null || (typeof pinnedTrackId === "string" && pinnedTrackId !== "")) &&
    !(mode === "pinned" && pinnedTrackId === null) &&
    typeof musicVolume === "number" &&
    musicVolume >= 0 &&
    musicVolume <= 1 &&
    typeof musicMuted === "boolean";
  return valid ? { mode, pinnedTrackId, musicVolume, musicMuted } : DEFAULT_MUSIC_PREFERENCE;
}

/** The director's mode. A pinned id it does not know, it plays as Auto. */
export function musicModeOf({ mode, pinnedTrackId }: MusicPreference): MusicMode {
  if (mode !== "pinned") {
    return { kind: mode };
  }
  return pinnedTrackId === null ? { kind: "auto" } : { kind: "pinned", trackId: pinnedTrackId };
}

export function loadMusicPreference(): MusicPreference {
  try {
    return parseMusicPreference(localStorage.getItem(MUSIC_KEY));
  } catch {
    // Private browsing can throw on localStorage access; the defaults play.
    return DEFAULT_MUSIC_PREFERENCE;
  }
}

export function saveMusicPreference(preference: MusicPreference): void {
  try {
    localStorage.setItem(MUSIC_KEY, JSON.stringify(preference));
  } catch {
    // The choice still holds for this session; it just is not remembered.
  }
}
