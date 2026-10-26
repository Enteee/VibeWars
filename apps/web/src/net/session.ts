import { DEFAULT_MATCH_RULES, type PlayerBuild } from "@vibewars/game-core";
import {
  MAX_LOBBY_PLAYERS,
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  type JsonValue,
  type PeerHello,
} from "@vibewars/game-protocol";
import {
  LobbyNoAnswerError,
  LobbyRefusedError,
  MatchRefusedError,
  connectMatch,
  createLobbyHost,
  createMatchHost,
  generateLobbyCode,
  joinLobby,
  type LobbyConnection,
  type MatchPlan,
  type MatchStarting,
  type PeerMatchConnection,
} from "@vibewars/game-session";

import { arenaIds, hostMap } from "./maps.js";
import { startHostClock } from "./transport/host-clock.js";
import { joinRoom } from "./transport/index.js";

/**
 * The glue between the app shell and a peer-to-peer lobby (#15, #403):
 * host one in this tab, join one by its code, and play its match. The
 * shell sees a `LobbyConnection` either way; only `hostLobby` knows the
 * lobby is here.
 */

/** How long a joiner waits for the lobby host to answer. */
export const JOIN_TIMEOUT_MS = 10_000;
/** How long a seated player waits for the match host to let them in. */
const MATCH_TIMEOUT_MS = 10_000;

/** #15's wording: a wrong code and an unreachable host cannot be told apart. */
export const NO_ANSWER_MESSAGE =
  "No lobby answered that code. Check it; if it is right, your network may be blocking peer-to-peer connections.";
export const LOBBY_FULL_MESSAGE = "That lobby is full.";
export const HOST_CLOSED_MESSAGE = "The host closed the lobby.";

/** A lobby hosted in this tab, and how to end it for everyone. */
export interface HostedLobby {
  readonly lobby: LobbyConnection;
  close(): Promise<void>;
}

/** In [0, 1), from `crypto`: a rejoin token is only as good as its randomness. */
function secureRandom(): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value / 2 ** 32;
}

/** Build the match the lobby planned, on its map. Throws for a map it does not have. */
function startMatch(plan: MatchPlan) {
  const map = hostMap(plan.mapId);
  if (map === undefined) {
    throw new Error(`no arena named ${JSON.stringify(plan.mapId)}`);
  }
  return createMatchHost({
    transport: plan.transport,
    map,
    // A match is reproducible from its seed; the lobby's match id is
    // unique only within the lobby, so the code goes in too.
    seed: `${plan.transport.selfId}:${plan.matchId}`,
    matchRules: DEFAULT_MATCH_RULES,
    random: secureRandom,
    maxPlayers: MAX_LOBBY_PLAYERS,
    seats: plan.seats,
  });
}

/**
 * Host a lobby in this tab: a fresh code, its room, the lobby host on it,
 * and this player joined to it as one more peer.
 *
 * One clock runs the whole lobby, from now until `close()`: the lobby's
 * message budget counts on it, and its match runs on it.
 */
export async function hostLobby(name: string): Promise<HostedLobby> {
  // Best effort: a page going away tells its guests, rather than leaving
  // them to wait out a dropped host's reconnect window (#515). Added
  // before the room exists, so it runs before a transport's own pagehide
  // leave, while there is still a room to say it in.
  const onPageHide = (): void => {
    void close();
  };
  window.addEventListener("pagehide", onPageHide);
  const code = generateLobbyCode(secureRandom);
  const room = joinRoom(code);
  const host = createLobbyHost({ transport: room, code, mapIds: arenaIds(), startMatch });
  const stopClock = startHostClock((seconds) => {
    host.advance(seconds);
  });
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    window.removeEventListener("pagehide", onPageHide);
    stopClock();
    await host.close();
  };
  try {
    const lobby = await joinLobby({
      transport: host.local,
      code,
      name,
      timeoutMs: JOIN_TIMEOUT_MS,
    });
    return { lobby, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/** Join the lobby `code` names, hosted on another peer's browser. */
export async function joinLobbyByCode(code: string, name: string): Promise<LobbyConnection> {
  const room = joinRoom(code);
  try {
    return await joinLobby({ transport: room, code, name, timeoutMs: JOIN_TIMEOUT_MS });
  } catch (error) {
    await room.leave();
    throw error;
  }
}

/** What the menu says when hosting or joining failed with `error`. */
export function joinFailureNotice(error: unknown): string {
  if (error instanceof LobbyNoAnswerError) {
    return NO_ANSWER_MESSAGE;
  }
  if (error instanceof LobbyRefusedError) {
    switch (error.reason) {
      case "protocol-mismatch":
        return PROTOCOL_MISMATCH_MESSAGE;
      case "lobby-full":
        return LOBBY_FULL_MESSAGE;
      case "host-left":
        return HOST_CLOSED_MESSAGE;
    }
  }
  return "Could not join the lobby.";
}

/** What the player is told when the match would not let them in. */
export function matchFailureNotice(error: unknown): string | undefined {
  if (error instanceof MatchRefusedError) {
    return error.message;
  }
  return undefined;
}

/**
 * `build` as the plain JSON a `hello` carries: an absent secondary
 * profession is dropped, which the host's parser reads as none.
 */
function wireBuild(build: PlayerBuild | undefined): JsonValue {
  return build === undefined ? null : (JSON.parse(JSON.stringify(build)) as JsonValue);
}

/** Play the lobby's match `start` announced, as `name` with `build`. */
export function connectMatchFor(
  lobby: LobbyConnection,
  start: MatchStarting,
  name: string,
  build: PlayerBuild | undefined,
): Promise<PeerMatchConnection> {
  const hello: PeerHello = {
    protocolVersion: PROTOCOL_VERSION,
    name,
    build: wireBuild(build),
    rejoin: null,
  };
  return connectMatch({
    transport: start.transport,
    hostId: lobby.getSnapshot().hostId,
    hello,
    timeoutMs: MATCH_TIMEOUT_MS,
  });
}
