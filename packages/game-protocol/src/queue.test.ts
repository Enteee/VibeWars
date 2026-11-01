import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "./protocol-version.js";
import {
  ASCENT_ROUNDS,
  isTeamQueueMode,
  parseQueueTicket,
  teamSizeOf,
  type QueueTicket,
} from "./queue.js";

const TICKET: QueueTicket = {
  ticketId: "a".repeat(64),
  protocol: PROTOCOL_VERSION,
  mode: "random-arena-4v4",
  members: ["a".repeat(64)],
  bots: 0,
  enteredAt: 1_700_000_000_000,
  heartbeatAt: 1_700_000_005_000,
  party: null,
  ascentRound: null,
};

/** A whole 4v4 team, sorted, led by `TICKET`'s id. */
const PARTY = ["a", "b", "c", "d"].map((digit) => digit.repeat(64));
/** Its proof, in shape: parsing checks no signature. */
const PROOF = { groupId: "f".repeat(64), consents: PARTY.map(() => "e".repeat(128)) };
const TEAM: QueueTicket = { ...TICKET, members: PARTY, party: PROOF };
/** A Team Arena side of three humans and a bot (ADR-0042). */
const ARENA_SIDE: QueueTicket = {
  ...TICKET,
  mode: "team-arena",
  members: PARTY.slice(0, 3),
  bots: 1,
  party: { ...PROOF, consents: PROOF.consents.slice(1) },
};
/** One human and seven bots in Heroes' Ascent, at its first round. */
const LONE_HERO: QueueTicket = { ...TICKET, mode: "heroes-ascent", bots: 7, ascentRound: 0 };

