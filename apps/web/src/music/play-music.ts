import { loadMuted } from "../audio/mute-preference.js";
import { directMusic, type MusicMode, type MusicState } from "./director.js";
import { measuringMusic, musicPlayer, type MusicPlayer, type MusicTrack } from "./music-player.js";
import type { MusicLevel } from "./host-protocol.js";
import type { Mood } from "./mood.js";
import { TRACKS } from "./tracks/index.js";

/**
 * What the player hears, from what the director decides (#371): a new
 * track crossfades in on the playing one's next phrase boundary, a new
 * intensity starts on the next cycle, and no track means silence.
 */

/** Until #372 adds preferences. */
export const MUSIC_MODE: MusicMode = { kind: "auto" };

/** How long the music takes to fade when it is muted or unmuted. */
export const MUTE_RAMP_SECONDS = 0.3;

type PlayableTrack = MusicTrack & { readonly moods: readonly Mood[] };

export interface MusicFollower {
  /** Play what `state` says, changing only what differs from the last state. */
  follow(state: MusicState): void;
  /** The music of a screen with no fight on it. */
  screen(screen: "menu" | "lobby"): void;
  /** The global mute, which mutes the music too. */
  setMuted(muted: boolean): void;
}

export function createMusicFollower(
  player: MusicPlayer,
  tracks: readonly PlayableTrack[],
  muted: boolean,
  now: () => number,
): MusicFollower {
  let trackId: string | null = null;
  let intensity: MusicState["intensity"] = 0;
  player.setVolume(muted ? 0 : 1, 0);

  const follow = (state: MusicState): void => {
    if (state.trackId !== trackId) {
      trackId = state.trackId;
      const track = tracks.find((candidate) => candidate.id === trackId);
      if (track === undefined) {
        player.stop();
      } else {
        player.crossfadeTo(track);
      }
    }
    if (state.intensity !== intensity) {
      intensity = state.intensity;
      player.setIntensity(intensity);
    }
  };

  return {
    follow,
    screen(screen) {
      follow(
        directMusic(
          {
            screen,
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
          MUSIC_MODE,
          tracks,
        ),
      );
    },
    setMuted(next) {
      player.setVolume(next ? 0 : 1, MUTE_RAMP_SECONDS);
    },
  };
}

let shared: MusicFollower | undefined;

/** The page's music. */
export function music(): MusicFollower {
  if (shared === undefined) {
    const player = musicPlayer();
    shared = createMusicFollower(player, TRACKS, loadMuted(), () => Date.now());
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
