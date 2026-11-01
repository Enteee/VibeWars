import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { schnorr } from "@noble/secp256k1";
import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";
import {
  admissionBytes,
  formGroups,
  type QueueBoardEvent,
  type TicketKey,
  type TransportTrouble,
} from "@vibewars/game-session";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createNostrQueue,
  MAX_QUEUE_MESSAGE_BYTES,
  QUEUE_EVENT_KIND,
  RELAY_RETRY_MS,
  VERIFY_BURST,
  VERIFY_PER_SECOND,
  type RelaySocketHandlers,
} from "./nostr-queue.js";
import { APP_ID } from "./relays.js";
import { newTicketKey, verifyTicketSig } from "./ticket-key.js";

const RELAYS = ["wss://one.example", "wss://two.example"];
const NOW = 1_700_000_000_000;

interface FakeSocket {
  readonly url: string;
  readonly handlers: RelaySocketHandlers;
  readonly sent: string[];
  closed: boolean;
}

/** Relay sockets with no network: the test plays the relays. */
function fakeRelays(now: () => number = () => NOW) {
  const sockets: FakeSocket[] = [];
  const verified: string[] = [];
  const queue = createNostrQueue({
    relays: RELAYS,
    now,
    newTicketKey,
    verifyTicketSig: (ticketId, digest, sig) => {
      verified.push(ticketId);
      return verifyTicketSig(ticketId, digest, sig);
    },
    openSocket: (url, handlers) => {
      const socket: FakeSocket = { url, handlers, sent: [], closed: false };
      sockets.push(socket);
      return {
        send: (data) => socket.sent.push(data),
        close: () => {
          socket.closed = true;
        },
      };
    },
  });
  return { queue, sockets, verified };
}

function ticketOf(key: TicketKey, extra: Partial<QueueTicket> = {}): QueueTicket {
  return {
    ticketId: key.ticketId,
    protocol: PROTOCOL_VERSION,
    mode: "random-arena-2v2",
    members: [key.ticketId],
    bots: 0,
    enteredAt: NOW - 1_000,
    heartbeatAt: NOW,
    party: null,
    ascentRound: null,
    ...extra,
  };
}

/** A remote peer's event, signed by `key` as NIP-01 says, independently of the board. */
function remoteEvent(
  key: TicketKey,
  content: unknown,
  kind = QUEUE_EVENT_KIND,
  mode: QueueMode = "random-arena-2v2",
) {
  const unsigned = {
    pubkey: key.ticketId,
    created_at: Math.floor(NOW / 1000),
    kind,
    tags: [
      ["t", APP_ID],
      ["mode", mode],
    ],
    content: JSON.stringify(content),
  };
  const id = sha256(
    new TextEncoder().encode(
      JSON.stringify([
        0,
        unsigned.pubkey,
        unsigned.created_at,
        unsigned.kind,
        unsigned.tags,
        unsigned.content,
      ]),
    ),
  );
  return { ...unsigned, id: bytesToHex(id), sig: key.sign(id) };
}

function deliver(socket: FakeSocket | undefined, event: unknown): void {
  socket?.handlers.message(JSON.stringify(["EVENT", "vibewars-queue", event]));
}

function listen(queue: ReturnType<typeof createNostrQueue>) {
  const heard: QueueBoardEvent[] = [];
  queue.board.subscribe("random-arena-2v2", (event) => heard.push(event));
  return heard;
}

function sentEvents(socket: FakeSocket | undefined) {
  return (socket?.sent ?? [])
    .map((data) => JSON.parse(data) as unknown[])
    .filter((message) => message[0] === "EVENT")
    .map((message) => message[1] as { pubkey: string; content: string; sig: string; id: string });
}

describe("ticket keys (ADR-0032 §5)", () => {
  it("are x-only public keys whose signatures verify, and only for their own id and digest", () => {
    const key = newTicketKey();
    const other = newTicketKey();
    const digest = sha256(new TextEncoder().encode("vibewars"));
    const sig = key.sign(digest);
    expect(key.ticketId).toMatch(/^[0-9a-f]{64}$/);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    expect(verifyTicketSig(key.ticketId, digest, sig)).toBe(true);
    expect(schnorr.verify(hexToBytes(sig), digest, hexToBytes(key.ticketId))).toBe(true);
    expect(verifyTicketSig(other.ticketId, digest, sig)).toBe(false);
    expect(verifyTicketSig(key.ticketId, sha256(digest), sig)).toBe(false);
    expect(verifyTicketSig("zz", digest, sig)).toBe(false);
    expect(verifyTicketSig(key.ticketId, digest, "00")).toBe(false);
  });
});

