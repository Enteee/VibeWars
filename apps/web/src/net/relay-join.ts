/**
 * A joiner's room that falls back on the relays its lobby's members share
 * (#2091, #2527, ADR-0049). It joins at once without one, so a direct path
 * is never delayed. Once an offer sealed to it has opened, it is
 * `RELAY_REJOIN_MS` since the join and the host is still unreached, it
 * leaves and joins again through offer 1, into sibling room `relay1`;
 * unseated `RELAY_ATTEMPT_MS` later, through the next offer into the
 * next sibling, up to `MAX_RELAY_ATTEMPTS`. Every client ranks the offers
 * alike (`rankOffers`), so no one votes, and each joiner switches alone.
 *
 * Seated, a member hears logins from the lobby's listed holders alone
 * (#2529). A newer login for the relay it uses, or the best-ranked live
 * one when that relay's holder leaves the list, moves the host's
 * connection in place, keeping its seat, also during a map (#2245): a 1 h
 * login cannot wait out a 28 min Guild Battle. A relayed member whose
 * host drops joins again through the best-ranked live login, since
 * coturn ends a relayed peer's allocation when its credential expires
 * (#1764).
 */
import type { Channel } from "@vibewars/game-protocol";
import type { Transport } from "@vibewars/game-session";

import { HandlerSets } from "./transport/handler-sets.js";
import type { RelayOffers } from "./transport/relay-offer.js";
import type { TrysteroTransport } from "./transport/trystero.js";
import { credentialExpiry, type TurnConfig } from "./transport/turn-config.js";

/** How long a joiner waits for the host directly before it takes an offer. */
export const RELAY_REJOIN_MS = 5_000;

/** How long a joiner waits to be seated through one offer before it tries the next. */
export const RELAY_ATTEMPT_MS = 8_000;

/** The most offers a joiner tries, each in its own sibling room. */
export const MAX_RELAY_ATTEMPTS = 3;

/**
 * The least time between two in-place ICE restarts onto one relay
 * (#2529), unless the connection's ICE has failed or disconnected: a
 * holder sending logins fast cannot keep a member restarting.
 */
export const RELAY_RESTART_EVERY_MS = 5 * 60 * 1000;

/** A joiner's `Transport`, told when the host has answered. */
export interface RelayJoin extends Transport {
  /** The host answered from `hostId`: no further attempt, and its drop is watched. */
  reached(hostId: string): void;
}

export interface RelayJoinOptions {
  /** The peer id `join` gives every room. */
  readonly selfId: string;
  /**
   * Join the lobby's room directly (`attempt` 0, `turn` undefined), or
   * through `turn` into sibling room `relay<attempt>`.
   */
  readonly join: (turn: TurnConfig | undefined, attempt: number) => TrysteroTransport;
  /** The lobby's offers; closed with the room. */
  readonly offers: RelayOffers;
  /** The player's own relay from Options: it wins, so an offer never rejoins. */
  readonly ownRelay: boolean;
  readonly rejoinMs?: number;
  readonly attemptMs?: number;
  /** The clock restarts are limited by; `Date.now` by default. */
  readonly now?: () => number;
}

export function joinWithRelayOffers(options: RelayJoinOptions): RelayJoin {
  const {
    selfId,
    join,
    offers,
    ownRelay,
    rejoinMs = RELAY_REJOIN_MS,
    attemptMs = RELAY_ATTEMPT_MS,
    now = Date.now,
  } = options;
  const handlers = new HandlerSets();
  /** Every channel listened on: a room joined later hears them all. */
  const channels = new Set<Channel>();
  /** Peers the room said joined and has not said left. */
  const peers = new Set<string>();
  let room: { readonly transport: TrysteroTransport; readonly offs: (() => void)[] } | undefined;
  /** The attempt the room is: 0 direct, else the sibling it went into. */
  let attempt = 0;
  /** Holders whose offer an attempt took: each is tried once. */
  const tried = new Set<string>();
  /** The relay the room was joined through, once it has been. */
  let joinedWith: TurnConfig | undefined;
  /** The login the host's connection relays with now: `joinedWith`, or a newer one swapped in. */
  let relayedWith: TurnConfig | undefined;
  let hostId: string | undefined;
  /** The current attempt has waited its time: the next may begin as soon as an offer is there. */
  let due = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** When ICE last restarted in place onto each relay, by its first URL. */
  const restarted = new Map<string, number>();
  /** A restart the limit held back, run once the limit allows. */
  let restartTimer: ReturnType<typeof setTimeout> | undefined;
  let swapping = false;
  let left = false;

  const listen = (transport: Transport, channel: Channel): (() => void) =>
    transport.on(channel, (data, from) => {
      handlers.message(channel, data, from);
    });

  const attach = (turn: TurnConfig | undefined): void => {
    const transport = join(turn, attempt);
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
            const best = offers.ranked()[0]?.config;
            if (best !== undefined && best.username !== joinedWith.username) {
              void rejoin(best);
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
   * Leave and join again through `turn`, into the current attempt's
   * sibling. Never rejects: a leave or a join that fails leaves no room,
   * which the player hears as the host being unreachable.
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

  /** Wait `ms` for the host; then the next attempt is due. */
  const wait = (ms: number): void => {
    due = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      due = true;
      check();
    }, ms);
  };

  // Checked whenever an offer opens or a wait ends: an offer at 12 s
  // still counts.
  const check = (): void => {
    if (left || ownRelay || !due || swapping || hostId !== undefined) {
      return;
    }
    if (attempt >= MAX_RELAY_ATTEMPTS) {
      return;
    }
    const offer = offers.ranked().find(({ holder }) => !tried.has(holder));
    if (offer === undefined) {
      return;
    }
    tried.add(offer.holder);
    attempt += 1;
    void rejoin(offer.config);
    wait(attemptMs);
  };

  /** The first URL a login relays through: a login for the same relay names the same one. */
  const relayOf = (turn: TurnConfig): string => turn.urls[0] ?? "";

  /**
   * Seated through a relay, move the host's connection in place (#2529):
   * onto a strictly newer login for the relay it uses, or, once no live
   * login from a listed holder names that relay, onto the best-ranked
   * one. At most once per relay each `RELAY_RESTART_EVERY_MS`, unless
   * ICE has failed or disconnected; a restart held back runs later.
   */
  const move = (): void => {
    if (
      left ||
      swapping ||
      room === undefined ||
      hostId === undefined ||
      relayedWith === undefined
    ) {
      return;
    }
    const current = relayedWith;
    const ranked = offers.ranked().map(({ config }) => config);
    const same = ranked.find((turn) => relayOf(turn) === relayOf(current));
    const next = same ?? ranked[0];
    if (
      next === undefined ||
      (credentialExpiry(next) ?? 0) <= (same === undefined ? 0 : (credentialExpiry(current) ?? 0))
    ) {
      return;
    }
    const last = restarted.get(relayOf(next));
    const ice = room.transport.iceState(hostId);
    const wait =
      last === undefined || ice === "failed" || ice === "disconnected"
        ? 0
        : last + RELAY_RESTART_EVERY_MS - now();
    if (wait > 0) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(move, wait);
      return;
    }
    room.transport.swapIceServers(hostId, next);
    restarted.set(relayOf(next), now());
    relayedWith = next;
  };

  attach(undefined);
  wait(rejoinMs);
  const stopHearing = offers.onOffer(() => {
    check();
    move();
  });

  return {
    selfId,
    reached(id) {
      hostId = id;
      clearTimeout(timer);
      move();
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
      clearTimeout(restartTimer);
      stopHearing();
      offers.close();
      await detach();
      handlers.clear();
    },
  };
}
