import { describe, expect, it } from "vitest";

import { DEFAULT_MUSIC_PREFERENCE, type MusicPreference } from "../audio/music-preference.js";
import { VOLUME_RAMP_SECONDS } from "../audio/volume-ramp.js";
import type { MusicState } from "./director.js";
import { createIntensityOverride } from "./intensity-override.js";
import type { MusicPlayer, TeardownReason } from "./music-player.js";
import { createMusicFollower } from "./play-music.js";

const tracks = [
  {
    id: "first-light",
    title: "First Light",
    source: "a",
    phraseCycles: 8,
    moods: ["atmospheric" as const],
    layers: 2,
  },
  {
    id: "clash-of-banners",
    title: "Clash of Banners",
    source: "b",
    phraseCycles: 4,
    moods: ["action" as const],
    layers: 4,
  },
];

/** No track is edited. */
const NO_EDITS = { get: () => undefined, remove: () => undefined };

/**
 * A player that records every call as `[method, argument]`, and tears its
 * host down on `tearDown`.
 */
function recording(): {
  player: MusicPlayer;
  calls: [string, unknown][];
  tearDown: (reason: TeardownReason) => void;
} {
  const calls: [string, unknown][] = [];
  const tornDown: ((reason: TeardownReason) => void)[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push([name, args.length > 1 ? args : args[0]]);
    };
  return {
    calls,
    tearDown: (reason) => {
      for (const handler of tornDown) {
        handler(reason);
      }
    },
    player: {
      load: record("load"),
      crossfadeTo: record("crossfadeTo"),
      setIntensity: record("setIntensity"),
      setVolume: record("setVolume"),
      evaluate: (source: string) => {
        record("evaluate")(source);
        return calls.length;
      },
      play: record("play"),
      stop: record("stop"),
      onNowPlaying: record("onNowPlaying"),
      onError: record("onError"),
      onStats: record("onStats"),
      onEvaluated: record("onEvaluated"),
      onTornDown: (handler) => {
        tornDown.push(handler);
      },
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
    const music = createMusicFollower(
      player,
      tracks,
      saved(true),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.setMuted(false);
    expect(calls).toEqual([
      ["setVolume", [0, 0]],
      ["setVolume", [0.6, VOLUME_RAMP_SECONDS]],
    ]);
  });

  it("crossfades on a new track, sets a new intensity, and repeats nothing", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
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
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.menu("main");
    expect(calls.at(-1)).toEqual(["crossfadeTo", tracks[0]]);
  });

  it("keeps the menu song from menu to menu, only its intensity following the depth (#1993)", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.menu("main");
    music.menu("character-builder");
    music.menu("main");
    expect(calls.filter(([call]) => call !== "setVolume")).toEqual([
      ["crossfadeTo", tracks[0]],
      ["setIntensity", 1],
      ["setIntensity", 0],
    ]);
  });
  it("plays at the music volume, silent under either mute, ramping to each change", () => {
    const { player, calls } = recording();
    const preference = { ...DEFAULT_MUSIC_PREFERENCE, musicVolume: 0.4 };
    const music = createMusicFollower(
      player,
      tracks,
      saved(false, preference),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
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
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.menu("main");
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
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.menu("main");
    music.follow(state("clash-of-banners", 1));
    calls.length = 0;
    music.setPreference({ ...DEFAULT_MUSIC_PREFERENCE, mode: "off" });
    expect(calls).toEqual([]);
  });

  it("previews a track at once over the director, and crossfades back when it ends", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.menu("main");
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

  it("plays a fixed override whatever the director says, and the director's level back on Auto (#425)", () => {
    const { player, calls } = recording();
    const override = createIntensityOverride();
    const music = createMusicFollower(player, tracks, saved(false), () => 0, override, NO_EDITS);
    music.follow(state("clash-of-banners", 1));
    calls.length = 0;
    override.set(3);
    music.follow(state("clash-of-banners", 2));
    music.follow(state("first-light", 0));
    // A new track starts at the fixed level: nothing to send.
    expect(music.intensity).toBe(0);
    override.set("auto");
    expect(calls).toEqual([
      ["setIntensity", 3],
      ["crossfadeTo", tracks[0]],
      ["setIntensity", 0],
    ]);
  });

  it("plays a track's edit wherever the track plays (#373)", () => {
    const { player, calls } = recording();
    const edited = { shippedHash: "a".repeat(64), source: "edited" };
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      {
        get: (trackId) => (trackId === "first-light" ? edited : undefined),
        remove: () => undefined,
      },
    );
    calls.length = 0;
    music.follow(state("first-light", 0));
    music.preview("clash-of-banners");
    music.preview(null);
    expect(calls).toEqual([
      ["crossfadeTo", { ...tracks[0], source: "edited" }],
      ["load", tracks[1]],
      ["crossfadeTo", { ...tracks[0], source: "edited" }],
    ]);
  });

  it("holds the track open in the beat editor over the director and a preview (#373)", () => {
    const { player, calls } = recording();
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    music.follow(state("first-light", 0));
    calls.length = 0;
    music.edit("first-light");
    music.follow(state("clash-of-banners", 0));
    music.preview("clash-of-banners");
    expect(calls).toEqual([]);
    expect(music.nowPlaying).toBe("first-light");
    music.edit(null);
    expect(calls).toEqual([["crossfadeTo", tracks[1]]]);
  });

  it("says what you hear: nothing under either mute, nothing for Off (#425)", () => {
    const { player } = recording();
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      NO_EDITS,
    );
    let changes = 0;
    const off = music.onChange(() => {
      changes += 1;
    });
    music.follow(state("first-light", 0));
    expect(music.nowPlaying).toBe("first-light");
    music.setMuted(true);
    expect(music.nowPlaying).toBeNull();
    music.setMuted(false);
    music.setPreference({ ...DEFAULT_MUSIC_PREFERENCE, musicMuted: true });
    expect(music.nowPlaying).toBeNull();
    music.setPreference(DEFAULT_MUSIC_PREFERENCE);
    music.follow(state(null, 0));
    expect(music.nowPlaying).toBeNull();
    expect(changes).toBe(6);
    off();
    music.follow(state("first-light", 0));
    expect(changes).toBe(6);
  });

  it("removes the playing track's edit when it stops the music, and says so once (#878)", () => {
    const { player, calls, tearDown } = recording();
    const edits = new Map([["first-light", { shippedHash: "a".repeat(64), source: "edited" }]]);
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      {
        get: (trackId) => edits.get(trackId),
        remove: (trackId) => {
          edits.delete(trackId);
        },
      },
    );
    const notices: string[] = [];
    music.onNotice((notice) => notices.push(notice));
    music.edit("first-light");
    tearDown("flooded");
    expect(edits.has("first-light")).toBe(false);
    expect(notices).toEqual(["Your edit of First Light stopped the music and was removed."]);

    // The next play of the track is the shipped one.
    calls.length = 0;
    music.edit(null);
    music.follow(state("first-light", 0));
    expect(calls).toEqual([["crossfadeTo", tracks[0]]]);
    tearDown("hung");
    expect(notices).toHaveLength(1);
  });

  it("removes nothing when a shipped track stops the music (#878)", () => {
    const { player, tearDown } = recording();
    const removed: string[] = [];
    const music = createMusicFollower(
      player,
      tracks,
      saved(false),
      () => 0,
      createIntensityOverride(),
      {
        get: () => undefined,
        remove: (trackId) => {
          removed.push(trackId);
        },
      },
    );
    const notices: string[] = [];
    music.onNotice((notice) => notices.push(notice));
    music.follow(state("first-light", 0));
    tearDown("hung");
    expect(removed).toEqual([]);
    expect(notices).toEqual([]);
    expect(music.nowPlaying).toBe("first-light");
  });
});
