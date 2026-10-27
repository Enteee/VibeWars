/**
 * The Random Arena queue board between tabs of one browser (#880): what
 * e2e queues on, as `broadcast-channel.ts` is what it plays on. One
 * `BroadcastChannel`, and the same ticket validation as the Nostr board
 * (`parseQueueTicket`), so a test queues through the path players do.
 *
 * Nothing here is signed: every tab on the channel is the same browser.
 */
import { parseQueueTicket, type QueueMode } from "@vibewars/game-protocol";
import type { QueueBoardEvent } from "@vibewars/game-session";

import type { NostrQueue } from "./nostr-queue.js";
import { APP_ID } from "./relays.js";
import { newTicketKey } from "./ticket-key.js";

export const QUEUE_CHANNEL = `${APP_ID}:queue`;

/** `raw` as a board event, or `undefined` if it is anything else. */
export function parseBoardMessage(raw: unknown): QueueBoardEvent | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const { kind, ticket, ticketId } = raw as Record<string, unknown>;
  if (kind === "withdrawn") {
    return typeof ticketId === "string" ? { kind, ticketId } : undefined;
  }
  if (kind === "ticket") {
    const parsed = parseQueueTicket(ticket);
    return parsed === undefined ? undefined : { kind, ticket: parsed };
  }
  return undefined;
}

interface Subscriber {
  readonly mode: QueueMode;
  readonly on: (event: QueueBoardEvent) => void;
}

/**
 * A board on `QUEUE_CHANNEL`. A tab does not hear its own messages, as
 * a `BroadcastChannel` never echoes: the queue client counts its own
 * ticket when it publishes it.
 */
export function joinBroadcastQueue(): NostrQueue {
  const channel = new BroadcastChannel(QUEUE_CHANNEL);
  const subscribers = new Set<Subscriber>();
  let closed = false;

  channel.onmessage = (message: MessageEvent<unknown>) => {
    const said = parseBoardMessage(message.data);
    if (closed || said === undefined) {
      return;
    }
    for (const subscriber of [...subscribers]) {
      // A withdrawal names no mode; a subscriber that never heard of the
      // ticket ignores it.
      if (said.kind === "withdrawn" || subscriber.mode === said.ticket.mode) {
        subscriber.on(said);
      }
    }
  };

  const post = (event: QueueBoardEvent): void => {
    if (!closed) {
      channel.postMessage(event);
    }
  };

  return {
    board: {
      publish: (ticket) => {
        post({ kind: "ticket", ticket });
      },
      withdraw: (ticketId) => {
        post({ kind: "withdrawn", ticketId });
      },
      subscribe: (mode, on) => {
        const subscriber: Subscriber = { mode, on };
        subscribers.add(subscriber);
        return () => {
          subscribers.delete(subscriber);
        };
      },
      // No relay to lose.
      onTrouble: () => () => undefined,
    },
    newTicketKey,
    close: () => {
      closed = true;
      subscribers.clear();
      channel.close();
    },
  };
}
