import {
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  CLIENT_LIMIT,
  SERVER_FULL_MESSAGE,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  ClientSeat,
  RoomSeats,
  createAddressCounts,
  createClientBudget,
  createClientLimits,
  addressKey,
  ipv6Key,
  onLinkFrom,
} from "./client-budget.js";

const onLinkNever = (): boolean => false;

function refusal(take: () => void): Error & { code?: unknown } {
  try {
    take();
  } catch (error: unknown) {
    return error as Error & { code?: unknown };
  }
  throw new Error("expected a refusal");
}

describe("createClientBudget (#265)", () => {
  it("lends seats up to its max, refuses at it, and frees one per release", () => {
    const budget = createClientBudget(2);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(true);
    expect(budget.tryAcquire()).toBe(false);
    budget.release();
    expect(budget.inUse).toBe(1);
    expect(budget.tryAcquire()).toBe(true);
  });
});

describe("createAddressCounts (#265)", () => {
  it("counts each address on its own, up to its max", () => {
    const counts = createAddressCounts(2);
    expect(counts.tryAcquire("10.0.0.1")).toBe(true);
    expect(counts.tryAcquire("10.0.0.1")).toBe(true);
    expect(counts.tryAcquire("10.0.0.1")).toBe(false);
    expect(counts.tryAcquire("10.0.0.2")).toBe(true);
    expect(counts.count("10.0.0.1")).toBe(2);
  });

  it("frees one per release, and forgets an address at none", () => {
    const counts = createAddressCounts(2);
    counts.tryAcquire("10.0.0.1");
    counts.tryAcquire("10.0.0.1");
    counts.release("10.0.0.1");
    expect(counts.count("10.0.0.1")).toBe(1);
    expect(counts.size).toBe(1);
    counts.release("10.0.0.1");
    expect(counts.size).toBe(0);
    counts.release("10.0.0.1");
    expect(counts.count("10.0.0.1")).toBe(0);
  });
});

describe("ClientSeat (#265)", () => {
  it("refuses a full server with CLIENT_LIMIT and the full-server message", () => {
    const limits = createClientLimits(1, 5, onLinkNever);
    new ClientSeat(limits).take("10.0.0.1");
    const refused = refusal(() => {
      new ClientSeat(limits).take("10.0.0.2");
    });
    expect(refused.code).toBe(CLIENT_LIMIT);
    expect(refused.message).toBe(SERVER_FULL_MESSAGE);
    expect(limits.addresses.count("10.0.0.2")).toBe(0);
  });

  it("refuses an address over its share with ADDRESS_LIMIT, holding nothing for it", () => {
    const limits = createClientLimits(5, 1, onLinkNever);
    new ClientSeat(limits).take("10.0.0.1");
    const refused = refusal(() => {
      new ClientSeat(limits).take("10.0.0.1");
    });
    expect(refused.code).toBe(ADDRESS_LIMIT);
    expect(refused.message).toBe(ADDRESS_LIMIT_MESSAGE);
    expect(limits.clients.inUse).toBe(1);
  });

  it("gives its seat back once, however often it is released", () => {
    const limits = createClientLimits(5, 5, onLinkNever);
    const seat = new ClientSeat(limits);
    new ClientSeat(limits).take("10.0.0.1");
    seat.take("10.0.0.1");
    seat.release();
    seat.release();
    expect(limits.clients.inUse).toBe(1);
    expect(limits.addresses.count("10.0.0.1")).toBe(1);
  });
});

describe("RoomSeats (#265)", () => {
  it("releases a session's seat once, and every seat when the room goes", () => {
    const limits = createClientLimits(5, 5, onLinkNever);
    const seats = new RoomSeats(limits);
    seats.take("a", "10.0.0.1");
    seats.take("b", "10.0.0.1");
    seats.take("c", "10.0.0.2");
    seats.release("a");
    seats.release("a");
    expect(limits.clients.inUse).toBe(2);
    seats.releaseAll();
    expect(limits.clients.inUse).toBe(0);
    expect(limits.addresses.size).toBe(0);
  });
});

