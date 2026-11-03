import type { Transport } from "@vibewars/game-session";
import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RELAY_REJOIN_MS, joinWithRelayOffers } from "./relay-join.js";
import { watchRelayOffers, type RelayOffers } from "./transport/relay-offer.js";
import { newTicketKey } from "./transport/ticket-key.js";
import type { TurnConfig } from "./transport/turn-config.js";

function offer(expiry: number): TurnConfig {
  return {
    urls: ["turn:relay.example:3478"],
    username: `${String(expiry)}:0011223344556677`,
    credential: `minted-${String(expiry)}`,
  };
}

/** Offers a test hands in one at a time, as the Nostr subscription would. */
function fakeOffers() {
  let latest: TurnConfig | undefined;
  const handlers = new Set<() => void>();
  let closed = false;
  const offers: RelayOffers = {
    latest: () => latest,
    fromHost(login) {
      latest = login ?? undefined;
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
    open(config: TurnConfig | undefined) {
      latest = config;
      for (const handler of [...handlers]) {
        handler();
      }
    },
    closed: () => closed,
  };
}

describe("a joiner's fallback on its host's shared relay (#2091)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A joiner on a memory network, recording the relay of each join. */
  function joiner(ownRelay = false, offers?: RelayOffers) {
    const network = createMemoryNetwork();
    const fake = fakeOffers();
    const joins: (TurnConfig | undefined)[] = [];
    let inRoom = 0;
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn): Transport => {
        joins.push(turn);
        const transport = network.join("guest");
        inRoom += 1;
        const leave = transport.leave.bind(transport);
        return {
          ...transport,
          leave: () => {
            inRoom -= 1;
            return leave();
          },
        };
      },
      offers: offers ?? fake.offers,
      ownRelay,
    });
    return { network, fake, room, joins, inRoom: () => inRoom };
  }

  it("joins at once without a relay", () => {
    const { joins } = joiner();
    expect(joins).toEqual([undefined]);
  });

  it("takes an offer only once the host has been unreached for the wait", async () => {
    const { fake, joins, inRoom } = joiner();
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS - 1);
    expect(joins).toEqual([undefined]);
    await vi.advanceTimersByTimeAsync(1);
    expect(joins).toEqual([undefined, offer(1)]);
    // The first room was fully left before the relayed one was joined.
    expect(inRoom()).toBe(1);
  });

  it("takes an offer that opens after the wait, and only once", async () => {
    const { fake, joins } = joiner();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(joins).toHaveLength(1);
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toEqual([undefined, offer(1)]);
    fake.open(offer(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toHaveLength(2);
  });

  it("never rejoins once the host has answered", async () => {
    const { fake, room, joins } = joiner();
    room.reached("host");
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS * 4);
    expect(joins).toEqual([undefined]);
  });

  it("never rejoins with the player's own relay from Options", async () => {
    const { fake, joins } = joiner(true);
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS * 4);
    expect(joins).toEqual([undefined]);
  });

  it("rejoins a dropped host through the newest offer, not the first", async () => {
    const { network, fake, room, joins } = joiner();
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    room.reached("host");
    fake.open(offer(2));
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toEqual([undefined, offer(1), offer(2)]);
  });

  it("rejoins a dropped host through the login it gave, which the drop keeps (#2248)", async () => {
    // Real offers, on Nostr relays that never answer: only the host speaks.
    const offers = watchRelayOffers(
      { topic: "ab".repeat(32), key: new Uint8Array(32).fill(7) },
      {
        relays: ["wss://relay.example"],
        openSocket: () => ({ send: () => undefined, close: () => undefined }),
        now: () => 0,
        newKey: newTicketKey,
        randomBytes: (length) => new Uint8Array(length),
      },
    );
    const { network, room, joins } = joiner(false, offers);
    offers.fromHost(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    room.reached("host");
    offers.fromHost(offer(2));
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joins).toEqual([undefined, offer(1), offer(2)]);
    expect(offers.latest()).toEqual(offer(2));
    await room.leave();
  });

  it("hears the host on the relayed room, through handlers added before it", async () => {
    const { network, fake, room } = joiner();
    const heard: unknown[] = [];
    room.on("chat-line", (data) => heard.push(data));
    fake.open(offer(1));
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
      join: (turn): Transport => {
        if (turn !== undefined) {
          throw new Error("the relayed room would not open");
        }
        return network.join("guest");
      },
      offers: fake.offers,
      ownRelay: false,
    });
    const troubles: string[] = [];
    room.onTrouble((trouble) => {
      troubles.push(trouble);
    });
    fake.open(offer(1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    expect(troubles).toEqual(["peer-unreachable"]);
    await room.leave();
  });

  it("closes the offers with the room", async () => {
    const { fake, room, inRoom } = joiner();
    await room.leave();
    expect(fake.closed()).toBe(true);
    expect(inRoom()).toBe(0);
  });
});
