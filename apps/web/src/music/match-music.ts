import { LONG_BOW_RANGE, type CombatEvent } from "@vibewars/game-core";
import type { MatchConnection, MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";

import { hitsForCombat } from "../audio/combat-sounds.js";
import {
  HIT_WINDOW_MS,
  directMusic,
  type MusicInput,
  type MusicMode,
  type MusicState,
  type TrackChoice,
} from "./director.js";
import type { StingId } from "./stings/ids.js";

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
  /**
   * Called with a sting to play over the music (#2523), after any new
   * state it lands on. Never in the Training Ground.
   */
  readonly onSting?: (id: StingId) => void;
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

/** A resurrection on your team plays its sting at most this often. */
export const RESURRECTED_STING_MS = 8_000;

/** What the stings (#2523) remember from one snapshot to the next. */
export interface StingMemory {
  /** The phase of the last snapshot, `null` before the first. */
  readonly phase: string | null;
  /** Whether someone has died: first blood is spent. */
  readonly bloodied: boolean;
  /** When the last resurrection sting played, epoch milliseconds. */
  readonly resurrectedAtMs: number | null;
}

export const FRESH_STINGS: StingMemory = { phase: null, bloodied: false, resurrectedAtMs: null };

/**
 * The stings `next` and the combat since the last snapshot call for, in
 * the order they rank: match-start, first-blood, resurrected, then victory
 * or defeat. Only the last plays. Pure: what it remembers comes back.
 *
 * @param selfTeam your team, `null` for a watcher, who has no side
 */
export function stingsFor(
  prev: StingMemory,
  next: MatchSnapshot,
  combatEvents: readonly CombatEvent[],
  selfTeam: number | null,
  nowMs: number,
): { readonly stings: StingId[]; readonly memory: StingMemory } {
  const stings: StingId[] = [];
  let { bloodied, resurrectedAtMs } = prev;
  // Creatures (#1052) are no one's blood and no one's comeback.
  const player = (id: string): PlayerSnapshot | undefined =>
    next.players.find((p) => p.sessionId === id && p.creature === undefined);
  if (prev.phase === null && next.phase === "active") {
    stings.push("match-start");
  }
  if (
    !bloodied &&
    combatEvents.some((event) => event.kind === "death" && player(event.targetId) !== undefined)
  ) {
    bloodied = true;
    stings.push("first-blood");
  }
  if (
    selfTeam !== null &&
    (resurrectedAtMs === null || nowMs - resurrectedAtMs >= RESURRECTED_STING_MS) &&
    combatEvents.some(
      (event) => event.kind === "resurrected" && player(event.targetId)?.team === selfTeam,
    )
  ) {
    resurrectedAtMs = nowMs;
    stings.push("resurrected");
  }
  // A draw has no winner, and plays neither.
  if (
    prev.phase === "active" &&
    next.phase === "finished" &&
    selfTeam !== null &&
    next.winningTeam !== undefined
  ) {
    stings.push(next.winningTeam === selfTeam ? "victory" : "defeat");
  }
  return { stings, memory: { phase: next.phase, bloodied, resurrectedAtMs } };
}

function sameMusic(a: MusicState, b: MusicState): boolean {
  return a.trackId === b.trackId && a.intensity === b.intensity && a.context === b.context;
}

export function attachMatchMusic(
  /** A seat, or a watcher's match (#480). */
  connection: Pick<MatchConnection, "map" | "selfSessionId" | "onCombat">,
  { screen, menuDepth, mode, tracks, onChange, onSting, now = Date.now }: MatchMusicOptions,
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
  /** What the stings remember, and the combat since the last snapshot (#2523). */
  let stingMemory = FRESH_STINGS;
  let combatSince: CombatEvent[] = [];

  connection.onCombat((message) => {
    if (disposed || !online) {
      return;
    }
    if (screen === "match") {
      combatSince.push(...message.events);
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
      if (disposed || !online) {
        return;
      }
      const self = next.players.find((p) => p.sessionId === next.selfSessionId);
      // Every snapshot, so a sting lands on its frame; none in training.
      let sting: StingId | undefined;
      if (screen === "match") {
        const called = stingsFor(stingMemory, next, combatSince, self?.team ?? null, at);
        stingMemory = called.memory;
        combatSince = [];
        sting = called.stings.at(-1);
      }
      // A sting asks the director at once: it plays in the key of the
      // track the director turns to, the result's at the end.
      if (sting === undefined && at - lastAsked < DIRECT_INTERVAL_MS) {
        return;
      }
      lastAsked = at;
      // Players join a running match one by one, so the first snapshot
      // may hold only some of the side: the largest count seen is the size.
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
      if (sting !== undefined) {
        onSting?.(sting);
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
