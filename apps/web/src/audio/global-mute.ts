import { music } from "../music/play-music.js";
import { saveMuted } from "./mute-preference.js";
import { soundPlayer } from "./sound-player.js";

/**
 * Mute all (#112, #424): the one switch behind the HUD's mute button, the
 * Training Ground's mute key and Options → Sound. It mutes the sound
 * effects and the music, saves, and tells whoever shows it, so a mute
 * made in one place shows in the others.
 */

type Listener = (muted: boolean) => void;

const listeners = new Set<Listener>();

export function isGloballyMuted(): boolean {
  return soundPlayer().muted;
}

export function setGlobalMute(muted: boolean): void {
  soundPlayer().setMuted(muted);
  music().setMuted(muted);
  saveMuted(muted);
  for (const listener of listeners) {
    listener(muted);
  }
}

/** Hear every change of the global mute, until the returned function is called. */
export function onGlobalMute(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
