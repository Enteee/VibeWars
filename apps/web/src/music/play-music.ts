import { loadMuted } from "../audio/mute-preference.js";
import {
  loadMusicPreference,
  musicModeOf,
  type MusicPreference,
} from "../audio/music-preference.js";
import { VOLUME_RAMP_SECONDS } from "../audio/volume-ramp.js";
import { directMusic, type Intensity, type MusicMode, type MusicState } from "./director.js";
import { measuringMusic, musicPlayer, type MusicPlayer, type MusicTrack } from "./music-player.js";
import type { MusicLevel } from "./host-protocol.js";
import type { Mood } from "./mood.js";
import { TRACKS } from "./tracks/index.js";

/**
 * What the player hears, from what the director decides (#371) and what
 * the player chose (#372): a new track crossfades in on the playing one's
 * next phrase boundary, a new intensity starts on the next cycle, and no
 * track means silence. A jukebox preview plays over all of that until it
 * ends.
 */

type PlayableTrack = MusicTrack & { readonly moods: readonly Mood[] };

export interface MusicFollower {
  /** Play what `state` says, changing only what differs from the last state. */
  follow(state: MusicState): void;
  /** The music of a screen with no fight on it. */
  screen(screen: "menu" | "lobby"): void;
  /** The global mute, which mutes the music too. */
  setMuted(muted: boolean): void;
  /** The director's mode, as the player chose it. */
  mode(): MusicMode;
  readonly preference: MusicPreference;
  /** A new mode applies at once; a new volume or music mute ramps to it. */
  setPreference(preference: MusicPreference): void;
  /** Play `trackId` now, over what the director says; `null` goes back to it. */
  preview(trackId: string | null): void;
  /** The director's intensity, last it said. */
  readonly intensity: Intensity;
}

export function createMusicFollower(
  player: MusicPlayer,
  tracks: readonly PlayableTrack[],
  saved: { readonly muted: boolean; readonly preference: MusicPreference },
  now: () => number,
): MusicFollower {
  let preference = saved.preference;
  let muted = saved.muted;
  /** What the player is playing, or was last told to. */
  let playingId: string | null = null;
  let previewId: string | null = null;
  let directed: string | null = null;
  let intensity: Intensity = 0;
  /** The screen with no fight on it the player is on, to redirect when the mode changes. */
  let onScreen: "menu" | "lobby" | null = null;

  const volume = (): number => (muted || preference.musicMuted ? 0 : preference.musicVolume);
  player.setVolume(volume(), 0);

  /** Play the preview, or else the director's track: at once, or on the next phrase. */
  const play = (when: "now" | "on-phrase"): void => {
    const wanted = previewId ?? directed;
    if (wanted === playingId) {
      return;
    }
    playingId = wanted;
    const track = tracks.find((candidate) => candidate.id === wanted);
    if (track === undefined) {
      player.stop();
    } else if (when === "now") {
      player.load(track);
    } else {
      player.crossfadeTo(track);
    }
  };

  const follow = (state: MusicState): void => {
    directed = state.trackId;
    play("on-phrase");
    if (state.intensity !== intensity) {
      intensity = state.intensity;
      player.setIntensity(intensity);
    }
  };

  const mode = (): MusicMode => musicModeOf(preference);

  const screen = (name: "menu" | "lobby"): void => {
    follow(
      directMusic(
        {
          screen: name,
          mapId: null,
          matchSeed: null,
          result: null,
          self: null,
          hitsDealtLast5s: 0,
          hitsTakenLast5s: 0,
          enemyInRange: false,
          lowestAllyHealthFraction: null,
          aliveAllies: null,
          aliveEnemies: null,
          teamSize: null,
          nowMs: now(),
        },
        null,
        mode(),
        tracks,
      ),
    );
    // After `follow`, which a fight's music calls without a screen.
    onScreen = name;
  };

  return {
    follow(state) {
      onScreen = null;
      follow(state);
    },
    screen,
    setMuted(next) {
      muted = next;
      player.setVolume(volume(), VOLUME_RAMP_SECONDS);
    },
    mode,
    get preference() {
      return preference;
    },
    setPreference(next) {
      const before = volume();
      preference = next;
      if (volume() !== before) {
        player.setVolume(volume(), VOLUME_RAMP_SECONDS);
      }
      // A fight's music asks for the mode on its next snapshot; a screen
      // without one is asked again here.
      if (onScreen !== null) {
        screen(onScreen);
      }
    },
    preview(trackId) {
      previewId = tracks.some((track) => track.id === trackId) ? trackId : null;
      play(previewId === null ? "on-phrase" : "now");
    },
    get intensity() {
      return intensity;
    },
  };
}

let shared: MusicFollower | undefined;

/** The page's music. */
export function music(): MusicFollower {
  if (shared === undefined) {
    const player = musicPlayer();
    shared = createMusicFollower(
      player,
      TRACKS,
      { muted: loadMuted(), preference: loadMusicPreference() },
      () => Date.now(),
    );
    if (measuringMusic(location.search)) {
      // For scripts/music-stress.mjs: force the load it measures (#420).
      Object.assign(window, {
        __music: {
          intensity: (level: MusicLevel) => {
            player.setIntensity(level);
          },
          crossfadeTo: (trackId: string) => {
            const track = TRACKS.find((candidate) => candidate.id === trackId);
            if (track !== undefined) {
              player.crossfadeTo(track);
            }
          },
        },
      });
    }
  }
  return shared;
}
