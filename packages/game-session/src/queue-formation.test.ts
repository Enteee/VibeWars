import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import { ROOM_PREFIX, formGroups, groupOf, type FormedGroup } from "./queue-formation.js";

/** Queue formation (#869, #854 C4): the same tickets make the same groups everywhere. */

const NOW = 1_700_000_100_000;
const MAPS = ["arena-a", "arena-b", "arena-c"];

/** Ticket `n`: its id is `n` in hex, it entered `n` seconds before `NOW`'s epoch start. */
function ticket(n: number, fields: Partial<QueueTicket> = {}): QueueTicket {
  return {
    ticketId: n.toString(16).padStart(64, "0"),
    protocol: PROTOCOL_VERSION,
    mode: "random-arena-4v4",
    partySize: 1,
    enteredAt: 1_700_000_000_000 + n * 1_000,
    heartbeatAt: NOW,
    ...fields,
  };
}

function solos(from: number, count: number, fields: Partial<QueueTicket> = {}): QueueTicket[] {
  return Array.from({ length: count }, (_, i) => ticket(from + i, fields));
}

function form(
  tickets: readonly QueueTicket[],
  mode: QueueMode = "random-arena-4v4",
  ignored: ReadonlySet<string> = new Set(),
): Promise<FormedGroup[]> {
  return formGroups({ tickets, now: NOW, mode, ignored, mapPool: MAPS });
}

function members(group: FormedGroup): string[] {
  return [...group.teams[0], ...group.teams[1]].sort();
}

function ids(tickets: readonly QueueTicket[]): string[] {
  return tickets.map((t) => t.ticketId).sort();
}

/** `tickets` in a different order, the same on every run. */
function reordered(tickets: readonly QueueTicket[], step: number): QueueTicket[] {
  return tickets.map((_, i) => tickets[(i * step) % tickets.length] ?? ticket(-1));
}

