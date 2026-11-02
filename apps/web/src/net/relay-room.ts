/**
 * The sibling room a lobby's relayed joiners come into (#2091, ADR-0049).
 *
 * A joiner that rejoins through an offered relay cannot come back into
 * the lobby's own room: Trystero keeps the host's state for a peer id it
 * failed to connect to for ~23 s and ignores that id's new offers until
 * then, and a page's peer id never changes. So it joins `<roomId>/relay`,
 * where the host has no state for it yet. A host that offers its relay
 * sits in both rooms and hears them as one: the lobby is a star, so a
 * guest needs only the host, and a peer id heard in both is one seat.
 */
import type { Channel } from "@vibewars/game-protocol";
import type { LobbyRoom, Transport } from "@vibewars/game-session";

import { HandlerSets } from "./transport/handler-sets.js";
import type { OfferedRelaySource } from "./transport/relay-offer.js";

/** The lobby `room`'s sibling: same password, its own room id. */
export function relaySibling(room: LobbyRoom): LobbyRoom {
  return { ...room, roomId: `${room.roomId}/relay` };
}

export interface SiblingRoomOptions {
  /** The lobby's own room, already joined. */
  readonly main: Transport;
  /** Join the sibling room. */
  readonly joinSibling: () => Transport;
  /** What the host offers: it is in the sibling exactly while there is something. */
  readonly offering: OfferedRelaySource;
}

/**
 * The host's `main` room, joined by its sibling while it offers a relay.
 * A peer heard in both rooms holds one seat, in the room it came into
 * first: a join in the other room never moves a live seat, since a peer
 * id is anyone's to announce. That room's traffic for it is dropped, and
 * its leaving there is not the peer leaving. Once the seat's room loses
 * it, a connection still open in the other room takes the seat.
 */
export function withSiblingRoom(options: SiblingRoomOptions): Transport {
  const { main, joinSibling, offering } = options;
  const { selfId } = main;
  const handlers = new HandlerSets();
  /** Every channel listened on: a sibling joined later hears them all. */
  const channels = new Set<Channel>();
  /** The room each peer's seat is in: the one it came into first. */
  const seats = new Map<string, Transport>();
  /** The peers each room has heard join and not yet leave. */
  const present = new Map<Transport, Set<string>>();
  let sibling: { readonly transport: Transport; readonly offs: (() => void)[] } | undefined;
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

  /** `peerId` leaves its seat; still connected in the other room, it is seated there. */
  const unseat = (peerId: string): void => {
    seats.delete(peerId);
    handlers.left(peerId);
    const other = [...present].find(([, peers]) => peers.has(peerId))?.[0];
    if (other !== undefined) {
      seats.set(peerId, other);
      handlers.joined(peerId);
    }
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

  /** Out of the sibling, awaited, so Trystero's room cache is clear for the next join. */
  const detach = async (): Promise<void> => {
    if (sibling === undefined) {
      return;
    }
    const { transport, offs } = sibling;
    sibling = undefined;
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

  const apply = async (): Promise<void> => {
    const wanted = !left && offering.load() !== undefined;
    if (!wanted) {
      await detach();
    } else if (sibling === undefined) {
      const transport = joinSibling();
      if (transport.selfId !== selfId) {
        throw new Error("a lobby's relay room changed its host's peer id");
      }
      sibling = { transport, offs: hook(transport) };
    }
  };

  // One change at a time: a leave is awaited before the next join.
  const sync = (): void => {
    syncing = syncing.then(apply).catch(() => {
      // A sibling that failed to join or leave is not held: relayed
      // joiners cannot reach this host, as without a shared relay.
      sibling = undefined;
    });
  };

  const stopHearing = offering.onChange(sync);
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
      if (sibling === undefined) {
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
        sibling?.offs.push(listen(sibling.transport, channel));
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
