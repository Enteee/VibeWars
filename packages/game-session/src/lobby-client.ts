import {
  LOBBY_REFUSALS,
  PROTOCOL_VERSION,
  normalizeLobbyCode,
  parseWireLobbyNote,
  parseWireLobbyState,
  parseWireMatchStart,
  type LobbyRefusal,
  type PeerLobbyJoin,
  type WireLobbyCommand,
  type WireLobbyState,
} from "@vibewars/game-protocol";

import { lobbyCharacter } from "./lobby-character.js";
import type {
  LobbyCharacter,
  LobbyClosedReason,
  LobbyConnection,
  LobbySnapshot,
  MatchStarting,
} from "./lobby-connection.js";
import { RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { scopeTransport } from "./scoped-transport.js";
import type { Transport } from "./transport.js";

/**
 * A lobby on another peer's browser, as the lobby screen sees every
 * lobby: a `LobbyConnection` (#379). The host is the peer that sends the
 * first state listing this player; from then on, only its messages count.
 *
 * During a match, the host's peer going is a drop the match waits out
 * (#515), so the lobby waits as long before it closes, and when the peer
 * is back, joins again: the host dropped this player from the lobby as it
 * went, and the match's end would otherwise find nobody to return to.
 */

/** Nobody answered: a wrong code, or a host that cannot be reached. */
export class LobbyNoAnswerError extends Error {
  public constructor(timeoutMs: number) {
    super(`No lobby answered within ${String(timeoutMs / 1000)} s.`);
    this.name = "LobbyNoAnswerError";
  }
}

/** The host turned this player away, and said why. */
export class LobbyRefusedError extends Error {
  public readonly reason: LobbyRefusal;

  public constructor(reason: LobbyRefusal) {
    super(`The lobby refused to let this player in: ${reason}.`);
    this.name = "LobbyRefusedError";
    this.reason = reason;
  }
}

export interface JoinLobbyOptions {
  /** The room named by the code. */
  readonly transport: Transport;
  readonly code: string;
  readonly name: string;
  /** The selected character's name and professions; `null` brings the house loadout. */
  readonly character: LobbyCharacter | null;
  /** How long to wait for a state that lists this player. */
  readonly timeoutMs: number;
}

function isRefusal(reason: string): reason is LobbyRefusal {
  return LOBBY_REFUSALS.some((refusal) => refusal === reason);
}

export function joinLobby(options: JoinLobbyOptions): Promise<LobbyConnection> {
  const { transport, timeoutMs } = options;
  const selfId = transport.selfId;
  const code = normalizeLobbyCode(options.code);
  const join: PeerLobbyJoin = {
    protocolVersion: PROTOCOL_VERSION,
    name: options.name,
    character: options.character,
  };
  const unsubscribe: (() => void)[] = [];
  let hostId: string | undefined;
  let latest: WireLobbyState | undefined;
  /** The match whose start was already handed on, so a repeat is not. */
  let startedMatch: string | null = null;
  let closed = false;
  const changeHandlers: (() => void)[] = [];
  const startingHandlers: ((start: MatchStarting) => void)[] = [];
  const rejectedHandlers: ((reason: string) => void)[] = [];
  const closedHandlers: ((reason: LobbyClosedReason) => void)[] = [];
  /** Until the join settles: how a refusal or the timeout ends it. */
  let failJoin: ((error: Error) => void) | undefined;
  /** When the host's peer went mid-match, by `Date.now`, while waiting for it back. */
  let droppedAt: number | undefined;
  let closeTimer: unknown;

  const stop = (): void => {
    clearTimeout(closeTimer);
    for (const off of unsubscribe.splice(0)) {
      off();
    }
    changeHandlers.length = 0;
    startingHandlers.length = 0;
    rejectedHandlers.length = 0;
    closedHandlers.length = 0;
  };

  const close = (reason: LobbyClosedReason): void => {
    if (closed) {
      return;
    }
    closed = true;
    const handlers = [...closedHandlers];
    stop();
    for (const handler of handlers) {
      handler(reason);
    }
  };

  const send = (command: WireLobbyCommand): void => {
    if (hostId !== undefined && !closed) {
      transport.send("lobby-cmd", command, hostId);
    }
  };

  const snapshot = (state: WireLobbyState): LobbySnapshot => ({
    selfSessionId: selfId,
    code: state.code,
    phase: state.phase,
    mapId: state.mapId,
    hostId: state.hostId,
    players: state.players.map((player) => ({
      sessionId: player.id,
      name: player.name,
      team: player.team,
      ready: player.ready,
      isHost: player.isHost,
      character: lobbyCharacter(player.character),
    })),
    isHost: state.players.some((player) => player.id === selfId && player.isHost),
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      failJoin?.(new LobbyNoAnswerError(timeoutMs));
    }, timeoutMs);
    failJoin = (error) => {
      failJoin = undefined;
      clearTimeout(timer);
      stop();
      reject(error);
    };

    const connection: LobbyConnection = {
      selfSessionId: selfId,
      getSnapshot() {
        if (latest === undefined) {
          throw new Error("a lobby connection exists only once a state has listed it");
        }
        return snapshot(latest);
      },
      chooseTeam(team) {
        send({ kind: "choose-team", team });
      },
      setReady(ready) {
        send({ kind: "ready", ready });
      },
      selectMap(mapId) {
        send({ kind: "select-map", mapId });
      },
      startMatch() {
        send({ kind: "start" });
      },
      onChange(handler) {
        changeHandlers.push(handler);
      },
      onMatchStarting(handler) {
        startingHandlers.push(handler);
      },
      onStartRejected(handler) {
        rejectedHandlers.push(handler);
      },
      onClosed(handler) {
        closedHandlers.push(handler);
      },
      async disconnect() {
        closed = true;
        stop();
        await transport.leave();
      },
    };

    unsubscribe.push(
      transport.on("lobby-state", (data, from) => {
        // Only the host's, once it is known; before that, only a state the
        // sender says it hosts, and that lists this player.
        if (hostId !== undefined && from !== hostId) {
          return;
        }
        const state = parseWireLobbyState(data);
        if (state?.hostId !== from || state.code !== code) {
          return;
        }
        if (hostId === undefined) {
          if (!state.players.some((player) => player.id === selfId)) {
            return;
          }
          hostId = from;
          latest = state;
          failJoin = undefined;
          clearTimeout(timer);
          resolve(connection);
          return;
        }
        latest = state;
        for (const handler of [...changeHandlers]) {
          handler();
        }
      }),
      transport.on("lobby-note", (data, from) => {
        // A refusal can come before the host is known: it is why it never is.
        if (hostId !== undefined && from !== hostId) {
          return;
        }
        const note = parseWireLobbyNote(data);
        if (note === undefined) {
          return;
        }
        if (note.kind === "start-rejected") {
          for (const handler of [...rejectedHandlers]) {
            handler(note.reason);
          }
        } else if (isRefusal(note.reason)) {
          if (failJoin !== undefined) {
            failJoin(new LobbyRefusedError(note.reason));
          } else if (note.reason === "host-left") {
            close("host-left");
          }
        }
      }),
      transport.on("match-start", (data, from) => {
        const start = parseWireMatchStart(data);
        // Only for the match the lobby says is on, and only once: a late
        // one, from a match already over, is ignored.
        if (
          from !== hostId ||
          start === undefined ||
          latest?.phase !== "in-match" ||
          start.matchId !== latest.matchId ||
          start.matchId === startedMatch
        ) {
          return;
        }
        startedMatch = start.matchId;
        const starting: MatchStarting = {
          mapId: start.mapId,
          matchId: start.matchId,
          transport: scopeTransport(transport),
        };
        for (const handler of [...startingHandlers]) {
          handler(starting);
        }
      }),
      transport.onPeerJoin((peerId) => {
        // Said to every peer in the room: until one answers, any might host.
        if (hostId === undefined) {
          transport.send("lobby-join", join, peerId);
          return;
        }
        if (peerId !== hostId || droppedAt === undefined) {
          return;
        }
        clearTimeout(closeTimer);
        // Measured on the clock: a hidden tab's timer may fire late.
        const late = Date.now() - droppedAt >= RECONNECT_WINDOW_SECONDS * 1000;
        droppedAt = undefined;
        if (late) {
          close("connection-lost");
          return;
        }
        transport.send("lobby-join", join, hostId);
      }),
      transport.onPeerLeave((peerId) => {
        if (peerId !== hostId || droppedAt !== undefined) {
          return;
        }
        if (latest?.phase !== "in-match") {
          close("host-left");
          return;
        }
        droppedAt = Date.now();
        closeTimer = setTimeout(() => {
          close("connection-lost");
        }, RECONNECT_WINDOW_SECONDS * 1000);
      }),
    );
    // And to those already here, in case their joins were told before now.
    transport.send("lobby-join", join);
  });
}
