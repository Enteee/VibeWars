/**
 * The sibling rooms a lobby's relayed joiners come into (#2091, #2527,
 * ADR-0049).
 *
 * A joiner that rejoins through an offered relay cannot come back into
 * the lobby's own room: Trystero keeps the host's state for a peer id it
 * failed to connect to for ~23 s and ignores that id's new offers until
 * then, and a page's peer id never changes. So attempt k joins
 * `<roomId>/relay<k>`, where the host has no state for it yet. The host
 * sits in all of them while relays are wanted and hears them as one: the
 * lobby is a star, so a guest needs only the host, and a peer id heard in
 * several is one seat.
 */
import type { Channel } from "@vibewars/game-protocol";
import type { LobbyRoom, Transport } from "@vibewars/game-session";

import { MAX_RELAY_ATTEMPTS } from "./relay-join.js";
import { HandlerSets } from "./transport/handler-sets.js";

/** The lobby `room`'s sibling for relay attempt `attempt` (1 on): same password, its own room id. */
export function relaySibling(room: LobbyRoom, attempt: number): LobbyRoom {
  return { ...room, roomId: `${room.roomId}/relay${String(attempt)}` };
}

/** Whether the host should sit in its relay rooms (`LobbyHost.onRelayRooms`), and when it changes. */
export interface RelayRoomsSource {
  wanted(): boolean;
  onChange(handler: () => void): () => void;
}

