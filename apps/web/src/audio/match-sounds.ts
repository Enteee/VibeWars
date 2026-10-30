import type { MatchConnection, MatchSnapshot } from "@vibewars/game-session";

import { soundsForCombat, soundsForSnapshot } from "./combat-sounds.js";
import type { SoundId } from "./sound-ids.js";
import type { SoundPlayer } from "./sound-player.js";

/**
 * One match's sounds (#112): listens to `connection` and plays what
 * `combat-sounds.ts` says concerns this player. The match view and the
 * Training Ground both use it, since both run a `MatchConnection`.
 */
export interface MatchSounds {
  /** Feed every snapshot the view draws; cast starts are found by diffing them. */
  snapshot(next: MatchSnapshot): void;
  /**
   * `onConnectionChange` takes one handler, which the caller owns, so it
   * passes the state on. While reconnecting nothing is diffed, and the
   * first snapshot back is a fresh start, so casts that ran through the
   * drop are not replayed.
   */
  connectionChanged(state: "online" | "reconnecting" | "lost"): void;
  /** A connection cannot unsubscribe, so this silences its handlers instead. */
  dispose(): void;
}

/** What the sounds listen to: a seat, or a watcher (#480), which has no cast to be refused. */
export type MatchSoundSource = Pick<MatchConnection, "selfSessionId" | "onCombat"> &
  Partial<Pick<MatchConnection, "onCastRefused">>;

export function attachMatchSounds(connection: MatchSoundSource, player: SoundPlayer): MatchSounds {
  let prev: MatchSnapshot | undefined;
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

  connection.onCombat((message) => {
    playAll(soundsForCombat(message, connection.selfSessionId));
  });
  connection.onCastRefused?.(() => {
    playAll(["refused"]);
  });

  return {
    snapshot(next) {
      if (!online) {
        return;
      }
      playAll(soundsForSnapshot(prev, next));
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
