import { describe, expect, it } from "vitest";

import { nowPlayingText } from "./now-playing.js";

const tracks = [{ id: "first-light", title: "First Light" }];

describe("nowPlayingText", () => {
  it("names the track out of a fight", () => {
    expect(nowPlayingText("first-light", tracks, 0)).toBe("♪ First Light");
    expect(nowPlayingText("first-light", tracks, 1)).toBe("♪ First Light");
  });

  it("says nothing at intensity 2 or more, or for a track it does not know", () => {
    expect(nowPlayingText("first-light", tracks, 2)).toBeNull();
    expect(nowPlayingText("first-light", tracks, 3)).toBeNull();
    expect(nowPlayingText("no-such-track", tracks, 0)).toBeNull();
  });
});
