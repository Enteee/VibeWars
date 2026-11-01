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
import {
  createQueueClient,
  type QueueClient,
  type QueueParty,
  type QueueState,
  type TicketKey,
} from "./queue-client.js";

/** The queue client (#870, #854): searching, forming, in-lobby, fell-through, over a memory board. */

const START = 1_700_000_000_000;
const MAPS = ["arena-a", "arena-b"];
const STEP_MS = 1_000;

/**
 * A stand-in for a secp256k1 key: its id is `0xa000 + n` in hex, never a
 * real public key, and it "signs" by echoing its id and the digest's length.
 */
function fakeKey(n: number): TicketKey {
  const ticketId = (0xa000 + n).toString(16).padStart(64, "0");
  return { ticketId, sign: (digest) => `${ticketId}${String(digest.length).padStart(64, "0")}` };
}

/** Let the board deliver: it does so in microtasks, all run before a timer. */
async function deliver(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

class Queue {
  public now = START;
  public readonly memory: MemoryBoard = createMemoryBoard();
  public readonly clients: QueueClient[] = [];
  /** Everything the board carried, as a client of it would hear it. */
  public readonly heard: QueueBoardEvent[] = [];
  /** Keys handed out so far, across every client. */
  public keys = 0;

  public readonly mode: QueueMode;

  public constructor(mode: QueueMode) {
    this.mode = mode;
    this.memory.board().subscribe(mode, (event) => this.heard.push(event));
  }

  /** A client alone, or as a member of `party`, its NAT `hardNat`. */
  public join(party?: QueueParty, hardNat = false): QueueClient {
    const client = createQueueClient({
      board: this.memory.board(),
      mode: this.mode,
      ...(party === undefined ? {} : { party }),
      now: () => this.now,
      newTicketKey: () => fakeKey((this.keys += 1)),
      mapPool: MAPS,
      hardNat,
    });
    this.clients.push(client);
    return client;
  }

  /** A ticket nobody's client owns, published as a peer would. */
  public async publish(ticket: Partial<QueueTicket> & { ticketId: string }): Promise<void> {
    this.memory.board().publish({
      protocol: PROTOCOL_VERSION,
      mode: this.mode,
      members: [ticket.ticketId],
      bots: 0,
      enteredAt: START,
      heartbeatAt: this.now,
      party: null,
      hardNat: false,
      ...ticket,
    });
    await deliver();
  }

  /** `ms` pass; every client ticks once, its formation lands, and the board catches up. */
  public async advance(ms = STEP_MS): Promise<void> {
    this.now += ms;
    await Promise.all(this.clients.map((client) => client.tick()));
    await deliver();
  }

  /** Advance a step at a time until `done`, failing after `maxMs`. */
  public async until(done: () => boolean, maxMs = 30_000): Promise<void> {
    await deliver();
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
function ticketIdOf(client: QueueClient): string {
  return inLobby(client.state).key.ticketId;
}

const EARLY = "0".repeat(63) + "1";

/** The group a party in these tests won together. */
const GROUP_WON = "f".repeat(64);

/** A 2v2 party of two fresh keys (#882): the lower leads. */
function partyOf(queue: Queue): { leader: QueueParty; follower: QueueParty } {
  const keys = [fakeKey((queue.keys += 1)), fakeKey((queue.keys += 1))].sort((a, b) =>
    a.ticketId < b.ticketId ? -1 : 1,
  );
  const [first, second] = keys as [TicketKey, TicketKey];
  const members = [first.ticketId, second.ticketId];
  // The board checks consents, not the client: these are only shaped like some.
  const proof = { groupId: GROUP_WON, consents: members.map(() => "e".repeat(128)) };
  return {
    leader: { members, key: first, ...proof },
    follower: { members, key: second, ...proof },
  };
}

describe("createQueueClient", () => {
  it("brings 2 × teamSize clients into one lobby, the same group on each", async () => {
    const queue = new Queue("random-arena-2v2");
    const clients = [queue.join(), queue.join(), queue.join(), queue.join()];

    await queue.until(() => clients.every((client) => client.state.kind === "in-lobby"));

    const groups = clients.map((client) => inLobby(client.state).group);
    expect(new Set(groups.map((group) => group.groupId)).size).toBe(1);
    const ids = clients.map(ticketIdOf);
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
    const oldId = ticketIdOf(a);
    const noShow = ticketIdOf(b);
    const [oldTicket] = queue.published(new Set([oldId]));

    a.fellThrough([noShow]);
    expect(a.state.kind).toBe("fell-through");
    await deliver();
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
    await deliver();
    for (let i = 0; i < 12; i += 1) {
      await queue.advance();
    }

    const beats = queue.heard.flatMap((event) =>
      event.kind === "ticket" ? [event.ticket.heartbeatAt - START] : [],
    );
    expect(beats).toEqual([0, TICKET_HEARTBEAT_MS, 2 * TICKET_HEARTBEAT_MS]);
  });

  it("puts its hardNat on every ticket it publishes (#2090)", async () => {
    const queue = new Queue("random-arena-4v4");
    queue.join(undefined, true);
    await deliver();

    expect(queue.heard.flatMap((e) => (e.kind === "ticket" ? [e.ticket.hardNat] : []))).toEqual([
      true,
    ]);
  });

  it("fills a team mode's empty seats with bots, a party's and a soloist's alike", async () => {
    const queue = new Queue("team-arena");
    const { leader, follower } = partyOf(queue);
    queue.join(leader);
    queue.join(follower);
    const solo = new Queue("heroes-ascent");
    solo.join();
    await deliver();

    expect(queue.heard.flatMap((e) => (e.kind === "ticket" ? [e.ticket.bots] : []))).toEqual([2]);
    expect(solo.heard.flatMap((e) => (e.kind === "ticket" ? [e.ticket.bots] : []))).toEqual([7]);
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

  it("counts the live tickets of its mode as teams, not another mode's or an expired one (#1881)", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.publish({ ticketId: EARLY });
    await queue.publish({ ticketId: "0".repeat(63) + "2", mode: "random-arena-2v2" });
    await queue.publish({ ticketId: "0".repeat(63) + "3", heartbeatAt: START - TICKET_TTL_MS });
    await queue.advance();

    expect(a.state).toMatchObject({ kind: "searching", searching: 2, teams: 2 });
  });

  it("says unreachable when the board has no relay, and searches when it talks again", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.advance();

    queue.memory.trouble("no-relay");
    await deliver();
    expect(a.state.kind).toBe("unreachable");

    await queue.advance(TICKET_HEARTBEAT_MS);
    expect(a.state.kind).toBe("searching");
  });

  it("starts the settle window again after an outage, rather than counting the time away", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    const b = queue.join();
    await queue.until(() => a.state.kind === "forming");

    queue.memory.trouble("no-relay");
    await deliver();
    expect(a.state.kind).toBe("unreachable");

    // Back after longer than the window: the group is forming again, not met.
    await queue.advance(FORMATION_SETTLE_MS + TICKET_HEARTBEAT_MS);
    expect(a.state.kind).toBe("searching");
    await queue.advance();
    expect(a.state.kind).toBe("forming");
    await queue.until(() => a.state.kind === "in-lobby" && b.state.kind === "in-lobby");
  });

  it("neither counts nor groups a ticket from the far future", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    await queue.publish({ ticketId: EARLY, heartbeatAt: Number.MAX_SAFE_INTEGER });
    for (let i = 0; i < 5; i += 1) {
      await queue.advance();
    }

    expect(a.state).toMatchObject({ kind: "searching", searching: 1 });
  });

  it("hands the lobby its ticket key to sign with, and a requeue a fresh one", async () => {
    const queue = new Queue("random-arena-1v1");
    const a = queue.join();
    const b = queue.join();
    await queue.until(() => a.state.kind === "in-lobby" && b.state.kind === "in-lobby");
    const { key, group } = inLobby(a.state);

    expect([...group.teams[0], ...group.teams[1]]).toContain(key.ticketId);
    expect(key.sign(new Uint8Array(32))).toMatch(/^[0-9a-f]{128}$/);

    a.fellThrough([ticketIdOf(b)]);
    queue.join();
    await queue.until(() => a.state.kind === "in-lobby");
    expect(inLobby(a.state).key.ticketId).not.toBe(key.ticketId);
  });

  it("ignores a withdrawal of a ticket it never heard of", async () => {
    const queue = new Queue("random-arena-4v4");
    const a = queue.join();
    await queue.advance();

    queue.memory.board().withdraw(EARLY);
    await queue.advance();

    expect(a.state).toMatchObject({ kind: "searching", searching: 1 });
  });

  describe("a party that stayed together (#882)", () => {
    it("publishes one ticket listing both members, and meets two solos", async () => {
      const queue = new Queue("random-arena-2v2");
      const { leader, follower } = partyOf(queue);
      const clients = [queue.join(leader), queue.join(follower), queue.join(), queue.join()];

      await queue.until(() => clients.every((client) => client.state.kind === "in-lobby"));

      const [lead, follow] = clients.map((client) => inLobby(client.state));
      expect(lead?.key.ticketId).toBe(leader.members[0]);
      expect(follow?.key.ticketId).toBe(follower.key.ticketId);
      expect(follow?.group).toEqual(lead?.group);
      expect(lead?.group.teams).toContainEqual(leader.members);
      expect(queue.published(new Set(leader.members)).map((ticket) => ticket.ticketId)).toEqual(
        expect.arrayContaining([leader.members[0]]),
      );
      expect(
        queue.published(new Set([follower.key.ticketId])),
        "the follower publishes nothing",
      ).toEqual([]);
      const [ticket] = queue.published(new Set([leader.members[0] ?? ""]));
      expect(ticket?.members).toEqual(leader.members);
      expect(ticket?.party).toEqual({ groupId: GROUP_WON, consents: leader.consents });
      for (const solo of clients.slice(2)) {
        expect(queue.published(new Set([ticketIdOf(solo)]))[0]?.party, "a solo's").toBeNull();
      }
    });

    it("keeps the leader's key and place across a fall-through, without a withdrawal", async () => {
      const queue = new Queue("random-arena-2v2");
      const { leader, follower } = partyOf(queue);
      const lead = queue.join(leader);
      const clients = [lead, queue.join(follower), queue.join(), queue.join()];
      await queue.until(() => clients.every((client) => client.state.kind === "in-lobby"));
      const [first] = queue.published(new Set([leader.members[0] ?? ""]));

      // Blamed for a member of its own that never came: it queues on.
      lead.fellThrough([leader.members[0] ?? ""]);
      await queue.advance();

      expect(queue.heard.some((event) => event.kind === "withdrawn")).toBe(false);
      const again = queue.published(new Set([leader.members[0] ?? ""])).at(-1);
      expect(again?.heartbeatAt).toBe(queue.now - STEP_MS);
      expect(again?.enteredAt).toBe(first?.enteredAt);
      expect(again?.party, "the consents sign the group won").toEqual(first?.party);
    });

    it("goes party-gone once its leader's ticket has been dead for TICKET_TTL_MS", async () => {
      const queue = new Queue("random-arena-2v2");
      const { leader, follower } = partyOf(queue);
      const lead = queue.join(leader);
      const follow = queue.join(follower);
      await queue.advance();
      expect(follow.state).toMatchObject({ kind: "searching", searching: 2 });

      lead.leave();
      await deliver();
      await queue.advance(TICKET_TTL_MS - 2 * STEP_MS);
      expect(follow.state.kind).toBe("searching");
      await queue.advance();
      expect(follow.state.kind).toBe("party-gone");
    });

    it("gives a follower its leader's first heartbeat's time before it gives up", async () => {
      const queue = new Queue("random-arena-2v2");
      const { follower } = partyOf(queue);
      const follow = queue.join(follower);

      await queue.advance(TICKET_TTL_MS - STEP_MS);
      expect(follow.state.kind).toBe("searching");
      await queue.advance();
      expect(follow.state.kind).toBe("party-gone");
    });
  });
});