/** A `RelayRoomsSource` set from outside, as the lobby host, made after the room, says. */
export function relayRoomsSwitch(): RelayRoomsSource & { set(wanted: boolean): void } {
  const handlers = new Set<() => void>();
  let on = false;
  return {
    wanted: () => on,
    set(wanted) {
      if (wanted === on) {
        return;
      }
      on = wanted;
      for (const handler of [...handlers]) {
        handler();
      }
    },
    onChange(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

export interface SiblingRoomOptions {
  /** The lobby's own room, already joined. */
  readonly main: Transport;
  /** Join sibling room `relay<attempt>`. */
  readonly joinSibling: (attempt: number) => Transport;
  /**
   * Whether relays are wanted: the host is in every sibling while they
   * are, and in one a relayed member is seated through while it is.
   */
  readonly relayRooms: RelayRoomsSource;
}

/**
 * The host's `main` room, joined by its siblings while relays are wanted.
 * A peer heard in several rooms holds one seat, in the room it came into
 * first: a join in another room never moves a live seat, since a peer id
 * is anyone's to announce. That room's traffic for it is dropped, and its
 * leaving there is not the peer leaving. Once the seat's room loses it, a
 * connection still open in another room takes the seat.
 */
export function withSiblingRoom(options: SiblingRoomOptions): Transport {
  const { main, joinSibling, relayRooms } = options;
  const { selfId } = main;
  const handlers = new HandlerSets();
  /** Every channel listened on: a sibling joined later hears them all. */
  const channels = new Set<Channel>();
  /** The room each peer's seat is in: the one it came into first. */
  const seats = new Map<string, Transport>();
  /** The peers each room has heard join and not yet leave. */
  const present = new Map<Transport, Set<string>>();
  /** The siblings joined, by attempt. */
  const siblings = new Map<
    number,
    { readonly transport: Transport; readonly offs: (() => void)[] }
  >();
  let syncing = Promise.resolve();
  let left = false;

  const listen = (transport: Transport, channel: Channel): (() => void) =>
    transport.on(channel, (data, from) => {
      const seat = seats.get(from);
      if (seat === undefined || seat === transport) {
        handlers.message(channel, data, from);
      }
    });

  const presentIn = (transport: Transport): Set<string> => {
    const peers = present.get(transport) ?? new Set<string>();
    present.set(transport, peers);
    return peers;
  };

  /** `peerId` leaves its seat; still connected in another room, it is seated there. */
  const unseat = (peerId: string): void => {
    seats.delete(peerId);
    handlers.left(peerId);
    const other = [...present].find(([, peers]) => peers.has(peerId))?.[0];
    if (other !== undefined) {
      seats.set(peerId, other);
      handlers.joined(peerId);
    }
    // A sibling kept for a seat it no longer holds may go.
    sync();
  };

  const hook = (transport: Transport): (() => void)[] => [
    ...[...channels].map((channel) => listen(transport, channel)),
    transport.onPeerJoin((peerId) => {
      presentIn(transport).add(peerId);
      const held = seats.get(peerId);
      if (held !== undefined && held !== transport) {
        return;
      }
      seats.set(peerId, transport);
      if (held !== undefined) {
        handlers.left(peerId);
      }
      handlers.joined(peerId);
    }),
    transport.onPeerLeave((peerId) => {
      presentIn(transport).delete(peerId);
      if (seats.get(peerId) === transport) {
        unseat(peerId);
      }
    }),
    transport.onTrouble((trouble) => {
      handlers.trouble(trouble);
    }),
  ];

  const mainOffs = hook(main);

  /** Out of sibling `attempt`, awaited, so Trystero's room cache is clear for the next join. */
  const detach = async (attempt: number): Promise<void> => {
    const sibling = siblings.get(attempt);
    if (sibling === undefined) {
      return;
    }
    const { transport, offs } = sibling;
    siblings.delete(attempt);
    for (const off of offs) {
      off();
    }
    present.delete(transport);
    for (const [peerId, seat] of [...seats]) {
      if (seat === transport) {
        unseat(peerId);
      }
    }
    await transport.leave();
  };

  /** Whether sibling `transport` holds a seat: it stays while it does, unless the lobby is left. */
  const holdsSeat = (transport: Transport): boolean =>
    [...seats.values()].some((seat) => seat === transport);

  /** Join or leave sibling `attempt` as `wanted` says, keeping one that holds a seat. */
  const applyOne = async (attempt: number, wanted: boolean): Promise<void> => {
    const sibling = siblings.get(attempt);
    try {
      if (sibling === undefined && wanted) {
        const transport = joinSibling(attempt);
        if (transport.selfId !== selfId) {
          throw new Error("a lobby's relay room changed its host's peer id");
        }
        siblings.set(attempt, { transport, offs: hook(transport) });
      } else if (sibling !== undefined && !wanted && (left || !holdsSeat(sibling.transport))) {
        await detach(attempt);
      }
    } catch {
      // A sibling that failed to join or leave is not held: relayed
      // joiners cannot reach this host through it, as without a relay.
      siblings.delete(attempt);
    }
  };

  const apply = async (): Promise<void> => {
    const wanted = !left && relayRooms.wanted();
    for (let attempt = 1; attempt <= MAX_RELAY_ATTEMPTS; attempt += 1) {
      await applyOne(attempt, wanted);
    }
  };

  // One change at a time: a leave is awaited before the next join.
  const sync = (): void => {
    syncing = syncing.then(apply);
  };

  const stopHearing = relayRooms.onChange(sync);
  sync();

  /** `to`, or every seated peer, split by the room each one's seat is in. */
  const route = (to: string | readonly string[] | undefined): Map<Transport, string[]> => {
    const ids = to === undefined ? [...seats.keys()] : typeof to === "string" ? [to] : to;
    const routes = new Map<Transport, string[]>();
    for (const id of ids) {
      const seat = seats.get(id) ?? main;
      routes.set(seat, [...(routes.get(seat) ?? []), id]);
    }
    return routes;
  };

  return {
    selfId,
    send(channel, data, to) {
      if (siblings.size === 0) {
        main.send(channel, data, to);
        return;
      }
      for (const [transport, ids] of route(to)) {
        transport.send(channel, data, ids);
      }
    },
    on(channel, handler) {
      if (!channels.has(channel)) {
        channels.add(channel);
        mainOffs.push(listen(main, channel));
        for (const sibling of siblings.values()) {
          sibling.offs.push(listen(sibling.transport, channel));
        }
      }
      return handlers.on(channel, handler);
    },
    onPeerJoin: (handler) => handlers.onPeerJoin(handler),
    onPeerLeave: (handler) => handlers.onPeerLeave(handler),
    onTrouble: (handler) => handlers.onTrouble(handler),
    async leave() {
      left = true;
      stopHearing();
      sync();
      await syncing;
      for (const off of mainOffs) {
        off();
      }
      seats.clear();
      present.clear();
      await main.leave();
      handlers.clear();
    },
  };
}
