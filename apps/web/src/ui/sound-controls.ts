import { isGloballyMuted, onGlobalMute, setGlobalMute } from "../audio/global-mute.js";
import { saveMusicPreference, type MusicPreference } from "../audio/music-preference.js";
import { saveSfxVolume } from "../audio/sfx-volume-preference.js";
import { soundPlayer, type SoundPlayer } from "../audio/sound-player.js";
import { music, type MusicFollower } from "../music/play-music.js";

/**
 * The sound controls (#424): mute all, the sound effects volume, and the
 * music's own volume and mute. They exist once and render in two places,
 * Options → Sound and the HUD's ♪ popover, so there is never a second
 * volume control to disagree with this one. Every change applies at once
 * and is saved; the volumes ramp to it rather than jump.
 *
 * `SoundSettings` holds the rules and needs no DOM, so they are tested in
 * Node; `mountSoundControls` only draws it.
 */

export interface SoundControlsDeps {
  readonly sounds: Pick<SoundPlayer, "volume" | "setVolume">;
  readonly music: Pick<MusicFollower, "preference" | "setPreference">;
  readonly saveSfxVolume: (volume: number) => void;
  readonly saveMusicPreference: (preference: MusicPreference) => void;
  readonly isMuted: () => boolean;
  readonly setGlobalMute: (muted: boolean) => void;
  /** Hear a mute made elsewhere, such as the HUD's button; returns the unsubscribe. */
  readonly onGlobalMute: (listener: (muted: boolean) => void) => () => void;
}

/** The page's own sound player, music and preferences. */
export function soundControlsDeps(): SoundControlsDeps {
  return {
    sounds: soundPlayer(),
    music: music(),
    saveSfxVolume,
    saveMusicPreference,
    isMuted: isGloballyMuted,
    setGlobalMute,
    onGlobalMute,
  };
}

/** What the controls show. */
export interface SoundState {
  readonly mutedAll: boolean;
  /** 0 to 1. */
  readonly sfxVolume: number;
  /** 0 to 1. */
  readonly musicVolume: number;
  readonly musicMuted: boolean;
}

export class SoundSettings {
  readonly #deps: SoundControlsDeps;
  readonly #listeners = new Set<() => void>();
  readonly #offMute: () => void;

  constructor(deps: SoundControlsDeps) {
    this.#deps = deps;
    // A mute made here comes back through this too, as one made elsewhere does.
    this.#offMute = deps.onGlobalMute(() => {
      this.#changed();
    });
  }

  get state(): SoundState {
    const { musicVolume, musicMuted } = this.#deps.music.preference;
    return {
      mutedAll: this.#deps.isMuted(),
      sfxVolume: this.#deps.sounds.volume,
      musicVolume,
      musicMuted,
    };
  }

  setMutedAll(muted: boolean): void {
    this.#deps.setGlobalMute(muted);
  }

  setSfxVolume(volume: number): void {
    this.#deps.sounds.setVolume(volume);
    this.#deps.saveSfxVolume(this.#deps.sounds.volume);
    this.#changed();
  }

  setMusicVolume(musicVolume: number): void {
    this.#changeMusic({ ...this.#deps.music.preference, musicVolume });
  }

  setMusicMuted(musicMuted: boolean): void {
    this.#changeMusic({ ...this.#deps.music.preference, musicMuted });
  }

  /** Called after every change, from here or a global mute from elsewhere. */
  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  dispose(): void {
    this.#offMute();
    this.#listeners.clear();
  }

  #changeMusic(next: MusicPreference): void {
    this.#deps.music.setPreference(next);
    this.#deps.saveMusicPreference(next);
    this.#changed();
  }

  #changed(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** "70 %", for a volume of 0.7. */
export function volumePercent(volume: number): string {
  return `${String(Math.round(volume * 100))} %`;
}

function checkbox(container: HTMLElement, className: string, label: string): HTMLInputElement {
  const field = document.createElement("label");
  field.className = `sound-toggle ${className}`;
  const input = document.createElement("input");
  input.type = "checkbox";
  const text = document.createElement("span");
  text.textContent = label;
  field.append(input, text);
  container.appendChild(field);
  return input;
}

function slider(
  container: HTMLElement,
  className: string,
  label: string,
): { input: HTMLInputElement; readout: HTMLElement } {
  const field = document.createElement("label");
  field.className = `field sound-volume ${className}`;
  const text = document.createElement("span");
  text.className = "field-label";
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  const readout = document.createElement("span");
  readout.className = "sound-volume-readout";
  field.append(text, input, readout);
  container.appendChild(field);
  return { input, readout };
}

/** Draw the four controls into `container`; returns the cleanup. */
export function mountSoundControls(container: HTMLElement, deps: SoundControlsDeps): () => void {
  const settings = new SoundSettings(deps);
  const panel = document.createElement("div");
  panel.className = "sound-controls";
  container.appendChild(panel);

  const muteAll = checkbox(panel, "sound-mute-all", "Mute all");
  const sfx = slider(panel, "sound-sfx-volume", "sound effects volume");
  const musicVolume = slider(panel, "sound-music-volume", "music volume");
  const musicMute = checkbox(panel, "sound-music-mute", "Mute music");

  muteAll.addEventListener("change", () => {
    settings.setMutedAll(muteAll.checked);
  });
  sfx.input.addEventListener("input", () => {
    settings.setSfxVolume(Number(sfx.input.value));
  });
  musicVolume.input.addEventListener("input", () => {
    settings.setMusicVolume(Number(musicVolume.input.value));
  });
  musicMute.addEventListener("change", () => {
    settings.setMusicMuted(musicMute.checked);
  });

  const paint = (): void => {
    const state = settings.state;
    muteAll.checked = state.mutedAll;
    sfx.input.value = String(state.sfxVolume);
    sfx.readout.textContent = volumePercent(state.sfxVolume);
    musicVolume.input.value = String(state.musicVolume);
    musicVolume.readout.textContent = volumePercent(state.musicVolume);
    musicMute.checked = state.musicMuted;
  };
  paint();
  settings.onChange(paint);

  return () => {
    settings.dispose();
    panel.remove();
  };
}
