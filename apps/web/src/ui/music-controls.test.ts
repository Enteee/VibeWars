import { describe, expect, it } from "vitest";

import type { Intensity } from "../music/director.js";
import { createIntensityOverride } from "../music/intensity-override.js";
import {
  INTENSITY_CHOICES,
  MusicSettings,
  intensityChoiceLabel,
  type MusicControlsDeps,
} from "./music-controls.js";

/** Music whose track and director level a test moves, telling listeners as the follower does. */
function fakes() {
  let nowPlaying: string | null = "hall-of-champions";
  let intensity: Intensity = 0;
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const override = createIntensityOverride();
  const deps: MusicControlsDeps = {
    override,
    music: {
      get nowPlaying() {
        return nowPlaying;
      },
      get intensity() {
        return intensity;
      },
      onChange: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    tracks: [
      { id: "hall-of-champions", title: "Hall of Champions", moods: ["triumphant", "action"] },
      { id: "first-light", title: "First Light", moods: ["atmospheric"] },
    ],
  };
  return {
    deps,
    override,
    listeners,
    play: (trackId: string | null): void => {
      nowPlaying = trackId;
      changed();
    },
    direct: (level: Intensity): void => {
      intensity = level;
      changed();
    },
  };
}

describe("the Music block (#425)", () => {
  it("names the playing track with its primary mood, live, and nothing when silent", () => {
    const { deps, play } = fakes();
    const settings = new MusicSettings(deps);
    let paints = 0;
    settings.onChange(() => {
      paints += 1;
    });
    expect(settings.state.nowPlaying).toBe("Hall of Champions (triumphant)");
    play("first-light");
    expect(settings.state.nowPlaying).toBe("First Light (atmospheric)");
    play(null);
    expect(settings.state.nowPlaying).toBe("Nothing playing");
    expect(paints).toBe(2);
  });

  it("shows Auto with the director's live level", () => {
    const { deps, direct } = fakes();
    const settings = new MusicSettings(deps);
    direct(2);
    expect(settings.state).toMatchObject({ override: "auto", directed: 2 });
    expect(INTENSITY_CHOICES.map((choice) => intensityChoiceLabel(choice, 2))).toEqual([
      "Auto (2)",
      "0",
      "1",
      "2",
      "3",
    ]);
  });

  it("sets the override, and hears one set elsewhere, such as the other place it shows", () => {
    const { deps, override } = fakes();
    const settings = new MusicSettings(deps);
    let paints = 0;
    settings.onChange(() => {
      paints += 1;
    });
    settings.setIntensity(3);
    expect(override.get()).toBe(3);
    override.set("auto");
    expect(settings.state.override).toBe("auto");
    expect(paints).toBe(2);
  });

  it("stops listening when disposed", () => {
    const { deps, listeners, override } = fakes();
    const settings = new MusicSettings(deps);
    let paints = 0;
    settings.onChange(() => {
      paints += 1;
    });
    settings.dispose();
    override.set(1);
    expect(listeners.size).toBe(0);
    expect(paints).toBe(0);
  });
});
