import { BlockList, isIPv6 } from "node:net";
import type { NetworkInterfaceInfo } from "node:os";

import { ServerError } from "colyseus";
import {
  ADDRESS_LIMIT,
  ADDRESS_LIMIT_MESSAGE,
  CLIENT_LIMIT,
  SERVER_FULL_MESSAGE,
} from "@vibewars/game-protocol";

import { createRoomBudget, type RoomBudget } from "./room-budget.js";

/**
 * How many players one server holds at once, match and lobby seats
 * together (#265, SECURITY.md gap 6): the same counter as the room
 * budget, counting seats. A lobby player in their match holds two.
 */
export type ClientBudget = RoomBudget;

export function createClientBudget(max: number): ClientBudget {
  return createRoomBudget(max);
}

/**
 * How many seats each network address holds (#265), so one address
 * cannot take every seat on the server. An address is forgotten when it
 * holds none, so the map only ever holds addresses with a seat.
 */
export interface AddressCounts {
  /** Count one more seat for `address`; false when it holds `max` already. */
  tryAcquire(address: string): boolean;
  /** Give one back. Never below none. */
  release(address: string): void;
  /** How many seats `address` holds. */
  count(address: string): number;
  /** How many addresses hold a seat. */
  readonly size: number;
}

export function createAddressCounts(max: number): AddressCounts {
  const counts = new Map<string, number>();
  return {
    tryAcquire(address) {
      const held = counts.get(address) ?? 0;
      if (held >= max) {
        return false;
      }
      counts.set(address, held + 1);
      return true;
    },
    release(address) {
      const held = counts.get(address) ?? 0;
      if (held <= 1) {
        counts.delete(address);
      } else {
        counts.set(address, held - 1);
      }
    },
    count(address) {
      return counts.get(address) ?? 0;
    },
    get size() {
      return counts.size;
    },
  };
}

/**
 * Whether an IPv6 address is on a link the server is on (#271): those
 * are LAN guests, counted per address. Given a zone-free address.
 */
export type OnLink = (ipv6: string) => boolean;

/**
 * One server's seat limits, made by `createGameServer`, never a module
 * global: the tests run several servers in one process.
 */
export interface ClientLimits {
  readonly clients: ClientBudget;
  readonly addresses: AddressCounts;
  /** The key a socket's peer address is counted under (`addressKey`). */
  readonly addressKey: (remoteAddress: string | undefined) => string;
}

export function createClientLimits(
  maxClients: number,
  maxPerAddress: number,
  onLink: OnLink,
): ClientLimits {
  return {
    clients: createClientBudget(maxClients),
    addresses: createAddressCounts(maxPerAddress),
    addressKey: (remoteAddress) => addressKey(remoteAddress, onLink),
  };
}

/**
 * The key every per-address cap counts a socket's peer under (#265,
 * #271). Never a header: those are written by the client.
 *
 * - IPv4, also when it reached a dual-stack listener as `::ffff:a.b.c.d`:
 *   the IPv4 address, so it counts the same either way.
 * - IPv6 on a link the server is on: the full address. A LAN party all
 *   shares the server's /64, so bucketing it would cap the party.
 * - Any other IPv6: its /64, which one host on the internet usually
 *   holds whole, so rotating addresses gets it no fresh share.
 *
 * @param remoteAddress the socket's peer address, `undefined` once it closed
 */
