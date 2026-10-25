import { Client, type Room } from "@colyseus/sdk";
import type { PlayerBuild } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  ROOM_MATCH,
  type CastRefusedMessage,
  type ClientIntent,
  type MapDescriptor,
  type MatchJoinOptions,
  type MatchSeatReservation,
  type RechargeMessage,
  type RechargeSlot,
  type ServerHello,
} from "@vibewars/game-protocol";

import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  PlayerSnapshot,
  SkillSlot,
  SlotRecharge,
} from "./match-connection.js";
import { extrapolateRecharges } from "./recharge-clock.js";

/**
 * Thin wrapper around the Colyseus browser SDK for the match room.
 *
 * This module is the *only* place in `apps/web` allowed to import
 * `@colyseus/sdk` — everything else (the renderer, the input handler) talks
 * to the plain snapshot/intent interface in `match-connection.ts`, so the
 * networking layer can change without touching rendering code (ADR-0001).
 */

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
export interface DecodedPlayer {
  readonly sessionId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly facing: number;
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
  readonly castTotal: number;
  readonly statuses: Iterable<string>;
}
export interface DecodedMatchState {
  readonly players: ReadonlyMap<string, DecodedPlayer> | Map<string, DecodedPlayer>;
  readonly scoreTeam0: number;
  readonly scoreTeam1: number;
  readonly elapsedSeconds: number;
  readonly phase: string;
  readonly winningTeam: number;
  readonly endReason: string;
}

function snapshotFrom(room: LiveMatchRoom): MatchSnapshot {
  const players: PlayerSnapshot[] = [];
  for (const player of room.state.players.values()) {
    players.push({
      sessionId: player.sessionId,
      name: player.name,
      x: player.x,
      y: player.y,
      facing: player.facing,
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
      castTotal: player.castTotal,
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

/**
 * Which match to enter: any Quick Match room with space, or the seat a
 * lobby reserved for this player in its own match (#41).
 */
export type MatchTarget =
  | {
      readonly kind: "quick";
      readonly mapId?: string | undefined;
      /** The display name to ask for; the server sanitises it. */
      readonly name?: string | undefined;
    }
  | { readonly kind: "lobby"; readonly reservation: MatchSeatReservation };

export async function connectToMatch(
  endpoint: string,
  target: MatchTarget,
  build?: PlayerBuild,
): Promise<MatchConnection> {
  const client = new Client(endpoint);
  let room: Room<unknown, DecodedMatchState>;
  if (target.kind === "lobby") {
    // The lobby reserved this seat with the build the player joined it
    // with, so there is nothing left to send.
    room = await client.consumeSeatReservation<DecodedMatchState>(target.reservation);
  } else {
    // The build is only a *request*: the server validates it and silently
    // falls back to its house loadout if it is illegal (brief §32).
    // Nothing here may assume it was honoured.
    //
    // The map id travels as a join option so the first client into a room
    // decides the arena; later joiners land in the room that already exists.
    const joinOptions: MatchJoinOptions = {
      protocolVersion: PROTOCOL_VERSION,
      ...(target.mapId === undefined ? {} : { mapId: target.mapId }),
      ...(build === undefined ? {} : { build }),
      ...(target.name === undefined ? {} : { name: target.name }),
    };
    room = await client.joinOrCreate<DecodedMatchState>(ROOM_MATCH, joinOptions);
  }

  // Sent on join, right behind the skill bar, so listen before awaiting
  // anything: a message with no listener yet is dropped.
  let recharges: { slots: readonly RechargeSlot[]; at: number } = {
    slots: [],
    at: performance.now(),
  };
  room.onMessage("recharge", (message: RechargeMessage) => {
    recharges = { slots: message.slots, at: performance.now() };
  });

  // Both arrive on join; waiting for them here means the caller gets a
  // fully-usable connection rather than one that is missing its map or
  // skill bar for the first few frames.
  const [map, bar] = await Promise.all([
    awaitMessage<MapDescriptor>(room, "map", 5000),
    awaitMessage<{ slots: SkillSlot[] }>(room, "skill-bar", 5000),
  ]);

  return createMatchConnection(room, map, bar.slots, () =>
    extrapolateRecharges(
      recharges.slots,
      bar.slots.length,
      (performance.now() - recharges.at) / 1000,
    ),
  );
}

/**
 * The few members of a Colyseus `Room` a match connection uses, so the
 * wiring below can be tested against a fake room without a socket.
 */
export interface LiveMatchRoom {
  readonly sessionId: string;
  readonly state: DecodedMatchState;
  readonly reconnection: { minUptime: number };
  send(type: "intent", payload: ClientIntent): void;
  onMessage(type: "combat", callback: (message: CombatMessage) => void): unknown;
  onMessage(type: "cast-refused", callback: (message: CastRefusedMessage) => void): unknown;
  onDrop(callback: (code: number) => void): unknown;
  onReconnect(callback: () => void): unknown;
  onLeave(callback: (code: number) => void): unknown;
  leave(): Promise<unknown>;
}

/** Colyseus' close code for a leave the player asked for. */
const CONSENTED_LEAVE = 4000;

export function createMatchConnection(
  room: LiveMatchRoom,
  map: MapDescriptor,
  skillBar: readonly SkillSlot[],
  getRecharges: () => readonly SlotRecharge[],
): MatchConnection {
  // A dropped connection is retried by the SDK itself, which reconnects
  // this same room in place: state, message handlers and `send` all keep
  // working afterwards (#181). The server holds the player's slot for a
  // window (see the match room's onLeave), so the right behaviour on a
  // wifi blip is to walk back in, not to dump the player back to the menu
  // having lost the match. By default the SDK gives up on a room younger
  // than 5 s; a blip right after joining deserves the same retry.
  room.reconnection.minUptime = 0;

  let notifyConnection: (state: "online" | "reconnecting" | "lost") => void = () => {
    /* no handler yet */
  };

  room.onDrop(() => {
    notifyConnection("reconnecting");
  });
  room.onReconnect(() => {
    notifyConnection("online");
  });
  // Once the room has left, the SDK drops every listener, so a later
  // room.leave() would wait forever for a leave that already happened.
  let left = false;
  room.onLeave((code) => {
    left = true;
    // The SDK only reports a leave once it has stopped retrying.
    if (code !== CONSENTED_LEAVE) {
      notifyConnection("lost");
    }
  });

  return {
    selfSessionId: room.sessionId,
    map,
    skillBar,
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
    getRecharges,
    async disconnect(): Promise<void> {
      if (!left) {
        await room.leave();
      }
    },
  };
}

export type { ServerHello };
