import type { Channel } from "@vibewars/game-protocol";

/**
 * `T` if it is plain JSON, which is all a `Transport` carries (#16), and
 * `never` otherwise: no `undefined`, no function, no method-bearing object
 * like a `Map` or a `Date`. Structural, so the wire's interfaces pass as
 * they are: an interface is never assignable to an index signature, so a
 * `JsonValue` parameter would refuse every message.
 */
export type Json<T> = T extends string | number | boolean | null
  ? T
  : T extends undefined | bigint | symbol | ((...args: never[]) => unknown)
    ? never
    : T extends readonly (infer Item)[]
      ? readonly Json<Item>[]
      : T extends object
        ? { readonly [K in keyof T]: Json<T[K]> }
        : never;

/**
 * How peers in one match reach each other (#15): Trystero in a browser,
 * BroadcastChannel in e2e, memory in tests. A session sees only this.
 *
 * - Reliable and ordered for each sender and receiver pair; nothing is
 *   promised about the order between two senders.
 * - `send` without `to` goes to every *other* peer, never back to the
 *   sender. It never throws: a message to a peer that is gone is dropped,
 *   and an adapter catches and logs its own asynchronous failures.
 * - Handlers receive `unknown`: every message goes through a
 *   `game-protocol` validator before anything reads it.
 * - `onPeerJoin` fires once for each peer already there when this one
 *   joins, and for each that joins later; `onPeerLeave` once when one goes.
 * - Each `on*` returns a function that removes the handler.
 * - `leave()` resolves once this peer has left: nothing is delivered to it
 *   afterwards, and what it sends afterwards goes nowhere. The others see
 *   it leave soon after, each on its own schedule; nothing waits for them.
 * - `onTrouble` says why a join may be failing (#707): no relay to find
 *   peers through, or a peer found but not reached. Only a real network
 *   has these; the memory and BroadcastChannel transports never say it.
 * - `selfId` lasts one page load. It is never a player's identity across a
 *   reconnect: a returning player proves who it was with its rejoin token,
 *   without sending it (#593).
 */
/**
 * What may be keeping a peer from reaching the others (#707): `no-relay`,
 * not one relay to find them through; `peer-unreachable`, a peer found
 * and offered a connection, which never connected.
 */
export type TransportTrouble = "no-relay" | "peer-unreachable";

export interface Transport {
  readonly selfId: string;
  send<T>(channel: Channel, data: Json<T>, to?: string): void;
  on(channel: Channel, handler: (data: unknown, from: string) => void): () => void;
  onPeerJoin(handler: (peerId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string) => void): () => void;
  onTrouble(handler: (trouble: TransportTrouble) => void): () => void;
  leave(): Promise<void>;
}

/**
 * The largest message any peer sends (#403): Trystero splits anything
 * longer into chunks and reassembles them against a budget for the whole
 * room, so one peer's big transfer could stall everyone else's. No
 * VibeWars message needs chunking; `message-size.test.ts` in apps/web
 * builds the worst case of each and keeps it under this. The host packs
 * a tick's combat into as many messages of this size as it takes
 * (`packCombat`, #601). Trystero sends a message inline only while its
 * 36-byte header plus the JSON fit one 16 KiB frame (`inlineHeaderSize`
 * in `@trystero-p2p/core` dist/action-wire.mjs; we pass no metadata), so
 * the limit is the frame less that header.
 */
export const MAX_MESSAGE_BYTES = 16 * 1024 - 36;

/** `data`'s size as a transport sends it: the UTF-8 length of its JSON. */
export function messageBytes(data: unknown): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * `transport`, saying once per channel when it sends a message over
 * `MAX_MESSAGE_BYTES`. That is a bug, not a case to handle: the message
 * still goes, because a dropped snapshot fails silently and a big one
 * fails loudly.
 */
export function sizeChecked(transport: Transport): Transport {
  const reported = new Set<Channel>();
  return {
    selfId: transport.selfId,
    send(channel, data, to) {
      if (!reported.has(channel)) {
        const bytes = messageBytes(data);
        if (bytes > MAX_MESSAGE_BYTES) {
          reported.add(channel);
          console.error(
            `game-session: a ${channel} message is ${String(bytes)} bytes, over MAX_MESSAGE_BYTES (${String(MAX_MESSAGE_BYTES)})`,
          );
        }
      }
      transport.send(channel, data, to);
    },
    on: (channel, handler) => transport.on(channel, handler),
    onPeerJoin: (handler) => transport.onPeerJoin(handler),
    onPeerLeave: (handler) => transport.onPeerLeave(handler),
    onTrouble: (handler) => transport.onTrouble(handler),
    leave: () => transport.leave(),
  };
}
