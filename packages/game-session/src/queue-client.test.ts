import { describe, expect, it } from "vitest";

import {
  FORMATION_SETTLE_MS,
  PROTOCOL_VERSION,
  TICKET_HEARTBEAT_MS,
  TICKET_TTL_MS,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import { createMemoryBoard, type MemoryBoard, type QueueBoardEvent } from "./queue-board.js";
import { createQueueClient, type QueueClient, type QueueState } from "./queue-client.js";

/** The queue client (#870, #854): searching, forming, in-lobby, fell-through, over a memory board. */

const START = 1_700_000_000_000;
const MAPS = ["arena-a", "arena-b"];
const STEP_MS = 1_000;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A `Math.random` stand-in that differs per seed and repeats per run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Let the board deliver and every formation in flight finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

class Queue {
  public now = START;
  public readonly memory: MemoryBoard = createMemoryBoard();
  public readonly clients: QueueClient[] = [];
  /** Everything the board carried, as a client of it would hear it. */
  public readonly heard: QueueBoardEvent[] = [];

  public readonly mode: QueueMode;

  public constructor(mode: QueueMode) {
    this.mode = mode;
    this.memory.board().subscribe(mode, (event) => this.heard.push(event));
  }

  public join(seed = this.clients.length + 1): QueueClient {
    const client = createQueueClient({
      board: this.memory.board(),
      mode: this.mode,
      partySize: 1,
      now: () => this.now,
      random: seeded(seed),
      sha256: sha256Hex,
      mapPool: MAPS,
    });
    this.clients.push(client);
    return client;
  }

  /** A ticket nobody's client owns, published as a peer would. */
  public async publish(ticket: Partial<QueueTicket> & { ticketId: string }): Promise<void> {
    this.memory.board().publish({
      protocol: PROTOCOL_VERSION,
      mode: this.mode,
      partySize: 1,
      enteredAt: START,
      heartbeatAt: this.now,
      ...ticket,
    });
    await settle();
  }

  /** `ms` pass; every client ticks once, then the board and formations catch up. */
  public async advance(ms = STEP_MS): Promise<void> {
    this.now += ms;
    for (const client of this.clients) {
      client.tick();
    }
    await settle();
  }

  /** Advance a step at a time until `done`, failing after `maxMs`. */
  public async until(done: () => boolean, maxMs = 30_000): Promise<void> {
    await settle();
    for (let waited = 0; !done(); waited += STEP_MS) {
      if (waited > maxMs) {
        throw new Error("the queue never got there");
      }
      await this.advance();
    }
  }

  /** Every copy of these tickets the board carried, in order. */
  public published(ticketIds: ReadonlySet<string>): QueueTicket[] {
    return this.heard.flatMap((event) =>
      event.kind === "ticket" && ticketIds.has(event.ticket.ticketId) ? [event.ticket] : [],
    );
  }
}

function inLobby(state: QueueState): Extract<QueueState, { kind: "in-lobby" }> {
  if (state.kind !== "in-lobby") {
    throw new Error(`expected in-lobby, got ${state.kind}`);
  }
  return state;
}

/** `client`'s current ticket id, once it has settled into a lobby. */
async function ticketIdOf(client: QueueClient): Promise<string> {
  return sha256Hex(inLobby(client.state).secret);
}

const EARLY = "0".repeat(63) + "1";

describe("createQueueClient", () => {
  it("brings 2 × teamSize clients into one lobby, the same group on each", async () => {
    const queue = new Queue("random-arena-2v2");
    const clients = [queue.join(), queue.join(), queue.join(), queue.join()];

    await queue.until(() => clients.every((client) => client.state.kind === "in-lobby"));

    const groups = clients.map((client) => inLobby(client.state).group);
    expect(new Set(groups.map((group) => group.groupId)).size).toBe(1);
    const ids = await Promise.all(clients.map(ticketIdOf));
    const members = [...(groups[0]?.teams[0] ?? []), ...(groups[0]?.teams[1] ?? [])];
    expect(members.sort()).toEqual([...ids].sort());
  });

  it("passes through forming for the settle window before the lobby", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    queue.join();

    await queue.until(() => a.state.kind === "forming");
    const formedAt = queue.now;
    await queue.until(() => a.state.kind === "in-lobby");

    expect(queue.now - formedAt).toBeGreaterThanOrEqual(FORMATION_SETTLE_MS);
  });

  it("starts the settle window again when the group changes, and drops out when not in it", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    const b = queue.join();
    await queue.until(() => a.state.kind === "forming" && b.state.kind === "forming");
    const first = a.state.kind === "forming" ? a.state.group.groupId : "";

    // Someone who queued before either of them: they take one of the two.
    await queue.publish({ ticketId: EARLY, enteredAt: START - 60_000 });
    await queue.advance();

    const [kept, dropped] = a.state.kind === "forming" ? [a, b] : [b, a];
    expect(dropped.state.kind).toBe("searching");
    expect(kept.state.kind).toBe("forming");
    const changedAt = queue.now;
    const regrouped = kept.state.kind === "forming" ? kept.state.group : undefined;
    expect(regrouped?.groupId).not.toBe(first);
    expect([...(regrouped?.teams[0] ?? []), ...(regrouped?.teams[1] ?? [])]).toContain(EARLY);

    // The early ticket keeps its heartbeat; the window counts from the change.
    while (kept.state.kind === "forming") {
      await queue.publish({ ticketId: EARLY, enteredAt: START - 60_000 });
      await queue.advance();
    }
    expect(kept.state.kind).toBe("in-lobby");
    expect(queue.now - changedAt).toBeGreaterThanOrEqual(FORMATION_SETTLE_MS);
  });

  it("falls through, requeues with the same enteredAt, and skips the no-show", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    const b = queue.join();
    await queue.until(() => a.state.kind === "in-lobby" && b.state.kind === "in-lobby");
    const oldId = await ticketIdOf(a);
    const noShow = await ticketIdOf(b);
    const [oldTicket] = queue.published(new Set([oldId]));

    a.fellThrough([noShow]);
    expect(a.state.kind).toBe("fell-through");
    await settle();
    expect(queue.heard).toContainEqual({ kind: "withdrawn", ticketId: oldId });

    // The no-show keeps publishing, as a client that never showed might.
    await queue.publish({ ticketId: noShow, enteredAt: START });
    await queue.advance();
    expect(a.state).toMatchObject({ kind: "searching", searching: 1 });

    const fresh = queue.heard.flatMap((event) =>
      event.kind === "ticket" && ![oldId, noShow].includes(event.ticket.ticketId)
        ? [event.ticket]
        : [],
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh[0]?.enteredAt).toBe(oldTicket?.enteredAt);

    // A newcomer is matched with a, and the no-show is not.
    const c = queue.join();
    await queue.until(() => a.state.kind === "in-lobby" && c.state.kind === "in-lobby");
    const group = inLobby(a.state).group;
    expect([...group.teams[0], ...group.teams[1]]).not.toContain(noShow);
  });

  it("withdraws on leave(), and the others' count drops", async () => {
    const queue = new Queue("random-arena-2v2");
    const a = queue.join();
    const b = queue.join();
    const c = queue.join();
    await queue.until(() => a.state.kind === "searching" && a.state.searching === 3);
    expect(a.state).toMatchObject({ searching: 3, needed: 4 });

    c.leave();
    await queue.advance();

    expect(a.state).toMatchObject({ kind: "searching", searching: 2 });
    expect(b.state).toMatchObject({ kind: "searching", searching: 2 });
    expect(queue.heard.some((event) => event.kind === "withdrawn")).toBe(true);
  });

  it("publishes a heartbeat every TICKET_HEARTBEAT_MS", async () => {
    const queue = new Queue("random-arena-4v4");
    queue.join();
    await settle();
    for (let i = 0; i < 12; i += 1) {
      await queue.advance();
    }

    const beats = queue.heard.flatMap((event) =>
      event.kind === "ticket" ? [event.ticket.heartbeatAt - START] : [],
    );
    expect(beats).toEqual([0, TICKET_HEARTBEAT_MS, 2 * TICKET_HEARTBEAT_MS]);
  });

  it("stops counting a ticket once it is TICKET_TTL_MS old", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.publish({ ticketId: EARLY });
    await queue.advance();
    expect(a.state).toMatchObject({ kind: "searching", searching: 2 });

    await queue.advance(TICKET_TTL_MS);

    expect(a.state).toMatchObject({ kind: "searching", searching: 1 });
  });

  it("says unreachable when the board has no relay, and searches when it talks again", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.advance();

    queue.memory.trouble("no-relay");
    await settle();
    expect(a.state.kind).toBe("unreachable");

    await queue.advance(TICKET_HEARTBEAT_MS);
    expect(a.state.kind).toBe("searching");
  });

  it("ignores a withdrawal of a ticket it never heard of", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.advance();

    queue.memory.board().withdraw(EARLY);
    await queue.advance();

    expect(a.state).toMatchObject({ kind: "searching", searching: 1 });
  });
});
