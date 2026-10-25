/**
 * Peers in one process, for tests (#82): a `Transport` with no network.
 *
 * Delivery is asynchronous, a microtask after `send`, as on a real
 * network, so a test catches a handler that sends while it is handling.
 * Every message is copied with `structuredClone` per receiver, so no two
 * peers ever share an object. `partition` cuts two peers off from each
 * other, as a dropped connection does, and `heal` joins them again.
 *
 * It keeps more order than the `Transport` contract asks: the others see
 * a peer leave before its `leave()` resolves, where a real network tells
 * them later. Code under test must not rely on that.
 */
import type { Channel } from "@vibewars/game-protocol";

import type { Transport } from "./transport.js";

type Handler = (data: unknown, from: string) => void;
type PeerHandler = (peerId: string) => void;

export interface MemoryNetwork {
  /** A new peer, as `peerId` or the next free `peer-<n>`. */
  join(peerId?: string): Transport;
  /**
   * Cut `a` and `b` off from each other: each sees the other leave, and
   * nothing either sends reaches the other until `heal`.
   */
  partition(a: string, b: string): void;
  /** Undo every `partition`: each pair sees the other join again. */
  heal(): void;
}

interface Peer {
  readonly id: string;
  left: boolean;
  readonly handlers: Map<Channel, Set<Handler>>;
  readonly joins: Set<PeerHandler>;
  readonly leaves: Set<PeerHandler>;
}

/** Call each of `handlers`, as they are now: one may remove itself. */
function fire<A extends unknown[]>(handlers: Iterable<(...args: A) => void>, ...args: A): void {
  for (const handler of [...handlers]) {
    handler(...args);
  }
}

function subscribe<T>(set: Set<T>, handler: T): () => void {
  set.add(handler);
  return () => {
    set.delete(handler);
  };
}

export function createMemoryNetwork(): MemoryNetwork {
  const peers = new Map<string, Peer>();
  const cut = new Set<string>();
  let joined = 0;

  const pair = (a: string, b: string): string => JSON.stringify(a < b ? [a, b] : [b, a]);

  /** Whether `a` and `b` reach each other now. */
  function linked(a: string, b: string): boolean {
    const from = peers.get(a);
    const to = peers.get(b);
    return (
      from !== undefined &&
      to !== undefined &&
      !from.left &&
      !to.left &&
      a !== b &&
      !cut.has(pair(a, b))
    );
  }

  /**
   * Whether what `from` sent lands at `to` now. A sender that called
   * `leave()` still delivers what it sent before, until its leave lands.
   */
  function delivers(from: string, to: string): boolean {
    const receiver = peers.get(to);
    return (
      peers.has(from) &&
      receiver !== undefined &&
      !receiver.left &&
      from !== to &&
      !cut.has(pair(from, to))
    );
  }

  /**
   * Tell `a` and `b`, a microtask from now, that each other joined, if
   * they are linked by then, or left.
   */
  function announce(a: string, b: string, how: "joins" | "leaves"): void {
    queueMicrotask(() => {
      const one = peers.get(a);
      const other = peers.get(b);
      if (one !== undefined && other !== undefined && (how === "leaves" || linked(a, b))) {
        fire(one[how], b);
        fire(other[how], a);
      }
    });
  }

  function join(peerId = `peer-${String(++joined)}`): Transport {
    if (peers.has(peerId)) {
      throw new Error(`memory transport: ${peerId} has already joined`);
    }
    const self: Peer = {
      id: peerId,
      left: false,
      handlers: new Map(),
      joins: new Set(),
      leaves: new Set(),
    };
    peers.set(peerId, self);
    for (const other of peers.keys()) {
      if (linked(other, peerId)) {
        announce(other, peerId, "joins");
      }
    }

    return {
      selfId: peerId,
      send(channel, data, to) {
        if (self.left) {
          return;
        }
        const targets = to === undefined ? [...peers.keys()] : [to];
        for (const target of targets) {
          if (!linked(peerId, target)) {
            continue;
          }
          const copy = structuredClone(data);
          queueMicrotask(() => {
            // A partition, or the receiver leaving, in between drops it.
            if (delivers(peerId, target)) {
              fire(peers.get(target)?.handlers.get(channel) ?? [], copy, peerId);
            }
          });
        }
      },
      on(channel, handler) {
        let handlers = self.handlers.get(channel);
        if (handlers === undefined) {
          handlers = new Set();
          self.handlers.set(channel, handlers);
        }
        return subscribe(handlers, handler);
      },
      onPeerJoin: (handler) => subscribe(self.joins, handler),
      onPeerLeave: (handler) => subscribe(self.leaves, handler),
      leave() {
        if (self.left) {
          return Promise.resolve();
        }
        const remaining = [...peers.keys()].filter((other) => linked(peerId, other));
        self.left = true;
        return new Promise((resolve) => {
          // After every message this peer sent before leaving has landed.
          queueMicrotask(() => {
            peers.delete(peerId);
            for (const other of remaining) {
              fire(peers.get(other)?.leaves ?? [], peerId);
            }
            resolve();
          });
        });
      },
    };
  }

  return {
    join,
    partition(a, b) {
      if (linked(a, b)) {
        announce(a, b, "leaves");
      }
      cut.add(pair(a, b));
    },
    heal() {
      const healed = [...cut].map((key) => JSON.parse(key) as [string, string]);
      cut.clear();
      for (const [a, b] of healed) {
        if (linked(a, b)) {
          announce(a, b, "joins");
        }
      }
    },
  };
}
