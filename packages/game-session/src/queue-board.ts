/**
 * Where Random Arena tickets meet (#870, #854): a queued client publishes
 * its own ticket and hears everyone else's. Shaped like `Transport`, so
 * the queue client knows nothing of Nostr (child 6) or BroadcastChannel
 * (the UI child); a board is all it is given.
 */
import type { QueueMode, QueueTicket } from "@vibewars/game-protocol";

import type { TransportTrouble } from "./transport.js";

export type QueueBoardEvent =
  | { readonly kind: "ticket"; readonly ticket: QueueTicket }
  | { readonly kind: "withdrawn"; readonly ticketId: string };

export interface QueueBoard {
  /** Publish `ticket`, or a fresh copy of it: this is also the heartbeat. */
  publish(ticket: QueueTicket): void;
  /** Tell everyone `ticketId` has left the queue. */
  withdraw(ticketId: string): void;
  /**
   * Every ticket of `mode` published from now on, the subscriber's own
   * included, and every withdrawal. A board keeps no history: a new
   * subscriber hears a ticket at its next heartbeat.
   */
  subscribe(mode: QueueMode, on: (event: QueueBoardEvent) => void): () => void;
  onTrouble(handler: (trouble: TransportTrouble) => void): () => void;
}

export interface MemoryBoard {
  /** One more client's view of the shared board. */
  board(): QueueBoard;
  /** Every board is told `trouble`, a microtask from now, as a relay outage says it. */
  trouble(trouble: TransportTrouble): void;
}

interface Subscriber {
  readonly mode: QueueMode | undefined;
  readonly on: (event: QueueBoardEvent) => void;
}

/**
 * Many boards over one memory, for tests. Delivery is a microtask after
 * `publish`, as on a real network, and each subscriber gets its own copy.
 */
export function createMemoryBoard(): MemoryBoard {
  const subscribers = new Set<Subscriber>();
  const troubles = new Set<(trouble: TransportTrouble) => void>();

  function deliver(mode: QueueMode | undefined, event: QueueBoardEvent): void {
    queueMicrotask(() => {
      for (const subscriber of [...subscribers]) {
        if (mode === undefined || subscriber.mode === mode) {
          subscriber.on(structuredClone(event));
        }
      }
    });
  }

  return {
    board: () => ({
      publish: (ticket) => {
        deliver(ticket.mode, { kind: "ticket", ticket });
      },
      withdraw: (ticketId) => {
        // A withdrawal names no mode; a subscriber that never heard of the
        // ticket ignores it.
        deliver(undefined, { kind: "withdrawn", ticketId });
      },
      subscribe: (mode, on) => {
        const subscriber: Subscriber = { mode, on };
        subscribers.add(subscriber);
        return () => {
          subscribers.delete(subscriber);
        };
      },
      onTrouble: (handler) => {
        troubles.add(handler);
        return () => {
          troubles.delete(handler);
        };
      },
    }),
    trouble: (trouble) => {
      queueMicrotask(() => {
        for (const handler of [...troubles]) {
          handler(trouble);
        }
      });
    },
  };
}