describe("the Nostr queue board (#872)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens every relay and subscribes to the queue kind and app tag once open", () => {
    const { sockets } = fakeRelays();
    expect(sockets.map((socket) => socket.url)).toEqual(RELAYS);
    sockets[0]?.handlers.open();
    expect(sockets[0]?.sent.map((data) => JSON.parse(data) as unknown)).toEqual([
      ["REQ", "vibewars-queue", { kinds: [QUEUE_EVENT_KIND], "#t": [APP_ID] }],
    ]);
  });

  it("signs a published ticket with its own key and sends it to every relay, held until open", () => {
    const { queue, sockets } = fakeRelays();
    sockets[0]?.handlers.open();
    const key = queue.newTicketKey();
    const ticket = ticketOf(key);
    queue.board.publish(ticket);
    expect(sockets[1]?.sent).toEqual([]);
    sockets[1]?.handlers.open();
    for (const socket of sockets) {
      const [event] = sentEvents(socket);
      expect(event?.pubkey).toBe(key.ticketId);
      expect(JSON.parse(event?.content ?? "") as unknown).toEqual(ticket);
      expect(verifyTicketSig(key.ticketId, hexToBytes(event?.id ?? ""), event?.sig ?? "")).toBe(
        true,
      );
    }
    // What one board sends, another hears.
    const { queue: other, sockets: theirs } = fakeRelays();
    const heard = listen(other);
    for (const event of sentEvents(sockets[0])) {
      deliver(theirs[0], event);
    }
    expect(heard).toEqual([{ kind: "ticket", ticket }]);
  });

  it("publishes nothing for a ticket whose key it did not make", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { queue, sockets } = fakeRelays();
    sockets[0]?.handlers.open();
    queue.board.publish(ticketOf(newTicketKey()));
    expect(sentEvents(sockets[0])).toEqual([]);
  });

  it("hears a valid ticket once, however many relays deliver it", () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const key = newTicketKey();
    const event = remoteEvent(key, ticketOf(key));
    deliver(sockets[0], event);
    deliver(sockets[1], event);
    expect(heard).toEqual([{ kind: "ticket", ticket: ticketOf(key) }]);
  });

  it("hears only tickets of the subscribed mode, and verifies none of another's tag", () => {
    const { queue, sockets, verified } = fakeRelays();
    const heard = listen(queue);
    const key = newTicketKey();
    const oneOnOne = ticketOf(key, { mode: "random-arena-1v1" });
    deliver(sockets[0], remoteEvent(key, oneOnOne, QUEUE_EVENT_KIND, "random-arena-1v1"));
    expect(verified).toEqual([]);
    deliver(sockets[0], remoteEvent(key, oneOnOne));
    expect(heard).toEqual([]);
  });

  it("verifies at most its budget of a flood, then a second's worth more a second later", () => {
    let now = NOW;
    const { queue, sockets, verified } = fakeRelays(() => now);
    const heard = listen(queue);
    const flood = () => {
      for (let n = 0; n < 2 * VERIFY_BURST; n += 1) {
        const key = newTicketKey();
        const event = remoteEvent(key, ticketOf(key));
        deliver(sockets[0], { ...event, sig: "0".repeat(128) });
      }
    };
    flood();
    expect(verified).toHaveLength(VERIFY_BURST);
    now += 1000;
    flood();
    expect(verified).toHaveLength(VERIFY_BURST + VERIFY_PER_SECOND);
    expect(heard).toEqual([]);

    // A flood slows the queue, never stops it.
    now += 1000;
    const honest = newTicketKey();
    deliver(sockets[0], remoteEvent(honest, ticketOf(honest)));
    expect(heard).toEqual([{ kind: "ticket", ticket: ticketOf(honest) }]);
  });

  it("drops a bad signature, another protocol, another kind, an oversize or malformed message", () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const socket = sockets[0];
    const key = newTicketKey();

    const forged = remoteEvent(key, ticketOf(key));
    deliver(socket, { ...forged, sig: newTicketKey().sign(hexToBytes(forged.id)) });
    deliver(socket, { ...forged, content: JSON.stringify(ticketOf(key)) + " " });
    deliver(socket, remoteEvent(key, ticketOf(key, { protocol: "someone-else" })));
    deliver(socket, remoteEvent(key, ticketOf(key), QUEUE_EVENT_KIND + 1));
    deliver(socket, remoteEvent(key, { ...ticketOf(key), padding: "x" }));
    deliver(socket, remoteEvent(key, "not a ticket"));
    socket?.handlers.message("[not json");
    socket?.handlers.message(
      JSON.stringify([
        "EVENT",
        "vibewars-queue",
        { ...forged, pad: "x".repeat(MAX_QUEUE_MESSAGE_BYTES) },
      ]),
    );
    socket?.handlers.message(JSON.stringify(["EVENT", "someone-elses-sub", forged]));
    expect(heard).toEqual([]);

    deliver(socket, forged);
    expect(heard).toHaveLength(1);
  });

  it("drops a ticket whose id is not the event's key, even validly signed", () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const honest = newTicketKey();
    const thief = newTicketKey();
    deliver(sockets[0], remoteEvent(thief, ticketOf(honest, { enteredAt: 0 })));
    expect(heard).toEqual([]);
  });

  it("takes a withdrawal from the ticket's own key, and not from another", () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const key = newTicketKey();
    deliver(sockets[0], remoteEvent(newTicketKey(), { withdrawn: key.ticketId }));
    expect(heard).toEqual([]);
    deliver(sockets[0], remoteEvent(key, { withdrawn: key.ticketId }));
    expect(heard).toEqual([{ kind: "withdrawn", ticketId: key.ticketId }]);
  });

  it("hears no heartbeat of a withdrawn ticket that a slower relay delivers late, for a TTL", () => {
    let now = NOW;
    const { queue, sockets } = fakeRelays(() => now);
    const heard = listen(queue);
    const key = newTicketKey();
    const late = remoteEvent(key, ticketOf(key, { heartbeatAt: NOW + 1 }));
    deliver(sockets[0], remoteEvent(key, ticketOf(key)));
    deliver(sockets[0], remoteEvent(key, { withdrawn: key.ticketId }));
    deliver(sockets[1], late);
    expect(heard).toEqual([
      { kind: "ticket", ticket: ticketOf(key) },
      { kind: "withdrawn", ticketId: key.ticketId },
    ]);

    // By then any copy of the ticket is dead to the queue client anyway.
    now += TICKET_TTL_MS;
    deliver(sockets[0], remoteEvent(key, ticketOf(key, { heartbeatAt: NOW + 2 })));
    expect(heard).toHaveLength(3);
  });

  it("withdraws a ticket it published with a signed withdrawal, and then forgets its key", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { queue, sockets } = fakeRelays();
    sockets[0]?.handlers.open();
    const key = queue.newTicketKey();
    queue.board.publish(ticketOf(key));
    queue.board.withdraw(key.ticketId);
    const { queue: other, sockets: theirs } = fakeRelays();
    const heard = listen(other);
    for (const event of sentEvents(sockets[0])) {
      deliver(theirs[0], event);
    }
    expect(heard).toEqual([
      { kind: "ticket", ticket: ticketOf(key) },
      { kind: "withdrawn", ticketId: key.ticketId },
    ]);
    queue.board.publish(ticketOf(key));
    expect(sentEvents(sockets[0])).toHaveLength(2);
  });

  it("says no-relay once when every socket has closed, again after one came back and closed", () => {
    vi.useFakeTimers();
    const { queue, sockets } = fakeRelays();
    const troubles: TransportTrouble[] = [];
    queue.board.onTrouble((trouble) => troubles.push(trouble));
    sockets[0]?.handlers.close();
    expect(troubles).toEqual([]);
    sockets[1]?.handlers.close();
    expect(troubles).toEqual(["no-relay"]);

    vi.advanceTimersByTime(RELAY_RETRY_MS);
    expect(sockets.map((socket) => socket.url)).toEqual([...RELAYS, ...RELAYS]);
    sockets[2]?.handlers.close();
    sockets[3]?.handlers.close();
    expect(troubles).toEqual(["no-relay"]);

    vi.advanceTimersByTime(RELAY_RETRY_MS);
    sockets[4]?.handlers.open();
    sockets[4]?.handlers.close();
    sockets[5]?.handlers.close();
    expect(troubles).toEqual(["no-relay", "no-relay"]);
  });

  it("closes every socket and opens none again", () => {
    vi.useFakeTimers();
    const { queue, sockets } = fakeRelays();
    sockets[0]?.handlers.close();
    queue.close();
    vi.advanceTimersByTime(RELAY_RETRY_MS);
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.closed).toBe(true);
  });
});

