import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "./protocol-version.js";
import { parseQueueTicket, teamSizeOf, type QueueTicket } from "./queue.js";

const TICKET: QueueTicket = {
  ticketId: "a".repeat(64),
  protocol: PROTOCOL_VERSION,
  mode: "random-arena-4v4",
  members: ["a".repeat(64)],
  enteredAt: 1_700_000_000_000,
  heartbeatAt: 1_700_000_005_000,
};

/** A whole 4v4 team, sorted, led by `TICKET`'s id. */
const PARTY = ["a", "b", "c", "d"].map((digit) => digit.repeat(64));

describe("parseQueueTicket (#869, #882)", () => {
  it("keeps a well-formed ticket, a solo or a whole team", () => {
    expect(parseQueueTicket({ ...TICKET })).toEqual(TICKET);
    expect(parseQueueTicket({ ...TICKET, members: PARTY })).toEqual({ ...TICKET, members: PARTY });
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
  ])("refuses %s", (_, raw) => {
    expect(parseQueueTicket(raw)).toBeUndefined();
  });
});

describe("teamSizeOf", () => {
  it("is 1, 2 and 4 for the three modes", () => {
    expect([
      teamSizeOf("random-arena-1v1"),
      teamSizeOf("random-arena-2v2"),
      teamSizeOf("random-arena-4v4"),
    ]).toEqual([1, 2, 4]);
  });
});
