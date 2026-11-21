import { describe, expect, it } from "vitest";

import {
  HALL_SLOT_SECONDS,
  createRng,
  hallSlotOpen,
  nextHallSlotMs,
  type TeamCount,
} from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  TICKET_TTL_MS,
  UNLISTED_CLAIM,
  isTeamQueueMode,
  teamSizeOf,
  type QueueMode,
  type QueueTicket,
} from "@vibewars/game-protocol";

import {
  ASCENT_SKIP_WAIT_SECONDS,
  ROOM_PREFIX,
  THIRD_TEAM_WAIT_SECONDS,
  formGroups,
  groupOf,
  isRankedGroup,
  ratingWindow,
  ticketsOf,
  type FormGroupsInput,
  type FormedGroup,
} from "./queue-formation.js";

// Real time, which no test here fakes: globals.d.ts does not declare it.
declare const performance: { now(): number };

/** Queue formation (#869, #854 C4): the same tickets make the same groups everywhere. */

const NOW = 1_700_000_100_000;
const MAPS = ["arena-a", "arena-b", "arena-c"];
/** The claim of a key no leaderboard lists, read from no leaderboard. */
const UNLISTED = { rating: UNLISTED_CLAIM, asOf: 0 };

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
    hardNat: false,
    holdsHallSince: null,
    claims: { [ticketId]: UNLISTED },
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
  const claims = Object.fromEntries(members.map((member) => [member, UNLISTED]));
  return { ...leader, members, claims, party: { groupId: "f".repeat(64), consents } };
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
    ignored,
    round: () => ({ mapPool: MAPS, teamCount: 2, skipping: false, slotted: false }),
  });
}

