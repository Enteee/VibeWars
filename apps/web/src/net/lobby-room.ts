/**
 * A coded lobby's host in its room only while it must be (#1682,
 * ADR-0043 "Open and closed"): open, or closed with guests to keep. A
 * closed lobby with nobody in it is in no room, so the relays see
 * nothing of it at all.
 */
import type { Channel } from "@vibewars/game-protocol";
import type { LobbyReach, Transport } from "@vibewars/game-session";

import { HandlerSets } from "./transport/handler-sets.js";

/**
 * How long the host waits before it goes into its room, following the
 * last state: a held key or a double-click makes at most one join, so
 * the relays are not spammed with announcements.
 */
export const ATTACH_SETTLE_MS = 500;

/** Whether a lobby's host must be in its room: open, or with a guest it keeps. */
export function needsRoom(reach: LobbyReach): boolean {
  return reach.open || reach.guests > 0;
}

/** The lobby host's `Transport`, in its room or not as `follow` is told. */
export interface LobbyRoomLink extends Transport {
  /** Go into the room after the settle window, or leave it at once, as `reach` needs. */
  follow(reach: LobbyReach): void;
}

export interface LobbyRoomLinkOptions {
  /** The peer id `join` gives every room: the gate above signs with it. */
  readonly selfId: string;
  /** Join the lobby's room, derived once for the lobby's life: a join derives nothing. */
  readonly join: () => Transport;
  readonly settleMs?: number;
}

export function linkLobbyRoom(options: LobbyRoomLinkOptions): LobbyRoomLink {
  const { selfId, join, settleMs = ATTACH_SETTLE_MS } = options;
  const handlers = new HandlerSets();
  /** Every channel listened on: a room joined later hears them all. */
  const channels = new Set<Channel>();
  /** Peers the room said joined and has not said left. */
  const peers = new Set<string>();
  let room: { readonly transport: Transport; readonly offs: (() => void)[] } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let left = false;

  const listen = (transport: Transport, channel: Channel): (() => void) =>
    transport.on(channel, (data, from) => {
      handlers.message(channel, data, from);
    });

  const attach = (): void => {
    timer = undefined;
    if (left || room !== undefined) {
      return;
    }
    const transport = join();
    if (transport.selfId !== selfId) {
      throw new Error("a lobby's room changed its host's peer id");
    }
    room = {
      transport,
      offs: [
        ...[...channels].map((channel) => listen(transport, channel)),
        transport.onPeerJoin((peerId) => {
          peers.add(peerId);
          handlers.joined(peerId);
        }),
        transport.onPeerLeave((peerId) => {
          if (peers.delete(peerId)) {
            handlers.left(peerId);
          }
        }),
        transport.onTrouble((trouble) => {
          handlers.trouble(trouble);
        }),
      ],
    };
  };

  /** Out of the room: every peer in it is gone, as far as anything above knows. */
  const detach = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (room === undefined) {
      return Promise.resolve();
    }
    const { transport, offs } = room;
    room = undefined;
    for (const off of offs) {
      off();
    }
    for (const peerId of [...peers]) {
      peers.delete(peerId);
      handlers.left(peerId);
    }
    return transport.leave();
  };

  return {
    selfId,
    follow(reach) {
      if (left) {
        return;
      }
      if (!needsRoom(reach)) {
        void detach();
      } else if (room === undefined && timer === undefined) {
        timer = setTimeout(attach, settleMs);
      }
    },
    send(channel, data, to) {
      room?.transport.send(channel, data, to);
    },
    on(channel, handler) {
      if (!channels.has(channel)) {
        channels.add(channel);
        room?.offs.push(listen(room.transport, channel));
      }
      return handlers.on(channel, handler);
    },
    onPeerJoin: (handler) => handlers.onPeerJoin(handler),
    onPeerLeave: (handler) => handlers.onPeerLeave(handler),
    onTrouble: (handler) => handlers.onTrouble(handler),
    async leave() {
      left = true;
      await detach();
      handlers.clear();
    },
  };
}
