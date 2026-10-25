import { describe, expect, it } from "vitest";

import type { MusicState } from "./director.js";
import type { MusicPlayer } from "./music-player.js";
import { MUTE_RAMP_SECONDS, createMusicFollower } from "./play-music.js";

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

const state = (trackId: string | null, intensity: MusicState["intensity"]): MusicState => ({
  trackId,
  intensity,
  intensitySinceMs: 0,
  context: "match:x",
});

describe("createMusicFollower", () => {
  it("starts at the saved mute, and mutes with the global mute", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, true, () => 0);
    music.setMuted(false);
    expect(calls).toEqual([
      ["setVolume", [0, 0]],
      ["setVolume", [1, MUTE_RAMP_SECONDS]],
    ]);
  });

  it("crossfades on a new track, sets a new intensity, and repeats nothing", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(player, tracks, false, () => 0);
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
    const music = createMusicFollower(player, tracks, false, () => 0);
    music.screen("menu");
    expect(calls.at(-1)).toEqual(["crossfadeTo", tracks[0]]);
  });
});
