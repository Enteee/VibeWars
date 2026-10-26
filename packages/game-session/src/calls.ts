import { MAX_WIRE_PINGS, type PeerCall, type WireCalls } from "@vibewars/game-protocol";

/**
 * Each team's calls (#443): the foe it has called, and its pings. Calls
 * change nothing in the simulation, only what a team is shown, so this
 * lives beside the host, not in game-core. Pure: the caller passes the
 * match clock and says who is alive and who is a foe.
 */

/** How long a ping stays up, seconds. */
export const PING_SECONDS = 2.6;
/** One call or ping a second, per player; the rest is dropped without a word. */
export const CALL_INTERVAL_SECONDS = 1;

export type Team = 0 | 1;

export interface CallBoard {
  /**
   * `callerId` on `team` calls or pings at match time `now`. A call needs
   * `isLiveEnemy(targetId)`; a ping is pulled into the arena, and one off
   * the number line is dropped. Whether the team's view changed.
   */
  call(
    team: Team,
    callerId: string,
    call: PeerCall,
    now: number,
    isLiveEnemy: (targetId: string) => boolean,
  ): boolean;
  /**
   * Expire pings and drop calls on a target that died or left, at match
   * time `now`. The teams whose view changed.
   */
  step(now: number, isAlive: (id: string) => boolean): Team[];
  /** What `team` is shown at match time `now`. */
  view(team: Team, now: number): WireCalls;
}

interface Ping {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly byId: string;
  readonly at: number;
}

interface TeamCalls {
  target: { readonly targetId: string; readonly callerId: string } | null;
  pings: Ping[];
}

const TEAMS: readonly Team[] = [0, 1];

export function createCallBoard(bounds: {
  readonly width: number;
  readonly height: number;
}): CallBoard {
  const teams: Record<Team, TeamCalls> = {
    0: { target: null, pings: [] },
    1: { target: null, pings: [] },
  };
  /** When each player last called or pinged. */
  const lastCall = new Map<string, number>();
  let nextPingId = 1;

  const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));

  return {
    call(team, callerId, call, now, isLiveEnemy) {
      const last = lastCall.get(callerId);
      if (last !== undefined && now - last < CALL_INTERVAL_SECONDS) {
        return false;
      }
      const calls = teams[team];
      if (call.kind === "target") {
        if (!isLiveEnemy(call.targetId)) {
          return false;
        }
        lastCall.set(callerId, now);
        calls.target = { targetId: call.targetId, callerId };
        return true;
      }
      if (!Number.isFinite(call.x) || !Number.isFinite(call.y)) {
        return false;
      }
      lastCall.set(callerId, now);
      const ping: Ping = {
        id: nextPingId,
        x: clamp(call.x, bounds.width),
        y: clamp(call.y, bounds.height),
        byId: callerId,
        at: now,
      };
      nextPingId += 1;
      calls.pings = [...calls.pings, ping].slice(-MAX_WIRE_PINGS);
      return true;
    },
    step(now, isAlive) {
      const changed: Team[] = [];
      for (const team of TEAMS) {
        const calls = teams[team];
        const pings = calls.pings.filter((ping) => now - ping.at < PING_SECONDS);
        const lost = calls.target !== null && !isAlive(calls.target.targetId);
        if (pings.length !== calls.pings.length || lost) {
          calls.pings = pings;
          if (lost) {
            calls.target = null;
          }
          changed.push(team);
        }
      }
      return changed;
    },
    view(team, now) {
      const calls = teams[team];
      return {
        target: calls.target,
        pings: calls.pings.map(({ id, x, y, byId, at }) => ({
          id,
          x,
          y,
          byId,
          remaining: Math.max(0, PING_SECONDS - (now - at)),
        })),
      };
    },
  };
}
