import { describe, expect, it } from "vitest";

import { DEFAULT_MUSIC_PREFERENCE, type MusicPreference } from "../audio/music-preference.js";
import { SoundSettings, volumePercent, type SoundControlsDeps } from "./sound-controls.js";

/** Deps that record every setter and saver, with a global mute anyone can flip. */
function fakes() {
  const calls: [string, unknown][] = [];
  let muted = false;
  let volume = 1;
  let preference: MusicPreference = DEFAULT_MUSIC_PREFERENCE;
  const listeners = new Set<(muted: boolean) => void>();
  const setGlobalMute = (next: boolean): void => {
    calls.push(["setGlobalMute", next]);
    muted = next;
    for (const listener of listeners) {
      listener(next);
    }
  };
  const deps: SoundControlsDeps = {
    sounds: {
      get volume() {
        return volume;
      },
      setVolume: (next) => {
        calls.push(["sounds.setVolume", next]);
        volume = next;
      },
    },
    music: {
      get preference() {
        return preference;
      },
      setPreference: (next) => {
        calls.push(["music.setPreference", next]);
        preference = next;
      },
    },
    saveSfxVolume: (next) => calls.push(["saveSfxVolume", next]),
    saveMusicPreference: (next) => calls.push(["saveMusicPreference", next]),
    isMuted: () => muted,
    setGlobalMute,
    onGlobalMute: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { deps, calls, setGlobalMute, listeners };
}

describe("the sound controls (#424)", () => {
  it("show the saved settings", () => {
    const { deps } = fakes();
    expect(new SoundSettings(deps).state).toEqual({
      mutedAll: false,
      sfxVolume: 1,
      musicVolume: DEFAULT_MUSIC_PREFERENCE.musicVolume,
      musicMuted: false,
    });
  });

  it("set and save the sound effects volume", () => {
    const { deps, calls } = fakes();
    const settings = new SoundSettings(deps);
    settings.setSfxVolume(0.3);
    expect(calls).toEqual([
      ["sounds.setVolume", 0.3],
      ["saveSfxVolume", 0.3],
    ]);
    expect(settings.state.sfxVolume).toBe(0.3);
  });

  it("set and save the music's volume and mute, keeping the rest of its preference", () => {
    const { deps, calls } = fakes();
    const settings = new SoundSettings(deps);
    settings.setMusicVolume(0.2);
    settings.setMusicMuted(true);
    const quiet = { ...DEFAULT_MUSIC_PREFERENCE, musicVolume: 0.2 };
    const muted = { ...quiet, musicMuted: true };
    expect(calls).toEqual([
      ["music.setPreference", quiet],
      ["saveMusicPreference", quiet],
      ["music.setPreference", muted],
      ["saveMusicPreference", muted],
    ]);
    expect(settings.state).toMatchObject({ musicVolume: 0.2, musicMuted: true });
  });

  it("mute all through the global mute, which the HUD's button also uses", () => {
    const { deps, calls } = fakes();
    const settings = new SoundSettings(deps);
    settings.setMutedAll(true);
    expect(calls).toEqual([["setGlobalMute", true]]);
    expect(settings.state.mutedAll).toBe(true);
  });

  it("repaint when the global mute changes elsewhere, and stop listening once disposed", () => {
    const { deps, setGlobalMute, listeners } = fakes();
    const settings = new SoundSettings(deps);
    const painted: boolean[] = [];
    settings.onChange(() => painted.push(settings.state.mutedAll));

    setGlobalMute(true);
    setGlobalMute(false);
    expect(painted).toEqual([true, false]);

    settings.dispose();
    expect(listeners.size).toBe(0);
    setGlobalMute(true);
    expect(painted).toEqual([true, false]);
  });

  it("read a volume as a whole percentage", () => {
    expect(volumePercent(0)).toBe("0 %");
    expect(volumePercent(0.35)).toBe("35 %");
    expect(volumePercent(1)).toBe("100 %");
  });
});
