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
 * - `selfId` lasts one page load. It is never a player's identity across a
 *   reconnect: a returning player proves who it was with its rejoin token.
 */
export interface Transport {
  readonly selfId: string;
  send<T>(channel: Channel, data: Json<T>, to?: string): void;
  on(channel: Channel, handler: (data: unknown, from: string) => void): () => void;
  onPeerJoin(handler: (peerId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string) => void): () => void;
  leave(): Promise<void>;
}
