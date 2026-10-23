import { Client, type Room } from "@colyseus/sdk";
import {
  ROOM_MATCH,
  type ClientIntent,
  type MapDescriptor,
  type ServerHello,
} from "@vibewars/game-protocol";

/**
 * Thin wrapper around the Colyseus browser SDK for the match room.
 *
 * This module is the *only* place in `apps/web` allowed to import
 * `@colyseus/sdk` — everything else (the renderer, the input handler) talks
 * to a plain snapshot/intent interface so the networking layer can change
 * without touching rendering code (ADR-0001).
 */

export interface PlayerSnapshot {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  /** Who this player is targeting, or `undefined` for no target. */
  readonly targetSessionId: string | undefined;
}

export interface MatchSnapshot {
  readonly selfSessionId: string;
  readonly players: readonly PlayerSnapshot[];
}

export interface MatchConnection {
  readonly selfSessionId: string;
  /** The match's static geometry, received once on join (brief §19). */
  readonly map: MapDescriptor;
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  disconnect(): Promise<void>;
}

/** Build the Colyseus endpoint from the page's own origin, over the right protocol. */
export function endpointFromLocation(location: Pick<Location, "protocol" | "host">): string {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${location.host}`;
}

/** Room state as the Colyseus client actually decodes it — a minimal, local shape. */
interface DecodedPlayer {
  readonly sessionId: string;
  readonly x: number;
  readonly y: number;
  readonly targetSessionId: string;
}
interface DecodedMatchState {
  readonly players: ReadonlyMap<string, DecodedPlayer> | Map<string, DecodedPlayer>;
}

function snapshotFrom(room: Room<unknown, DecodedMatchState>): MatchSnapshot {
  const players: PlayerSnapshot[] = [];
  for (const player of room.state.players.values()) {
    players.push({
      sessionId: player.sessionId,
      x: player.x,
      y: player.y,
      targetSessionId: player.targetSessionId === "" ? undefined : player.targetSessionId,
    });
  }
  return { selfSessionId: room.sessionId, players };
}

/** Await exactly one message of `type` from `room`, or reject after `timeoutMs`. */
function awaitMessage<T>(room: Room, type: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out waiting for a "${type}" message`));
    }, timeoutMs);
    room.onMessage(type, (message: T) => {
      clearTimeout(timer);
      resolve(message);
    });
  });
}

export async function connectToMatch(endpoint: string): Promise<MatchConnection> {
  const client = new Client(endpoint);
  const room = await client.joinOrCreate<DecodedMatchState>(ROOM_MATCH);
  const map = await awaitMessage<MapDescriptor>(room, "map", 5000);

  return {
    selfSessionId: room.sessionId,
    map,
    sendIntent(intent: ClientIntent): void {
      room.send("intent", intent);
    },
    getSnapshot(): MatchSnapshot {
      return snapshotFrom(room);
    },
    async disconnect(): Promise<void> {
      await room.leave();
    },
  };
}

export type { ServerHello };
