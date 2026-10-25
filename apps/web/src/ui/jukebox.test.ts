import { describe, expect, it } from "vitest";

import { DEFAULT_MUSIC_PREFERENCE } from "../audio/music-preference.js";
import { chooseMode, jukeboxRows, pinTrack } from "./jukebox.js";

const tracks = [
  {
    id: "first-light",
    title: "First Light",
    moods: ["atmospheric", "mysterious"] as const,
    bpm: 84,
  },
  { id: "last-stand", title: "Last Stand", moods: ["epic"] as const, bpm: 140 },
];

describe("the jukebox", () => {
  it("lists every track with its moods and tempo, marking the pinned and the previewed", () => {
    const rows = jukeboxRows(
      tracks,
      pinTrack(DEFAULT_MUSIC_PREFERENCE, "last-stand"),
      "first-light",
    );
    expect(rows).toEqual([
      {
        id: "first-light",
        title: "First Light",
        moods: "atmospheric, mysterious",
        bpm: "84 bpm",
        pinned: false,
        previewing: true,
      },
      {
        id: "last-stand",
        title: "Last Stand",
        moods: "epic",
        bpm: "140 bpm",
        pinned: true,
        previewing: false,
      },
    ]);
  });

  it("pins a track by playing it from now on", () => {
    expect(pinTrack({ ...DEFAULT_MUSIC_PREFERENCE, mode: "off" }, "last-stand")).toEqual({
      ...DEFAULT_MUSIC_PREFERENCE,
      mode: "pinned",
      pinnedTrackId: "last-stand",
    });
  });

  it("refuses Pinned until a track is pinned, and keeps the pin under other modes", () => {
    expect(chooseMode(DEFAULT_MUSIC_PREFERENCE, "pinned")).toBe(DEFAULT_MUSIC_PREFERENCE);
    const pinned = pinTrack(DEFAULT_MUSIC_PREFERENCE, "last-stand");
    const shuffle = chooseMode(pinned, "shuffle");
    expect(shuffle).toEqual({ ...pinned, mode: "shuffle" });
    expect(chooseMode(shuffle, "pinned")).toEqual(pinned);
  });
});
