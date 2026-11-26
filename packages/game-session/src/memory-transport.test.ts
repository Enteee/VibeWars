import { describe, expect, it } from "vitest";

import { createMemoryNetwork } from "./memory-transport.js";
import { transportContract } from "./transport-contract.js";
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

transportContract(
  "memory",
  () => {
    const network = createMemoryNetwork();
    return { join: () => network.join(), settle };
  },
  { describe, it, expect },
);

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

  it("shows every remaining peer the leave soon after leave() resolves", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    await settle();
    const atA = events(a);
    await b.leave();
    await settle();
    expect(atA).toEqual([`-${b.selfId}`]);
  });

  it("drops what is in flight to a peer that leaves", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join(), network.join()];
    const atB = inbox(b);
    a.send("intent", "in flight");
    await b.leave();
    await settle();
    expect(atB).toEqual([]);
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
    await settle();
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

  it("tells one peer the trouble it is given, until the handler is removed (#707)", async () => {
    const network = createMemoryNetwork();
    const [a, b] = [network.join("a"), network.join("b")];
    const atA: string[] = [];
    const atB: string[] = [];
    const off = a.onTrouble((trouble) => atA.push(trouble));
    b.onTrouble((trouble) => atB.push(trouble));
    network.trouble("a", "no-relay");
    await Promise.resolve();
    off();
    network.trouble("a", "peer-unreachable");
    await Promise.resolve();
    expect(atA).toEqual(["no-relay"]);
    expect(atB).toEqual([]);
  });

  it("refuses a second peer with the same id", () => {
    const network = createMemoryNetwork();
    network.join("host");
    expect(() => network.join("host")).toThrow(/already joined/);
  });
});
