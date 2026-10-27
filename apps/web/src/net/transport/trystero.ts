/**
 * A `Transport` over Trystero (#15, #392): WebRTC between browsers, found
 * through public Nostr relays. The only file that imports Trystero; lint
 * holds every other file to `Transport`.
 *
 * Trystero gives each action, and each room event, one handler slot. The
 * adapter owns every slot and fans out to its own handler sets, so any
 * number of listeners can come and go.
 *
 * It says what keeps a join from working (#707): `peer-unreachable` when
 * Trystero found a peer and exchanged SDP but never connected, and
 * `no-relay` when, `RELAY_CHECK_MS` in and with nobody met, not one
 * relay socket is open.
 *
 * A TURN relay the player saved (#972) goes to Trystero as `turnConfig`.
 */
import { CHANNELS, normalizeLobbyCode } from "@vibewars/game-protocol";
import type { Channel } from "@vibewars/game-protocol";
import type { Transport } from "@vibewars/game-session";
import { getRelaySockets, joinRoom, selfId } from "trystero/nostr";
import type { DataPayload, MessageAction } from "trystero/nostr";

import { HandlerSets } from "./handler-sets.js";
import { oversizedCheck } from "./oversized.js";
import { loadTurnConfig, type TurnConfig } from "./turn-config.js";
import {
  APP_ID,
  MAX_RECEIVE_BYTES,
  NOSTR_RELAYS,
  RELAY_CHECK_MS,
  RELAY_REDUNDANCY,
} from "./relays.js";

/** What the adapter takes from Trystero; the unit test hands in fakes. */
export interface TrysteroDeps {
  readonly joinRoom: typeof joinRoom;
  readonly selfId: string;
  /** Every relay's socket, by URL. */
  readonly relaySockets: () => Readonly<Record<string, { readonly readyState: number }>>;
  /** The player's own TURN relay (#972), if they saved one. */
  readonly turnConfig: () => TurnConfig | undefined;
}

/** Trystero itself. `getRelaySockets` is untyped there; this is its shape. */
const TRYSTERO: TrysteroDeps = {
  joinRoom,
  selfId,
  relaySockets: getRelaySockets as TrysteroDeps["relaySockets"],
  turnConfig: () => loadTurnConfig(),
};

/** Trystero's `onJoinError` text when SDP went both ways and no connection came of it. */
const SDP_EXCHANGED = "after exchanging SDP";

/** `WebSocket.OPEN`, which a fake socket in the unit test does not carry. */
const SOCKET_OPEN = 1;

/** Join the room for lobby code `code`. `deps` is for the unit test; the app passes nothing. */
export function joinTrysteroRoom(code: string, deps: TrysteroDeps = TRYSTERO): Transport {
  const roomId = normalizeLobbyCode(code);
  const handlers = new HandlerSets();
  // Read at join, so a relay saved in Options counts from the next lobby.
  // Added to Trystero's STUN, not instead: ICE still prefers a direct path.
  const turn = deps.turnConfig();
  const room = deps.joinRoom(
    {
      appId: APP_ID,
      password: roomId,
      relayConfig: { urls: [...NOSTR_RELAYS], redundancy: RELAY_REDUNDANCY },
      maxReceiveBytes: MAX_RECEIVE_BYTES,
      ...(turn === undefined
        ? {}
        : {
            turnConfig: [
              { urls: [...turn.urls], username: turn.username, credential: turn.credential },
            ],
          }),
    },
    roomId,
    {
      // No retry: a joiner that reaches nobody is caught by its own
      // connect timeout, and told it couldn't reach the host (#15).
      onJoinError: (details) => {
        console.warn("trystero transport: could not join", details.error);
        // Only this one: a wrong password cannot come from a typo, since
        // the code is the room and the password both.
        if (details.error.includes(SDP_EXCHANGED)) {
          handlers.trouble("peer-unreachable");
        }
      },
    },
  );
  let met = false;
  const relayCheck = setTimeout(() => {
    const open = Object.values(deps.relaySockets()).some(
      (socket) => socket.readyState === SOCKET_OPEN,
    );
    if (!met && !open) {
      handlers.trouble("no-relay");
    }
  }, RELAY_CHECK_MS);
  const oversized = oversizedCheck("trystero transport");

  // Every action up front: one made lazily would miss what arrived first.
  const actions = new Map<Channel, MessageAction>();
  for (const channel of CHANNELS) {
    const action = room.makeAction(channel);
    action.onMessage = (data, context) => {
      if (!oversized(data, context.peerId)) {
        handlers.message(channel, data, context.peerId);
      }
    };
    actions.set(channel, action);
  }
  room.onPeerJoin = (peerId) => {
    met = true;
    handlers.joined(peerId);
  };
  room.onPeerLeave = (peerId) => {
    handlers.left(peerId);
  };

  return {
    selfId: deps.selfId,
    send(channel, data, to) {
      // `Json<T>` is plain JSON by construction; Trystero's own type is an
      // index signature, which no interface satisfies.
      const payload = data as DataPayload;
      const warn = (error: unknown) => {
        console.warn("trystero transport: could not send", channel, "to", to ?? "all", error);
      };
      try {
        actions
          .get(channel)
          ?.send(payload, { target: to ?? null })
          .catch(warn);
      } catch (error) {
        warn(error);
      }
    },
    on: (channel, handler) => handlers.on(channel, handler),
    onPeerJoin: (handler) => handlers.onPeerJoin(handler),
    onPeerLeave: (handler) => handlers.onPeerLeave(handler),
    onTrouble: (handler) => handlers.onTrouble(handler),
    async leave() {
      clearTimeout(relayCheck);
      handlers.clear();
      await room.leave();
    },
  };
}
