import { PROTOCOL_VERSION, type QueueTicket } from "@vibewars/game-protocol";
import type { QueueBoardEvent } from "@vibewars/game-session";
import { afterEach, describe, expect, it } from "vitest";

import type { NostrQueue } from "./nostr-queue.js";
import { QUEUE_CHANNEL, joinBroadcastQueue, parseBoardMessage } from "./broadcast-queue.js";

/** A real-timer wait long enough for every posted message to land. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

function ticket(ticketId: string, mode: QueueTicket["mode"] = "random-arena-1v1"): QueueTicket {
  const at = Date.now();
  return {
    ticketId,
    protocol: PROTOCOL_VERSION,
    mode,
    members: [ticketId],
    bots: 0,
    enteredAt: at,
    heartbeatAt: at,
    party: null,
    ascentRound: null,
  };
}

const ID_A = "a".repeat(64);
const ID_B = "b".repeat(64);

const opened: NostrQueue[] = [];

function open(): { queue: NostrQueue; heard: QueueBoardEvent[] } {
  const queue = joinBroadcastQueue();
  opened.push(queue);
  const heard: QueueBoardEvent[] = [];
  queue.board.subscribe("random-arena-1v1", (event) => {
    heard.push(event);
  });
  return { queue, heard };
}

afterEach(() => {
  for (const queue of opened.splice(0)) {
    queue.close();
  }
});

describe("joinBroadcastQueue", () => {
  it("lets two boards on one channel see each other's tickets and withdrawals", async () => {
    const a = open();
    const b = open();
    a.queue.board.publish(ticket(ID_A));
    b.queue.board.publish(ticket(ID_B));
    a.queue.board.withdraw(ID_A);
    await settle();

    expect(b.heard).toEqual([
      { kind: "ticket", ticket: expect.objectContaining({ ticketId: ID_A }) },
      { kind: "withdrawn", ticketId: ID_A },
    ]);
    expect(a.heard).toEqual([
      { kind: "ticket", ticket: expect.objectContaining({ ticketId: ID_B }) },
    ]);
  });

  it("replays the tickets a board published, not those it withdrew, to a board that subscribes later", async () => {
    const a = open();
    a.queue.board.publish(ticket(ID_A));
    a.queue.board.publish(ticket(ID_B));
    a.queue.board.withdraw(ID_B);
    await settle();
    const late = open();
    await settle();

    expect(late.heard).toEqual([
      { kind: "ticket", ticket: expect.objectContaining({ ticketId: ID_A }) },
    ]);
  });

  it("tells a subscriber only the tickets of its mode", async () => {
    const a = open();
    const b = open();
    a.queue.board.publish(ticket(ID_A, "random-arena-4v4"));
    await settle();
    expect(b.heard).toEqual([]);
  });

  it("drops malformed messages", async () => {
    const b = open();
    const raw = new BroadcastChannel(QUEUE_CHANNEL);
    try {
      raw.postMessage("not an event");
      raw.postMessage({ kind: "ticket", ticket: { ...ticket(ID_A), members: [ID_A, ID_A] } });
      raw.postMessage({ kind: "ticket", ticket: { ...ticket(ID_A), extra: true } });
      raw.postMessage({ kind: "withdrawn", ticketId: 7 });
      raw.postMessage({ kind: "hello", ticketId: ID_A });
      await settle();
    } finally {
      raw.close();
    }
    expect(b.heard).toEqual([]);
  });

  it("says nothing more once closed", async () => {
    const a = open();
    const b = open();
    b.queue.close();
    a.queue.board.publish(ticket(ID_A));
    await settle();
    expect(b.heard).toEqual([]);
  });
});

describe("parseBoardMessage", () => {
  it("reads a ticket and a withdrawal", () => {
    const sent = ticket(ID_A);
    expect(parseBoardMessage({ kind: "ticket", ticket: sent })).toEqual({
      kind: "ticket",
      ticket: sent,
    });
    expect(parseBoardMessage({ kind: "withdrawn", ticketId: ID_A })).toEqual({
      kind: "withdrawn",
      ticketId: ID_A,
    });
  });
});