function members(group: FormedGroup): string[] {
  return group.teams.flat().sort();
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
      ignored: new Set<string>(),
      round: () => ({ mapPool: [], teamCount: 2 as const, skipping: false, slotted: false }),
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
      claims: Object.fromEntries(members.map((member) => [member, UNLISTED])),
      bots: teamSizeOf(mode) - humans,
      party:
        humans === 1
          ? null
          : { groupId: "f".repeat(64), consents: members.map(() => "e".repeat(128)) },
    };
  }

  it("two team tickets of one mode form a match, each a side, bots and all", async () => {
    const tickets = [side(1, "team-arena-4v4", 3), side(2, "team-arena-4v4", 1)];
    const [group, ...more] = await form(tickets, "team-arena-4v4");
    expect(more).toEqual([]);
    expect(group?.mode).toBe("team-arena-4v4");
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

  describe("skipping ahead in Heroes' Ascent (#2687)", () => {
    const WAITED = NOW - ASCENT_SKIP_WAIT_SECONDS * 1000;
    const hero = (n: number, round: number, enteredAt = NOW, hardNat = false): QueueTicket => ({
      ...side(n, "heroes-ascent", 1),
      ascentRound: round,
      enteredAt,
      hardNat,
    });
    // As `queueSkipping` draws it: not The Underworld (0), not the Hall (7).
    const form2 = (tickets: readonly QueueTicket[], now = NOW) =>
      formGroups({
        tickets,
        now,
        mode: "heroes-ascent",
        ignored: new Set(),
        round: (at) => ({
          mapPool: [`map-${String(at)}`],
          teamCount: 2,
          skipping: at !== 0 && at !== 7,
          slotted: false,
        }),
      });

    it("matches a side alone 60 s at round 3 with one at round 6, on round 6's map", async () => {
      const a = hero(1, 3, WAITED);
      const b = hero(2, 6);
      const groups = await form2([b, a]);
      expect(groups.map(members)).toEqual([ids([a, b])]);
      expect(groups[0]?.mapId).toBe("map-6");
    });

    it("forms the same group whichever order the tickets came in", async () => {
      const a = hero(1, 3, WAITED);
      const b = hero(2, 6);
      expect(await form2([a, b])).toEqual(await form2([b, a]));
    });

    it("does not match before the 60 s are up", async () => {
      expect(await form2([hero(1, 3, WAITED + 1), hero(2, 6)])).toEqual([]);
    });

    it("waits on the earlier side's time, not the later's", async () => {
      expect(await form2([hero(1, 3), hero(2, 6, WAITED)])).toEqual([]);
    });

    it("never skips round 0, The Underworld", async () => {
      expect(await form2([hero(1, 0, WAITED), hero(2, 6)])).toEqual([]);
    });

    it("never skips into the Hall", async () => {
      expect(await form2([hero(1, 3, WAITED), hero(2, 7)])).toEqual([]);
    });

    it("prefers an opponent at its own round", async () => {
      const pair = [hero(1, 3, WAITED), hero(2, 3)];
      const groups = await form2([...pair, hero(3, 6)]);
      expect(groups.map(members)).toEqual([ids(pair)]);
      expect(groups[0]?.mapId).toBe("map-3");
    });

    it("takes no side from a pair at its own round", async () => {
      const groups = await form2([hero(1, 3, WAITED), hero(2, 6), hero(3, 6)]);
      expect(groups).toHaveLength(1);
      expect(groups[0]?.mapId).toBe("map-6");
      expect(groups.map(members)).toEqual([ids([hero(2, 6), hero(3, 6)])]);
    });

    it("never pairs two hard NATs across rounds", async () => {
      expect(await form2([hero(1, 3, WAITED, true), hero(2, 6, NOW, true)])).toEqual([]);
    });

    it("leaves a lone side queued after 10 minutes: never bots, never a win", async () => {
      const lone = hero(1, 3, NOW - 600_000);
      expect(await form2([lone])).toEqual([]);
    });
  });

  describe("Heroes' Ascent rounds (#1996)", () => {
    /** Heroes' Ascent's sides `n` at `round`, formed at `round` with its one map. */
    const hero = (n: number, round: number): QueueTicket => ({
      ...side(n, "heroes-ascent", 1),
      ascentRound: round,
    });
    const formAt = (
      tickets: readonly QueueTicket[],
      round: number,
      map: string,
      { teamCount = 2, now = NOW }: { teamCount?: TeamCount; now?: number } = {},
    ) =>
      formGroups({
        tickets,
        now,
        mode: "heroes-ascent",
        ignored: new Set(),
        round: (at) => ({
          mapPool: [at === round ? map : "elsewhere"],
          teamCount,
          skipping: false,
          slotted: false,
        }),
      });

    it("drops a ticket at a round with no map, and the others still form", async () => {
      const groups = await formGroups({
        tickets: [hero(1, 2), hero(2, 2), hero(3, 7)],
        now: NOW,
        mode: "heroes-ascent",
        ignored: new Set(),
        round: (at) =>
          at === 7
            ? undefined
            : { mapPool: ["map"], teamCount: 2, skipping: false, slotted: false },
      });
      expect(groups).toHaveLength(1);
      expect(groups[0]?.parties.flat()).not.toContain(hero(3, 7).ticketId);
    });

    it("groups a 1-human side with 7 bots, and every side keeps a human (#2688)", async () => {
      const tickets = [hero(1, 0), hero(2, 0)];
      const groups = await formAt(tickets, 0, "broken-tower");
      expect(groups).toHaveLength(1);
      expect(groups[0]?.parties.map((members) => members.length)).toEqual([1, 1]);
      expect(tickets.map(({ bots }) => bots)).toEqual([7, 7]);
    });

    it("never groups sides at different rounds, even the only two queued", async () => {
      const tickets = [hero(1, 0), hero(2, 1)];
      expect(await formAt(tickets, 0, "broken-tower")).toEqual([]);
      expect(await formAt(tickets, 1, "scarred-earth")).toEqual([]);
    });

    it("groups two sides at round 2 on its map, and leaves the round-1 side waiting", async () => {
      const pair = [hero(2, 1), hero(3, 1)];
      const groups = await formAt([hero(1, 0), ...pair], 1, "scarred-earth");
      expect(groups.map(members)).toEqual([ids(pair)]);
      expect(groups[0]?.mapId).toBe("scarred-earth");
    });

    it("plays a pair at the last round in the Hall", async () => {
      const groups = await formAt([hero(1, 3), hero(2, 3)], 3, "hall-of-heroes-king");
      expect(groups.map((group) => group.mapId)).toEqual(["hall-of-heroes-king"]);
    });

    describe("of three teams (#2683)", () => {
      /** Side `n` at round 2, queued `ago` seconds before `NOW`. */
      const waited = (n: number, ago: number): QueueTicket => ({
        ...hero(n, 2),
        enteredAt: NOW - ago * 1_000,
      });
      /** Formed at `now`, each side heard from just then. */
      const formThree = (tickets: readonly QueueTicket[], now = NOW) =>
        formAt(
          tickets.map((ticket) => ({ ...ticket, heartbeatAt: now })),
          2,
          "threefold-keep",
          { teamCount: 3, now },
        );

      it("seats three sides as three teams, one a side", async () => {
        const three = [waited(1, 5), waited(2, 4), waited(3, 3)];
        const groups = await formThree(three);
        expect(groups.map(members)).toEqual([ids(three)]);
        expect(groups[0]?.teams.map((team) => team.length)).toEqual([1, 1, 1]);
        expect(groups[0]?.teams.flat().sort()).toEqual(ids(three));
      });

      it("has two wait for a third, and play each other after THIRD_TEAM_WAIT_SECONDS", async () => {
        expect(THIRD_TEAM_WAIT_SECONDS).toBe(30);
        const two = [waited(1, 40), waited(2, 10)];
        expect(await formThree(two)).toEqual([]);
        expect(await formThree(two, NOW + 19_999)).toEqual([]);
        const groups = await formThree(two, NOW + 20_000);
        expect(groups.map(members)).toEqual([ids(two)]);
        expect(groups[0]?.teams).toHaveLength(2);
      });

      it("never takes back two that formed before a third queued", async () => {
        // X at 0 s, Y at 1 s, Z at 40 s, formed at 41 s: X and Y play as two.
        const pair = [waited(1, 41), waited(2, 40)];
        const late = waited(3, 1);
        const groups = await formThree([...pair, late]);
        expect(groups.map(members)).toEqual([ids(pair)]);
        expect(groups[0]?.teams).toHaveLength(2);
        // A third in time is still a third.
        expect((await formThree([...pair, waited(3, 10.001)])).map(members)).toEqual([
          ids([...pair, waited(3, 10.001)]),
        ]);
      });

      it("forms three of four, and the fourth waits", async () => {
        const four = [waited(1, 5), waited(2, 4), waited(3, 3), waited(4, 2)];
        const groups = await formThree(four);
        expect(groups.map(members)).toEqual([ids(four.slice(0, 3))]);
      });

      it("never takes a side that left during the wait", async () => {
        // Side 2, queued 35 s ago, is gone: side 1 waits on, now with side 3.
        expect(await formThree([waited(1, 40), waited(3, 2)])).toEqual([]);
      });
    });
  });

  it("the earliest two are picked, and the third waits", async () => {
    const first = side(1, "team-arena-4v4", 2);
    const second = side(2, "team-arena-4v4", 1);
    const groups = await form([side(3, "team-arena-4v4", 4), first, second], "team-arena-4v4");
    expect(groups.map(members)).toEqual([ids([first, second])]);
  });

  it("never pairs a Team Arena side with one of another size (#2107)", async () => {
    const tickets = [
      side(1, "team-arena-2v2", 2),
      side(2, "team-arena-4v4", 2),
      side(3, "team-arena-8v8", 2),
    ];
    for (const mode of ["team-arena-2v2", "team-arena-4v4", "team-arena-8v8"] as const) {
      expect(await form(tickets, mode), mode).toEqual([]);
    }
    const twos = [side(1, "team-arena-2v2", 2), side(4, "team-arena-2v2", 1)];
    const [group] = await form([...twos, side(2, "team-arena-4v4", 2)], "team-arena-2v2");
    expect(group && members(group)).toEqual(ids(twos));
  });

  it("a one-human side finds its group by its own key", async () => {
    const tickets = [side(1, "team-arena-4v4", 1), side(2, "team-arena-4v4", 4)];
    const groups = await form(tickets, "team-arena-4v4");
    const lone = tickets[0];
    expect(lone && groupOf(groups, lone.ticketId, lone.members)).toBe(groups[0]);
  });
});

