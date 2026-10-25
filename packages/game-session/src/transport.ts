import type { Channel } from "@vibewars/game-protocol";

/**
 * How peers in one match reach each other (#15): Trystero in a browser,
 * BroadcastChannel in e2e, memory in tests. A session sees only this.
 *
 * - Reliable and ordered for each sender and receiver pair; nothing is
 *   promised about the order between two senders.
 * - `send` without `to` goes to every *other* peer, never back to the sender.
 * - Handlers receive `unknown`: every message goes through a
 *   `game-protocol` validator before anything reads it.
 * - `onPeerJoin` fires once for each peer already there when this one
 *   joins, and for each that joins later; `onPeerLeave` once when one goes.
 * - Each `on*` returns a function that removes the handler.
 * - `leave()` resolves after `onPeerLeave` has fired on every remaining
 *   peer. Nothing is delivered to this peer after it, and what it sends
 *   after it goes nowhere.
 */
export interface Transport {
  readonly selfId: string;
  send(channel: Channel, data: unknown, to?: string): void;
  on(channel: Channel, handler: (data: unknown, from: string) => void): () => void;
  onPeerJoin(handler: (peerId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string) => void): () => void;
  leave(): Promise<void>;
}
