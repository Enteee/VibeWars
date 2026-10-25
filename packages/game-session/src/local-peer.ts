import type { Channel } from "@vibewars/game-protocol";

import type { Json, Transport } from "./transport.js";

type Handler = (data: unknown, from: string) => void;
type PeerHandler = (peerId: string) => void;

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

function handlersOf(map: Map<Channel, Set<Handler>>, channel: Channel): Set<Handler> {
  let handlers = map.get(channel);
  if (handlers === undefined) {
    handlers = new Set();
    map.set(channel, handlers);
  }
  return handlers;
}

/**
 * The host's own player, as one more peer (#375): `host` is `remote` with
 * a peer added, `local`, whose only peer is the host. The host's match
 * then seats its own player exactly as it seats a remote one, through
 * `hello` and `intent`, with no branch for "this one is me".
 *
 * Between the two, delivery is a microtask after `send` and each message a
 * `structuredClone`, as the memory transport does, so neither can lean on
 * the other being in the same tab.
 */
export function createLocalPeer(remote: Transport): { host: Transport; local: Transport } {
  const localId = `${remote.selfId}/local`;
  /** What the host listens to from `local`, and what `local` listens to from the host. */
  const toHost = new Map<Channel, Set<Handler>>();
  const toLocal = new Map<Channel, Set<Handler>>();
  const hostJoins = new Set<PeerHandler>();
  const hostLeaves = new Set<PeerHandler>();
  const localJoins = new Set<PeerHandler>();
  const localLeaves = new Set<PeerHandler>();
  let localLeft = false;
  let hostLeft = false;

  /** What one side sent lands at the other unless the other has left by then. */
  const deliver = (to: "host" | "local", channel: Channel, data: unknown, from: string): void => {
    const copy = structuredClone(data);
    queueMicrotask(() => {
      if (to === "host" ? !hostLeft : !localLeft) {
        fire(handlersOf(to === "host" ? toHost : toLocal, channel), copy, from);
      }
    });
  };

  // Each side sees the other already there, a microtask from now.
  queueMicrotask(() => {
    if (!localLeft && !hostLeft) {
      fire(hostJoins, localId);
      fire(localJoins, remote.selfId);
    }
  });

  const host: Transport = {
    selfId: remote.selfId,
    send<T>(channel: Channel, data: Json<T>, to?: string) {
      if (hostLeft) {
        return;
      }
      if (to === undefined || to === localId) {
        deliver("local", channel, data, remote.selfId);
      }
      if (to !== localId) {
        remote.send(channel, data, to);
      }
    },
    on(channel, handler) {
      const offRemote = remote.on(channel, handler);
      const offLocal = subscribe(handlersOf(toHost, channel), handler);
      return () => {
        offRemote();
        offLocal();
      };
    },
    onPeerJoin(handler) {
      const offRemote = remote.onPeerJoin(handler);
      const offLocal = subscribe(hostJoins, handler);
      return () => {
        offRemote();
        offLocal();
      };
    },
    onPeerLeave(handler) {
      const offRemote = remote.onPeerLeave(handler);
      const offLocal = subscribe(hostLeaves, handler);
      return () => {
        offRemote();
        offLocal();
      };
    },
    async leave() {
      if (hostLeft) {
        return;
      }
      hostLeft = true;
      const wasThere = !localLeft;
      await remote.leave();
      if (wasThere) {
        fire(localLeaves, remote.selfId);
      }
    },
  };

  const local: Transport = {
    selfId: localId,
    send<T>(channel: Channel, data: Json<T>, to?: string) {
      if (!localLeft && (to === undefined || to === remote.selfId)) {
        deliver("host", channel, data, localId);
      }
    },
    on: (channel, handler) => subscribe(handlersOf(toLocal, channel), handler),
    onPeerJoin: (handler) => subscribe(localJoins, handler),
    onPeerLeave: (handler) => subscribe(localLeaves, handler),
    leave() {
      if (!localLeft) {
        localLeft = true;
        queueMicrotask(() => {
          if (!hostLeft) {
            fire(hostLeaves, localId);
          }
        });
      }
      return Promise.resolve();
    },
  };

  return { host, local };
}
