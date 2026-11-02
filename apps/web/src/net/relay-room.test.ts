import { createMemoryNetwork } from "@vibewars/game-session/testing";
import { describe, expect, it } from "vitest";

import { relaySibling, withSiblingRoom } from "./relay-room.js";
import type { SharedRelay } from "./transport/turn-config.js";

const SHARED: SharedRelay = { urls: ["turns:relay.example:5349"], secret: "s" };

/** Lets the memory network's microtasks and the sibling's join run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("a sharing host's sibling relay room (#2091)", () => {
  /** A host in a main room, its sibling on its own network, and Options it follows. */
  function hosted(initially: SharedRelay | undefined) {
    const main = createMemoryNetwork();
    const relay = createMemoryNetwork();
    let offered = initially;
    const watchers = new Set<() => void>();
    let siblings = 0;
    let inSibling = 0;
    const host = withSiblingRoom({
      main: main.join("host"),
      joinSibling: () => {
        const room = relay.join("host");
        siblings += 1;
        inSibling += 1;
        const leave = room.leave.bind(room);
        return {
          ...room,
          leave: () => {
            inSibling -= 1;
            return leave();
          },
        };
      },
      offering: {
        load: () => offered,
        onChange: (handler) => {
          watchers.add(handler);
          return () => watchers.delete(handler);
        },
      },
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
    const setOffered = (next: SharedRelay | undefined): void => {
      offered = next;
      for (const watcher of watchers) {
        watcher();
      }
    };
    return {
      main,
      relay,
      host,
      seats,
      heard,
      setOffered,
      siblings: () => siblings,
      inSibling: () => inSibling,
      watchers,
    };
  }

  it("names the sibling after the room, with its password", () => {
    const room = { roomId: "r", password: "p", proofKey: null, relay: null };
    expect(relaySibling(room)).toEqual({ ...room, roomId: "r/relay" });
  });

  it("joins no sibling for a host that offers no relay", async () => {
    const { host, siblings } = hosted(undefined);
    await settle();
    expect(siblings()).toBe(0);
    await host.leave();
  });

  it("lets a joiner in the sibling reach the host, both ways", async () => {
    const { relay, host, seats } = hosted(SHARED);
    await settle();
    const hostHeard: unknown[] = [];
    host.on("chat-line", (data, from) => {
      hostHeard.push([data, from]);
    });
    const guest = relay.join("guest");
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

  it("gives a peer id heard in both rooms one seat: the newest", async () => {
    const { main, relay, host, seats, heard } = hosted(SHARED);
    await settle();
    const hostHeard: unknown[] = [];
    host.on("chat-line", (data) => {
      hostHeard.push(data);
    });
    const direct = main.join("guest");
    await settle();
    const relayed = relay.join("guest");
    const relayedHeard: unknown[] = [];
    relayed.on("chat-line", (data) => {
      relayedHeard.push(data);
    });
    const directHeard: unknown[] = [];
    direct.on("chat-line", (data) => {
      directHeard.push(data);
    });
    await settle();
    expect(heard).toEqual(["+guest", "-guest", "+guest"]);
    expect([...seats]).toEqual(["guest"]);

    // The older connection is not heard, and is not sent to.
    direct.send("chat-line", { old: 1 });
    relayed.send("chat-line", { new: 1 });
    host.send("chat-line", { all: 1 });
    await settle();
    expect(hostHeard).toEqual([{ new: 1 }]);
    expect(relayedHeard).toEqual([{ all: 1 }]);
    expect(directHeard).toEqual([]);

    // Its leaving the older room is not the peer leaving.
    await direct.leave();
    await settle();
    expect([...seats]).toEqual(["guest"]);
    await relayed.leave();
    await settle();
    expect([...seats]).toEqual([]);
    await host.leave();
  });

  it("follows Options: in the sibling while it offers, its guests gone when it stops", async () => {
    const { relay, host, seats, setOffered, siblings, inSibling, watchers } = hosted(undefined);
    await settle();
    setOffered(SHARED);
    await settle();
    expect(siblings()).toBe(1);
    const guest = relay.join("guest");
    await settle();
    expect([...seats]).toEqual(["guest"]);

    setOffered(undefined);
    await settle();
    expect(inSibling()).toBe(0);
    expect([...seats]).toEqual([]);

    setOffered(SHARED);
    await settle();
    expect(siblings()).toBe(2);
    await host.leave();
    expect(inSibling()).toBe(0);
    expect(watchers.size).toBe(0);
    await guest.leave();
  });
});