export function addressKey(remoteAddress: string | undefined, onLink: OnLink): string {
  if (remoteAddress === undefined) {
    // Every closed socket shares one key, so it can only be refused, never
    // slip past the count.
    return "unknown";
  }
  const address = withoutZone(remoteAddress);
  if (!isIPv6(address)) {
    return remoteAddress;
  }
  const hextets = ipv6Hextets(address);
  if (hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff) {
    const [high = 0, low = 0] = hextets.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return ipv6Key(address, onLink(address) ? 128 : 64);
}

/**
 * An IPv6 address in one spelling (#271): no zone id, `::` and any
 * dotted IPv4 tail expanded, lower case, no leading zeros. With `prefix`
 * 64, only its /64, as `a:b:c:d::/64`. A string that is not an IPv6
 * address comes back as it is.
 */
export function ipv6Key(address: string, prefix: 64 | 128): string {
  const bare = withoutZone(address);
  if (!isIPv6(bare)) {
    return address;
  }
  const hextets = ipv6Hextets(bare).map((hextet) => hextet.toString(16));
  return prefix === 128 ? hextets.join(":") : `${hextets.slice(0, 4).join(":")}::/64`;
}

/** The address without its zone id (`fe80::1%eth0`). */
function withoutZone(address: string): string {
  const zone = address.indexOf("%");
  return zone === -1 ? address : address.slice(0, zone);
}

/** The eight 16-bit groups of a valid, zone-free IPv6 address. */
function ipv6Hextets(address: string): number[] {
  const groups = (part: string): number[] => {
    if (part === "") {
      return [];
    }
    return part.split(":").flatMap((group) => {
      if (!group.includes(".")) {
        return [Number.parseInt(group, 16)];
      }
      const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  };
  const gap = address.indexOf("::");
  if (gap === -1) {
    return groups(address);
  }
  const head = groups(address.slice(0, gap));
  const tail = groups(address.slice(gap + 2));
  return [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}

/**
 * The `OnLink` for a host with these interfaces (#271): inside the
 * prefix of one of its own IPv6 addresses, link-local, or loopback.
 * Read once, at start: a LAN renumbered while the server runs looks
 * off-link until it restarts (SECURITY.md gap 6).
 *
 * @param interfaces what `os.networkInterfaces()` returns
 */
export function onLinkFrom(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): OnLink {
  const links = new BlockList();
  links.addSubnet("fe80::", 10, "ipv6");
  links.addAddress("::1", "ipv6");
  for (const info of Object.values(interfaces).flat()) {
    if (info?.family !== "IPv6" || info.cidr === null) {
      continue;
    }
    const prefix = Number(info.cidr.slice(info.cidr.lastIndexOf("/") + 1));
    links.addSubnet(withoutZone(info.address), prefix, "ipv6");
  }
  return (ipv6) => links.check(ipv6, "ipv6");
}

/**
 * One client's hold on a seat: taken in the room's `onAuth`, before the
 * client joins, and given back once, when the seat is truly gone. Modelled
 * on `RoomSlot`.
 */
export class ClientSeat {
  #address: string | undefined;
  readonly #limits: ClientLimits;

  public constructor(limits: ClientLimits) {
    this.#limits = limits;
  }

  /**
   * Take a seat for a client from `address`, or refuse the join: with
   * `CLIENT_LIMIT` when the server is full, `ADDRESS_LIMIT` when this
   * address is over its share.
   */
  public take(address: string): void {
    if (!this.#limits.clients.tryAcquire()) {
      throw new ServerError(CLIENT_LIMIT, SERVER_FULL_MESSAGE);
    }
    if (!this.#limits.addresses.tryAcquire(address)) {
      this.#limits.clients.release();
      throw new ServerError(ADDRESS_LIMIT, ADDRESS_LIMIT_MESSAGE);
    }
    this.#address = address;
  }

  public release(): void {
    if (this.#address !== undefined) {
      this.#limits.addresses.release(this.#address);
      this.#limits.clients.release();
      this.#address = undefined;
    }
  }
}

/**
 * Every seat one room holds, by session id. A reconnecting client keeps
 * the seat it already holds: Colyseus skips `onAuth` for a reconnection,
 * so nothing is counted twice and nobody coming back is refused.
 */
export class RoomSeats {
  readonly #seats = new Map<string, ClientSeat>();
  readonly #limits: ClientLimits;

  public constructor(limits: ClientLimits) {
    this.#limits = limits;
  }

  /** Take a seat for `sessionId`, or refuse its join (`ClientSeat.take`). */
  public take(sessionId: string, address: string): void {
    const seat = new ClientSeat(this.#limits);
    seat.take(address);
    this.#seats.set(sessionId, seat);
  }

  /** Give back the seat `sessionId` holds, if it holds one. */
  public release(sessionId: string): void {
    this.#seats.get(sessionId)?.release();
    this.#seats.delete(sessionId);
  }

  /** Give back every seat, when the room is gone. */
  public releaseAll(): void {
    for (const seat of this.#seats.values()) {
      seat.release();
    }
    this.#seats.clear();
  }
}
