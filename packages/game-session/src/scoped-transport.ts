import type { Channel } from "@vibewars/game-protocol";

import type { Json, Transport } from "./transport.js";

/**
 * `transport` for one match inside a lobby (#379): the same room and the
 * same peers, but its `leave()` only takes back what was registered
 * through it. The match is over, and the lobby, still in the room, goes
 * on. After `leave()` nothing reaches its handlers and nothing it sends
 * goes out, as the contract says of a real leave.
 */
export function scopeTransport(transport: Transport): Transport {
  const removers = new Set<() => void>();
  let left = false;

  const track = (remove: () => void): (() => void) => {
    if (left) {
      remove();
      return () => undefined;
    }
    removers.add(remove);
    return () => {
      removers.delete(remove);
      remove();
    };
  };

  return {
    selfId: transport.selfId,
    send<T>(channel: Channel, data: Json<T>, to?: string) {
      if (!left) {
        transport.send(channel, data, to);
      }
    },
    on: (channel, handler) => track(transport.on(channel, handler)),
    onPeerJoin: (handler) => track(transport.onPeerJoin(handler)),
    onPeerLeave: (handler) => track(transport.onPeerLeave(handler)),
    onTrouble: (handler) => track(transport.onTrouble(handler)),
    leave() {
      left = true;
      for (const remove of removers) {
        remove();
      }
      removers.clear();
      return Promise.resolve();
    },
  };
}
