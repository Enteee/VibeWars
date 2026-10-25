import { describe, expect, it } from "vitest";

import { createMemoryNetwork } from "./memory-transport.js";
import type { Transport } from "./transport.js";

/** Let every delivery queued so far land: microtasks run in order. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

/** What `peer` receives on `"intent"`, as `[from, data]`. */
function inbox(peer: Transport): [string, unknown][] {
  const got: [string, unknown][] = [];
  peer.on("intent", (data, from) => got.push([from, data]));
  return got;
}

/** Who `peer` sees join and leave, in order. */
function events(peer: Transport): string[] {
  const seen: string[] = [];
  peer.onPeerJoin((id) => seen.push(`+${id}`));
  peer.onPeerLeave((id) => seen.push(`-${id}`));
  return seen;
}

describe("the memory transport (#82)", () => {
  it("delivers after send returns, not during it", async () => {
    const network = createMemoryNetwork();
    const a = network.join();
    const b = network.join();
    const got = inbox(b);
    a.send("intent", 1);
    expect(got).toEqual([]);
    await settle();
    expect(got).toEqual([[a.selfId, 1]]);
  });

  it("keeps each sender's order to each receiver over 1 000 interleaved sends", async () => {
    const network = createMemoryNetwork();
    const [a, b, c] = [network.join(), network.join(), network.join()];
    const got = inbox(c);
    for (let i = 0; i < 1000; i++) {
      (i % 3 === 0 ? b : a).send("intent", i);
    }
    await settle();
    const from = (peer: Transport) =>
      got.filter(([sender]) => sender === peer.selfId).map(([, data]) => data);
    expect(from(a)).toEqual([...Array(1000).keys()].filter((i) => i % 3 !== 0));
    expect(from(b)).toEqual([...Array(1000).keys()].filter((i) => i % 3 === 0));
  });

  it("broadcasts to every other peer, never back to the sender", async () => {
    const network = createMemoryNetwork();
    const [a, b, c] = [network.join(), network.join(), network.join()];
    const [atA, atB, atC] = [inbox(a), inbox(b), inbox(c)];
    a.send("intent", "hi");
    await settle();
    expect(atA).toEqual([]);
    expect(atB).toEqual([[a.selfId, "hi"]]);
    expect(atC).toEqual([[a.selfId, "hi"]]);
  });

  it("sends to one peer alone with `to`", async () => {
    const network = createMemoryNetwork();
    const [a, b, c] = [network.join(), network.join(), network.join()];
    const [atB, atC] = [inbox(b), inbox(c)];
    a.send("intent", "psst", c.selfId);
    await settle();
    expect(atB).toEqual([]);
    expect(atC).toEqual([[a.selfId, "psst"]]);
  });

  it("delivers only on the channel sent to", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    const got = inbox(b);
    a.send("snapshot", {});
    await settle();
    expect(got).toEqual([]);
  });

  it("tells every peer of each join and leave, existing peers included", async () => {
    const network = createMemoryNetwork();
    const a = network.join("a");
    const atA = events(a);
    const b = network.join("b");
    const atB = events(b);
    await settle();
    const c = network.join("c");
    const atC = events(c);
    await settle();
    await b.leave();
    expect(atA).toEqual(["+b", "+c", "-b"]);
    expect(atB).toEqual(["+a", "+c"]);
    expect(atC).toEqual(["+a", "+b", "-b"]);
  });

  it("resolves leave() after every remaining peer has seen it", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    await settle();
    const atA = events(a);
    await b.leave();
    expect(atA).toEqual([`-${b.selfId}`]);
  });

  it("delivers nothing to a peer after leave(), and nothing it sends after", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    const [atA, atB] = [inbox(a), inbox(b)];
    a.send("intent", "in flight");
    const left = b.leave();
    a.send("intent", "too late");
    b.send("intent", "from beyond");
    await left;
    await settle();
    expect(atB).toEqual([]);
    expect(atA).toEqual([]);
  });

  it("lands what a peer sent before leave() ahead of its leave", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    await settle();
    const seen: string[] = [];
    a.on("intent", (data) => seen.push(String(data)));
    a.onPeerLeave((id) => seen.push(`-${id}`));
    b.send("intent", "bye");
    await b.leave();
    expect(seen).toEqual(["bye", `-${b.selfId}`]);
  });

  it("drops messages across a partition and resumes after heal", async () => {
    const network = createMemoryNetwork();
    const [a, b, c] = [network.join("a"), network.join("b"), network.join("c")];
    const [atB, atC] = [inbox(b), inbox(c)];
    await settle();
    const seen = events(a);
    network.partition("a", "b");
    a.send("intent", "lost");
    b.send("intent", "lost too", "a");
    await settle();
    network.heal();
    a.send("intent", "back");
    await settle();
    expect(atB).toEqual([["a", "back"]]);
    expect(atC).toEqual([
      ["a", "lost"],
      ["a", "back"],
    ]);
    expect(seen).toEqual(["-b", "+b"]);
  });

  it("copies a message: mutating it after send changes nothing received", async () => {
    const network = createMemoryNetwork();
    const [a, b, c] = [network.join(), network.join(), network.join()];
    const [atB, atC] = [inbox(b), inbox(c)];
    const sent = { players: [{ health: 100 }] };
    a.send("intent", sent);
    const first = sent.players[0];
    if (first !== undefined) {
      first.health = 0;
    }
    await settle();
    expect(atB[0]?.[1]).toEqual({ players: [{ health: 100 }] });
    expect(atB[0]?.[1]).not.toBe(atC[0]?.[1]);
  });

  it("refuses a second peer with the same id", () => {
    const network = createMemoryNetwork();
    network.join("host");
    expect(() => network.join("host")).toThrow(/already joined/);
  });

  it("stops calling a handler once it is removed", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    const got: unknown[] = [];
    const off = b.on("intent", (data) => got.push(data));
    a.send("intent", 1);
    await settle();
    off();
    a.send("intent", 2);
    await settle();
    expect(got).toEqual([1]);
  });
});
