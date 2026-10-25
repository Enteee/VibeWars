import { describe, expect, it } from "vitest";

import { DEFAULT_MUSIC_PREFERENCE, type MusicPreference } from "../audio/music-preference.js";
import type { MusicState } from "./director.js";
import type { MusicPlayer } from "./music-player.js";
import { VOLUME_RAMP_SECONDS, createMusicFollower } from "./play-music.js";

const tracks = [
  { id: "first-light", source: "a", phraseCycles: 8, moods: ["atmospheric" as const] },
  { id: "clash-of-banners", source: "b", phraseCycles: 4, moods: ["action" as const] },
];

/** A player that records every call as `[method, argument]`. */
function recording(): { player: MusicPlayer; calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push([name, args.length > 1 ? args : args[0]]);
    };
  return {
    calls,
    player: {
      load: record("load"),
      crossfadeTo: record("crossfadeTo"),
      setIntensity: record("setIntensity"),
      setVolume: record("setVolume"),
      evaluate: record("evaluate"),
      stop: record("stop"),
      onNowPlaying: record("onNowPlaying"),
      onError: record("onError"),
      onStats: record("onStats"),
    },
  };
}

const saved = (
  muted: boolean,
  preference: MusicPreference = DEFAULT_MUSIC_PREFERENCE,
): { muted: boolean; preference: MusicPreference } => ({ muted, preference });

const state = (trackId: string | null, intensity: MusicState["intensity"]): MusicState => ({
  trackId,
  intensity,
  intensitySinceMs: 0,
  context: "match:x",
});

describe("createMusicFollower", () => {
  it("starts at the saved mute, and mutes with the global mute", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(true), () => 0);
    music.setMuted(false);
    expect(calls).toEqual([
      ["setVolume", [0, 0]],
      ["setVolume", [0.6, VOLUME_RAMP_SECONDS]],
    ]);
  });

  it("crossfades on a new track, sets a new intensity, and repeats nothing", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(false), () => 0);
    calls.length = 0;
    music.follow(state("clash-of-banners", 0));
    music.follow(state("clash-of-banners", 2));
    music.follow(state("clash-of-banners", 2));
    music.follow(state(null, 0));
    expect(calls).toEqual([
      ["crossfadeTo", tracks[1]],
      ["setIntensity", 2],
      ["stop", undefined],
      ["setIntensity", 0],
    ]);
  });

  it("plays the menu's track on the menu", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(false), () => 0);
    music.screen("menu");
    expect(calls.at(-1)).toEqual(["crossfadeTo", tracks[0]]);
  });
  it("plays at the music volume, silent under either mute, ramping to each change", () => {
    const { player, calls } = recording();
    const preference = { ...DEFAULT_MUSIC_PREFERENCE, musicVolume: 0.4 };
    const music = createMusicFollower(player, tracks, saved(false, preference), () => 0);
    music.setPreference({ ...preference, musicMuted: true });
    music.setMuted(true);
    music.setPreference(preference);
    music.setMuted(false);
    music.setPreference({ ...preference, musicVolume: 0.9 });
    expect(calls.filter(([name]) => name === "setVolume")).toEqual([
      ["setVolume", [0.4, 0]],
      ["setVolume", [0, VOLUME_RAMP_SECONDS]],
      ["setVolume", [0, VOLUME_RAMP_SECONDS]],
      ["setVolume", [0.4, VOLUME_RAMP_SECONDS]],
      ["setVolume", [0.9, VOLUME_RAMP_SECONDS]],
    ]);
  });

  it("changes the menu's track at once when the mode changes, and stops for Off", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(false), () => 0);
    music.screen("menu");
    calls.length = 0;
    const pinned = {
      ...DEFAULT_MUSIC_PREFERENCE,
      mode: "pinned" as const,
      pinnedTrackId: "clash-of-banners",
    };
    music.setPreference(pinned);
    expect(music.mode()).toEqual({ kind: "pinned", trackId: "clash-of-banners" });
    music.setPreference({ ...pinned, mode: "off" });
    expect(calls).toEqual([
      ["crossfadeTo", tracks[1]],
      ["stop", undefined],
    ]);
  });

  it("leaves a fight's track to its next snapshot when the mode changes", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(false), () => 0);
    music.screen("menu");
    music.follow(state("clash-of-banners", 1));
    calls.length = 0;
    music.setPreference({ ...DEFAULT_MUSIC_PREFERENCE, mode: "off" });
    expect(calls).toEqual([]);
  });

  it("previews a track at once over the director, and crossfades back when it ends", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, saved(false), () => 0);
    music.screen("menu");
    calls.length = 0;
    music.preview("clash-of-banners");
    // The director goes on deciding, unheard.
    music.follow(state("first-light", 2));
    music.preview(null);
    music.preview("no-such-track");
    expect(calls).toEqual([
      ["load", tracks[1]],
      ["setIntensity", 2],
      ["crossfadeTo", tracks[0]],
    ]);
    expect(music.intensity).toBe(2);
  });
});
