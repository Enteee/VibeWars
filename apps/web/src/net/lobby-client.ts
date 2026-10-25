import { Client, type Room } from "@colyseus/sdk";
import type { PlayerBuild } from "@vibewars/game-core";
import {
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  CLIENT_LIMIT,
  PROTOCOL_MISMATCH_MESSAGE,
  ROOM_LIMIT,
  SERVER_FULL_MESSAGE,
  PROTOCOL_VERSION,
  ROOM_LOBBY,
  normalizeLobbyCode,
  type LobbyJoinOptions,
  type LobbyMatchStartingMessage,
  type LobbyStartRejectedMessage,
} from "@vibewars/game-protocol";

import { sendMessage } from "./wire.js";

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
  onChange(handler: () => void): void;
  onMatchStarting(handler: (message: LobbyMatchStartingMessage) => void): void;
  onStartRejected(handler: (message: LobbyStartRejectedMessage) => void): void;
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

function hasDecodedState(room: Room<unknown, DecodedLobbyState>): boolean {
  // `room.state` itself is replaced when the first patch decodes, so both
  // it and `players` have to be checked.
  return (room.state as DecodedLobbyState | undefined)?.players !== undefined;
}

/**
 * Wait until the room's state has actually decoded.
 *
 * `client.join()` resolves on the WebSocket handshake; the first state
 * patch is a separate, slightly later message. Until it arrives
 * `room.state.players` is genuinely `undefined` at runtime, whatever the
 * decoded-state type says — reading it threw "Cannot read properties of
 * undefined (reading 'values')" the first time this ran in a real
 * browser. Returning a connection that is not yet readable is the bug;
 * callers should never have to know about this window.
 */
async function awaitFirstPatch(room: Room<unknown, DecodedLobbyState>): Promise<void> {
  if (hasDecodedState(room)) {
    return;
  }
  await new Promise<void>((resolve) => {
    // `onStateChange(cb)` returns the signal's emitter, not an
    // unsubscribe function — removal goes through `.remove(cb)`.
    const handler = (): void => {
      if (hasDecodedState(room)) {
        room.onStateChange.remove(handler);
        resolve();
      }
    };
    room.onStateChange(handler);
  });
}

function snapshotFrom(room: Room<unknown, DecodedLobbyState>): LobbySnapshot {
  const players: LobbyPlayerSnapshot[] = [];
  // Defensive as well as awaited: a reconnect re-enters this window, and
  // an empty lobby render is recoverable where a thrown error is not.
  const decoded = (room.state as DecodedLobbyState | undefined)?.players;
  for (const player of (decoded as Map<string, DecodedLobbyPlayer> | undefined)?.values() ?? []) {
    players.push({
      sessionId: player.sessionId,
      name: player.name,
      team: player.team,
      ready: player.ready,
      isHost: player.isHost,
    });
  }
  const state = room.state as DecodedLobbyState | undefined;
  return {
    selfSessionId: room.sessionId,
    code: state?.code ?? "",
    phase: state?.phase ?? "",
    mapId: state?.mapId ?? "",
    players,
    isHost: players.find((p) => p.sessionId === room.sessionId)?.isHost ?? false,
  };
}

function wrap(room: Room<unknown, DecodedLobbyState>): LobbyConnection {
  return {
    selfSessionId: room.sessionId,
    getSnapshot: () => snapshotFrom(room),
    chooseTeam(team) {
      sendMessage(room, "choose-team", { team });
    },
    setReady(ready) {
      sendMessage(room, "ready", { ready });
    },
    selectMap(mapId) {
      sendMessage(room, "select-map", { mapId });
    },
    startMatch() {
      sendMessage(room, "start-match", {});
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

/**
 * Host a new lobby. `build` is what this player will ask to play when the
 * match starts: the lobby takes their seat for them (#41).
 */
export async function createLobby(
  endpoint: string,
  name: string,
  build: PlayerBuild | undefined,
): Promise<LobbyConnection> {
  const client = new Client(endpoint);
  const room = await client.create<DecodedLobbyState>(ROOM_LOBBY, {
    protocolVersion: PROTOCOL_VERSION,
    name,
    ...(build === undefined ? {} : { build }),
  } satisfies LobbyJoinOptions);
  await awaitFirstPatch(room);
  return wrap(room);
}

/**
 * Whether a failed create or join was the server refusing this tab's
 * protocol version. The only fix is a reload, so the caller must say so
 * rather than report a generic connection problem.
 */
export function isProtocolMismatch(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PROTOCOL_MISMATCH_MESSAGE);
}

/**
 * What to tell a player whose create or join the server refused for
 * capacity, or `undefined` when it was some other failure. Quick Match,
 * hosting and joining say so, rather than "could not connect", because
 * waiting or closing a tab fixes it:
 *
 * - `ROOM_LIMIT`: the server holds all the rooms it can (#114);
 * - `CLIENT_LIMIT`: it holds all the players it can (#265);
 * - `ADDRESS_LIMIT`: this network is over its share (#265).
 *
 * @param error what the SDK rejected with
 */
export function capacityRefusal(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) {
    return undefined;
  }
  const { code } = error as Error & { readonly code: unknown };
  if (code === ROOM_LIMIT || code === CLIENT_LIMIT) {
    return SERVER_FULL_MESSAGE;
  }
  return code === ADDRESS_LIMIT ? ADDRESS_LIMIT_MESSAGE : undefined;
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
  build: PlayerBuild | undefined,
): Promise<LobbyConnection> {
  const normalized = normalizeLobbyCode(code);
  const client = new Client(endpoint);
  try {
    const room = await client.join<DecodedLobbyState>(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      code: normalized,
      name,
      ...(build === undefined ? {} : { build }),
    } satisfies LobbyJoinOptions);
    await awaitFirstPatch(room);
    return wrap(room);
  } catch (error) {
    throw joinByCodeFailure(error, normalized);
  }
}

/**
 * What a failed join by `code` is rethrown as. A stale tab and a server
 * at capacity keep their own error, so the player is told what fixes it;
 * anything else is reported as no such lobby.
 *
 * @param error what the SDK rejected with
 * @param code the normalised code that was tried
 */
export function joinByCodeFailure(error: unknown, code: string): unknown {
  if (isProtocolMismatch(error) || capacityRefusal(error) !== undefined) {
    return error;
  }
  return new LobbyNotFoundError(
    `no lobby with code ${code} (${error instanceof Error ? error.message : String(error)})`,
  );
}
