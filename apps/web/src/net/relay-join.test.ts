import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_RELAY_ATTEMPTS,
  RELAY_ATTEMPT_MS,
  RELAY_REJOIN_MS,
  RELAY_RESTART_EVERY_MS,
  joinWithRelayOffers,
} from "./relay-join.js";
import { relayRoomsSwitch, withSiblingRoom } from "./relay-room.js";
import type { RelayOffers } from "./transport/relay-offer.js";
import type { RelayOffer } from "./transport/relay-seal.js";
import type { TrysteroTransport } from "./transport/trystero.js";
import type { TurnConfig } from "./transport/turn-config.js";

const OTHER_URL = "turn:other.example:3478";

function login(expiry: number): TurnConfig {
  return loginAt("turn:relay.example:3478", expiry);
}

/** A login through `url` that runs out at `expiry`, in seconds. */
function loginAt(url: string, expiry: number): TurnConfig {
  return {
    urls: [url],
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
 * would: `ranked` is the order the test gives.
 */
function fakeOffers() {
  let ranked: RelayOffer[] = [];
  const handlers = new Set<() => void>();
  let closed = false;
  const tell = (): void => {
    for (const handler of [...handlers]) {
      handler();
    }
  };
  const offers: RelayOffers = {
    pub: () => Promise.resolve(null),
    ranked: () => [...ranked],
    listed: () => undefined,
    fromMember: () => undefined,
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
          iceState: () => undefined,
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

  it("rejoins a dropped host, relayed, through the best-ranked newer login, in the same sibling (#2529)", async () => {
    const { network, fake, room, joins } = joiner();
    fake.open(offer("a", 1), offer("b", 2));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    const host = network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    room.reached("host");
    fake.open(offer("a", 5));
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
    same.fake.open(offer("a", 1));
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(same.joins).toHaveLength(2);
    await same.room.leave();

    const direct = joiner();
    const directHost = direct.network.join("host");
    await vi.advanceTimersByTimeAsync(0);
    direct.room.reached("host");
    direct.fake.open(offer("a", 5));
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
        return {
          ...network.join("guest"),
          swapIceServers: () => undefined,
          iceState: () => undefined,
        };
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

describe("a relayed member's login, moved in place (#2245, #2529)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The first offer's expiry, in seconds. */
  const EXPIRY = 10_000;
  const NEWER = login(EXPIRY + 60 * 60);

  /** A member that may be relayed, recording joins and swaps, its host's ICE as `ice` says. */
  function relayedJoiner(ownRelay = false) {
    const network = createMemoryNetwork();
    const fake = fakeOffers();
    const joins: Join[] = [];
    const swaps: { peerId: string; turn: TurnConfig }[] = [];
    let ice: RTCIceConnectionState = "connected";
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn, attempt): TrysteroTransport => {
        joins.push({ turn, attempt });
        return {
          ...network.join("guest"),
          swapIceServers: (peerId, swapped) => {
            swaps.push({ peerId, turn: swapped });
          },
          iceState: () => ice,
        };
      },
      offers: fake.offers,
      ownRelay,
    });
    const setIce = (state: RTCIceConnectionState): void => {
      ice = state;
    };
    return { network, fake, room, joins, swaps, setIce };
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

  it("moves the host's connection onto a newer login for its relay, in place, once", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    expect(joiner.swaps).toEqual([{ peerId: "host", turn: NEWER }]);
    // It relays with that one now: the same login moves nothing again.
    joiner.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    expect(joiner.swaps).toHaveLength(1);
    // In place: no leave, no join.
    expect(joiner.joins).toEqual([DIRECT, { turn: login(EXPIRY), attempt: 1 }]);
    await joiner.room.leave();
  });

  it("does not move onto the same login, or while its holder has no later one", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.open(offer("a", EXPIRY));
    joiner.fake.open(offer("b", EXPIRY + 60), offer("a", EXPIRY));
    expect(joiner.swaps).toEqual([]);
    await joiner.room.leave();
  });

  it("moves onto the best-ranked live login once none names its relay, and stays with none", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    const other = loginAt(OTHER_URL, EXPIRY - 60);
    joiner.fake.open(
      { config: other, holder: "b", name: "Member b" },
      { config: loginAt("turn:third.example:3478", EXPIRY), holder: "c", name: "Member c" },
    );
    expect(joiner.swaps).toEqual([{ peerId: "host", turn: other }]);
    joiner.fake.open();
    expect(joiner.swaps).toHaveLength(1);
    await joiner.room.leave();
  });

  it("follows its holder onto a new relay", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    const moved = loginAt(OTHER_URL, EXPIRY + 60 * 60);
    joiner.fake.open(offer("c", EXPIRY + 2 * 60 * 60), {
      config: moved,
      holder: "a",
      name: "Member a",
    });
    expect(joiner.swaps).toEqual([{ peerId: "host", turn: moved }]);
    await joiner.room.leave();
  });

  it("never moves onto another holder's newer login for its relay while its holder has one", async () => {
    const joiner = relayedJoiner();
    const host = await reachHost(joiner);
    // A seated member says it holds this relay and seals a bogus login
    // for it, newer and ranked first: it must not end the connection.
    joiner.fake.open(offer("m", EXPIRY + 60 * 60), offer("a", EXPIRY));
    joiner.setIce("failed");
    joiner.fake.open(offer("m", EXPIRY + 2 * 60 * 60), offer("a", EXPIRY));
    expect(joiner.swaps).toEqual([]);
    // Nor does a drop rejoin through it: its holder's login still lives.
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joiner.joins).toEqual([DIRECT, { turn: login(EXPIRY), attempt: 1 }]);
    await joiner.room.leave();
  });

  it("moves onto the best-ranked live login once its holder leaves the list", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.open(offer("m", EXPIRY + 60 * 60), offer("a", EXPIRY));
    expect(joiner.swaps).toEqual([]);
    joiner.fake.open(offer("m", EXPIRY + 60 * 60));
    expect(joiner.swaps).toEqual([{ peerId: "host", turn: login(EXPIRY + 60 * 60) }]);
    // Then that holder's logins alone move it.
    joiner.fake.open(offer("a", EXPIRY + 3 * 60 * 60), offer("m", EXPIRY + 60 * 60));
    expect(joiner.swaps).toHaveLength(1);
    await joiner.room.leave();
  });

  it("restarts at most once per relay each 5 min, unless ICE failed or disconnected", async () => {
    const joiner = relayedJoiner();
    await reachHost(joiner);
    joiner.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    const later = (hours: number) => login(EXPIRY + hours * 60 * 60);
    joiner.fake.open({ config: later(2), holder: "a", name: "Member a" });
    expect(joiner.swaps).toHaveLength(1);
    joiner.setIce("failed");
    joiner.fake.open({ config: later(3), holder: "a", name: "Member a" });
    expect(joiner.swaps.map(({ turn }) => turn)).toEqual([NEWER, later(3)]);

    // Held back, then run once the limit allows.
    joiner.setIce("connected");
    joiner.fake.open({ config: later(4), holder: "a", name: "Member a" });
    expect(joiner.swaps).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(RELAY_RESTART_EVERY_MS);
    expect(joiner.swaps.map(({ turn }) => turn)).toEqual([NEWER, later(3), later(4)]);
    await joiner.room.leave();
  });

  it("never moves a member with its own relay, or one that reached its host directly", async () => {
    const own = relayedJoiner(true);
    await reachHost(own);
    own.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    expect(own.swaps).toEqual([]);
    await own.room.leave();

    const direct = relayedJoiner();
    direct.room.reached("host");
    direct.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    expect(direct.swaps).toEqual([]);
    await direct.room.leave();
  });

  it("still rejoins through the newest login when the host drops after all", async () => {
    const joiner = relayedJoiner();
    const host = await reachHost(joiner);
    joiner.fake.open({ config: NEWER, holder: "a", name: "Member a" });
    await host.leave();
    await vi.advanceTimersByTimeAsync(0);
    expect(joiner.joins).toEqual([
      DIRECT,
      { turn: login(EXPIRY), attempt: 1 },
      { turn: NEWER, attempt: 1 },
    ]);
    await joiner.room.leave();
  });

  it("rejoins a dropped host through its sibling, which the host keeps for an away member (#1764)", async () => {
    const networks = Array.from({ length: MAX_RELAY_ATTEMPTS + 1 }, () => createMemoryNetwork());
    const network = (attempt: number) => {
      const found = networks[attempt];
      if (found === undefined) {
        throw new Error(`no room for attempt ${String(attempt)}`);
      }
      return found;
    };
    // The host's half: in every sibling while relays are wanted, and the
    // lobby's members, away ones included, as its lobby host says.
    const members = new Set<string>();
    const gone = new Set<(peerId: string) => void>();
    const relayRooms = relayRoomsSwitch();
    relayRooms.follow({
      isMember: (peerId) => members.has(peerId),
      onMemberGone: (handler) => {
        gone.add(handler);
        return () => {
          gone.delete(handler);
        };
      },
    });
    relayRooms.set(true);
    const host = withSiblingRoom({
      main: network(0).join("host"),
      joinSibling: (attempt) => network(attempt).join("host"),
      relayRooms,
    });
    const heard: string[] = [];
    host.onPeerJoin((peerId) => {
      heard.push(`+${peerId}`);
      members.add(peerId);
    });
    host.onPeerLeave((peerId) => {
      heard.push(`-${peerId}`);
    });
    // The joiner's half: its direct join never reaches the host.
    network(0).partition("guest", "host");
    const fake = fakeOffers();
    const joins: Join[] = [];
    const room = joinWithRelayOffers({
      selfId: "guest",
      join: (turn, attempt): TrysteroTransport => {
        joins.push({ turn, attempt });
        return {
          ...network(attempt).join("guest"),
          swapIceServers: () => undefined,
          iceState: () => undefined,
        };
      },
      offers: fake.offers,
      ownRelay: false,
    });
    fake.open(offer("a", 1));
    await vi.advanceTimersByTimeAsync(RELAY_REJOIN_MS);
    expect(heard).toEqual(["+guest"]);
    room.reached("host");
    fake.open(offer("a", 5));
    // The admit and its linger are over.
    relayRooms.set(false);
    await vi.advanceTimersByTimeAsync(0);

    // The connection drops: the member is away, and the host stays in relay1 for it.
    network(1).partition("guest", "host");
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual(["+guest", "-guest"]);
    expect(joins).toEqual([DIRECT, { turn: login(1), attempt: 1 }, { turn: login(5), attempt: 1 }]);
    network(1).heal();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual(["+guest", "-guest", "+guest"]);

    // Gone for good, unseated: the sibling goes too, and a rejoin there is not heard.
    network(1).partition("guest", "host");
    members.delete("guest");
    for (const handler of [...gone]) {
      handler("guest");
    }
    await vi.advanceTimersByTimeAsync(0);
    network(1).heal();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).toEqual(["+guest", "-guest", "+guest", "-guest"]);
    await room.leave();
    await host.leave();
  });
});
