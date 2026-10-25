/**
 * A `Transport` over Trystero (#15, #392): WebRTC between browsers, found
 * through public Nostr relays. The only file that imports Trystero; lint
 * holds every other file to `Transport`.
 *
 * Trystero gives each action, and each room event, one handler slot. The
 * adapter owns every slot and fans out to its own handler sets, so any
 * number of listeners can come and go.
 */
import { CHANNELS, normalizeLobbyCode } from "@vibewars/game-protocol";
import type { Channel } from "@vibewars/game-protocol";
import type { Transport } from "@vibewars/game-session";
import { joinRoom, selfId } from "trystero/nostr";
import type { DataPayload, MessageAction } from "trystero/nostr";

import { HandlerSets } from "./handler-sets.js";
import { APP_ID, MAX_RECEIVE_BYTES, NOSTR_RELAYS, RELAY_REDUNDANCY } from "./relays.js";

/** Join the room for lobby code `code`. `deps` is for the unit test; the app passes nothing. */
export function joinTrysteroRoom(
  code: string,
  deps: { joinRoom: typeof joinRoom; selfId: string } = { joinRoom, selfId },
): Transport {
  const roomId = normalizeLobbyCode(code);
  const room = deps.joinRoom(
    {
      appId: APP_ID,
      password: roomId,
      relayConfig: { urls: [...NOSTR_RELAYS], redundancy: RELAY_REDUNDANCY },
      maxReceiveBytes: MAX_RECEIVE_BYTES,
    },
    roomId,
    {
      // No retry: a joiner that reaches nobody is caught by its own
      // connect timeout, and told it couldn't reach the host (#15).
      onJoinError: (details) => {
        console.warn("trystero transport: could not join", details.error);
      },
    },
  );
  const handlers = new HandlerSets();

  // Every action up front: one made lazily would miss what arrived first.
  const actions = new Map<Channel, MessageAction>();
  for (const channel of CHANNELS) {
    const action = room.makeAction(channel);
    action.onMessage = (data, context) => {
      handlers.message(channel, data, context.peerId);
    };
    actions.set(channel, action);
  }
  room.onPeerJoin = (peerId) => {
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
    async leave() {
      handlers.clear();
      await room.leave();
    },
  };
}
