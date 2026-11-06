import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { describe, expect, it } from "vitest";

import { MAX_RELAY_ATTEMPTS } from "./relay-join.js";
import { relayRoomsSwitch, relaySibling, withSiblingRoom } from "./relay-room.js";

/** Lets the memory network's microtasks and the siblings' joins run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("a host's sibling relay rooms (#2091, #2527)", () => {
  /** A host in a main room, each sibling on its own network, and a switch for whether relays are wanted. */
  function hosted(wanted: boolean) {
    const main = createMemoryNetwork();
    const relays = new Map(
      Array.from({ length: MAX_RELAY_ATTEMPTS }, (_, i) => [i + 1, createMemoryNetwork()] as const),
    );
    const relay = (attempt: number) => {
      const network = relays.get(attempt);
      if (network === undefined) {
        throw new Error(`no sibling relay${String(attempt)}`);
      }
      return network;
    };
    const relayRooms = relayRoomsSwitch();
    relayRooms.set(wanted);
    const joined: number[] = [];
    const inSibling = new Set<number>();
    const host = withSiblingRoom({
      main: main.join("host"),
      joinSibling: (attempt) => {
        const room = relay(attempt).join("host");
        joined.push(attempt);
        inSibling.add(attempt);
        const leave = room.leave.bind(room);
        return {
          ...room,
          leave: () => {
            inSibling.delete(attempt);
            return leave();
          },
        };
      },
      relayRooms,
    });
    const seats = new Set<string>();
    const heard: string[] = [];
    host.onPeerJoin((peerId) => {
      heard.push(`+${peerId}`);
      seats.add(peerId);
    });
    host.onPeerLeave((peerId) => {
      heard.push(`-${peerId}`);
      seats.delete(peerId);
    });
    return {
      main,
      relay,
      host,
      seats,
      heard,
      relayRooms,
      joined,
      inSibling: () => [...inSibling].sort(),
    };
  }

  it("names each sibling after the room and its attempt, with its password", () => {
    const room = { roomId: "r", password: "p", proofKey: null, relay: null };
    expect(relaySibling(room, 1)).toEqual({ ...room, roomId: "r/relay1" });
    expect(relaySibling(room, 3)).toEqual({ ...room, roomId: "r/relay3" });
  });

  it("joins no sibling while relays are not wanted", async () => {
    const { host, joined } = hosted(false);
    await settle();
    expect(joined).toEqual([]);
    await host.leave();
  });

  it("joins every sibling while relays are wanted, and leaves them once they are not", async () => {
    const { host, relayRooms, joined, inSibling } = hosted(false);
    await settle();
    relayRooms.set(true);
    await settle();
    expect(joined).toEqual([1, 2, 3]);
    expect(inSibling()).toEqual([1, 2, 3]);
    relayRooms.set(false);
    await settle();
    expect(inSibling()).toEqual([]);
    relayRooms.set(true);
    await settle();
    expect(joined).toEqual([1, 2, 3, 1, 2, 3]);
    await host.leave();
  });

  it("lets a joiner in any sibling reach the host, both ways", async () => {
    const { relay, host, seats } = hosted(true);
    await settle();
    const hostHeard: unknown[] = [];
    host.on("chat-line", (data, from) => {
      hostHeard.push([data, from]);
    });
    const guest = relay(2).join("guest");
    const guestHeard: unknown[] = [];
    guest.on("chat-line", (data) => {
      guestHeard.push(data);
    });
    await settle();
    expect([...seats]).toEqual(["guest"]);
    guest.send("chat-line", { hello: 1 });
    host.send("chat-line", { welcome: 1 });
    await settle();
    expect(hostHeard).toEqual([[{ hello: 1 }, "guest"]]);
    expect(guestHeard).toEqual([{ welcome: 1 }]);
    await host.leave();
    await guest.leave();
  });

  it("never moves a live seat for a join in another room: a peer id is anyone's", async () => {
    const { main, relay, host, seats, heard } = hosted(true);
    await settle();
    const hostHeard: unknown[] = [];
    host.on("chat-line", (data) => {
      hostHeard.push(data);
    });
    const seated = relay(1).join("guest");
    const seatedHeard: unknown[] = [];
    seated.on("chat-line", (data) => {
      seatedHeard.push(data);
    });
    await settle();
    // The same id, announced in the main room and another sibling by whoever holds the invite.
    const thieves = [main.join("guest"), relay(3).join("guest")];
    const thiefHeard: unknown[] = [];
    for (const thief of thieves) {
      thief.on("chat-line", (data) => {
        thiefHeard.push(data);
      });
    }
    await settle();
    expect(heard).toEqual(["+guest"]);
    expect([...seats]).toEqual(["guest"]);

    // The seat's room is heard and sent to; the others are not.
    seated.send("chat-line", { seated: 1 });
    for (const thief of thieves) {
      thief.send("chat-line", { thief: 1 });
    }
    host.send("chat-line", { all: 1 });
    await settle();
    expect(hostHeard).toEqual([{ seated: 1 }]);
    expect(seatedHeard).toEqual([{ all: 1 }]);
    expect(thiefHeard).toEqual([]);

    // Its leaving another room is not the peer leaving.
    for (const thief of thieves) {
      await thief.leave();
    }
    await settle();
    expect(heard).toEqual(["+guest"]);
    await seated.leave();
    await settle();
    expect(heard).toEqual(["+guest", "-guest"]);
    expect([...seats]).toEqual([]);
    await host.leave();
  });

  it("seats a peer in another room once its seat's room loses it", async () => {
    const { main, relay, host, seats, heard } = hosted(true);
    await settle();
    const hostHeard: unknown[] = [];
    host.on("chat-line", (data) => {
      hostHeard.push(data);
    });
    const direct = main.join("guest");
    await settle();
    const relayed = relay(2).join("guest");
    await settle();
    await direct.leave();
    await settle();
    expect(heard).toEqual(["+guest", "-guest", "+guest"]);
    expect([...seats]).toEqual(["guest"]);
    relayed.send("chat-line", { relayed: 1 });
    await settle();
    expect(hostHeard).toEqual([{ relayed: 1 }]);
    await relayed.leave();
    await host.leave();
  });

  it("keeps a sibling a relayed member is seated through, until it leaves", async () => {
    const { relay, host, seats, relayRooms, inSibling } = hosted(true);
    await settle();
    const guest = relay(2).join("guest");
    await settle();
    expect([...seats]).toEqual(["guest"]);

    relayRooms.set(false);
    await settle();
    expect(inSibling()).toEqual([2]);
    expect([...seats]).toEqual(["guest"]);

    await guest.leave();
    await settle();
    expect([...seats]).toEqual([]);
    expect(inSibling()).toEqual([]);
    await host.leave();
  });

  it("leaves every room with the lobby, a seated sibling too, and stops listening", async () => {
    const { relay, host, relayRooms, joined, inSibling } = hosted(true);
    await settle();
    const guest = relay(1).join("guest");
    await settle();
    await host.leave();
    expect(inSibling()).toEqual([]);
    relayRooms.set(false);
    relayRooms.set(true);
    await settle();
    expect(joined).toEqual([1, 2, 3]);
    await guest.leave();
  });
});
