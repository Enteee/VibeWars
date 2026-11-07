import type { WireRelayLogin } from "@vibewars/game-protocol";
import type { LobbyRoom, MatchRecord, Transport } from "@vibewars/game-session";

import { checkNat } from "../nat-check.js";
import { joinWithRelayOffers } from "../relay-join.js";
import { relaySibling, withSiblingRoom, type RelayRoomsSource } from "../relay-room.js";

import { BROADCAST_SELF_ID, joinBroadcastRoom } from "./broadcast-channel.js";
import { joinBroadcastQueue } from "./broadcast-queue.js";
import {
  publishMatchRecord,
  watchMatchRecords,
  type MatchRecordWatch,
  type MatchRecordWatchHandlers,
} from "./match-records.js";
import { createNostrQueue, type NostrQueue } from "./nostr-queue.js";
import {
  holdRelay,
  watchRelayAsks,
  watchRelayOffers,
  type OfferedRelaySource,
  type RelayAsks,
  type RelayHold,
} from "./relay-offer.js";
import { TRYSTERO_SELF_ID, joinTrysteroRoom } from "./trystero.js";
import {
  loadOfferedRelay,
  loadRelay,
  onRelaySharingChange,
  validateTurnConfig,
} from "./turn-config.js";

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

/** A guest's room, how it is told the host answered, the relay login the host shares, and its refresh. */
export interface GuestRoom {
  readonly transport: Transport;
  reached(hostId: string): void;
  /** The host's `relay-login` (#2248): from then on, it asks no more over Nostr. */
  fromHost(login: WireRelayLogin | null): void;
  /** Called in the lobby, never in a map (#2245): see `RelayJoin.refreshRelay`. */
  refreshRelay(nowMs: number): void;
}

/**
 * Join a coded lobby's room as a guest (#2091, #2527): through a relay a
 * member seals to it when the host cannot be reached directly, on the
 * same switch. The broadcast build's pages reach each other without one.
 */
export function joinGuestRoom(room: LobbyRoom): GuestRoom {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return {
      transport: joinRoom(room),
      reached: () => undefined,
      fromHost: () => undefined,
      refreshRelay: () => undefined,
    };
  }
  const offers = watchRelayOffers(room.relay, room.roomId, TRYSTERO_SELF_ID);
  const transport = joinWithRelayOffers({
    selfId: TRYSTERO_SELF_ID,
    // Through a relay, into the attempt's sibling room the host also sits in.
    join: (turn, attempt) =>
      turn === undefined
        ? joinTrysteroRoom(room)
        : joinTrysteroRoom(relaySibling(room, attempt), turn),
    offers,
    ownRelay: loadRelay() !== undefined,
  });
  return {
    transport,
    reached: (hostId) => {
      transport.reached(hostId);
    },
    // A login the guest would not use itself, such as a private address, is none.
    fromHost: (login) => {
      offers.fromHost(login === null ? null : (validateTurnConfig(login) ?? null));
    },
    refreshRelay: (nowMs) => {
      transport.refreshRelay(nowMs);
    },
  };
}

/** What this player's lobbies offer, as Options has it now. */
const OFFERED_RELAY: OfferedRelaySource = {
  load: () => loadOfferedRelay(),
  onChange: onRelaySharingChange,
};

/**
 * Join a coded lobby's room as its host (#2091): with the sibling rooms
 * its relayed joiners come into, while `relayRooms` wants them. A queued
 * lobby's room, and the broadcast build, have none.
 */
export function joinHostRoom(room: LobbyRoom, relayRooms: RelayRoomsSource): Transport {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return joinRoom(room);
  }
  return withSiblingRoom({
    main: joinTrysteroRoom(room),
    joinSibling: (attempt) => joinTrysteroRoom(relaySibling(room, attempt)),
    relayRooms,
  });
}

/**
 * Hold this player's shared relay for the lobby `room` is (#2527), as
 * member `selfId` named `name()`, following Options while it is there;
 * `undefined` for a room that never shares, and always on the broadcast
 * build, which has no Nostr relays to seal a login over.
 */
export function holdLobbyRelay(
  room: LobbyRoom,
  selfId: string,
  name: () => string,
): RelayHold | undefined {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return undefined;
  }
  return holdRelay(room.relay, OFFERED_RELAY, selfId, name);
}

/**
 * A lobby host's ear for relay asks on `room`'s topic (#2527), handed to
 * `ask`; `undefined` where `holdLobbyRelay` is.
 */
export function watchLobbyRelayAsks(
  room: LobbyRoom,
  ask: (peerId: string, pub: string) => void,
): RelayAsks | undefined {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast" || room.relay === null) {
    return undefined;
  }
  return watchRelayAsks(room.relay, ask);
}

/**
 * Publish a finished match's record on Nostr (#2528). The broadcast
 * build, which e2e runs, publishes nothing: a test match never reaches
 * the public relays.
 */
export function publishRecord(record: MatchRecord): void {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast") {
    return;
  }
  publishMatchRecord(record);
}

/**
 * Watch the finished matches on Nostr (#2532) until closed. The
 * broadcast build, which e2e runs, hears none: its Matches page is
 * empty, as no test match ever reaches the public relays.
 */
export function watchRecords(on: MatchRecordWatchHandlers): MatchRecordWatch {
  if (import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast") {
    return { close: () => undefined };
  }
  return watchMatchRecords(on);
}
