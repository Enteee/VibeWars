/**
 * The Random Arena queue board between tabs of one browser (#880): what
 * e2e queues on, as `broadcast-channel.ts` is what it plays on. One
 * `BroadcastChannel`, and the same ticket validation as the Nostr board
 * (`parseQueueTicket`), so a test queues through the path players do.
 *
 * Nothing here is signed: every tab on the channel is the same browser.
 *
 * A relay keeps what it was sent and replays it to a new subscription; a
 * channel keeps nothing. So a board that subscribes asks for a replay,
 * and every board answers with the tickets it published and has not
 * withdrawn. Without it a tab that queues second never hears a ticket
 * whose owner settled before its next heartbeat.
 */
import { parseQueueTicket, type QueueMode, type QueueTicket } from "@vibewars/game-protocol";
import type { QueueBoardEvent } from "@vibewars/game-session";

import type { NostrQueue } from "./nostr-queue.js";
import { APP_ID } from "./relays.js";
import { newTicketKey } from "./ticket-key.js";

export const QUEUE_CHANNEL = `${APP_ID}:queue`;

/** A new subscriber asking every board to post its tickets again. */
const REPLAY = { kind: "replay" } as const;

function isReplay(raw: unknown): boolean {
  return (
    typeof raw === "object" && raw !== null && (raw as Record<string, unknown>).kind === "replay"
  );
}

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
  /** This board's tickets, newest copy each, until withdrawn: what a replay posts. */
  const published = new Map<string, QueueTicket>();
  let closed = false;

  channel.onmessage = (message: MessageEvent<unknown>) => {
    if (isReplay(message.data)) {
      for (const ticket of published.values()) {
        post({ kind: "ticket", ticket });
      }
      return;
    }
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

  const post = (event: QueueBoardEvent | typeof REPLAY): void => {
    if (!closed) {
      channel.postMessage(event);
    }
  };

  return {
    board: {
      publish: (ticket) => {
        published.set(ticket.ticketId, ticket);
        post({ kind: "ticket", ticket });
      },
      withdraw: (ticketId) => {
        published.delete(ticketId);
        post({ kind: "withdrawn", ticketId });
      },
      subscribe: (mode, on) => {
        const subscriber: Subscriber = { mode, on };
        subscribers.add(subscriber);
        post(REPLAY);
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
