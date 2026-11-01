import { LONG_BOW_RANGE } from "@vibewars/game-core";
import type { MatchConnection, MatchSnapshot } from "@vibewars/game-session";

import { hitsForCombat } from "../audio/combat-sounds.js";
import {
  HIT_WINDOW_MS,
  directMusic,
  type MusicInput,
  type MusicMode,
  type MusicState,
  type TrackChoice,
} from "./director.js";

/** Within this, an enemy has you engaged: the longest any weapon reaches. */
export const ENGAGE_RANGE = LONG_BOW_RANGE;

/** The director is asked at most this often; snapshots come every frame. */
export const DIRECT_INTERVAL_MS = 250;

/**
 * One match's music (#370): listens to `connection`, asks the director
 * what should play, and hands on only what changed. The sibling of
 * `attachMatchSounds`, with the same shape and the same callers.
 */
export interface MatchMusic {
  /** Feed every snapshot the view draws. */
  snapshot(next: MatchSnapshot): void;
  /** While the connection is down the music holds where it was. */
  connectionChanged(state: "online" | "reconnecting" | "lost"): void;
  /** A connection cannot unsubscribe, so this silences its handlers instead. */
  dispose(): void;
}

export interface MatchMusicOptions {
  readonly screen: "training" | "match";
  /** Training only: the depth of the editor it sits in (#2020); a match passes `null`. */
  readonly menuDepth: 0 | 1 | null;
  /** Asked on every snapshot, so a mode the player changes mid-match applies at once. */
  readonly mode: () => MusicMode;
  readonly tracks: readonly TrackChoice[];
  /** Called with each new state: a new track, intensity or context. */
  readonly onChange: (state: MusicState) => void;
  /** Epoch milliseconds; a test passes its own. */
  readonly now?: () => number;
}

/** What the director reads from one snapshot, besides the hits and the clock. */
function fromSnapshot(
  snapshot: MatchSnapshot,
  screen: MatchMusicOptions["screen"],
  teamSize: number | null,
): Omit<
  MusicInput,
  "mapId" | "matchSeed" | "menuDepth" | "hitsDealtLast5s" | "hitsTakenLast5s" | "nowMs"
> {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const finished = snapshot.phase === "finished";
  const result =
    !finished || self === undefined || snapshot.winningTeam === undefined
      ? null
      : snapshot.winningTeam === self.team
        ? "victory"
        : "defeat";
  if (self === undefined) {
    return {
      screen: finished && screen === "match" ? "result" : screen,
      result,
      self: null,
      enemyInRange: false,
      lowestAllyHealthFraction: null,
      aliveAllies: null,
      aliveEnemies: null,
      teamSize,
    };
  }
  const fraction = (health: number, maxHealth: number): number =>
    maxHealth > 0 ? health / maxHealth : 0;
  // Creatures (#1052) are neither side's strength nor its losses.
  const living = snapshot.players.filter((p) => !p.dead && p.creature === undefined);
  const allies = living.filter((p) => p.team === self.team);
  const enemies = living.filter((p) => p.team !== self.team);
  const others = allies.filter((p) => p.sessionId !== self.sessionId);
  return {
    screen: finished && screen === "match" ? "result" : screen,
    result,
    self: { alive: !self.dead, healthFraction: fraction(self.health, self.maxHealth) },
    enemyInRange:
      !self.dead && enemies.some((p) => Math.hypot(p.x - self.x, p.y - self.y) <= ENGAGE_RANGE),
    lowestAllyHealthFraction:
      others.length === 0 ? null : Math.min(...others.map((p) => fraction(p.health, p.maxHealth))),
    aliveAllies: allies.length,
    aliveEnemies: enemies.length,
    teamSize,
  };
}

function sameMusic(a: MusicState, b: MusicState): boolean {
  return a.trackId === b.trackId && a.intensity === b.intensity && a.context === b.context;
}

export function attachMatchMusic(
  /** A seat, or a watcher's match (#480). */
  connection: Pick<MatchConnection, "map" | "selfSessionId" | "onCombat">,
  { screen, menuDepth, mode, tracks, onChange, now = Date.now }: MatchMusicOptions,
): MatchMusic {
  const mapId = connection.map.id;
  // The Training Ground is a menu (#2020): Shuffle seeds it as one, by context.
  const matchSeed = screen === "training" ? null : `${mapId}:${String(now())}`;
  /** When each hit this player dealt or took landed, oldest first. */
  const dealt: number[] = [];
  const taken: number[] = [];
  let teamSize: number | null = null;
  let state: MusicState | null = null;
  let lastAsked = Number.NEGATIVE_INFINITY;
  let online = true;
  let disposed = false;

  connection.onCombat((message) => {
    if (disposed || !online) {
      return;
    }
    const at = now();
    for (const hit of hitsForCombat(message, connection.selfSessionId)) {
      (hit === "dealt" ? dealt : taken).push(at);
    }
  });

  /** How many of `times` are inside the window, after dropping the rest. */
  const recent = (times: number[], at: number): number => {
    while (times[0] !== undefined && times[0] <= at - HIT_WINDOW_MS) {
      times.shift();
    }
    return times.length;
  };

  return {
    snapshot(next) {
      const at = now();
      if (disposed || !online || at - lastAsked < DIRECT_INTERVAL_MS) {
        return;
      }
      lastAsked = at;
      // Players join a running match one by one, so the first snapshot
      // may hold only some of the side: the largest count seen is the size.
      const self = next.players.find((p) => p.sessionId === next.selfSessionId);
      if (self !== undefined) {
        const side = next.players.filter(
          (p) => p.team === self.team && p.creature === undefined,
        ).length;
        teamSize = Math.max(teamSize ?? 0, side);
      }
      const input: MusicInput = {
        ...fromSnapshot(next, screen, teamSize),
        mapId,
        matchSeed,
        menuDepth,
        hitsDealtLast5s: recent(dealt, at),
        hitsTakenLast5s: recent(taken, at),
        nowMs: at,
      };
      const prev = state;
      state = directMusic(input, prev, mode(), tracks);
      if (prev === null || !sameMusic(prev, state)) {
        onChange(state);
      }
    },
    connectionChanged(next) {
      online = next === "online";
    },
    dispose() {
      disposed = true;
    },
  };
}
