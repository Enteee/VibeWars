import { loadMuted } from "../audio/mute-preference.js";
import {
  loadMusicPreference,
  musicModeOf,
  type MusicPreference,
} from "../audio/music-preference.js";
import { VOLUME_RAMP_SECONDS } from "../audio/volume-ramp.js";
import { beatEdits, editStoppedNotice, type BeatEditStore } from "./beat-edits.js";
import { directMusic, type Intensity, type MusicMode, type MusicState } from "./director.js";
import { MENU_DEPTH, SPLASH_TRACK, type MenuScreen } from "./fixed-tracks.js";
import {
  intensityOverride,
  playedIntensity,
  type IntensityOverrideStore,
} from "./intensity-override.js";
import { measuringMusic, musicPlayer, type MusicPlayer, type MusicTrack } from "./music-player.js";
import type { LandOn, MusicLevel } from "./host-protocol.js";
import type { Mood } from "./mood.js";
import { STINGS, type StingId } from "./stings/index.js";
import { TRACKS } from "./tracks/index.js";

/**
 * What the player hears, from what the director decides (#371) and what
 * the player chose (#372): a new track crossfades in on the playing one's
 * next phrase boundary, a new intensity starts on the next cycle, and no
 * track means silence. A jukebox preview plays over all of that until it
 * ends, the track open in the beat editor over that (#373), and a fixed
 * intensity override (#425) over the director's level. A track the player
 * edited plays the edit, wherever it plays, until the edit stops the music
 * (#878): then it is removed, and the shipped track plays from then on.
 * A track shared in the lobby (#2745) plays over all of it, in a host of
 * its own, until the player goes back to their own music.
 */

type PlayableTrack = MusicTrack & {
  readonly title: string;
  readonly moods: readonly Mood[];
  readonly layers: number;
  /** Its scale, "D aeolian": the key a sting plays in over it (#2523). */
  readonly key: string;
};

/** A lobby member's shared track (#2745), as the follower plays it. */
export interface SharedPlay {
  readonly trackId: string;
  readonly source: string;
}

export interface MusicFollower {
  /**
   * Play what `state` says, changing only what differs from the last
   * state: a new track lands on the next phrase, or the next cycle (#2530).
   */
  follow(state: MusicState, landOn: LandOn): void;
  /** The menus' music, as deep as `screen` is (#1993); the song already playing goes on. */
  menu(screen: MenuScreen): void;
  /**
   * The splash screen's theme (#2884), under the same rules as any screen's
   * song. With a `startAtEpochMs`, its first beat lands there (#2936), and
   * `onHeard` says, once, when that really is. `false` when no theme will
   * be heard, and `onHeard` never runs.
   */
  splash(startAtEpochMs: number | null, onHeard: (heardAtEpochMs: number) => void): boolean;
  /**
   * Play `id` once over the music (#2523), in the key of the track
   * playing, an edit's or preview's too: none when none plays.
   */
  sting(id: StingId): void;
  /** The global mute, which mutes the music too. */
  setMuted(muted: boolean): void;
  /** The director's mode, as the player chose it. */
  mode(): MusicMode;
  readonly preference: MusicPreference;
  /** A new mode applies at once; a new volume or music mute ramps to it. */
  setPreference(preference: MusicPreference): void;
  /** Play `trackId` now, over what the director says; `null` goes back to it. */
  preview(trackId: string | null): void;
  /**
   * Hold `trackId` while the beat editor has it open, over a preview too,
   * so what it evaluates replaces that track; `null` lets go.
   */
  edit(trackId: string | null): void;
  /**
   * Play `source`, a lobby member's shared `trackId` (#2745), now, over
   * everything else, in a fresh host; `null` goes back to the player's
   * own music, in a fresh host too. Nothing of it is saved, and a share
   * that hangs or floods is only let go: no edit is removed for it.
   */
  playShared(share: SharedPlay | null): void;
  /** The shared track playing, or `null`. */
  readonly sharing: SharedPlay | null;
  /** The director's intensity, last it said, whatever the override plays. */
  readonly intensity: Intensity;
  /** The track you hear: `null` when nothing plays, or the music is muted. */
  readonly nowPlaying: string | null;
  /** Called after anything here may have changed; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
  /** Called with what to tell the player when an edit stopped the music and was removed (#878). */
  onNotice(listener: (notice: string) => void): void;
}

