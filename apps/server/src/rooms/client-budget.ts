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
 * One server's seat limits, made by `createGameServer`, never a module
 * global: the tests run several servers in one process.
 */
export interface ClientLimits {
  readonly clients: ClientBudget;
  readonly addresses: AddressCounts;
}

export function createClientLimits(maxClients: number, maxPerAddress: number): ClientLimits {
  return {
    clients: createClientBudget(maxClients),
    addresses: createAddressCounts(maxPerAddress),
  };
}

/**
 * The address a socket really came from, so an IPv4 peer counts the same
 * whether it reached a dual-stack listener (`::ffff:1.2.3.4`) or an IPv4
 * one. Never a header: those are written by the client (#265).
 *
 * @param remoteAddress the socket's peer address, `undefined` once it closed
 */
export function peerAddress(remoteAddress: string | undefined): string {
  if (remoteAddress === undefined) {
    // Every closed socket shares one key, so it can only be refused, never
    // slip past the count.
    return "unknown";
  }
  return remoteAddress.startsWith("::ffff:") && remoteAddress.includes(".")
    ? remoteAddress.slice("::ffff:".length)
    : remoteAddress;
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
