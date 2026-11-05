/**
 * A joiner's room that falls back on the relay its lobby's host shares
 * (#2091, ADR-0049). It joins at once without one, so a direct path is
 * never delayed. Once an offer has opened, it is `RELAY_REJOIN_MS` since
 * the join and the host is still unreached, it leaves the room and joins
 * again through the offered relay: once. A relayed joiner whose host drops
 * joins again with the newest offer it holds, since coturn ends a relayed
 * peer's allocation when its credential expires (#1764). Between maps, a
 * relayed joiner whose login is running out moves onto a newer offer in
 * place, keeping its seat (#2245).
 */
import type { Channel } from "@vibewars/game-protocol";
import type { Transport } from "@vibewars/game-session";

import { HandlerSets } from "./transport/handler-sets.js";
import type { RelayOffers } from "./transport/relay-offer.js";
import type { TrysteroTransport } from "./transport/trystero.js";
import { credentialExpiry, type TurnConfig } from "./transport/turn-config.js";

/** How long a joiner waits for the host directly before it takes an offer. */
export const RELAY_REJOIN_MS = 5_000;

/**
 * A relayed joiner moves onto a newer offer once its login has this
 * little left (#2245): more than the longest map, a Guild Battle's 28 min,
 * so it never has to mid-map.
 */
export const RELAY_REFRESH_LEFT_MS = 60 * 60 * 1000;

/** A joiner's `Transport`, told when the host has answered. */
export interface RelayJoin extends Transport {
  /** The host answered from `hostId`: no first rejoin, and its drop is watched. */
  reached(hostId: string): void;
  /**
   * In the lobby, not a map (#2245): if this joiner came in through an
   * offer, its login has under `RELAY_REFRESH_LEFT_MS` left at `nowMs` and
   * a newer offer is held, move the host's connection onto that one.
   */
  refreshRelay(nowMs: number): void;
}

export interface RelayJoinOptions {
  /** The peer id `join` gives every room. */
  readonly selfId: string;
  /** Join the lobby's room, through `turn` when given. */
  readonly join: (turn: TurnConfig | undefined) => TrysteroTransport;
  /** The lobby's offers; closed with the room. */
  readonly offers: RelayOffers;
  /** The player's own relay from Options: it wins, so an offer never rejoins. */
  readonly ownRelay: boolean;
  readonly rejoinMs?: number;
}

export function joinWithRelayOffers(options: RelayJoinOptions): RelayJoin {
  const { selfId, join, offers, ownRelay, rejoinMs = RELAY_REJOIN_MS } = options;
  const handlers = new HandlerSets();
  /** Every channel listened on: a room joined later hears them all. */
  const channels = new Set<Channel>();
  /** Peers the room said joined and has not said left. */
  const peers = new Set<string>();
  let room: { readonly transport: TrysteroTransport; readonly offs: (() => void)[] } | undefined;
  /** The relay the room was joined through, once it has been. */
  let joinedWith: TurnConfig | undefined;
  /** The login the host's connection relays with now: `joinedWith`, or a newer one swapped in. */
  let relayedWith: TurnConfig | undefined;
  let hostId: string | undefined;
  let waited = false;
  let swapping = false;
  let left = false;

  const listen = (transport: Transport, channel: Channel): (() => void) =>
    transport.on(channel, (data, from) => {
      handlers.message(channel, data, from);
    });

  const attach = (turn: TurnConfig | undefined): void => {
    const transport = join(turn);
    if (transport.selfId !== selfId) {
      throw new Error("a lobby's room changed its joiner's peer id");
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
          if (!peers.delete(peerId)) {
            return;
          }
          handlers.left(peerId);
          // A swapped-in login the drop came after still rejoins: the room
          // itself was joined with the older one.
          if (peerId === hostId && joinedWith !== undefined) {
            const newest = offers.latest();
            if (newest !== undefined && newest.username !== joinedWith.username) {
              void rejoin(newest);
            }
          }
        }),
        transport.onTrouble((trouble) => {
          handlers.trouble(trouble);
        }),
      ],
    };
  };

  /** Out of the room, awaited, so Trystero's room cache is clear for the next join. */
  const detach = async (): Promise<void> => {
    if (room === undefined) {
      return;
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
    await transport.leave();
  };

  /**
   * Leave and join again through `turn`. Never rejects: a leave or a join
   * that fails leaves no room, which the player hears as the host being
   * unreachable.
   */
  const rejoin = async (turn: TurnConfig): Promise<void> => {
    swapping = true;
    joinedWith = turn;
    relayedWith = turn;
    try {
      await detach();
      if (!left) {
        attach(turn);
      }
    } catch {
      room = undefined;
      handlers.trouble("peer-unreachable");
    } finally {
      swapping = false;
    }
  };

  // Checked whenever an offer opens or the wait ends: an offer at 12 s
  // still counts, once.
  const check = (): void => {
    if (left || ownRelay || !waited || hostId !== undefined || relayedWith !== undefined) {
      return;
    }
    const offered = offers.latest();
    if (offered !== undefined && !swapping) {
      void rejoin(offered);
    }
  };

  attach(undefined);
  const timer = setTimeout(() => {
    waited = true;
    check();
  }, rejoinMs);
  const stopHearing = offers.onOffer(check);

  return {
    selfId,
    reached(id) {
      hostId = id;
    },
    refreshRelay(nowMs) {
      // Direct, or through the player's own relay: nothing to refresh.
      if (
        left ||
        swapping ||
        room === undefined ||
        hostId === undefined ||
        relayedWith === undefined
      ) {
        return;
      }
      const expiry = credentialExpiry(relayedWith);
      if (expiry === undefined || expiry - nowMs >= RELAY_REFRESH_LEFT_MS) {
        return;
      }
      const newest = offers.latest();
      const newestExpiry = newest === undefined ? undefined : credentialExpiry(newest);
      if (
        newest === undefined ||
        newestExpiry === undefined ||
        newest.username === relayedWith.username ||
        newestExpiry <= expiry
      ) {
        return;
      }
      room.transport.swapIceServers(hostId, newest);
      relayedWith = newest;
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
      clearTimeout(timer);
      stopHearing();
      offers.close();
      await detach();
      handlers.clear();
    },
  };
}
