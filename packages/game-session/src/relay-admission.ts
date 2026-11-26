/**
 * Which relay asks a lobby host admits (#2527, ADR-0049): a joiner that
 * needs a relay asks over Nostr before it can be seated, and the host
 * tells its members which asks they may seal a login for. A peer id is
 * anyone's to announce, so every limit here bounds what an invite holder
 * can make the lobby's relays mint, not who joins: seating stays the
 * lobby's own business.
 */
import type { PeerRelayAdmit } from "@vibewars/game-protocol";

/** How long an admit is live: a joiner's direct wait and three attempts fit in it. */
export const RELAY_ADMIT_MS = 30_000;

/** At most this many new admits in any `RELAY_ADMIT_WINDOW_MS`. */
export const RELAY_ADMITS_PER_WINDOW = 2;
export const RELAY_ADMIT_WINDOW_MS = 10_000;

/** An admitted ask that did not seat is not admitted again for this long. */
export const RELAY_READMIT_MS = 5 * 60 * 1000;

/** The host stays in its relay rooms this long after the last admit ends. */
export const RELAY_ROOMS_LINGER_MS = 60_000;

/** What the admission reads of its lobby, now. */
export interface RelayAdmissionLobby {
  /**
   * Whether the lobby would seat `peerId` if it joined now: open, not
   * seated, a seat free and no match on, or the id is an away member's.
   */
  wouldSeat(peerId: string): boolean;
  /** Whether `peerId` is an away member's (#1764), whose seat is free for it alone. */
  isAway(peerId: string): boolean;
  /** Seats a new joiner could take now. */
  freeSeats(): number;
}

export interface RelayAdmission {
  /**
   * `peerId` asked with `pub` at `nowMs`: the admit to tell every member,
   * or `undefined`. Keyed on the pair, so an invite holder re-asking with
   * a joiner's peer id and its own key never blocks the joiner's.
   */
  ask(peerId: string, pub: string, nowMs: number): PeerRelayAdmit | undefined;
  /** `peerId` took a seat: its asks are answered, and it may ask again once it leaves. */
  seated(peerId: string): void;
  /** Member `memberId` holds a relay it shares, or stopped. */
  holding(memberId: string, on: boolean): void;
  /** Whether member `memberId` last said it holds a relay (#2529). */
  holds(memberId: string): boolean;
  /** Member `memberId` left the lobby: it holds nothing any more. */
  gone(memberId: string): void;
  /**
   * Whether the host should sit in its relay rooms at `nowMs`: someone
   * holds a relay and an admit is live, or ended under
   * `RELAY_ROOMS_LINGER_MS` ago.
   */
  roomsWanted(nowMs: number): boolean;
}

export function createRelayAdmission(lobby: RelayAdmissionLobby): RelayAdmission {
  const holders = new Set<string>();
  /** Live admits by `peerId pub`, with when each ends. */
  const live = new Map<string, { readonly peerId: string; readonly until: number }>();
  /** When each `peerId pub` was last admitted, for `RELAY_READMIT_MS`. */
  const admittedAt = new Map<string, number>();
  /** When the newest admits began, newest last: at most `RELAY_ADMITS_PER_WINDOW`. */
  const recent: number[] = [];
  let lastEnds = -Infinity;

  const prune = (nowMs: number): void => {
    for (const [key, admit] of live) {
      if (admit.until <= nowMs) {
        live.delete(key);
      }
    }
    for (const [key, at] of admittedAt) {
      if (nowMs - at >= RELAY_READMIT_MS) {
        admittedAt.delete(key);
      }
    }
    while (recent.length > 0 && nowMs - (recent[0] ?? 0) >= RELAY_ADMIT_WINDOW_MS) {
      recent.shift();
    }
  };

  return {
    ask(peerId, pub, nowMs) {
      prune(nowMs);
      const key = `${peerId} ${pub}`;
      if (
        holders.size === 0 ||
        live.has(key) ||
        admittedAt.has(key) ||
        recent.length >= RELAY_ADMITS_PER_WINDOW ||
        !lobby.wouldSeat(peerId)
      ) {
        return undefined;
      }
      // An away member's seat is its own: only new joiners share the free ones.
      if (!lobby.isAway(peerId)) {
        const taking = [...live.values()].filter((admit) => !lobby.isAway(admit.peerId)).length;
        if (taking >= lobby.freeSeats()) {
          return undefined;
        }
      }
      const until = nowMs + RELAY_ADMIT_MS;
      live.set(key, { peerId, until });
      admittedAt.set(key, nowMs);
      recent.push(nowMs);
      lastEnds = Math.max(lastEnds, until);
      return { peerId, pub };
    },
    seated(peerId) {
      for (const [key, admit] of live) {
        if (admit.peerId === peerId) {
          live.delete(key);
        }
      }
      for (const key of [...admittedAt.keys()]) {
        if (key.startsWith(`${peerId} `)) {
          admittedAt.delete(key);
        }
      }
    },
    holding(memberId, on) {
      if (on) {
        holders.add(memberId);
      } else {
        holders.delete(memberId);
      }
    },
    holds(memberId) {
      return holders.has(memberId);
    },
    gone(memberId) {
      holders.delete(memberId);
    },
    roomsWanted(nowMs) {
      prune(nowMs);
      return holders.size > 0 && (live.size > 0 || nowMs < lastEnds + RELAY_ROOMS_LINGER_MS);
    },
  };
}
