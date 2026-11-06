import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RELAY_ATTEMPTS,
  RELAY_ATTEMPT_MS,
  RELAY_REFRESH_LEFT_MS,
  RELAY_REJOIN_MS,
  joinWithRelayOffers,
} from "./relay-join.js";
import type { RelayOffers } from "./transport/relay-offer.js";
import type { RelayOffer } from "./transport/relay-seal.js";
import type { TrysteroTransport } from "./transport/trystero.js";
import type { TurnConfig } from "./transport/turn-config.js";

function login(expiry: number): TurnConfig {
  return {
    urls: ["turn:relay.example:3478"],
    username: `${String(expiry)}:0011223344556677`,
    credential: `minted-${String(expiry)}`,
  };
}

/** Holder `holder`'s offer of `login(expiry)`. */
function offer(holder: string, expiry: number): RelayOffer {
  return { config: login(expiry), holder, name: `Member ${holder}` };
}

/**
 * Offers a test hands in, as the Nostr subscription and the host's lobby
 * would: `ranked` is the order the test gives, and the host's login is
 * whatever it was last told.
 */
function fakeOffers() {
  let ranked: RelayOffer[] = [];
  let host: TurnConfig | undefined;
  const handlers = new Set<() => void>();
  let closed = false;
  const tell = (): void => {
    for (const handler of [...handlers]) {
      handler();
    }
  };
  const offers: RelayOffers = {
    ranked: () => [...ranked],
    hostLogin: () => host,
    fromHost(next) {
      host = next ?? undefined;
      tell();
    },
    onOffer(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close() {
      closed = true;
    },
  };
  return {
    offers,
    /** The offers sealed to this joiner now, best first. */
    open(...next: RelayOffer[]) {
      ranked = next;
      tell();
    },
    closed: () => closed,
  };
}

/** One join: the relay it went through and the attempt (0 direct, k = `relay<k>`). */
interface Join {
  readonly turn: TurnConfig | undefined;
  readonly attempt: number;
}

const DIRECT: Join = { turn: undefined, attempt: 0 };

describe("a joiner's fallback on the relays its lobby's members offer (#2091, #2527)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A joiner on a memory network, recording each join. */
  function joiner(ownRelay = false) {
    const network = createMemoryNetwork();
    const fake = fakeOffers();
    const joins: Join[] = [];
    let inRoom = 0;
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn, attempt): TrysteroTransport => {
        joins.push({ turn, attempt });
        const transport = network.join("guest");
        inRoom += 1;
        const leave = transport.leave.bind(transport);
        return {
          ...transport,
          leave: () => {
            inRoom -= 1;
            return leave();
          },
          swapIceServers: () => undefined,
        };
      },
      offers: fake.offers,
      ownRelay,
    });
    return { network, fake, room, joins, inRoom: () => inRoom };
  }

  it("joins at once, directly", () => {
    const { joins } = joiner();
    expect(joins).toEqual([DIRECT]);
  });

  it("takes the best offer only once the host has been unreached for the wait", async () => {
    const { fake, joins, inRoom } = joiner();
    fake.open(offer("a", 1), offer("b", 2));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS - 1);
    expect(joins).toEqual([DIRECT]);
    await vi.advanceTimersByTimeAsync(1);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }]);
    // The first room was fully left before the relayed one was joined.
    expect(inRoom()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
  });

  it("takes an offer that opens after the wait", async () => {
    const { fake, joins } = joiner();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(joins).toEqual([DIRECT]);
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }]);
  });

  it("never rejoins once the host has answered directly", async () => {
    const { fake, room, joins } = joiner();
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS - 1);
    room.reached("host");
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS * 4);
    expect(joins).toEqual([DIRECT]);
  });

  it("never rejoins with the player's own relay from Options", async () => {
    const { fake, joins } = joiner(true);
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS * 4);
    expect(joins).toEqual([DIRECT]);
  });

  it("tries the next holder's offer in the next sibling, unseated, up to the most attempts", async () => {
    const { fake, joins } = joiner();
    fake.open(offer("a", 1), offer("b", 2), offer("c", 3), offer("d", 4));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }]);
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS - 1);
    expect(joins).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(joins.at(-1)).toEqual({ turn: login(2), attempt: 2 });
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS);
    expect(joins.at(-1)).toEqual({ turn: login(3), attempt: 3 });
    // A fourth holder is there, but no fourth attempt.
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS * 4);
    fake.open(offer("d", 4), offer("e", 5));
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toHaveLength(1 + MAX_RELAY_ATTEMPTS);
  });

  it("stops seated through an attempt", async () => {
    const { fake, room, joins } = joiner();
    fake.open(offer("a", 1), offer("b", 2));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS + RELAY_ATTEMPT_MS - 1);
    room.reached("host");
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS * 4);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }]);
  });

  it("never tries a holder twice, however the offers rank", async () => {
    const { fake, joins } = joiner();
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    // `a` renewed its offer and still ranks first; `b` is the untried one.
    fake.open(offer("a", 10), offer("b", 2));
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }, { turn: login(2), attempt: 2 }]);
  });

  it("joins no further once out of offers, and takes one that comes later", async () => {
    const { fake, joins } = joiner();
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS + RELAY_ATTEMPT_MS * 4);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }]);
    fake.open(offer("a", 1), offer("b", 2));
    await vi.advanceTimersByTimeAsync(0);
    expect(joins.at(-1)).toEqual({ turn: login(2), attempt: 2 });
  });

  it("rejoins a dropped host, relayed, through the host's newer login, in the same sibling (#2248)", async () => {
    const { network, fake, room, joins } = joiner();
    fake.open(offer("a", 1), offer("b", 2));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    room.reached("host");
    fake.offers.fromHost(login(5));
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }, { turn: login(5), attempt: 1 }]);
    // Reached, so no attempt follows.
    await vi.advanceTimersByTimeAsync(RELAY_ATTEMPT_MS * 4);
    expect(joins).toHaveLength(3);
    await room.leave();
  });

  it("does not rejoin a dropped host without a newer login, or reached directly", async () => {
    const same = joiner();
    same.fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = same.network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    same.room.reached("host");
    same.fake.offers.fromHost(login(1));
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(same.joins).toHaveLength(2);
    await same.room.leave();

    const direct = joiner();
    const directHost = direct.network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    direct.room.reached("host");
    direct.fake.offers.fromHost(login(5));
    await directHost.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(direct.joins).toEqual([DIRECT]);
    await direct.room.leave();
  });

  it("hears the host on the relayed room, through handlers added before it", async () => {
    const { network, fake, room } = joiner();
    const heard: unknown[] = [];
    room.on("chat-line", (data) => heard.push(data));
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    host.send("chat-line", { hello: true }, "guest");
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual([{ hello: true }]);
  });

  it("says the host is unreachable when the relayed join fails, and rejects nothing", async () => {
    const network = createMemoryNetwork();
    const fake = fakeOffers();
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn): TrysteroTransport => {
        if (turn !== undefined) {
          throw new Error("the relayed room would not open");
        }
        return { ...network.join("guest"), swapIceServers: () => undefined };
      },
      offers: fake.offers,
      ownRelay: false,
    });
    const troubles: string[] = [];
    room.onTrouble((trouble) => {
      troubles.push(trouble);
    });
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    expect(troubles).toEqual(["peer-unreachable"]);
    await room.leave();
  });

  it("closes the offers with the room, and joins nothing after", async () => {
    const { fake, room, joins, inRoom } = joiner();
    await room.leave();
    expect(fake.closed()).toBe(true);
    expect(inRoom()).toBe(0);
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS * 4);
    expect(joins).toEqual([DIRECT]);
  });
});