describe("parseQueueTicket (#869, #882, #1078)", () => {
  it("keeps a well-formed ticket, a solo or a whole team", () => {
    expect(parseQueueTicket({ ...TICKET })).toEqual(TICKET);
    expect(parseQueueTicket({ ...TEAM })).toEqual(TEAM);
  });

  it("keeps a team mode's side: its humans and its bots, one human's too (ADR-0042)", () => {
    expect(parseQueueTicket({ ...ARENA_SIDE })).toEqual(ARENA_SIDE);
    expect(parseQueueTicket({ ...LONE_HERO })).toEqual(LONE_HERO);
    const gvg = { ...TEAM, mode: "gvg", bots: 4 };
    expect(parseQueueTicket(gvg)).toEqual(gvg);
  });

  it("keeps a side led by its party host, the rest sorted (#1766)", () => {
    const led = { ...ARENA_SIDE, ticketId: PARTY[3], members: [PARTY[3], PARTY[0], PARTY[1]] };
    expect(parseQueueTicket(led)).toEqual(led);
  });

  it("keeps a Heroes' Ascent side at each of its rounds (#1996)", () => {
    for (let round = 0; round < ASCENT_ROUNDS; round += 1) {
      const hero = { ...LONE_HERO, ascentRound: round };
      expect(parseQueueTicket(hero)).toEqual(hero);
    }
  });

  it.each<[string, unknown]>([
    ["a Heroes' Ascent side with no round (#1996)", { ...LONE_HERO, ascentRound: null }],
    ["a Heroes' Ascent side past the Hall", { ...LONE_HERO, ascentRound: ASCENT_ROUNDS }],
    ["a Heroes' Ascent side at round 7", { ...LONE_HERO, ascentRound: 7 }],
    ["a negative round", { ...LONE_HERO, ascentRound: -1 }],
    ["a fractional round", { ...LONE_HERO, ascentRound: 1.5 }],
    ["a round as text", { ...LONE_HERO, ascentRound: "1" }],
    ["a Team Arena side with a round", { ...ARENA_SIDE, ascentRound: 0 }],
    ["a Random Arena ticket with a round", { ...TICKET, ascentRound: 1 }],
    ["a ticket with no round field", (({ ascentRound: _, ...rest }) => rest)(TICKET)],
  ])("refuses %s", (_, raw) => {
    expect(parseQueueTicket(raw)).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["not an object", "ticket"],
    ["null", null],
    ["an array", [TICKET]],
    ["a short id", { ...TICKET, ticketId: "a".repeat(63) }],
    ["an upper-case id", { ...TICKET, ticketId: "A".repeat(64) }],
    ["a non-hex id", { ...TICKET, ticketId: "g".repeat(64) }],
    ["a numeric id", { ...TICKET, ticketId: 7 }],
    ["an empty protocol", { ...TICKET, protocol: "" }],
    ["a numeric protocol", { ...TICKET, protocol: 3 }],
    ["an oversize protocol", { ...TICKET, protocol: "p".repeat(65) }],
    ["an unknown mode", { ...TICKET, mode: "random-arena-3v3" }],
    ["a party of neither 1 nor the team", { ...TICKET, members: PARTY.slice(0, 2) }],
    ["a party bigger than the team", { ...TICKET, mode: "random-arena-2v2", members: PARTY }],
    ["no members", { ...TICKET, members: [] }],
    ["unsorted members", { ...TICKET, members: [PARTY[0], PARTY[2], PARTY[1], PARTY[3]] }],
    ["a member twice", { ...TICKET, members: [PARTY[0], PARTY[1], PARTY[1], PARTY[3]] }],
    ["its leader twice", { ...TICKET, members: [PARTY[0], PARTY[1], PARTY[2], PARTY[0]] }],
    ["members not led by the id", { ...TICKET, members: [...PARTY.slice(1), "e".repeat(64)] }],
    ["a solo of another key", { ...TICKET, members: ["b".repeat(64)] }],
    ["a non-hex member", { ...TICKET, members: [...PARTY.slice(0, 3), "g".repeat(64)] }],
    ["members that are not a list", { ...TICKET, members: "a".repeat(64) }],
    ["a NaN enteredAt", { ...TICKET, enteredAt: Number.NaN }],
    ["a fractional enteredAt", { ...TICKET, enteredAt: 1.5 }],
    ["a negative heartbeatAt", { ...TICKET, heartbeatAt: -1 }],
    ["an infinite heartbeatAt", { ...TICKET, heartbeatAt: Number.POSITIVE_INFINITY }],
    ["a missing field", { ...TICKET, heartbeatAt: undefined }],
    ["an oversize ticket, padded with a field", { ...TICKET, padding: "x".repeat(10_000) }],
    ["an undefined party", { ...TICKET, party: undefined }],
    ["seven fields: no party at all", (({ party: _, ...seven }) => seven)(TICKET)],
    ["seven fields: no bots at all", (({ bots: _, ...seven }) => seven)(TICKET)],
    ["bots in Random Arena", { ...TICKET, bots: 1 }],
    ["bots in a Random Arena party", { ...TEAM, mode: "random-arena-2v2", bots: 2 }],
    ["a solo in a team mode", { ...TICKET, mode: "team-arena" }],
    ["a side short of a bot", { ...ARENA_SIDE, bots: 0 }],
    ["a side a bot over", { ...ARENA_SIDE, bots: 2 }],
    ["a side of bots alone", { ...ARENA_SIDE, members: [], bots: 4, party: null }],
    ["negative bots", { ...LONE_HERO, bots: -1 }],
    ["fractional bots", { ...LONE_HERO, bots: 6.5 }],
    ["bots that are not a number", { ...LONE_HERO, bots: "7" }],
    ["a one-human side with a party", { ...LONE_HERO, party: PROOF }],
    ["a team-mode party with none", { ...ARENA_SIDE, party: null }],
    ["a solo with a party", { ...TICKET, party: PROOF }],
    ["a party with none", { ...TEAM, party: null }],
    [
      "a party with a consent too few",
      { ...TEAM, party: { ...PROOF, consents: PROOF.consents.slice(1) } },
    ],
    [
      "a party with a consent too many",
      { ...TEAM, party: { ...PROOF, consents: [...PROOF.consents, "e".repeat(128)] } },
    ],
    [
      "a non-hex consent",
      { ...TEAM, party: { ...PROOF, consents: [...PROOF.consents.slice(1), "g".repeat(128)] } },
    ],
    [
      "a short consent",
      { ...TEAM, party: { ...PROOF, consents: [...PROOF.consents.slice(1), "e".repeat(127)] } },
    ],
    ["a bad group id", { ...TEAM, party: { ...PROOF, groupId: "F".repeat(64) } }],
    ["consents that are not a list", { ...TEAM, party: { ...PROOF, consents: "e".repeat(128) } }],
    ["a party padded with a field", { ...TEAM, party: { ...PROOF, padding: 1 } }],
    ["a party that is a list", { ...TEAM, party: [PROOF.groupId, PROOF.consents] }],
  ])("refuses %s", (_, raw) => {
    expect(parseQueueTicket(raw)).toBeUndefined();
  });
});

describe("teamSizeOf", () => {
  it("is 1, 2 and 4 for Random Arena, 4, 8 and 8 for the team modes", () => {
    expect([
      teamSizeOf("random-arena-1v1"),
      teamSizeOf("random-arena-2v2"),
      teamSizeOf("random-arena-4v4"),
      teamSizeOf("team-arena"),
      teamSizeOf("heroes-ascent"),
      teamSizeOf("gvg"),
    ]).toEqual([1, 2, 4, 4, 8, 8]);
  });
});

describe("isTeamQueueMode (ADR-0042)", () => {
  it("is Team Arena, Heroes' Ascent and GvG, never Random Arena", () => {
    expect(isTeamQueueMode("team-arena")).toBe(true);
    expect(isTeamQueueMode("heroes-ascent")).toBe(true);
    expect(isTeamQueueMode("gvg")).toBe(true);
    expect(isTeamQueueMode("random-arena-4v4")).toBe(false);
  });
});
