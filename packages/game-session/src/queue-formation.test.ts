import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import {
  ROOM_PREFIX,
  formGroups,
  groupOf,
  ticketsOf,
  type FormedGroup,
} from "./queue-formation.js";

/** Queue formation (#869, #854 C4): the same tickets make the same groups everywhere. */

const NOW = 1_700_000_100_000;
const MAPS = ["arena-a", "arena-b", "arena-c"];

/** A ticket of `mode`'s round: Heroes' Ascent's first (#1996), none in other modes. */
function roundOf(mode: QueueMode): number | null {
  return mode === "heroes-ascent" ? 0 : null;
}

/** Ticket `n`: its id is `n` in hex, it entered `n` seconds before `NOW`'s epoch start. */
function ticket(n: number, fields: Partial<QueueTicket> = {}): QueueTicket {
  const ticketId = n.toString(16).padStart(64, "0");
  return {
    ticketId,
    protocol: PROTOCOL_VERSION,
    mode: "random-arena-4v4",
    members: [ticketId],
    bots: 0,
    enteredAt: 1_700_000_000_000 + n * 1_000,
    heartbeatAt: NOW,
    party: null,
    ascentRound: roundOf(fields.mode ?? "random-arena-4v4"),
    ...fields,
  };
}

/**
 * Ticket `n` as a party of `mode`'s whole team (#882): its id leads, and
 * each other member's key is the id with a higher first digit. Its
 * consents are only shaped like some: formation never sees them, since
 * the board drops a ticket whose consents do not verify (#1078).
 */
function party(n: number, mode: QueueMode = "random-arena-4v4"): QueueTicket {
  const leader = ticket(n, { mode });
  const others = Array.from(
    { length: teamSizeOf(mode) - 1 },
    (_, i) => `${String(i + 1)}${leader.ticketId.slice(1)}`,
  );
  const members = [leader.ticketId, ...others];
  const consents = members.map(() => "e".repeat(128));
  return { ...leader, members, party: { groupId: "f".repeat(64), consents } };
}

function solos(from: number, count: number, fields: Partial<QueueTicket> = {}): QueueTicket[] {
  return Array.from({ length: count }, (_, i) => ticket(from + i, fields));
}

function form(
  tickets: readonly QueueTicket[],
  mode: QueueMode = "random-arena-4v4",
  ignored: ReadonlySet<string> = new Set(),
): Promise<FormedGroup[]> {
  return formGroups({
    tickets,
    now: NOW,
    mode,
    ascentRound: roundOf(mode),
    ignored,
    mapPool: MAPS,
  });
}

function members(group: FormedGroup): string[] {
  return [...group.teams[0], ...group.teams[1]].sort();
}

