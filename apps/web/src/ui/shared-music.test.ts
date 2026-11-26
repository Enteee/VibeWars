import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MusicFollower } from "../music/play-music.js";
import { createSharedTracks } from "../music/shared-tracks.js";
import type { Track } from "../music/tracks/index.js";
import { FakeElement } from "./fake-dom.test-support.js";
import { sharedMusicSection } from "./shared-music.js";

describe("a shared track's sharer (#2820)", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    vi.stubGlobal("HTMLImageElement", FakeElement);
    vi.stubGlobal("HTMLButtonElement", FakeElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the sharer's signet beside the row's words; none without one", () => {
    const shared = createSharedTracks();
    const share = { trackId: "ruins", source: "s('bd')" };
    shared.add({ from: "a", name: "Ann", signet: 5, ...share });
    shared.add({ from: "b", name: "Bo", signet: undefined, ...share });
    const player = { sharing: null, onChange: () => () => undefined } as unknown as MusicFollower;
    const tracks = [{ id: "ruins", title: "Ruins" }] as unknown as readonly Track[];
    const { element } = sharedMusicSection(player, shared, tracks, false);
    const section = element as unknown as FakeElement;
    expect(section.all("jukebox-shared-text").map((text) => text.textContent)).toEqual([
      "Ann · Ruins",
      "Bo · Ruins",
    ]);
    expect(section.all("signet").map((signet) => signet.hidden)).toEqual([false, true]);
  });
});