describe("ipv6Key (#271)", () => {
  it("keeps all eight hextets, or the /64", () => {
    expect(ipv6Key("2001:db8::1", 64)).toBe("2001:db8:0:0::/64");
    expect(ipv6Key("2001:db8::1", 128)).toBe("2001:db8:0:0:0:0:0:1");
  });

  it("spells one address one way, whatever its case and leading zeros", () => {
    expect(ipv6Key("2001:0DB8:0000::0001", 128)).toBe(ipv6Key("2001:db8::1", 128));
    expect(ipv6Key("2001:0DB8:0000::0001", 64)).toBe(ipv6Key("2001:db8::1", 64));
  });

  it("drops a zone id", () => {
    expect(ipv6Key("fe80::1%eth0", 128)).toBe("fe80:0:0:0:0:0:0:1");
  });

  it("expands :: at the start, in the middle and at the end", () => {
    expect(ipv6Key("::1", 128)).toBe("0:0:0:0:0:0:0:1");
    expect(ipv6Key("1:2::7:8", 128)).toBe("1:2:0:0:0:0:7:8");
    expect(ipv6Key("1:2::", 128)).toBe("1:2:0:0:0:0:0:0");
    expect(ipv6Key("::", 64)).toBe("0:0:0:0::/64");
  });

  it("turns an embedded IPv4 tail into two hextets", () => {
    expect(ipv6Key("64:ff9b::1.2.3.4", 128)).toBe("64:ff9b:0:0:0:0:102:304");
  });

  it("returns what is not an IPv6 address as it is", () => {
    expect(ipv6Key("not an address", 64)).toBe("not an address");
    expect(ipv6Key("10.0.0.1", 64)).toBe("10.0.0.1");
  });
});

describe("addressKey (#265, #271)", () => {
  it("counts off-link IPv6 peers per /64", () => {
    expect(addressKey("2001:db8::1", onLinkNever)).toBe(
      addressKey("2001:db8::ffff:2", onLinkNever),
    );
    expect(addressKey("2001:db8:0:1::1", onLinkNever)).not.toBe(
      addressKey("2001:db8::1", onLinkNever),
    );
  });

  it("counts on-link IPv6 peers per address", () => {
    const onLinkAlways = (): boolean => true;
    expect(addressKey("2001:db8::1", onLinkAlways)).not.toBe(
      addressKey("2001:db8::ffff:2", onLinkAlways),
    );
  });

  it("counts link-local peers per address, without their zone", () => {
    const onLink = onLinkFrom({});
    expect(addressKey("fe80::1%eth0", onLink)).toBe("fe80:0:0:0:0:0:0:1");
    expect(addressKey("fe80::2%eth0", onLink)).toBe("fe80:0:0:0:0:0:0:2");
  });

  it("counts an IPv4 peer the same on a dual-stack listener", () => {
    expect(addressKey("::ffff:192.168.1.7", onLinkNever)).toBe("192.168.1.7");
    expect(addressKey("192.168.1.7", onLinkNever)).toBe("192.168.1.7");
    expect(addressKey(undefined, onLinkNever)).toBe("unknown");
  });
});

describe("onLinkFrom (#271)", () => {
  const onLink = onLinkFrom({
    eth0: [
      {
        address: "192.168.1.2",
        netmask: "255.255.255.0",
        family: "IPv4",
        mac: "00:00:00:00:00:01",
        internal: false,
        cidr: "192.168.1.2/24",
      },
      {
        address: "2001:db8:aa:bb::5",
        netmask: "ffff:ffff:ffff:ffff::",
        family: "IPv6",
        mac: "00:00:00:00:00:01",
        internal: false,
        cidr: "2001:db8:aa:bb::5/64",
        scopeid: 0,
      },
    ],
  });

  it("holds the prefix of each of the host's IPv6 addresses", () => {
    expect(onLink("2001:db8:aa:bb::99")).toBe(true);
    expect(onLink("2001:db8:aa:bc::99")).toBe(false);
  });

  it("holds link-local and loopback, whatever the interfaces", () => {
    expect(onLink("fe80::1234")).toBe(true);
    expect(onLink("::1")).toBe(true);
    expect(onLink("::2")).toBe(false);
  });
});

describe("the per-address cap over IPv6 (#271)", () => {
  // Every test client connects from loopback, so this goes through the
  // seat limits with the key a socket from each address would get.
  it("refuses a second address in a held /64 with ADDRESS_LIMIT", () => {
    const limits = createClientLimits(5, 1, onLinkNever);
    new ClientSeat(limits).take(limits.addressKey("2001:db8::1"));
    const refused = refusal(() => {
      new ClientSeat(limits).take(limits.addressKey("2001:db8::abcd:2"));
    });
    expect(refused.code).toBe(ADDRESS_LIMIT);
    new ClientSeat(limits).take(limits.addressKey("2001:db8:0:1::1"));
  });
});