/** The seat keys `tickets` bring: each solo's id, each party's members. */
function ids(tickets: readonly QueueTicket[]): string[] {
  return tickets.flatMap((t) => t.members).sort();
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const groupId = await sha256Hex(ids(queued).join("\n"));
    expect(group?.groupId).toBe(groupId);
    expect(group?.room).toBe(`${ROOM_PREFIX}${groupId}`);
    expect(group?.room).not.toMatch(/^[A-Z0-9]{6}$/);
    expect(MAPS).toContain(group?.mapId);
  });

  it("hosts the ticket with the lowest sha256(groupId ‖ ticketId), not the lowest id", async () => {
    let lowestIdHosted = 0;
    for (let from = 1; from <= 8; from += 1) {
      const queued = solos(from, 8);
      const [group] = await form(queued);
      const groupId = await sha256Hex(ids(queued).join("\n"));
      const ranked = await Promise.all(
        ids(queued).map(async (id) => [await sha256Hex(`${groupId}${id}`), id] as const),
      );
      const [, host] = ranked.sort(([a], [b]) => (a < b ? -1 : 1))[0] ?? [];
      expect(group?.hostTicketId).toBe(host);
      if (host === ticket(from).ticketId) {
        lowestIdHosted += 1;
      }
    }
    // One in eight by chance; never all of them.
    expect(lowestIdHosted).toBeLessThan(8);
  });

  it("every member, whatever order its tickets came in, forms the same group", async () => {
    const queued = solos(1, 8);
    const [expected] = await form(queued);
    for (const step of [1, 3, 5, 7]) {
      expect(await form(reordered(queued, step))).toEqual([expected]);
      expect(await form([...queued].reverse())).toEqual([expected]);
    }
    for (const own of queued) {
      expect(groupOf(await form(queued), own.ticketId, own.members)).toEqual(expected);
    }
    expect(groupOf(await form(queued), ticket(99).ticketId, ticket(99).members)).toBeUndefined();
  });

  it("a different set of tickets shuffles and names differently", async () => {
    const [one] = await form(solos(1, 8));
    const [other] = await form(solos(2, 8));
    expect(other?.groupId).not.toBe(one?.groupId);
  });

  it.each<[string, QueueTicket, boolean]>([
    ["expired", ticket(50, { heartbeatAt: NOW - TICKET_TTL_MS - 1 }), false],
    ["from the far future", ticket(50, { heartbeatAt: Number.MAX_SAFE_INTEGER }), false],
    ["from just over a TTL ahead", ticket(50, { heartbeatAt: NOW + TICKET_TTL_MS + 1 }), false],
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

  it("a party's member keys are a side of their own, facing four solo players", async () => {
    const team = party(1);
    const [group] = await form([team, ...solos(2, 4)]);
    expect(group?.teams.map((side) => [...side].sort())).toContainEqual(team.members);
    expect(group?.teams.map((side) => [...side].sort())).toContainEqual(ids(solos(2, 4)));
    expect(group?.parties).toEqual([team.members]);
  });

  it("two parties face each other, and the host is one of their tickets (#882)", async () => {
    const parties = [party(1, "random-arena-2v2"), party(2, "random-arena-2v2")];
    const [group] = await form(parties, "random-arena-2v2");
    expect(group?.teams.map((side) => [...side])).toEqual(
      expect.arrayContaining([parties[0]?.members, parties[1]?.members]),
    );
    expect(parties.map((t) => t.ticketId)).toContain(group?.hostTicketId);
    expect(group?.groupId).toBe(await sha256Hex(parties.map((t) => t.ticketId).join("\n")));
  });

  it("finds a party member's group by its own key (#882)", async () => {
    const team = party(1);
    const groups = await form([team, ...solos(2, 4)]);
    expect(groupOf(groups, team.members[3] ?? "", team.members)).toBe(groups[0]);
  });

  it("drops a party that names a live solo's id, and the solo plays on its own (#882)", async () => {
    // The forger's id sorts below the victim's, and claims to have queued first.
    const victim = ticket(9, { mode: "random-arena-2v2" });
    const forged = {
      ...ticket(1, { mode: "random-arena-2v2", enteredAt: 0 }),
      members: [ticket(1).ticketId, victim.ticketId],
    };
    const others = solos(10, 3, { mode: "random-arena-2v2" });
    const groups = await form([forged, victim, ...others], "random-arena-2v2");
    expect(groups.map((group) => group.parties)).toEqual([[]]);
    expect(groups[0] && members(groups[0])).toEqual(ids([victim, ...others]));
    expect(groupOf(groups, victim.ticketId, victim.members)).toBe(groups[0]);
  });

  // Both verified (#1078): the follower consented to both, its own doing.
  it("drops both parties that name one member, so neither seats the follower (#882)", async () => {
    const real = party(2, "random-arena-2v2");
    const follower = real.members[1] ?? "";
    const forged = {
      ...ticket(1, { mode: "random-arena-2v2", enteredAt: 0 }),
      members: [ticket(1).ticketId, follower],
    };
    const queued = [forged, real, ...solos(10, 2, { mode: "random-arena-2v2" })];
    expect(await form(queued, "random-arena-2v2")).toEqual([]);
  });

  it("settles a seat only where it sits as its own ticket (#882)", async () => {
    const team = party(1);
    const groups = await form([team, ...solos(2, 4)]);
    const follower = team.members[1] ?? "";
    // A solo whose id a party claims, or a follower of a party it never joined.
    expect(groupOf(groups, follower, [follower])).toBeUndefined();
    expect(groupOf(groups, follower, [team.ticketId, follower])).toBeUndefined();
    const solo = ticket(2);
    expect(groupOf(groups, solo.ticketId, solo.members)).toBe(groups[0]);
    expect(groupOf(groups, solo.ticketId, [solo.ticketId, follower])).toBeUndefined();
  });

  it("names the ticket behind a missing seat: a party's, or the solo's own (#882)", async () => {
    const team = party(1);
    const [group] = await form([team, ...solos(2, 4)]);
    if (group === undefined) {
      throw new Error("no group");
    }
    const solo = ticket(2).ticketId;
    expect(ticketsOf(group, [team.members[2] ?? "", solo, team.members[3] ?? ""])).toEqual([
      team.ticketId,
      solo,
    ]);
  });

  it("a party forms with the first side of solos, and the solo left over waits", async () => {
    // Five solos ahead of it: the party and the first four make a match,
    // the fifth leads the next with the solos after it.
    const team = party(6);
    const queued = [...solos(1, 5), team, ...solos(7, 7)];
    const [first, second, ...rest] = await form(queued);
    expect(rest).toEqual([]);
    expect(first && members(first)).toEqual(ids([team, ...solos(1, 4)]));
    expect(first?.teams.map((side) => [...side].sort())).toContainEqual(team.members);
    expect(second && members(second)).toEqual(ids([ticket(5), ...solos(7, 7)]));
  });

  it("two parties behind too few solos still face each other", async () => {
    const parties = [party(4), party(5)];
    const [group, ...rest] = await form([...solos(1, 3), ...parties]);
    expect(rest).toEqual([]);
    expect(group && members(group)).toEqual(ids(parties));
  });

  it("a party waits while there are not four solos to face it", async () => {
    expect(await form([party(1), ...solos(2, 3)])).toEqual([]);
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

  it("forms 20,000 tickets in one pass, every one of them", async () => {
    const queued = solos(1, 20_000);
    const groups = await form(reordered(queued, 7));
    expect(groups).toHaveLength(20_000 / 8);
    expect(new Set(groups.flatMap(members)).size).toBe(20_000);
  });

  it("a flood of tickets claiming to have queued first does not keep later players from meeting", async () => {
    const flood = solos(1_000_000, 1_024).map((t, i) => ({ ...t, enteredAt: i }));
    const real = solos(1, 8);
    const groups = await form([...flood, ...real]);
    expect(groups).toHaveLength(129);
    expect(groups.some((group) => members(group).join() === ids(real).join())).toBe(true);
  });

  it("throws on an empty map pool only when a group forms", async () => {
    const empty = {
      now: NOW,
      mode: "random-arena-1v1" as const,
      ascentRound: null,
      ignored: new Set<string>(),
      mapPool: [],
    };
    await expect(formGroups({ ...empty, tickets: [] })).resolves.toEqual([]);
    await expect(
      formGroups({ ...empty, tickets: solos(1, 2, { mode: "random-arena-1v1" }) }),
    ).rejects.toThrow();
  });
});

describe("team modes (ADR-0042)", () => {
  /**
   * Ticket `n` as a side of `mode`: `humans` keys led by its id, as
   * `party` makes them, and bots for the rest.
   */
  function side(n: number, mode: QueueMode, humans: number): QueueTicket {
    const whole = party(n, mode);
    const members = whole.members.slice(0, humans);
    return {
      ...whole,
      members,
      bots: teamSizeOf(mode) - humans,
      party:
        humans === 1
          ? null
          : { groupId: "f".repeat(64), consents: members.map(() => "e".repeat(128)) },
    };
  }

  it("two team tickets of one mode form a match, each a side, bots and all", async () => {
    const tickets = [side(1, "team-arena", 3), side(2, "team-arena", 1)];
    const [group, ...more] = await form(tickets, "team-arena");
    expect(more).toEqual([]);
    expect(group?.mode).toBe("team-arena");
    expect(group?.teams.map((seats) => [...seats])).toEqual(
      expect.arrayContaining([tickets[0]?.members, tickets[1]?.members]),
    );
    expect(group?.parties).toEqual(
      expect.arrayContaining([tickets[0]?.members, tickets[1]?.members]),
    );
    expect(tickets.map((t) => t.ticketId)).toContain(group?.hostTicketId);
    expect(group?.groupId).toBe(await sha256Hex(tickets.map((t) => t.ticketId).join("\n")));
  });

  it("one team ticket alone forms nothing", async () => {
    expect(await form([side(1, "gvg", 8)], "gvg")).toEqual([]);
    expect(await form([side(1, "heroes-ascent", 1)], "heroes-ascent")).toEqual([]);
  });

  it("modes never mix", async () => {
    const tickets = [side(1, "heroes-ascent", 8), side(2, "gvg", 8)];
    expect(await form(tickets, "heroes-ascent")).toEqual([]);
    expect(await form(tickets, "gvg")).toEqual([]);
  });

  describe("Heroes' Ascent rounds (#1996)", () => {
    /** Heroes' Ascent's sides `n` at `round`, formed at `round` with its one map. */
    const hero = (n: number, round: number): QueueTicket => ({
      ...side(n, "heroes-ascent", 1),
      ascentRound: round,
    });
    const formAt = (tickets: readonly QueueTicket[], round: number, map: string) =>
      formGroups({
        tickets,
        now: NOW,
        mode: "heroes-ascent",
        ascentRound: round,
        ignored: new Set(),
        mapPool: [map],
      });

    it("never groups sides at different rounds, even the only two queued", async () => {
      const tickets = [hero(1, 0), hero(2, 1)];
      expect(await formAt(tickets, 0, "relic-temples")).toEqual([]);
      expect(await formAt(tickets, 1, "forgotten-shrines")).toEqual([]);
    });

    it("groups two sides at round 2 on its map, and leaves the round-1 side waiting", async () => {
      const pair = [hero(2, 1), hero(3, 1)];
      const groups = await formAt([hero(1, 0), ...pair], 1, "forgotten-shrines");
      expect(groups.map(members)).toEqual([ids(pair)]);
      expect(groups[0]?.mapId).toBe("forgotten-shrines");
    });

    it("plays a pair at the last round in the Hall", async () => {
      const groups = await formAt([hero(1, 3), hero(2, 3)], 3, "hall-of-heroes");
      expect(groups.map((group) => group.mapId)).toEqual(["hall-of-heroes"]);
    });
  });

  it("the earliest two are picked, and the third waits", async () => {
    const first = side(1, "team-arena", 2);
    const second = side(2, "team-arena", 1);
    const groups = await form([side(3, "team-arena", 4), first, second], "team-arena");
    expect(groups.map(members)).toEqual([ids([first, second])]);
  });

  it("a one-human side finds its group by its own key", async () => {
    const tickets = [side(1, "team-arena", 1), side(2, "team-arena", 4)];
    const groups = await form(tickets, "team-arena");
    const lone = tickets[0];
    expect(lone && groupOf(groups, lone.ticketId, lone.members)).toBe(groups[0]);
  });
});