describe("a relayed joiner's login, refreshed in place between maps (#2245)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The first offer's expiry, in seconds, and a moment it has just under the refresh margin left. */
  const EXPIRY = 10_000;
  const LATE = EXPIRY * 1000 - RELAY_REFRESH_LEFT_MS + 1;
  const NEWER = login(EXPIRY + 2 * 60 * 60);

  /** A joiner that may be relayed, recording joins and swaps. */
  function relayedJoiner(ownRelay = false) {
    const network = createMemoryNetwork();
    const fake = fakeOffers();
    const joins: Join[] = [];
    const swaps: { peerId: string; turn: TurnConfig }[] = [];
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn, attempt): TrysteroTransport => {
        joins.push({ turn, attempt });
        return {
          ...network.join("guest"),
          swapIceServers: (peerId, swapped) => {
            swaps.push({ peerId, turn: swapped });
          },
        };
      },
      offers: fake.offers,
      ownRelay,
    });
    return { network, fake, room, joins, swaps };
  }

  /** Relayed through `login(EXPIRY)`, then reached the host. */
  async function reachHost(joiner: ReturnType<typeof relayedJoiner>) {
    joiner.fake.open(offer("a", EXPIRY));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = joiner.network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    joiner.room.reached("host");
    return host;
  }

  it("swaps the host's connection onto the host's newer login near expiry, once", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.offers.fromHost(NEWER);
    joiner.room.refreshRelay(LATE);
    expect(joiner.swaps).toEqual([{ peerId: "host", turn: NEWER }]);
    // `relayedWith` moved on: the same login swaps nothing again.
    joiner.room.refreshRelay(LATE + 60_000);
    expect(joiner.swaps).toHaveLength(1);
    // In place: no leave, no join.
    expect(joiner.joins).toEqual([DIRECT, { turn: login(EXPIRY), attempt: 1 }]);
    await joiner.room.leave();
  });

  it("does not swap with the margin or more left", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.offers.fromHost(NEWER);
    joiner.room.refreshRelay(LATE - 1);
    expect(joiner.swaps).toEqual([]);
    await joiner.room.leave();
  });

  it("does not swap without a newer host login: none, the same login, or one no later", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.room.refreshRelay(LATE);
    joiner.fake.offers.fromHost(login(EXPIRY));
    joiner.room.refreshRelay(LATE);
    joiner.fake.offers.fromHost(login(EXPIRY - 60));
    joiner.room.refreshRelay(LATE);
    joiner.fake.offers.fromHost(null);
    joiner.room.refreshRelay(LATE);
    expect(joiner.swaps).toEqual([]);
    await joiner.room.leave();
  });

  it("never swaps a joiner with its own relay, or one that reached its host directly", async () => {
    const own = relayedJoiner(true);
    await reachHost(own);
    own.fake.offers.fromHost(NEWER);
    own.room.refreshRelay(LATE);
    expect(own.swaps).toEqual([]);
    await own.room.leave();

    const direct = relayedJoiner();
    direct.room.reached("host");
    direct.fake.offers.fromHost(NEWER);
    direct.room.refreshRelay(LATE);
    expect(direct.swaps).toEqual([]);
    await direct.room.leave();
  });

  it("still rejoins through the swapped-in login when the host drops after all", async () => {
    const joiner = relayedJoiner();
    const host = await reachHost(joiner);
    joiner.fake.offers.fromHost(NEWER);
    joiner.room.refreshRelay(LATE);
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joiner.joins).toEqual([
      DIRECT,
      { turn: login(EXPIRY), attempt: 1 },
      { turn: NEWER, attempt: 1 },
    ]);
    await joiner.room.leave();
  });
});
