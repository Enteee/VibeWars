import type { LobbyRoom, Transport } from "@vibewars/game-session";

import { checkNat } from "../nat-check.js";
import { joinWithRelayOffers } from "../relay-join.js";
import { relaySibling, withSiblingRoom } from "../relay-room.js";

import { BROADCAST_SELF_ID, joinBroadcastRoom } from "./broadcast-channel.js";
import { joinBroadcastQueue } from "./broadcast-queue.js";
import { createNostrQueue, type NostrQueue } from "./nostr-queue.js";
import {
  followOfferedRelay,
  watchRelayOffers,
  type OfferedRelaySource,
  type RelayShare,
} from "./relay-offer.js";
import { TRYSTERO_SELF_ID, joinTrysteroRoom } from "./trystero.js";
import { loadOfferedRelay, loadRelay, onRelaySharingChange } from "./turn-config.js";

/**
 * Join `room` (#403), derived from a lobby key or a queue room's name
 * (#1681): the one place a transport is chosen.
 *
 * `VITE_VIBEWARS_TRANSPORT` is `broadcast` only in the build e2e runs
 * against, whose pages share one browser; every other build plays over
 * Trystero. A capability switch for one kind of build, as `ONLINE_PLAY`
 * was, not a compatibility path. `vite.config.ts` refuses any other value.
 */
export function joinRoom(room: LobbyRoom): Transport {
  return import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast"
    ? joinBroadcastRoom(room, BROADCAST_SELF_ID)
    : joinTrysteroRoom(room);
}

/** This page's peer id in every room `joinRoom` joins (#1682), on the same switch. */
export function roomSelfId(): string {
  return import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast"
    ? BROADCAST_SELF_ID
    : TRYSTERO_SELF_ID;
}

/**
 * Open the Random Arena queue board (#880): the one place a board is
 * chosen, on the same switch as `joinRoom`. The queue client's ticket keys
 * must come from the board it gets, since the Nostr board signs only with
 * keys it made.
 */
export function joinQueueBoard(): NostrQueue {
  return import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast"
    ? joinBroadcastQueue()
    : createNostrQueue();
}

/**
 * Whether this page's NAT is hard (#2090), on the same switch: pages
 * that share one browser reach each other whatever their NAT, so the
 * broadcast build never asks a STUN server.
 */
export function checkTransportNat(): Promise<boolean> {
  return import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast"
    ? Promise.resolve(false)
    : checkNat();
}

/** A guest's room, and how it is told the host answered. */
export interface GuestRoom {
  readonly transport: Transport;
  reached(hostId: string): void;
}

/**
 * Join a coded lobby's room as a guest (#2091): through the relay its host
 * offers when the host cannot be reached directly, on the same switch.
 * The broadcast build's pages reach each other without one.
 */
export function joinGuestRoom(room: LobbyRoom): GuestRoom {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return { transport: joinRoom(room), reached: () => undefined };
  }
  const transport = joinWithRelayOffers({
    selfId: TRYSTERO_SELF_ID,
    // Through a relay, into the sibling room the sharing host also sits in.
    join: (turn) =>
      turn === undefined ? joinTrysteroRoom(room) : joinTrysteroRoom(relaySibling(room), turn),
    offers: watchRelayOffers(room.relay),
    ownRelay: loadRelay() !== undefined,
  });
  return {
    transport,
    reached: (hostId) => {
      transport.reached(hostId);
    },
  };
}

/** What this player's lobbies offer, as Options has it now. */
const OFFERED_RELAY: OfferedRelaySource = {
  load: () => loadOfferedRelay(),
  onChange: onRelaySharingChange,
};

/**
 * Join a coded lobby's room as its host (#2091): with the sibling room
 * its relayed joiners come into, while it offers a relay. A room that
 * never shares, and the broadcast build, have no sibling.
 */
export function joinHostRoom(room: LobbyRoom): Transport {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return joinRoom(room);
  }
  return withSiblingRoom({
    main: joinTrysteroRoom(room),
    joinSibling: () => joinTrysteroRoom(relaySibling(room)),
    offering: OFFERED_RELAY,
  });
}

/**
 * Offer the host's shared relay to its lobby `room` (#2091) whenever it
 * has one and sharing is on, following Options while the lobby is open;
 * `undefined` for a room that never shares, and always on the broadcast
 * build, which has no Nostr relays to offer it over.
 */
export function shareLobbyRelay(room: LobbyRoom): RelayShare | undefined {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return undefined;
  }
  return followOfferedRelay(room.relay, OFFERED_RELAY);
}
