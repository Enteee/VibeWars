import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MUSIC_PREFERENCE,
  loadMusicPreference,
  musicModeOf,
  parseMusicPreference,
  saveMusicPreference,
  type MusicPreference,
} from "./music-preference.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

const pinned: MusicPreference = {
  mode: "pinned",
  pinnedTrackId: "ember-deep",
  musicVolume: 0.25,
  musicMuted: true,
};

describe("the music preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is Auto at 0.6 until the player changes it, and survives a reload once they do", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadMusicPreference()).toEqual({
      mode: "auto",
      pinnedTrackId: null,
      musicVolume: 0.6,
      musicMuted: false,
    });
    saveMusicPreference(pinned);
    expect(loadMusicPreference()).toEqual(pinned);
  });

  it("round-trips every mode", () => {
    for (const mode of ["auto", "shuffle", "pinned", "off"] as const) {
      const preference = { ...pinned, mode };
      expect(parseMusicPreference(JSON.stringify(preference))).toEqual(preference);
    }
  });

  it.each([
    ["bad JSON", "{"],
    ["not an object", "3"],
    ["null", "null"],
    ["an unknown mode", JSON.stringify({ ...pinned, mode: "loud" })],
    ["a volume above 1", JSON.stringify({ ...pinned, musicVolume: 1.5 })],
    ["a volume below 0", JSON.stringify({ ...pinned, musicVolume: -0.1 })],
    ["a volume that is not a number", JSON.stringify({ ...pinned, musicVolume: "0.5" })],
    ["pinned without an id", JSON.stringify({ ...pinned, pinnedTrackId: null })],
    ["an empty pinned id", JSON.stringify({ ...pinned, pinnedTrackId: "" })],
    ["a mute that is not a boolean", JSON.stringify({ ...pinned, musicMuted: "true" })],
    ["a missing field", JSON.stringify({ mode: "auto", pinnedTrackId: null, musicVolume: 0.6 })],
  ])("is the defaults for %s", (_, text) => {
    expect(parseMusicPreference(text)).toEqual(DEFAULT_MUSIC_PREFERENCE);
  });

  it("means the defaults when storage cannot be read, and never throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("private browsing");
      },
      setItem: () => {
        throw new Error("private browsing");
      },
    });
    expect(loadMusicPreference()).toEqual(DEFAULT_MUSIC_PREFERENCE);
    expect(() => {
      saveMusicPreference(pinned);
    }).not.toThrow();
  });

  it("is the director's mode", () => {
    expect(musicModeOf(pinned)).toEqual({ kind: "pinned", trackId: "ember-deep" });
    expect(musicModeOf({ ...pinned, mode: "shuffle" })).toEqual({ kind: "shuffle" });
    expect(musicModeOf(DEFAULT_MUSIC_PREFERENCE)).toEqual({ kind: "auto" });
  });
});
