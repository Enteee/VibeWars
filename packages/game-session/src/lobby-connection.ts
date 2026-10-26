import type { LobbyPhase } from "@vibewars/game-protocol";

import type { Transport } from "./transport.js";

/**
 * A lobby as the lobby screen sees it (#379): plain snapshots and
 * callbacks, whoever hosts it.
 */

export interface LobbyPlayerSnapshot {
  readonly sessionId: string;
  readonly name: string;
  /** `null` spectates. */
  readonly team: 0 | 1 | null;
  readonly ready: boolean;
  readonly isHost: boolean;
}

export interface LobbySnapshot {
  readonly selfSessionId: string;
  readonly code: string;
  readonly phase: LobbyPhase;
  readonly mapId: string;
  /** The peer the lobby and its match are hosted on. */
  readonly hostId: string;
  readonly players: readonly LobbyPlayerSnapshot[];
  /** Whether this player is the host's own: the one who picks the map and starts. */
  readonly isHost: boolean;
}

/**
 * Why a lobby closed: the host closed it or left, or its peer was gone
 * for the whole reconnect window, which this side cannot tell from its
 * own connection dropping.
 */
export type LobbyClosedReason = "host-left" | "connection-lost";

/** The lobby's match is on, and this player is seated in it. */
export interface MatchStarting {
  readonly mapId: string;
  readonly matchId: string;
  /**
   * The room, for this match alone: hand it to `connectMatch`. Leaving it
   * leaves the match, not the lobby.
   */
  readonly transport: Transport;
}

export interface LobbyConnection {
  readonly selfSessionId: string;
  getSnapshot(): LobbySnapshot;
  chooseTeam(team: 0 | 1 | null): void;
  setReady(ready: boolean): void;
  selectMap(mapId: string): void;
  startMatch(): void;
  onChange(handler: () => void): void;
  onMatchStarting(handler: (start: MatchStarting) => void): void;
  /** The host's own player alone: why the start it asked for did not happen. */
  onStartRejected(handler: (reason: string) => void): void;
  /** The lobby is over for this player, and why. */
  onClosed(handler: (reason: LobbyClosedReason) => void): void;
  disconnect(): Promise<void>;
}
