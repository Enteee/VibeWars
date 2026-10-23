import { Client, type Room } from "@colyseus/sdk";
import {
  ROOM_LOBBY,
  normalizeLobbyCode,
  type LobbyMatchStartingMessage,
} from "@vibewars/game-protocol";

/**
 * Browser-side wrapper for the lobby room.
 *
 * Mirrors `match-client.ts`: the only place in `apps/web` that talks to
 * `@colyseus/sdk` for lobbies, exposing plain snapshots and callbacks so
 * the UI never depends on the transport (ADR-0001).
 */

export interface LobbyPlayerSnapshot {
  readonly sessionId: string;
  readonly name: string;
  readonly team: number;
  readonly ready: boolean;
  readonly isHost: boolean;
}

export interface LobbySnapshot {
  readonly selfSessionId: string;
  readonly code: string;
  readonly phase: string;
  readonly mapId: string;
  readonly players: readonly LobbyPlayerSnapshot[];
  readonly isHost: boolean;
}

export interface LobbyConnection {
  readonly selfSessionId: string;
  getSnapshot(): LobbySnapshot;
  chooseTeam(team: number | null): void;
  setReady(ready: boolean): void;
  selectMap(mapId: string): void;
  startMatch(): void;
  returnToLobby(): void;
  onChange(handler: () => void): void;
  onMatchStarting(handler: (message: LobbyMatchStartingMessage) => void): void;
  onStartRejected(handler: (message: { reason: string }) => void): void;
  disconnect(): Promise<void>;
}

interface DecodedLobbyPlayer {
  readonly sessionId: string;
  readonly name: string;
  readonly team: number;
  readonly ready: boolean;
  readonly isHost: boolean;
}

interface DecodedLobbyState {
  readonly code: string;
  readonly phase: string;
  readonly mapId: string;
  readonly players: ReadonlyMap<string, DecodedLobbyPlayer> | Map<string, DecodedLobbyPlayer>;
}

function snapshotFrom(room: Room<unknown, DecodedLobbyState>): LobbySnapshot {
  const players: LobbyPlayerSnapshot[] = [];
  for (const player of room.state.players.values()) {
    players.push({
      sessionId: player.sessionId,
      name: player.name,
      team: player.team,
      ready: player.ready,
      isHost: player.isHost,
    });
  }
  return {
    selfSessionId: room.sessionId,
    code: room.state.code,
    phase: room.state.phase,
    mapId: room.state.mapId,
    players,
    isHost: players.find((p) => p.sessionId === room.sessionId)?.isHost ?? false,
  };
}

function wrap(room: Room<unknown, DecodedLobbyState>): LobbyConnection {
  return {
    selfSessionId: room.sessionId,
    getSnapshot: () => snapshotFrom(room),
    chooseTeam(team) {
      room.send("choose-team", { team });
    },
    setReady(ready) {
      room.send("ready", { ready });
    },
    selectMap(mapId) {
      room.send("select-map", { mapId });
    },
    startMatch() {
      room.send("start-match", {});
    },
    returnToLobby() {
      room.send("return-to-lobby", {});
    },
    onChange(handler) {
      room.onStateChange(handler);
    },
    onMatchStarting(handler) {
      room.onMessage("match-starting", handler);
    },
    onStartRejected(handler) {
      room.onMessage("start-rejected", handler);
    },
    async disconnect() {
      await room.leave();
    },
  };
}

export async function createLobby(endpoint: string, name: string): Promise<LobbyConnection> {
  const client = new Client(endpoint);
  return wrap(await client.create<DecodedLobbyState>(ROOM_LOBBY, { name }));
}

export class LobbyNotFoundError extends Error {
  public override readonly name = "LobbyNotFoundError";
}

/**
 * Join an existing lobby by its code.
 *
 * Colyseus matches on room *metadata*, so the code is normalised first
 * (players mistype and paste codes constantly) and a miss is reported as
 * a clear "no such lobby" rather than a raw matchmaking error.
 */
export async function joinLobbyByCode(
  endpoint: string,
  code: string,
  name: string,
): Promise<LobbyConnection> {
  const normalized = normalizeLobbyCode(code);
  const client = new Client(endpoint);
  try {
    return wrap(await client.join<DecodedLobbyState>(ROOM_LOBBY, { code: normalized, name }));
  } catch (error) {
    throw new LobbyNotFoundError(
      `no lobby with code ${normalized} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}