describe("hard NAT (#2090)", () => {
  const hard = { hardNat: true };

  /** The groups, each as its tickets' numbers in queue order. */
  async function formed(
    tickets: readonly QueueTicket[],
    mode: QueueMode = "random-arena-4v4",
  ): Promise<number[][]> {
    const numbers = new Map(tickets.map((t) => [t.ticketId, Number.parseInt(t.ticketId, 16)]));
    return (await form(tickets, mode)).map((group) =>
      [
        ...new Set(
          group.teams
            .flat()
            .map((key) => numbers.get(key) ?? numbers.get(`0${key.slice(1)}`) ?? -1),
        ),
      ].sort((a, b) => a - b),
    );
  }

  it("1v1 [A hard, B hard, C open] forms A and C, and B keeps its place", async () => {
    const mode = "random-arena-1v1";
    const queued = [
      ticket(1, { mode, ...hard }),
      ticket(2, { mode, ...hard }),
      ticket(3, { mode }),
    ];
    expect(await formed(queued, mode)).toEqual([[1, 3]]);
    expect(await formed([...queued, ticket(4, { mode })], mode)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });

  it("a group of only hard tickets never forms", async () => {
    const mode = "random-arena-2v2";
    expect(await formed(solos(1, 4, { mode, ...hard }), mode)).toEqual([]);
    expect(await formed(solos(1, 8, hard))).toEqual([]);
  });

  it("an all-hard front is skipped and the next candidate forms", async () => {
    const mode = "random-arena-2v2";
    const queued = [...solos(1, 4, { mode, ...hard }), ticket(5, { mode })];
    expect(await formed(queued, mode)).toEqual([[1, 2, 3, 5]]);
  });

  it("two hard sides at the front of a team queue do not stop a later open one", async () => {
    const mode = "team-arena-4v4";
    const queued = [{ ...party(1, mode), ...hard }, { ...party(2, mode), ...hard }, party(3, mode)];
    expect(await formed(queued, mode)).toEqual([[1, 3]]);
  });

  it("a hard party behind hard solos meets its side once an open solo queues", async () => {
    const queued = [{ ...party(1), ...hard }, ...solos(2, 4, hard)];
    expect(await formed(queued)).toEqual([]);
    expect(await formed([...queued, ticket(6)])).toEqual([[1, 2, 3, 4, 6]]);
  });

  it("the host is never a hard ticket when the group has an open one", async () => {
    for (let open = 1; open <= 8; open += 1) {
      const queued = solos(1, 8).map((t, i) => (i + 1 === open ? t : { ...t, ...hard }));
      const [group] = await form(queued);
      expect(group?.hostTicketId).toBe(ticket(open).ticketId);
    }
    const mixed = solos(1, 8).map((t, i) => (i % 2 === 0 ? { ...t, ...hard } : t));
    for (let from = 0; from < 4; from += 1) {
      const queued = mixed.map((t, i) => ({
        ...t,
        ...ticket(i + 1 + from * 8),
        hardNat: t.hardNat,
      }));
      const [group] = await form(queued);
      const host = queued.find((t) => t.ticketId === group?.hostTicketId);
      expect(host?.hardNat).toBe(false);
    }
  });

  it("the same tickets make the same groups and hosts in any arrival order", async () => {
    const mode = "random-arena-2v2";
    const queued = [
      ...solos(1, 3, { mode, ...hard }),
      ticket(4, { mode }),
      ...solos(5, 2, { mode, ...hard }),
      ...solos(7, 3, { mode }),
    ];
    const expected = await form(queued, mode);
    expect(expected.length).toBeGreaterThan(0);
    for (const step of [2, 4, 5]) {
      expect(await form(reordered(queued, step), mode)).toEqual(expected);
    }
  });
});

describe("the Hall in its slots (#2701)", () => {
  const SLOT_MS = 720_000;
  const OPEN = Math.ceil(NOW / SLOT_MS) * SLOT_MS + SLOT_MS;
  const QUEUED = OPEN - 60_000;
  const LAST = 12;

  const hall = (n: number, fields: Partial<QueueTicket> = {}): QueueTicket =>
    ticket(n, {
      mode: "heroes-ascent",
      bots: 7,
      ascentRound: LAST,
      enteredAt: QUEUED + n,
      heartbeatAt: OPEN,
      ...fields,
    });
  const formAt = (now: number, tickets: readonly QueueTicket[]): Promise<FormedGroup[]> =>
    formGroups({
      tickets: tickets.map((one) => ({ ...one, heartbeatAt: now })),
      now,
      mode: "heroes-ascent",
      ignored: new Set(),
      round: () => ({ mapPool: MAPS, teamCount: 3, skipping: false, slotted: true }),
    });
  const seated = (groups: readonly FormedGroup[]): string[] =>
    groups.flatMap((group) => group.parties.flat()).sort();
  const idOf = (n: number): string => hall(n).ticketId;

  it("forms nothing with the window shut", async () => {
    expect(await formAt(OPEN + 30_000, [hall(1), hall(2), hall(3)])).toEqual([]);
    expect(await formAt(OPEN - 1, [hall(1), hall(2), hall(3)])).toEqual([]);
  });

  it("seats the holder and two challengers, one group, whoever queued first", async () => {
    const groups = await formAt(OPEN, [
      hall(1),
      hall(2),
      hall(3),
      hall(4, { holdsHallSince: 5_000 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(seated(groups)).toEqual([idOf(1), idOf(2), idOf(4)].sort());
  });

  it("of two claims, seats the greatest as the holder and the other as a challenger", async () => {
    const groups = await formAt(OPEN, [
      hall(1),
      hall(2, { holdsHallSince: 5_000 }),
      hall(3),
      hall(4, { holdsHallSince: 9_000 }),
    ]);
    expect(seated(groups)).toEqual([idOf(1), idOf(2), idOf(4)].sort());
  });

  it("seats two with no wait for a third side", async () => {
    expect(seated(await formAt(OPEN, [hall(1), hall(2)]))).toEqual([idOf(1), idOf(2)].sort());
  });

  it("forms nothing for a holder alone or a lone challenger", async () => {
    expect(await formAt(OPEN, [hall(1, { holdsHallSince: 5_000 })])).toEqual([]);
    expect(await formAt(OPEN, [hall(1)])).toEqual([]);
  });

  it("leaves out a side that queued at or after the slot's start", async () => {
    const groups = await formAt(OPEN + 1_000, [hall(1), hall(2), hall(3, { enteredAt: OPEN })]);
    expect(seated(groups)).toEqual([idOf(1), idOf(2)].sort());
  });
});

describe("ranked groups (ADR-0055, #3573)", () => {
  /** Ticket `n` as a side of 2v2 Team Arena: a party of two humans, or one and a bot. */
  function side(n: number, humans: 1 | 2): QueueTicket {
    const whole = party(n, "team-arena-2v2");
    const members = whole.members.slice(0, humans);
    return {
      ...whole,
      members,
      claims: Object.fromEntries(members.map((member) => [member, UNLISTED])),
      bots: 2 - humans,
      party: humans === 1 ? null : whole.party,
    };
  }

  it("is every ticket bringing no bot: a bot ticket keeps its group unranked", () => {
    expect(isRankedGroup(solos(1, 8))).toBe(true);
    expect(isRankedGroup([side(1, 2), side(2, 2)])).toBe(true);
    expect(isRankedGroup([side(1, 2), side(2, 1)])).toBe(false);
    expect(isRankedGroup([])).toBe(false);
  });

  it("forms solos ranked, a side with a bot unranked", async () => {
    const [solo] = await form(solos(1, 8));
    expect(solo?.ranked).toBe(true);
    const [humans] = await form([side(1, 2), side(2, 2)], "team-arena-2v2");
    expect(humans?.ranked).toBe(true);
    const [botted] = await form([side(1, 2), side(2, 1)], "team-arena-2v2");
    expect(botted?.ranked).toBe(false);
  });

  it("draws one u32 seed from the group's id, whatever order its tickets are seen in", async () => {
    const tickets = solos(1, 8);
    const [group] = await form(tickets);
    const [again] = await form([...tickets].reverse());
    const [other] = await form(solos(20, 8));
    expect(group?.seed).toBe(again?.seed);
    expect(Number.isInteger(group?.seed)).toBe(true);
    expect(group?.seed).toBeGreaterThanOrEqual(0);
    expect(group?.seed).toBeLessThan(2 ** 32);
    expect(other?.seed).not.toBe(group?.seed);
  });

  it("carries every seat key's claim, each with the leaderboard it was read from", async () => {
    const tickets = solos(1, 8).map((each, n) => ({
      ...each,
      claims: { [each.ticketId]: { rating: 700 + n, asOf: n * 10 } },
    }));
    const [group] = await form(tickets);
    expect(group?.claims).toEqual(
      Object.fromEntries(tickets.flatMap((each) => Object.entries(each.claims))),
    );
  });
});

describe("rating pairing (ADR-0055, #3575)", () => {
  const START = 1_700_000_000_000;

  /** Solo `n` of `mode`, queued `n` seconds after `START`, claiming `claim`. */
  function rated(n: number, claim: number, mode: QueueMode = "random-arena-1v1"): QueueTicket {
    const solo = ticket(n, { mode });
    return { ...solo, claims: { [solo.ticketId]: { rating: claim, asOf: 0 } } };
  }

  /** `mode`'s party `n`, every member claiming `claim`, `bots` of its seats bots. */
  function ratedSide(n: number, claim: number, bots = 0): QueueTicket {
    const whole = party(n, "team-arena-2v2");
    const members = whole.members.slice(0, 2 - bots);
    return {
      ...whole,
      members,
      bots,
      party: members.length === 1 ? null : whole.party,
      claims: Object.fromEntries(members.map((member) => [member, { rating: claim, asOf: 0 }])),
    };
  }

  /** The groups `tickets` form `seconds` after `START`, every ticket heard just now. */
  function formAt(
    tickets: readonly QueueTicket[],
    seconds: number,
    mode: QueueMode = "random-arena-1v1",
  ): Promise<FormedGroup[]> {
    const now = START + seconds * 1_000;
    return formGroups({
      tickets: tickets.map((each) => ({ ...each, heartbeatAt: now })),
      now,
      mode,
      ignored: new Set(),
      round: () => ({ mapPool: MAPS, teamCount: 2, skipping: false, slotted: false }),
    });
  }

  it("opens the window at ±100 and widens it by 10 a second the first queued waits", async () => {
    const pair = [rated(0, 1000), rated(1, 1250)];
    expect(await formAt(pair, 1)).toEqual([]);
    expect(await formAt(pair, 14)).toEqual([]);
    expect((await formAt(pair, 15)).map(members)).toEqual([ids(pair)]);
    expect(ratingWindow(0)).toBe(100);
    expect(ratingWindow(14_999)).toBe(240);
  });

  it("matches two players 1200 apart once the first has waited 50 s, and not before", async () => {
    const pair = [rated(0, 800), rated(1, 2000)];
    expect(await formAt(pair, 49)).toEqual([]);
    expect((await formAt(pair, 50)).map(members)).toEqual([ids(pair)]);
  });

  it("passes over a ticket out of range: the next in range plays, and it keeps waiting", async () => {
    const [low, high, near] = [rated(0, 800), rated(1, 2000), rated(2, 850)];
    const groups = await formAt([low, high, near], 3);
    expect(groups.map(members)).toEqual([ids([low, near])]);
  });

  it("splits ranked solos by a snake draft on claim, so the two sides' averages land close", async () => {
    const eight = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700].map((claim, n) =>
      rated(n, claim, "random-arena-4v4"),
    );
    const [group] = await formAt(eight, 60, "random-arena-4v4");
    const claim = (key: string): number => group?.claims[key]?.rating ?? 0;
    const sums = (group?.teams ?? []).map((team) => team.reduce((sum, key) => sum + claim(key), 0));
    expect(sums).toEqual([5400, 5400]);
  });

  it("pairs whole teams by their mean claim", async () => {
    const sides = [ratedSide(0, 1000), ratedSide(1, 2000), ratedSide(2, 1050)];
    const groups = await formAt(sides, 3, "team-arena-2v2");
    expect(groups.map(members)).toEqual([ids(sides.filter((_, i) => i !== 1))]);
  });

  it("forms a group with a bot ticket as before, however far apart the claims", async () => {
    const sides = [ratedSide(0, 800), ratedSide(1, 2400, 1)];
    expect((await formAt(sides, 2, "team-arena-2v2")).map(members)).toEqual([ids(sides)]);
  });

  it("passes over 400 tickets none of which is in another's window within a queue tick", async () => {
    // Claims 1000 apart, all queued within the last second: nobody pairs.
    const spread = Array.from({ length: 400 }, (_, n) => ({
      ...rated(n, 1000 * (n + 1), "random-arena-4v4"),
      enteredAt: START + n,
    }));
    expect(await formAt(spread, 1, "random-arena-4v4")).toEqual([]);
    // Timed warm, as a client forms every tick: the first pass pays the JIT.
    const begun = performance.now();
    await formAt(spread, 1, "random-arena-4v4");
    // Every queued client forms every 250 ms (session.ts' QUEUE_TICK_SECONDS).
    expect(performance.now() - begun).toBeLessThan(250);
  });

  it("forms the same groups whatever order the tickets come in", async () => {
    const queue = [800, 2000, 850, 1990, 1400, 1300].map((claim, n) => rated(n, claim));
    const groups = await formAt(queue, 8);
    expect(groups.map(members)).toEqual(
      [
        [0, 2],
        [1, 3],
        [4, 5],
      ].map((pair) => ids(pair.map((n) => queue[n] ?? ticket(-1)))),
    );
    for (const step of [5, 7]) {
      expect(await formAt(reordered(queue, step), 8)).toEqual(groups);
    }
  });
});

describe("formation cost (#3747)", () => {
  const START = 1_700_000_000_000;
  const AT = START + 2_000;

  /** Ticket `n` of Random Arena 1v1, queued at `enteredAt` claiming `claim`, heard at `AT`. */
  function rated(n: number, claim: number, enteredAt: number, hardNat = false): QueueTicket {
    const solo = ticket(n, { mode: "random-arena-1v1" });
    return {
      ...solo,
      enteredAt,
      heartbeatAt: AT,
      hardNat,
      claims: { [solo.ticketId]: { rating: claim, asOf: 0 } },
    };
  }

  /**
   * `count` hostile tickets claiming to have queued first, all within a
   * second: claims 1000 apart, so none is in another's window, or all
   * `hardNat` at one claim, so none can connect to another.
   */
  function flood(count: number, hardNat: boolean): QueueTicket[] {
    return Array.from({ length: count }, (_, n) =>
      rated(
        1_000_000 + n,
        hardNat ? 1500 : 1000 * (n + 1),
        START + Math.floor((n * 1000) / count),
        hardNat,
      ),
    );
  }

  /** The honest pair behind a flood, 50 apart. */
  const honest = [rated(1, 1500, START + 1_500), rated(2, 1550, START + 1_600)];

  function inputOf(tickets: readonly QueueTicket[]): FormGroupsInput {
    return {
      tickets,
      now: AT,
      mode: "random-arena-1v1",
      ignored: new Set(),
      round: () => ({ mapPool: MAPS, teamCount: 2, skipping: false, slotted: false }),
    };
  }

  /**
   * A queue drawn from `seed`: any mode, 0 to 300 tickets, solos and
   * parties, bots, `hardNat`, Heroes' Ascent rounds of two and three
   * sides, skipping and slotted, waits either side of every threshold,
   * claims tight or spread, stale, ignored and repeated tickets.
   */
  function mixedQueue(seed: number): FormGroupsInput {
    const rng = createRng(seed + 1);
    const modes: QueueMode[] = [
      "random-arena-4v4",
      "random-arena-1v1",
      "team-arena-2v2",
      "heroes-ascent",
    ];
    const mode = modes[rng.nextInt(0, modes.length)] ?? "random-arena-4v4";
    const spread = [60, 150, 600, 3000][rng.nextInt(0, 4)] ?? 600;
    const tickets = Array.from({ length: rng.nextInt(0, 301) }, (_, i) => {
      const n = seed * 1_000 + i;
      const whole = mode === "random-arena-4v4" && rng.nextInt(0, 6) === 0;
      const base = whole ? party(n, mode) : ticket(n, { mode });
      return {
        ...base,
        bots: isTeamQueueMode(mode) ? rng.nextInt(0, 2) : 0,
        enteredAt: NOW - rng.nextInt(-2_000, 90_000),
        heartbeatAt: rng.nextInt(0, 20) === 0 ? NOW - TICKET_TTL_MS - 1 : NOW,
        hardNat: rng.nextInt(0, 3) === 0,
        ascentRound: mode === "heroes-ascent" ? rng.nextInt(0, 5) : null,
        claims: Object.fromEntries(
          base.members.map((member) => [
            member,
            { rating: 1500 + rng.nextInt(-spread, spread + 1), asOf: 0 },
          ]),
        ),
      };
    });
    const again = tickets[rng.nextInt(0, Math.max(1, tickets.length))];
    return {
      tickets: again === undefined ? tickets : [...tickets, { ...again, heartbeatAt: NOW - 1 }],
      now: NOW,
      mode,
      ignored: new Set(tickets.filter(() => rng.nextInt(0, 25) === 0).map((t) => t.ticketId)),
      round: (at) => ({
        mapPool: MAPS,
        teamCount: at === 2 ? 3 : 2,
        skipping: at !== 0 && at !== 4,
        slotted: at === 4,
      }),
    };
  }

  it("forms exactly the groups the quadratic formation did, for 240 drawn queues", async () => {
    let formed = 0;
    for (let seed = 0; seed < 240; seed += 1) {
      const input = mixedQueue(seed);
      const groups = (await formGroups(input)).map((group) => group.groupId);
      expect(groups, `seed ${String(seed)}`).toEqual(await referenceGroupIds(input));
      formed += groups.length;
    }
    // The draw is no use if nothing forms.
    expect(formed).toBeGreaterThan(1_000);
  });

  it("2000 tickets in nobody's window queued first: the honest pair behind them forms", async () => {
    const groups = await formGroups(inputOf([...flood(2_000, false), ...honest]));
    expect(groups.map(members)).toEqual([ids(honest)]);
  });

  it("2000 hard-NAT solos queued first: each of the honest pair is seated", async () => {
    const groups = await formGroups(inputOf([...flood(2_000, true), ...honest]));
    expect(groups.flatMap(members)).toEqual(expect.arrayContaining(ids(honest)));
  });

  it("visits under 6× as much for 4000 flooding tickets as for 1000: no pass is quadratic", async () => {
    for (const hardNat of [false, true]) {
      const visits = async (count: number): Promise<number> => {
        const cost = { visits: 0 };
        await formGroups(inputOf([...flood(count, hardNat), ...honest]), cost);
        return cost.visits;
      };
      const [small, large] = [await visits(1_000), await visits(4_000)];
      expect(large, `hardNat ${String(hardNat)}`).toBeLessThan(6 * small);
    }
  });
});

/**
 * The formation before #3747, quadratic in the queue, kept only as the
 * oracle the one above must match: the groups it forms, by id, first
 * formed first.
 */
async function referenceGroupIds(input: FormGroupsInput): Promise<string[]> {
  const formed = roundGroups(liveQueue(input), input.mode, input.round, input.now);
  return Promise.all(
    formed.map(({ group }) =>
      sha256Hex(
        group
          .map((each) => each.ticketId)
          .sort(compare)
          .join("\n"),
      ),
    ),
  );
}

function claimOf(ticket: QueueTicket): number {
  const claims = ticket.members.map((member) => ticket.claims[member]?.rating ?? 0);
  return claims.reduce((sum, claim) => sum + claim, 0) / claims.length;
}

function inWindow(group: readonly Queued[], at: number): boolean {
  const first = group.reduce<Queued | undefined>(
    (min, queued) => (min === undefined || queued.place < min.place ? queued : min),
    undefined,
  );
  if (first === undefined || !isRankedGroup(group.map((queued) => queued.ticket))) {
    return true;
  }
  const window = ratingWindow(at - first.ticket.enteredAt);
  const claim = claimOf(first.ticket);
  return group.every((queued) => Math.abs(claimOf(queued.ticket) - claim) <= window);
}

function pick(
  pools: readonly (readonly Queued[])[],
  counts: readonly number[],
  at: number,
): Queued[] | undefined {
  if (pools.some((pool, i) => pool.length < (counts[i] ?? 0))) {
    return undefined;
  }
  const front = pools.flatMap((pool, i) => pool.slice(0, counts[i]));
  if (inWindow(front, at)) {
    return front;
  }
  const rated = pools
    .flatMap((pool, i) =>
      pool
        .filter((queued) => queued.ticket.bots === 0)
        .map((queued) => ({ queued, pool: i, claim: claimOf(queued.ticket) })),
    )
    .sort((a, b) => a.claim - b.claim || a.queued.place - b.queued.place);
  const total = counts.reduce((sum, count) => sum + count, 0);
  for (const anchor of [...rated].sort((a, b) => a.queued.place - b.queued.place)) {
    const window = ratingWindow(at - anchor.queued.ticket.enteredAt);
    const from = firstAbove(rated, anchor.claim - window, false);
    const to = firstAbove(rated, anchor.claim + window, true);
    if (to - from < total) {
      continue;
    }
    const group = pools.flatMap((_, i) =>
      rated
        .slice(from, to)
        .filter(
          ({ queued, pool }) =>
            pool === i && (queued === anchor.queued || queued.place > anchor.queued.place),
        )
        .map(({ queued }) => queued)
        .sort((a, b) => a.place - b.place)
        .slice(0, counts[i]),
    );
    if (group.length === front.length && inWindow(group, at)) {
      return group;
    }
  }
  return undefined;
}

function firstAbove(
  sorted: readonly { readonly claim: number }[],
  bound: number,
  strict: boolean,
): number {
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const mid = (low + high) >>> 1;
    const claim = sorted[mid]?.claim ?? Number.POSITIVE_INFINITY;
    if (claim > bound || (!strict && claim === bound)) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function queueOrder(a: QueueTicket, b: QueueTicket): number {
  return (
    a.enteredAt - b.enteredAt ||
    compare(a.ticketId, b.ticketId) ||
    b.heartbeatAt - a.heartbeatAt ||
    a.members.length - b.members.length ||
    compare(a.members.join(), b.members.join())
  );
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isLive(ticket: QueueTicket, now: number): boolean {
  return Math.abs(now - ticket.heartbeatAt) <= TICKET_TTL_MS;
}

function liveTickets(input: Pick<FormGroupsInput, "tickets" | "now" | "mode">): QueueTicket[] {
  const live = input.tickets
    .filter(
      (ticket) =>
        ticket.protocol === PROTOCOL_VERSION &&
        ticket.mode === input.mode &&
        isLive(ticket, input.now),
    )
    .sort(queueOrder);
  const ids = new Set<string>();
  return live.filter((ticket) => {
    if (ids.has(ticket.ticketId)) {
      return false;
    }
    ids.add(ticket.ticketId);
    return true;
  });
}

function unclaimed(live: readonly QueueTicket[]): (ticket: QueueTicket) => boolean {
  const ids = new Set(live.map((ticket) => ticket.ticketId));
  const claims = new Map<string, number>();
  for (const ticket of live) {
    for (const member of ticket.members.slice(1)) {
      claims.set(member, (claims.get(member) ?? 0) + 1);
    }
  }
  return (ticket) =>
    ticket.members.slice(1).every((member) => !ids.has(member) && claims.get(member) === 1);
}

function liveQueue(input: FormGroupsInput): QueueTicket[] {
  const live = liveTickets(input);
  const own = unclaimed(live);
  return live.filter(
    (ticket) =>
      !input.ignored.has(ticket.ticketId) &&
      own(ticket) &&
      input.round(ticket.ascentRound) !== undefined,
  );
}

interface Queued {
  readonly ticket: QueueTicket;
  readonly place: number;
}

function earlier(a: readonly Queued[], b: readonly Queued[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const difference = (a[i]?.place ?? 0) - (b[i]?.place ?? 0);
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return a.length <= b.length;
}

function isSide(ticket: QueueTicket, mode: QueueMode): boolean {
  return isTeamQueueMode(mode) || ticket.members.length > 1;
}

function takeGroups(
  queue: readonly QueueTicket[],
  mode: QueueMode,
  teamCount: TeamCount,
  now: number,
): QueueTicket[][] {
  const teamSize = teamSizeOf(mode);
  const groups: QueueTicket[][] = [];
  let solos: Queued[] = [];
  let parties: Queued[] = [];
  const take = (group: readonly Queued[]): void => {
    const taken = new Set(group);
    solos = solos.filter((queued) => !taken.has(queued));
    parties = parties.filter((queued) => !taken.has(queued));
    groups.push(group.map((queued) => queued.ticket));
  };
  const settlePairs = (at: number): void => {
    for (;;) {
      const front = teamCount === 3 ? pick([parties], [2], at) : undefined;
      const [pair] = front === undefined ? [] : fitting(reachable(front, [parties]), at);
      const queuedLast = Math.max(...(pair ?? []).map((queued) => queued.ticket.enteredAt));
      if (pair === undefined || at - queuedLast < THIRD_TEAM_WAIT_SECONDS * 1000) {
        return;
      }
      take(pair);
    }
  };
  const formOne = (at: number): boolean => {
    const fronts = [
      pick([parties], [teamCount], at),
      pick([parties, solos], [1, teamSize], at),
      pick([solos], [2 * teamSize], at),
    ];
    const pools = [[parties], [parties, solos], [solos]];
    const candidates = fronts.flatMap((front, i) =>
      front === undefined ? [] : fitting(reachable(front, pools[i] ?? []), at),
    );
    const best = candidates
      .map((candidate) => [...candidate].sort((a, b) => a.place - b.place))
      .reduce<Queued[] | undefined>(
        (chosen, candidate) =>
          chosen === undefined || earlier(candidate, chosen) ? candidate : chosen,
        undefined,
      );
    if (best !== undefined) {
      take(best);
    }
    return best !== undefined;
  };
  queue.forEach((ticket, place) => {
    settlePairs(ticket.enteredAt);
    (isSide(ticket, mode) ? parties : solos).push({ ticket, place });
    while (formOne(ticket.enteredAt)) {
      // Ranked windows that widened while nobody queued can fill more than one.
    }
  });
  settlePairs(now);
  while (formOne(now)) {
    // As above: a window wide enough by now forms its group.
  }
  return groups;
}

function fitting(candidates: readonly Queued[][], at: number): Queued[][] {
  return candidates.filter((candidate) => inWindow(candidate, at));
}

function reachable(front: readonly Queued[], pools: readonly (readonly Queued[])[]): Queued[][] {
  if (front.some((queued) => !queued.ticket.hardNat)) {
    return [[...front]];
  }
  return pools.flatMap((pool) => {
    const open = pool.find((queued) => !queued.ticket.hardNat);
    const latest = front
      .filter((queued) => pool.includes(queued))
      .reduce<Queued | undefined>(
        (last, queued) => (last === undefined || queued.place > last.place ? queued : last),
        undefined,
      );
    return open === undefined || latest === undefined
      ? []
      : [front.map((queued) => (queued === latest ? open : queued))];
  });
}

function isLater(a: QueueTicket, b: QueueTicket): boolean {
  return a.ascentRound !== null && b.ascentRound !== null && a.ascentRound > b.ascentRound;
}

function skipPairs(
  waiting: readonly QueueTicket[],
  round: FormGroupsInput["round"],
  now: number,
): (readonly [QueueTicket, QueueTicket])[] {
  const reaches = (a: QueueTicket, b: QueueTicket): boolean => !a.hardNat || !b.hardNat;
  const alone = waiting.filter(
    (ticket) =>
      round(ticket.ascentRound)?.skipping === true &&
      !waiting.some(
        (other) =>
          other !== ticket && other.ascentRound === ticket.ascentRound && reaches(ticket, other),
      ),
  );
  const pairs: (readonly [QueueTicket, QueueTicket])[] = [];
  const taken = new Set<QueueTicket>();
  for (const ticket of alone) {
    if (taken.has(ticket) || now - ticket.enteredAt < ASCENT_SKIP_WAIT_SECONDS * 1000) {
      continue;
    }
    const later = alone.find(
      (other) => !taken.has(other) && isLater(other, ticket) && reaches(ticket, other),
    );
    if (later !== undefined) {
      taken.add(ticket).add(later);
      pairs.push([ticket, later]);
    }
  }
  return pairs;
}

function hallGroup(
  queue: readonly QueueTicket[],
  teamCount: TeamCount,
  now: number,
): QueueTicket[][] {
  if (!hallSlotOpen(now)) {
    return [];
  }
  const slotStart = nextHallSlotMs(now) - HALL_SLOT_SECONDS * 1000;
  const waiting = queue.filter((ticket) => ticket.enteredAt < slotStart);
  const [holder] = waiting
    .filter((ticket) => ticket.holdsHallSince !== null)
    .sort((a, b) => (b.holdsHallSince ?? 0) - (a.holdsHallSince ?? 0));
  const seated = [
    ...(holder === undefined ? [] : [holder]),
    ...waiting.filter((ticket) => ticket !== holder),
  ].map((ticket, place) => ({ ticket, place }));
  if (seated.length < 2) {
    return [];
  }
  const [group] = reachable(seated.slice(0, teamCount), [seated]);
  return group === undefined ? [] : [group.map((queued) => queued.ticket)];
}

function roundGroups(
  queue: readonly QueueTicket[],
  mode: QueueMode,
  round: FormGroupsInput["round"],
  now: number,
): { readonly group: readonly QueueTicket[]; readonly ascentRound: number | null }[] {
  const rounds = [...new Set(queue.map((ticket) => ticket.ascentRound))].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  );
  const groups = rounds.flatMap((ascentRound) => {
    const atRound = queue.filter((ticket) => ticket.ascentRound === ascentRound);
    const teamCount = round(ascentRound)?.teamCount ?? 2;
    return (
      round(ascentRound)?.slotted === true
        ? hallGroup(atRound, teamCount, now)
        : takeGroups(atRound, mode, teamCount, now)
    ).map((group) => ({ group, ascentRound }));
  });
  const grouped = new Set(groups.flatMap(({ group }) => group));
  const waiting = queue.filter((ticket) => !grouped.has(ticket));
  return [
    ...groups,
    ...skipPairs(waiting, round, now).map((group) => ({
      group,
      ascentRound: group[1].ascentRound,
    })),
  ];
}