describe("party consents on the Nostr queue board (#1078)", () => {
  const GROUP_WON = "f".repeat(64);

  /** `key`'s consent to the party of `members` that won `groupId`, for `mode`. */
  const consentOf = (
    key: TicketKey,
    members: readonly TicketKey[],
    groupId = GROUP_WON,
    mode: QueueMode = "random-arena-2v2",
  ): string => {
    const ids = members.map((member) => member.ticketId).join("");
    return key.sign(sha256(admissionBytes("vibewars-party", groupId, ids, mode)));
  };

  /** Two fresh keys, sorted: a 2v2 party's members, the lower its leader. */
  const membersOf = (): [TicketKey, TicketKey] =>
    [newTicketKey(), newTicketKey()].sort((a, b) => (a.ticketId < b.ticketId ? -1 : 1)) as [
      TicketKey,
      TicketKey,
    ];

  /** `members`' ticket, led by the first, with `consents` in their order. */
  const partyTicket = (
    members: readonly TicketKey[],
    consents: readonly string[],
    extra: Partial<QueueTicket> = {},
  ): QueueTicket => {
    const [leader] = members;
    if (leader === undefined) {
      throw new Error("a party has members");
    }
    return ticketOf(leader, {
      members: members.map((key) => key.ticketId),
      party: { groupId: GROUP_WON, consents },
      ...extra,
    });
  };

  it("hears a party ticket whose every consent verifies: one check for the event, one a member", () => {
    const { queue, sockets, verified } = fakeRelays();
    const heard = listen(queue);
    const members = membersOf();
    const ticket = partyTicket(
      members,
      members.map((key) => consentOf(key, members)),
    );
    deliver(sockets[0], remoteEvent(members[0], ticket));
    expect(heard).toEqual([{ kind: "ticket", ticket }]);
    expect(verified).toEqual([members[0].ticketId, ...members.map((key) => key.ticketId)]);
  });

  it("drops a forger's party naming a real follower, signed by the forger or with the follower's consent to its real party (PR 1092), and the real party still forms", async () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const real = membersOf();
    const realTicket = partyTicket(
      real,
      real.map((key) => consentOf(key, real)),
    );
    const follower = real[1];
    // The forger leads with a key below the follower's and signs for both.
    let forger = newTicketKey();
    while (forger.ticketId >= follower.ticketId) {
      forger = newTicketKey();
    }
    const set = [forger, follower];
    const forged = partyTicket(set, [consentOf(forger, set), consentOf(forger, set)], {
      enteredAt: 0,
    });
    // The winning match's host saw the follower's real consent: to the
    // same group, but to the real party's members, not to these.
    const replayed = partyTicket(set, [consentOf(forger, set), consentOf(follower, real)], {
      enteredAt: 0,
    });
    deliver(sockets[0], remoteEvent(forger, forged));
    deliver(sockets[0], remoteEvent(forger, { ...replayed, heartbeatAt: NOW + 1 }));
    deliver(sockets[0], remoteEvent(real[0], realTicket));
    const solos = [newTicketKey(), newTicketKey()];
    for (const solo of solos) {
      deliver(sockets[0], remoteEvent(solo, ticketOf(solo)));
    }

    expect(heard.map((event) => event.kind === "ticket" && event.ticket.ticketId)).toEqual([
      real[0].ticketId,
      ...solos.map((solo) => solo.ticketId),
    ]);
    const groups = await formGroups({
      tickets: heard.flatMap((event) => (event.kind === "ticket" ? [event.ticket] : [])),
      now: NOW,
      mode: "random-arena-2v2",
      ascentRound: null,
      ignored: new Set(),
      mapPool: ["arena"],
    });
    expect(groups.map((group) => group.parties)).toEqual([[realTicket.members]]);
  });

  it("drops a team ticket whose consents were to a Random Arena party, and hears its own mode's (#1766)", () => {
    const { queue, sockets } = fakeRelays();
    const heard: QueueBoardEvent[] = [];
    queue.board.subscribe("team-arena", (event) => heard.push(event));
    const members = membersOf();
    const team = (mode: QueueMode) =>
      partyTicket(
        members,
        members.map((key) => consentOf(key, members, GROUP_WON, mode)),
        { mode: "team-arena", bots: 2 },
      );
    const tagged = (ticket: QueueTicket) =>
      remoteEvent(members[0], ticket, QUEUE_EVENT_KIND, "team-arena");
    deliver(sockets[0], tagged(team("random-arena-2v2")));
    expect(heard).toEqual([]);

    const ticket = { ...team("team-arena"), heartbeatAt: NOW + 1 };
    deliver(sockets[0], tagged(ticket));
    expect(heard).toEqual([{ kind: "ticket", ticket }]);
  });

  it("checks a heartbeat with the same consents once, and a changed party again", () => {
    const { queue, sockets, verified } = fakeRelays();
    const heard = listen(queue);
    const members = membersOf();
    const ticket = partyTicket(
      members,
      members.map((key) => consentOf(key, members)),
    );
    deliver(sockets[0], remoteEvent(members[0], ticket));
    expect(verified).toHaveLength(3);

    deliver(sockets[0], remoteEvent(members[0], { ...ticket, heartbeatAt: NOW + 5_000 }));
    expect(verified).toHaveLength(4);

    const elsewhere = "e".repeat(64);
    const moved = {
      ...ticket,
      heartbeatAt: NOW + 10_000,
      party: {
        groupId: elsewhere,
        consents: members.map((key) => consentOf(key, members, elsewhere)),
      },
    };
    deliver(sockets[0], remoteEvent(members[0], moved));
    expect(verified).toHaveLength(7);
    expect(heard).toHaveLength(3);
  });

  it("checks a heartbeat that swaps a member again, and drops it (PR 1092)", () => {
    const { queue, sockets } = fakeRelays();
    const heard = listen(queue);
    const follower = membersOf()[1];
    // The forger's own party of two keys it holds, under the follower.
    let forger = newTicketKey();
    while (forger.ticketId >= follower.ticketId) {
      forger = newTicketKey();
    }
    let sybil = newTicketKey();
    while (sybil.ticketId <= forger.ticketId) {
      sybil = newTicketKey();
    }
    const own = [forger, sybil];
    const ticket = partyTicket(
      own,
      own.map((key) => consentOf(key, own)),
    );
    deliver(sockets[0], remoteEvent(forger, ticket));
    // The same consents, now naming the follower instead.
    const swapped = {
      ...ticket,
      members: [forger.ticketId, follower.ticketId],
      heartbeatAt: NOW + 5_000,
    };
    deliver(sockets[0], remoteEvent(forger, swapped));
    expect(heard).toEqual([{ kind: "ticket", ticket }]);
  });

  it("drops a party it cannot pay every check for, and hears another relay's copy later", () => {
    let now = NOW;
    const { queue, sockets, verified } = fakeRelays(() => now);
    const heard = listen(queue);
    // Leave two checks: the event's own and one consent, of three.
    for (let n = 0; n < VERIFY_BURST - 2; n += 1) {
      const key = newTicketKey();
      deliver(sockets[0], { ...remoteEvent(key, ticketOf(key)), sig: "0".repeat(128) });
    }
    const members = membersOf();
    const event = remoteEvent(
      members[0],
      partyTicket(
        members,
        members.map((key) => consentOf(key, members)),
      ),
    );
    deliver(sockets[0], event);
    expect(verified).toHaveLength(VERIFY_BURST - 1);
    expect(heard).toEqual([]);

    now += 1000;
    deliver(sockets[1], event);
    expect(heard).toHaveLength(1);
  });
});
