import {
  MAX_WIRE_PINGS,
  MAX_WIRE_STROKES,
  STROKE_SECONDS,
  type PeerCall,
  type WireCalls,
  type WirePoint,
  type WireStroke,
} from "@vibewars/game-protocol";

import { MessageBudget } from "./intent-budget.js";

/**
 * Each team's calls (#443): the foe it has called, its pings, and the
 * lines it drew on the compass (#2391). Calls
 * change nothing in the simulation, only what a team is shown, so this
 * lives beside the host, not in game-core. Pure: the caller passes the
 * match clock and says who is alive and who is a foe.
 */

/** How long a ping stays up, seconds. */
export const PING_SECONDS = 2.6;

/**
 * How many compass line segments one player may draw a second (#2391),
 * sustained and at once, on top of the host's message budget: a drag
 * sends 10 a second.
 */
export const STROKES_PER_SECOND = 15;

export type Team = 0 | 1;

export interface CallBoard {
  /**
   * `callerId` on `team` calls or pings at match time `now`. A call needs
   * `isLiveEnemy(targetId)`; a ping is pulled into the arena, and one off
   * the number line is dropped. A stroke's points are pulled in too,
   * and one past the caller's `STROKES_PER_SECOND` is dropped: it is
   * never in the view, only in `freshStrokes` and `strokes`. Whether
   * the team's view changed.
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
  /** `team`'s live line segments at match time `now`, the newest `MAX_WIRE_STROKES` (#2391). */
  strokes(team: Team, now: number): WireStroke[];
  /** `team`'s segments drawn since this was last asked, at match time `now`; forgets them. */
  freshStrokes(team: Team, now: number): WireStroke[];
}

interface Ping {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly byId: string;
  readonly at: number;
}

interface Stroke {
  readonly id: number;
  readonly byId: string;
  readonly strokeId: number;
  readonly points: readonly WirePoint[];
  readonly at: number;
}

interface TeamCalls {
  target: { readonly targetId: string; readonly callerId: string } | null;
  pings: Ping[];
  /**
   * The team's own: one counter for both would let a team read how often,
   * and when, the other pinged from the gaps in its ids.
   */
  nextPingId: number;
  strokes: Stroke[];
  /** Drawn since `freshStrokes` last asked. */
  fresh: Stroke[];
  /** As `nextPingId`. */
  nextStrokeId: number;
}

const TEAMS: readonly Team[] = [0, 1];

export function createCallBoard(bounds: {
  readonly width: number;
  readonly height: number;
}): CallBoard {
  const teams: Record<Team, TeamCalls> = {
    0: { target: null, pings: [], nextPingId: 1, strokes: [], fresh: [], nextStrokeId: 1 },
    1: { target: null, pings: [], nextPingId: 1, strokes: [], fresh: [], nextStrokeId: 1 },
  };
  // Keyed by player, so a reconnect does not refill it; on the match clock.
  const strokeBudget = new MessageBudget(STROKES_PER_SECOND, STROKES_PER_SECOND, () => undefined);

  const clamp = (value: number, max: number): number => Math.min(max, Math.max(0, value));
  const live = (strokes: readonly Stroke[], now: number): Stroke[] =>
    strokes.filter((stroke) => now - stroke.at < STROKE_SECONDS);
  const wire = (strokes: readonly Stroke[], now: number): WireStroke[] =>
    strokes.map(({ id, byId, strokeId, points, at }) => ({
      id,
      byId,
      strokeId,
      points,
      remaining: Math.max(0, STROKE_SECONDS - (now - at)),
    }));

  return {
    call(team, callerId, call, now, isLiveEnemy) {
      const calls = teams[team];
      if (call.kind === "target") {
        if (!isLiveEnemy(call.targetId)) {
          return false;
        }
        calls.target = { targetId: call.targetId, callerId };
        return true;
      }
      if (call.kind === "stroke") {
        const points = call.points
          .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
          .map(([x, y]): WirePoint => [clamp(x, bounds.width), clamp(y, bounds.height)]);
        if (points.length < 2 || !strokeBudget.take(callerId, now * 1000)) {
          return false;
        }
        const stroke: Stroke = {
          id: calls.nextStrokeId,
          byId: callerId,
          strokeId: call.strokeId,
          points,
          at: now,
        };
        calls.nextStrokeId += 1;
        calls.strokes = [...calls.strokes, stroke].slice(-MAX_WIRE_STROKES);
        calls.fresh = [...calls.fresh, stroke].slice(-MAX_WIRE_STROKES);
        return false;
      }
      if (!Number.isFinite(call.x) || !Number.isFinite(call.y)) {
        return false;
      }
      const ping: Ping = {
        id: calls.nextPingId,
        x: clamp(call.x, bounds.width),
        y: clamp(call.y, bounds.height),
        byId: callerId,
        at: now,
      };
      calls.nextPingId += 1;
      calls.pings = [...calls.pings, ping].slice(-MAX_WIRE_PINGS);
      return true;
    },
    step(now, isAlive) {
      const changed: Team[] = [];
      for (const team of TEAMS) {
        const calls = teams[team];
        // Each client ages its own copy of the lines: dropping them is no change.
        calls.strokes = live(calls.strokes, now);
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
    strokes(team, now) {
      return wire(live(teams[team].strokes, now), now);
    },
    freshStrokes(team, now) {
      const calls = teams[team];
      const fresh = wire(live(calls.fresh, now), now);
      calls.fresh = [];
      return fresh;
    },
  };
}
