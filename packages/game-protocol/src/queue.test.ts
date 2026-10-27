import { describe, expect, it } from "vitest";

import { PROTOCOL_VERSION } from "./protocol-version.js";
import { parseQueueTicket, teamSizeOf, type QueueTicket } from "./queue.js";

const TICKET: QueueTicket = {
  ticketId: "a".repeat(64),
  protocol: PROTOCOL_VERSION,
  mode: "random-arena-4v4",
  partySize: 1,
  enteredAt: 1_700_000_000_000,
  heartbeatAt: 1_700_000_005_000,
};

describe("parseQueueTicket (#869)", () => {
  it("keeps a well-formed ticket, a solo or a whole team", () => {
    expect(parseQueueTicket({ ...TICKET })).toEqual(TICKET);
    expect(parseQueueTicket({ ...TICKET, partySize: 4 })).toEqual({ ...TICKET, partySize: 4 });
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
    ["a party of neither 1 nor the team", { ...TICKET, partySize: 2 }],
    ["a party bigger than the team", { ...TICKET, mode: "random-arena-2v2", partySize: 4 }],
    ["a string party", { ...TICKET, partySize: "1" }],
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