describe("formGroups (#869)", () => {
  it.each<[QueueMode, number]>([
    ["random-arena-1v1", 1],
    ["random-arena-2v2", 3],
    ["random-arena-4v4", 7],
  ])("%s: %i tickets, one short, form nothing", async (mode, count) => {
    expect(await form(solos(1, count, { mode }), mode)).toEqual([]);
  });

  it.each<QueueMode>(["random-arena-1v1", "random-arena-2v2", "random-arena-4v4"])(
    "%s: a full set forms one group of two whole sides",
    async (mode) => {
      const size = teamSizeOf(mode);
      const queued = solos(1, 2 * size, { mode });
      const [group, ...rest] = await form(queued, mode);
      expect(rest).toEqual([]);
      expect(group?.teams.map((side) => side.length)).toEqual([size, size]);
      expect(group && members(group)).toEqual(ids(queued));
    },
  );

  it("names the group by its tickets: room, host and map from its id", async () => {
    const queued = solos(1, 8);
    const [group] = await form(queued);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ids(queued).join("\n")),
    );
    const groupId = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    expect(group?.groupId).toBe(groupId);
    expect(group?.room).toBe(`${ROOM_PREFIX}${groupId}`);
    expect(group?.room).not.toMatch(/^[A-Z0-9]{6}$/);
    expect(group?.hostTicketId).toBe(ticket(1).ticketId);
    expect(MAPS).toContain(group?.mapId);
  });

  it("every member, whatever order its tickets came in, forms the same group", async () => {
    const queued = solos(1, 8);
    const [expected] = await form(queued);
    for (const step of [1, 3, 5, 7]) {
      expect(await form(reordered(queued, step))).toEqual([expected]);
      expect(await form([...queued].reverse())).toEqual([expected]);
    }
    for (const own of queued) {
      expect(groupOf(await form(queued), own.ticketId)).toEqual(expected);
    }
    expect(groupOf(await form(queued), ticket(99).ticketId)).toBeUndefined();
  });

  it("a different set of tickets shuffles and names differently", async () => {
    const [one] = await form(solos(1, 8));
    const [other] = await form(solos(2, 8));
    expect(other?.groupId).not.toBe(one?.groupId);
  });

  it.each<[string, QueueTicket, boolean]>([
    ["expired", ticket(50, { heartbeatAt: NOW - TICKET_TTL_MS - 1 }), false],
    ["of another protocol", ticket(50, { protocol: "000000000000" }), false],
    ["of another mode", ticket(50, { mode: "random-arena-2v2" }), false],
    ["ignored", ticket(50), true],
  ])("leaves a ticket %s out", async (_, odd, ignore) => {
    const ignored = new Set(ignore ? [odd.ticketId] : []);
    // Queued first, so it would be taken if it counted.
    const first = { ...odd, enteredAt: 0 };
    expect(await form([first, ...solos(1, 7)], "random-arena-4v4", ignored)).toEqual([]);
    const [group] = await form([first, ...solos(1, 8)], "random-arena-4v4", ignored);
    expect(group && members(group)).toEqual(ids(solos(1, 8)));
  });

  it("a ticket heard exactly TICKET_TTL_MS ago is still live", async () => {
    const queued = [ticket(1, { heartbeatAt: NOW - TICKET_TTL_MS }), ...solos(2, 7)];
    expect(await form(queued)).toHaveLength(1);
  });

  it("a ticket heard twice counts once", async () => {
    const queued = [...solos(1, 7), ticket(1, { heartbeatAt: NOW - 1_000 })];
    expect(await form(queued)).toEqual([]);
  });

  it("a party is a side of its own, facing four solo players", async () => {
    const party = ticket(1, { partySize: 4 });
    const [group] = await form([party, ...solos(2, 4)]);
    expect(group?.teams.map((side) => [...side].sort())).toContainEqual([party.ticketId]);
    expect(group?.teams.map((side) => [...side].sort())).toContainEqual(ids(solos(2, 4)));
  });

  it("two parties face each other", async () => {
    const parties = [
      ticket(1, { mode: "random-arena-2v2", partySize: 2 }),
      ticket(2, { mode: "random-arena-2v2", partySize: 2 }),
    ];
    const [group] = await form(parties, "random-arena-2v2");
    expect(group?.teams.map((side) => [...side])).toEqual(
      expect.arrayContaining([[parties[0]?.ticketId], [parties[1]?.ticketId]]),
    );
  });

  it("a party that does not fit keeps its place for the next group", async () => {
    // Five solos ahead of it leave three seats: the party waits, three
    // later solos fill them, and the party leads the next group.
    const party = ticket(6, { partySize: 4 });
    const queued = [...solos(1, 5), party, ...solos(7, 7)];
    const [first, second, ...rest] = await form(queued);
    expect(rest).toEqual([]);
    expect(first && members(first)).toEqual(ids([...solos(1, 5), ...solos(7, 3)]));
    expect(second && members(second)).toEqual(ids([party, ...solos(10, 4)]));
    expect(second?.teams.map((side) => [...side].sort())).toContainEqual([party.ticketId]);
  });

  it("a large queue forms groups that never share a ticket, earliest first", async () => {
    const queued = solos(1, 43);
    const groups = await form(reordered(queued, 7));
    expect(groups).toHaveLength(5);
    const all = groups.flatMap(members);
    expect(new Set(all).size).toBe(40);
    expect(groups[0] && members(groups[0])).toEqual(ids(solos(1, 8)));
    expect(all).not.toContain(ticket(41).ticketId);
  });

  it("throws on an empty map pool only when a group forms", async () => {
    const empty = {
      now: NOW,
      mode: "random-arena-1v1" as const,
      ignored: new Set<string>(),
      mapPool: [],
    };
    await expect(formGroups({ ...empty, tickets: [] })).resolves.toEqual([]);
    await expect(
      formGroups({ ...empty, tickets: solos(1, 2, { mode: "random-arena-1v1" }) }),
    ).rejects.toThrow();
  });
});
