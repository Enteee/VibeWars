import type { Intensity } from "../music/director.js";
import {
  intensityOverride,
  type IntensityOverride,
  type IntensityOverrideStore,
} from "../music/intensity-override.js";
import type { Mood } from "../music/mood.js";
import { music, type MusicFollower } from "../music/play-music.js";
import { TRACKS } from "../music/tracks/index.js";
import { button, h } from "./kit.js";

/**
 * The Music block (#425), under the sound controls in Options → Sound and
 * the HUD's ♪ popover: what is playing, and the intensity, `Auto` or a
 * level you fix for this session. The track choice stays the jukebox's.
 *
 * `MusicSettings` holds the rules and needs no DOM, so they are tested in
 * Node; `mountMusicControls` only draws it.
 */

export interface MusicControlsDeps {
  readonly override: IntensityOverrideStore;
  readonly music: Pick<MusicFollower, "intensity" | "nowPlaying" | "onChange">;
  readonly tracks: readonly {
    readonly id: string;
    readonly title: string;
    readonly moods: readonly Mood[];
  }[];
}

/** The page's override, music and tracks. */
export function musicControlsDeps(): MusicControlsDeps {
  return { override: intensityOverride, music: music(), tracks: TRACKS };
}

/** The control's choices, in the order it shows them. */
export const INTENSITY_CHOICES: readonly IntensityOverride[] = ["auto", 0, 1, 2, 3];

/** What the block shows. */
export interface MusicBlockState {
  /** "Hall of Champions (action)", or "Nothing playing". */
  readonly nowPlaying: string;
  readonly override: IntensityOverride;
  /** The level the director picked, which `Auto` shows beside it. */
  readonly directed: Intensity;
}

/** "Auto (2)" for Auto, the level itself otherwise. */
export function intensityChoiceLabel(choice: IntensityOverride, directed: Intensity): string {
  return choice === "auto" ? `Auto (${String(directed)})` : String(choice);
}

export class MusicSettings {
  readonly #deps: MusicControlsDeps;
  readonly #listeners = new Set<() => void>();
  readonly #off: (() => void)[];

  constructor(deps: MusicControlsDeps) {
    this.#deps = deps;
    const changed = (): void => {
      for (const listener of this.#listeners) {
        listener();
      }
    };
    this.#off = [deps.music.onChange(changed), deps.override.subscribe(changed)];
  }

  get state(): MusicBlockState {
    const playing = this.#deps.music.nowPlaying;
    const track = this.#deps.tracks.find((candidate) => candidate.id === playing);
    const mood = track?.moods[0];
    return {
      nowPlaying:
        track === undefined
          ? "Nothing playing"
          : mood === undefined
            ? track.title
            : `${track.title} (${mood})`,
      override: this.#deps.override.get(),
      directed: this.#deps.music.intensity,
    };
  }

  /** Session only (Q55): never saved. */
  setIntensity(choice: IntensityOverride): void {
    this.#deps.override.set(choice);
  }

  /** Called after every change: the track, the director's level, the override. */
  onChange(listener: () => void): void {
    this.#listeners.add(listener);
  }

  dispose(): void {
    for (const off of this.#off) {
      off();
    }
    this.#listeners.clear();
  }
}

/** Draw the Music block into `container`; returns the cleanup. */
export function mountMusicControls(container: HTMLElement, deps: MusicControlsDeps): () => void {
  const settings = new MusicSettings(deps);
  const block = h("div", "music-controls");
  container.appendChild(block);

  const playingField = h("div", "field music-now-playing");
  playingField.appendChild(h("span", "field-label", "now playing"));
  const title = h("span", "music-now-playing-title");
  title.setAttribute("aria-live", "polite");
  playingField.appendChild(title);

  const intensityField = h("div", "field music-intensity");
  const intensityLabel = h("span", "field-label", "intensity");
  const choices = h("div", "music-intensity-choices");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "intensity");
  const buttons = INTENSITY_CHOICES.map((choice) => {
    const choose = button("", "music-intensity-choice", () => {
      settings.setIntensity(choice);
    });
    choices.appendChild(choose);
    return { choice, choose };
  });
  intensityField.append(intensityLabel, choices);
  block.append(playingField, intensityField);

  const paint = (): void => {
    const state = settings.state;
    title.textContent = state.nowPlaying;
    for (const { choice, choose } of buttons) {
      choose.textContent = intensityChoiceLabel(choice, state.directed);
      choose.setAttribute("aria-pressed", String(choice === state.override));
    }
  };
  paint();
  settings.onChange(paint);

  return () => {
    settings.dispose();
    block.remove();
  };
}
