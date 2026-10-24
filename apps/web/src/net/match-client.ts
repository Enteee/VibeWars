import { Client, type Room } from "@colyseus/sdk";
import type { PlayerBuild } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  ROOM_MATCH,
  type CastRefusedMessage,
  type ClientIntent,
  type MapDescriptor,
  type MatchJoinOptions,
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
  /** Base armor including the off-hand, before statuses. */
  readonly armor: number;
  /** Equipped weapon class id, or `undefined` if the server sent none. */
  readonly weaponId: string | undefined;
  readonly team: number;
  readonly dead: boolean;
  readonly castingSkillId: string | undefined;
  readonly castRemaining: number;
  readonly statuses: readonly string[];
}

export interface MatchSnapshot {
  readonly selfSessionId: string;
  readonly players: readonly PlayerSnapshot[];
  readonly scoreTeam0: number;
  readonly scoreTeam1: number;
  readonly elapsedSeconds: number;
  /** "active" or "finished". */
  readonly phase: string;
  /** The winning team, or `undefined` while active or on a draw. */
  readonly winningTeam: number | undefined;
  /** "score", "time", or `undefined` while active. */
  readonly endReason: string | undefined;
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
  /** Notifies when the connection drops and when it comes back. */
  onConnectionChange(handler: (state: "online" | "reconnecting" | "lost") => void): void;
  /** The match's static geometry, received once on join (brief §19). */
  readonly map: MapDescriptor;
  /** The server-assigned skill bar, received once on join. */
  readonly skillBar: readonly SkillSlot[];
  sendIntent(intent: ClientIntent): void;
  getSnapshot(): MatchSnapshot;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** Why the server refused one of this player's casts, sent to them alone. */
  onCastRefused(handler: (message: CastRefusedMessage) => void): void;
  disconnect(): Promise<void>;
}

/** Build the Colyseus endpoint from the page's own origin, over the right protocol. */
export function endpointFromLocation(location: Pick<Location, "protocol" | "host">): string {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${location.host}`;
}

/**
 * Where the game server lives.
 *
 * Normally the page's own origin: in production the server serves the
 * client, so they are the same host and nothing needs configuring.
 *
 * During `pnpm run dev` they are *not* the same host — Vite serves the
 * client on 5173 with hot reload while the game server runs on 2567 —
 * so `VITE_VIBEWARS_SERVER` points the client at the real server. The
 * override is read from Vite's compile-time env, so it is baked in at
 * build time and a production bundle simply has no override to find.
 */
export function resolveEndpoint(
  location: Pick<Location, "protocol" | "host">,
  override: string | undefined = import.meta.env.VITE_VIBEWARS_SERVER,
): string {
  const trimmed = override?.trim();
  return trimmed === undefined || trimmed === "" ? endpointFromLocation(location) : trimmed;
}

/**
 * The same server, addressed over HTTP instead of WebSocket.
 *
 * The REST endpoints (`/api/maps`) have to reach the *server*, not the
 * page's origin. In production those are the same thing and a relative
 * URL would do; in dev they are not, and a relative URL quietly hits
 * Vite and 404s. Deriving both from one resolved endpoint means there is
 * a single answer to "where is the server".
 */
export function httpOriginFrom(endpoint: string): string {
  return endpoint.replace(/^ws/, "http");
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
  readonly armor: number;
  readonly weaponId: string;
  readonly team: number;
  readonly dead: boolean;
  readonly castingSkillId: string;
  readonly castRemaining: number;
  readonly statuses: Iterable<string>;
}
interface DecodedMatchState {
  readonly players: ReadonlyMap<string, DecodedPlayer> | Map<string, DecodedPlayer>;
  readonly scoreTeam0: number;
  readonly scoreTeam1: number;
  readonly elapsedSeconds: number;
  readonly phase: string;
  readonly winningTeam: number;
  readonly endReason: string;
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
      armor: player.armor,
      weaponId: player.weaponId === "" ? undefined : player.weaponId,
      team: player.team,
      dead: player.dead,
      castingSkillId: player.castingSkillId === "" ? undefined : player.castingSkillId,
      castRemaining: player.castRemaining,
      statuses: [...player.statuses],
    });
  }
  return {
    selfSessionId: room.sessionId,
    players,
    scoreTeam0: room.state.scoreTeam0,
    scoreTeam1: room.state.scoreTeam1,
    elapsedSeconds: room.state.elapsedSeconds,
    phase: room.state.phase,
    // -1 is the wire's "no winner"; the UI should not have to know that.
    winningTeam: room.state.winningTeam < 0 ? undefined : room.state.winningTeam,
    endReason: room.state.endReason === "" ? undefined : room.state.endReason,
  };
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

export async function connectToMatch(
  endpoint: string,
  mapId?: string,
  build?: PlayerBuild,
): Promise<MatchConnection> {
  const client = new Client(endpoint);
  // The map id travels as a join option so the first client into a room
  // decides the arena; later joiners land in the room that already exists.
  //
  // The build travels the same way, but it is only a *request*: the
  // server validates it and silently falls back to its house loadout if
  // it is illegal (brief '32). Nothing here may assume it was honoured.
  const joinOptions: MatchJoinOptions = {
    protocolVersion: PROTOCOL_VERSION,
    ...(mapId === undefined ? {} : { mapId }),
    ...(build === undefined ? {} : { build }),
  };
  const room = await client.joinOrCreate<DecodedMatchState>(ROOM_MATCH, joinOptions);

  // Both arrive on join; waiting for them here means the caller gets a
  // fully-usable connection rather than one that is missing its map or
  // skill bar for the first few frames.
  const [map, bar] = await Promise.all([
    awaitMessage<MapDescriptor>(room, "map", 5000),
    awaitMessage<{ slots: SkillSlot[] }>(room, "skill-bar", 5000),
  ]);

  // A dropped connection is retried automatically: the server holds the
  // player's slot for a window (see the match room's onLeave), so the
  // right behaviour on a wifi blip is to walk back in, not to dump the
  // player back to the menu having lost the match.
  let notifyConnection: (state: "online" | "reconnecting" | "lost") => void = () => {
    /* no handler yet */
  };

  room.onLeave((code) => {
    if (code === 4000) {
      // A deliberate leave; nothing to recover.
      return;
    }
    notifyConnection("reconnecting");
    void (async () => {
      const token = room.reconnectionToken;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 + attempt * 500));
        try {
          await client.reconnect(token);
          notifyConnection("online");
          return;
        } catch {
          // Keep trying until the server's window closes.
        }
      }
      notifyConnection("lost");
    })();
  });

  return {
    selfSessionId: room.sessionId,
    map,
    skillBar: bar.slots,
    onConnectionChange(handler) {
      notifyConnection = handler;
    },
    sendIntent(intent: ClientIntent): void {
      room.send("intent", intent);
    },
    getSnapshot(): MatchSnapshot {
      return snapshotFrom(room);
    },
    onCombat(handler: (message: CombatMessage) => void): void {
      room.onMessage("combat", handler);
    },
    onCastRefused(handler: (message: CastRefusedMessage) => void): void {
      room.onMessage("cast-refused", handler);
    },
    async disconnect(): Promise<void> {
      await room.leave();
    },
  };
}

export type { ServerHello };
