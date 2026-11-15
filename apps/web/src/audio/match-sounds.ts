import type { Vec2 } from "@vibewars/game-core";
import type { ConnectionState, MatchConnection, MatchSnapshot } from "@vibewars/game-session";

import {
  castVoices,
  instantCastVoice,
  soundsForCombat,
  soundsForSkillGround,
  soundsForSnapshot,
  soundsForWorld,
} from "./combat-sounds.js";
import type { CastListener, CastVoice } from "./combat-sounds.js";
import type { SoundId } from "./sound-ids.js";
import type { SoundPlayer } from "./sound-player.js";
import type { WorldPlaces } from "./world-places.js";

/**
 * One match's sounds (#112): listens to `connection` and plays what
 * `combat-sounds.ts` says concerns this player. The match view and the
 * Training Ground both use it, since both run a `MatchConnection`.
 */
export interface MatchSounds {
  /**
   * Feed every snapshot the view draws; cast starts are found by diffing
   * them. A watcher passes `camera`, where it looks from: casts are heard
   * from there (#3298).
   */
  snapshot(next: MatchSnapshot, camera?: Vec2): void;
  /**
   * `onConnectionChange` takes one handler, which the caller owns, so it
   * passes the state on. While reconnecting nothing is diffed, and the
   * first snapshot back is a fresh start, so casts that ran through the
   * drop are not replayed.
   */
  connectionChanged(state: ConnectionState): void;
  /** A connection cannot unsubscribe, so this silences its handlers instead. */
  dispose(): void;
}

/** What the sounds listen to: a seat, or a watcher (#480), which has no cast to be refused. */
export type MatchSoundSource = Pick<MatchConnection, "selfSessionId" | "onCombat"> &
  Partial<Pick<MatchConnection, "onCastRefused">>;

export function attachMatchSounds(
  connection: MatchSoundSource,
  player: SoundPlayer,
  places: WorldPlaces,
): MatchSounds {
  let prev: MatchSnapshot | undefined;
  let camera: Vec2 | undefined;
  let online = true;
  let disposed = false;

  const playAll = (ids: readonly SoundId[]): void => {
    if (disposed) {
      return;
    }
    for (const id of ids) {
      player.play(id);
    }
  };
  const castAll = (voices: readonly CastVoice[]): void => {
    if (disposed) {
      return;
    }
    for (const voice of voices) {
      player.playCast(voice);
    }
  };
  const listener = (): CastListener => ({ selfId: connection.selfSessionId, at: camera });

  connection.onCombat((message) => {
    playAll(soundsForCombat(message, connection.selfSessionId, prev));
    const instant = instantCastVoice(message, prev, listener());
    castAll(instant === undefined ? [] : [instant]);
  });
  connection.onCastRefused?.(() => {
    playAll(["refused"]);
  });

  return {
    snapshot(next, at) {
      if (!online) {
        return;
      }
      camera = at;
      castAll(castVoices(prev, next, listener()));
      playAll(soundsForSnapshot(prev, next));
      playAll(soundsForWorld(prev, next, connection.selfSessionId, places));
      playAll(soundsForSkillGround(prev, next, connection.selfSessionId));
      prev = next;
    },
    connectionChanged(state) {
      online = state === "online";
      prev = undefined;
    },
    dispose() {
      disposed = true;
    },
  };
}