export function createMusicFollower(
  player: MusicPlayer,
  tracks: readonly PlayableTrack[],
  saved: { readonly muted: boolean; readonly preference: MusicPreference },
  now: () => number,
  override: IntensityOverrideStore,
  edits: Pick<BeatEditStore, "get" | "remove">,
): MusicFollower {
  let preference = saved.preference;
  let muted = saved.muted;
  /** What the player is playing, or was last told to. */
  let playingId: string | null = null;
  let previewId: string | null = null;
  let editId: string | null = null;
  let directed: string | null = null;
  let sharing: SharedPlay | null = null;
  /** The director's level, and the one the player was last told to play. */
  let intensity: Intensity = 0;
  let played: Intensity = 0;
  const listeners = new Set<() => void>();
  const noticeListeners: ((notice: string) => void)[] = [];
  const changed = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  /** The menu the player is on, to redirect when the mode changes. */
  let onScreen: MenuScreen | null = null;

  // A hung or flooding edit would do it again on every load: it goes.
  // A shipped track that did it is the next play's to try again.
  player.onTornDown(() => {
    if (sharing !== null) {
      sharing = null;
      playingId = null;
      changed();
      return;
    }
    const track = tracks.find((candidate) => candidate.id === playingId);
    if (track === undefined || edits.get(track.id) === undefined) {
      return;
    }
    edits.remove(track.id);
    playingId = null;
    for (const listener of noticeListeners) {
      listener(editStoppedNotice(track.title));
    }
    changed();
  });

  const volume = (): number => (muted || preference.musicMuted ? 0 : preference.musicVolume);
  player.setVolume(volume(), 0);

  /**
   * Play the edited track, the preview, or else the director's: at once,
   * or on the next phrase, or the next cycle when a match starts (#2530).
   */
  const play = (
    when: "now" | "on-phrase" | "on-cycle",
    startAtEpochMs: number | null = null,
  ): void => {
    if (sharing !== null) {
      return;
    }
    const wanted = editId ?? previewId ?? directed;
    if (wanted === playingId) {
      return;
    }
    playingId = wanted;
    const track = tracks.find((candidate) => candidate.id === wanted);
    if (track === undefined) {
      player.stop();
      return;
    }
    const edited = edits.get(track.id);
    const heard = edited === undefined ? track : { ...track, source: edited.source };
    if (when === "now") {
      player.load(heard, startAtEpochMs);
    } else {
      player.crossfadeTo(heard, when === "on-cycle" ? "cycle" : "phrase");
    }
  };

  /** The override's level, or the director's; sent only when it differs. */
  const playIntensity = (): void => {
    const next = playedIntensity(override.get(), intensity);
    if (next !== played) {
      played = next;
      player.setIntensity(played);
    }
  };
  // A new level starts on the next cycle, as the director's does.
  override.subscribe(() => {
    playIntensity();
    changed();
  });

  /** Out of a share, its host with it: what the player plays next loads in a fresh one. */
  const endShare = (): void => {
    if (sharing !== null) {
      sharing = null;
      player.renew();
      playingId = null;
    }
  };

  const follow = (state: MusicState, landOn: LandOn): void => {
    directed = state.trackId;
    play(landOn === "cycle" ? "on-cycle" : "on-phrase");
    intensity = state.intensity;
    playIntensity();
    changed();
  };

  const mode = (): MusicMode => musicModeOf(preference);

  /** Told once when the timed theme is heard. */
  let splashHeard: ((heardAtEpochMs: number) => void) | undefined;
  player.onNowPlaying((trackId, heardAtEpochMs) => {
    if (trackId === SPLASH_TRACK) {
      splashHeard?.(heardAtEpochMs);
      splashHeard = undefined;
    }
  });

  const splash = (
    startAtEpochMs: number | null,
    onHeard: (heardAtEpochMs: number) => void,
  ): boolean => {
    const state = directMusic(
      {
        screen: "splash",
        menuDepth: null,
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
    );
    const timed =
      startAtEpochMs !== null &&
      sharing === null &&
      volume() > 0 &&
      state.trackId === SPLASH_TRACK &&
      tracks.some((track) => track.id === SPLASH_TRACK);
    if (!timed) {
      follow(state, "phrase");
      return false;
    }
    directed = state.trackId;
    splashHeard = onHeard;
    // Timed even if it is already loaded.
    playingId = null;
    play("now", startAtEpochMs);
    intensity = state.intensity;
    playIntensity();
    changed();
    return true;
  };

  const menu = (name: MenuScreen): void => {
    follow(
      directMusic(
        {
          screen: "menu",
          menuDepth: MENU_DEPTH[name],
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
      "phrase",
    );
    // After `follow`, which a fight's music calls without a screen.
    onScreen = name;
  };

  return {
    follow(state, landOn) {
      onScreen = null;
      follow(state, landOn);
    },
    menu,
    splash,
    sting(id) {
      const track = tracks.find((candidate) => candidate.id === playingId);
      if (track !== undefined) {
        player.sting({ ...STINGS[id], key: track.key });
      }
    },
    setMuted(next) {
      muted = next;
      player.setVolume(volume(), VOLUME_RAMP_SECONDS);
      changed();
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
      // A fight's music asks for the mode on its next snapshot; a menu,
      // without one, is asked again here.
      if (onScreen !== null) {
        menu(onScreen);
      }
      changed();
    },
    preview(trackId) {
      if (trackId !== null) {
        endShare();
      }
      previewId = tracks.some((track) => track.id === trackId) ? trackId : null;
      play(previewId === null ? "on-phrase" : "now");
      changed();
    },
    edit(trackId) {
      if (trackId !== null) {
        endShare();
      }
      editId = tracks.some((track) => track.id === trackId) ? trackId : null;
      play(editId === null ? "on-phrase" : "now");
      changed();
    },
    playShared(share) {
      const track =
        share === null ? undefined : tracks.find((candidate) => candidate.id === share.trackId);
      if (share !== null && track === undefined) {
        return;
      }
      if (share === null && sharing === null) {
        return;
      }
      // Never asked to stop: the old host goes, and what it ran with it.
      player.renew();
      playingId = null;
      sharing = null;
      if (share !== null && track !== undefined) {
        sharing = { trackId: share.trackId, source: share.source };
        playingId = track.id;
        player.load({ ...track, source: share.source }, null);
      } else {
        play("now");
      }
      changed();
    },
    get sharing() {
      return sharing;
    },
    get intensity() {
      return intensity;
    },
    get nowPlaying() {
      return muted || preference.musicMuted ? null : playingId;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onNotice(listener) {
      noticeListeners.push(listener);
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
      intensityOverride,
      beatEdits,
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
              player.crossfadeTo(track, "phrase");
            }
          },
          // Re-evaluate a track's own source, as the beat editor would (#509).
          evaluate: (trackId: string) => {
            const track = TRACKS.find((candidate) => candidate.id === trackId);
            if (track !== undefined) {
              player.evaluate(track.source);
            }
          },
        },
      });
    }
  }
  return shared;
}
