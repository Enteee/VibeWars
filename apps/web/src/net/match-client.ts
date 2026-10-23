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
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly adrenaline: number;
  readonly team: number;
  readonly dead: boolean;
  readonly castingSkillId: string | undefined;
  readonly castRemaining: number;
  readonly statuses: readonly string[];
}

export interface MatchSnapshot {
  readonly selfSessionId: string;
  readonly players: readonly PlayerSnapshot[];
}

/** One slot of the server-assigned skill bar. */
export interface SkillSlot {
  readonly id: string;
  readonly name: string;
  readonly energyCost: number;
  readonly adrenalineCost: number;
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
}

export interface CombatMessage {
  readonly casterSessionId: string;
  readonly skillId: string;
  readonly events: readonly {
    readonly kind: string;
    readonly targetId?: string;
    readonly amount?: number;
  }[];
}

export interface MatchConnection {
  readonly selfSessionId: string;
  /** The match's static geometry, received once on join (brief §19). */
  readonly map: MapDescriptor;
  /** The server-assigned skill bar, received once on join. */
  readonly skillBar: readonly SkillSlot[];
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
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
  readonly health: number;
  readonly maxHealth: number;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly adrenaline: number;
  readonly team: number;
  readonly dead: boolean;
  readonly castingSkillId: string;
  readonly castRemaining: number;
  readonly statuses: Iterable<string>;
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
      health: player.health,
      maxHealth: player.maxHealth,
      energy: player.energy,
      maxEnergy: player.maxEnergy,
      adrenaline: player.adrenaline,
      team: player.team,
      dead: player.dead,
      castingSkillId: player.castingSkillId === "" ? undefined : player.castingSkillId,
      castRemaining: player.castRemaining,
      statuses: [...player.statuses],
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

  // Both arrive on join; waiting for them here means the caller gets a
  // fully-usable connection rather than one that is missing its map or
  // skill bar for the first few frames.
  const [map, bar] = await Promise.all([
    awaitMessage<MapDescriptor>(room, "map", 5000),
    awaitMessage<{ slots: SkillSlot[] }>(room, "skill-bar", 5000),
  ]);

  return {
    selfSessionId: room.sessionId,
    map,
    skillBar: bar.slots,
    sendIntent(intent: ClientIntent): void {
      room.send("intent", intent);
    },
    getSnapshot(): MatchSnapshot {
      return snapshotFrom(room);
    },
    onCombat(handler: (message: CombatMessage) => void): void {
      room.onMessage("combat", handler);
    },
    async disconnect(): Promise<void> {
      await room.leave();
    },
  };
}

export type { ServerHello };
