/**
 * The `Transport` contract (#82, #392) as a test suite every adapter runs:
 * memory in game-session, BroadcastChannel in apps/web. Trystero does not,
 * since CI reaches no public relay (#15).
 *
 * The vitest functions are handed in, so `dist` never imports vitest at
 * runtime.
 */
import type { describe, expect, it } from "vitest";

import type { Transport } from "./transport.js";

/** A fresh room for one case: every `join` meets every other. */
export interface ContractNetwork {
  join(): Transport;
  /** Resolves once everything in flight so far has landed. */
  settle(): Promise<void>;
}

/** What `peer` receives on `"intent"`, as `[from, data]`. */
function inbox(peer: Transport): [string, unknown][] {
  const got: [string, unknown][] = [];
  peer.on("intent", (data, from) => got.push([from, data]));
  return got;
}

/** Who `peer` sees join and leave, as `+id` and `-id`. */
function events(peer: Transport): string[] {
  const seen: string[] = [];
  peer.onPeerJoin((id) => seen.push(`+${id}`));
  peer.onPeerLeave((id) => seen.push(`-${id}`));
  return seen;
}

export function transportContract(
  name: string,
  makeNetwork: () => ContractNetwork,
  t: { describe: typeof describe; it: typeof it; expect: typeof expect },
): void {
  /** Run `body` in a fresh room, and leave every peer it joined after. */
  function room(title: string, body: (network: ContractNetwork) => Promise<void>): void {
    t.it(title, async () => {
      const made = makeNetwork();
      const joined: Transport[] = [];
      const network: ContractNetwork = {
        join() {
          const peer = made.join();
          joined.push(peer);
          return peer;
        },
        settle: () => made.settle(),
      };
      try {
        await body(network);
      } finally {
        await Promise.all(joined.map((peer) => peer.leave()));
      }
    });
  }

  t.describe(`the ${name} transport keeps the Transport contract (#82)`, () => {
    room("keeps each sender's order to each receiver over 1 000 interleaved sends", async (n) => {
      const [a, b, c] = [n.join(), n.join(), n.join()];
      const got = inbox(c);
      await n.settle();
      for (let i = 0; i < 1000; i++) {
        (i % 3 === 0 ? b : a).send("intent", i);
      }
      await n.settle();
      const from = (peer: Transport) =>
        got.filter(([sender]) => sender === peer.selfId).map(([, data]) => data);
      t.expect(from(a)).toEqual([...Array(1000).keys()].filter((i) => i % 3 !== 0));
      t.expect(from(b)).toEqual([...Array(1000).keys()].filter((i) => i % 3 === 0));
    });

    room("broadcasts to every other peer, never back to the sender", async (n) => {
      const [a, b, c] = [n.join(), n.join(), n.join()];
      const [atA, atB, atC] = [inbox(a), inbox(b), inbox(c)];
      await n.settle();
      a.send("intent", "hi");
      await n.settle();
      t.expect(atA).toEqual([]);
      t.expect(atB).toEqual([[a.selfId, "hi"]]);
      t.expect(atC).toEqual([[a.selfId, "hi"]]);
    });

    room("sends to one peer alone with `to`", async (n) => {
      const [a, b, c] = [n.join(), n.join(), n.join()];
      const [atB, atC] = [inbox(b), inbox(c)];
      await n.settle();
      a.send("intent", "psst", c.selfId);
      await n.settle();
      t.expect(atB).toEqual([]);
      t.expect(atC).toEqual([[a.selfId, "psst"]]);
    });

    room("delivers only on the channel sent to", async (n) => {
      const [a, b] = [n.join(), n.join()];
      const got = inbox(b);
      await n.settle();
      a.send("snapshot", {});
      await n.settle();
      t.expect(got).toEqual([]);
    });

    room("tells every peer of each join and leave, existing peers included", async (n) => {
      const a = n.join();
      const atA = events(a);
      const b = n.join();
      const atB = events(b);
      await n.settle();
      const c = n.join();
      const atC = events(c);
      await n.settle();
      await b.leave();
      await n.settle();
      t.expect(atA).toEqual([`+${b.selfId}`, `+${c.selfId}`, `-${b.selfId}`]);
      t.expect(atB).toEqual([`+${a.selfId}`, `+${c.selfId}`]);
      // Two senders: nothing orders a's hello against b's.
      t.expect(atC.slice(0, 2).sort()).toEqual([`+${a.selfId}`, `+${b.selfId}`].sort());
      t.expect(atC.slice(2)).toEqual([`-${b.selfId}`]);
    });

    room("delivers nothing to a peer after leave(), and nothing it sends after", async (n) => {
      const [a, b] = [n.join(), n.join()];
      const [atA, atB] = [inbox(a), inbox(b)];
      await n.settle();
      const left = b.leave();
      a.send("intent", "too late");
      b.send("intent", "from beyond");
      await left;
      await n.settle();
      t.expect(atB).toEqual([]);
      t.expect(atA).toEqual([]);
    });

    room("stops calling a handler once it is removed", async (n) => {
      const [a, b] = [n.join(), n.join()];
      const got: unknown[] = [];
      const off = b.on("intent", (data) => got.push(data));
      const offLeave = b.onPeerLeave((id) => got.push(`-${id}`));
      await n.settle();
      a.send("intent", 1);
      await n.settle();
      off();
      offLeave();
      a.send("intent", 2);
      await a.leave();
      await n.settle();
      t.expect(got).toEqual([1]);
    });

    room("copies a message: mutating it after send changes nothing received", async (n) => {
      const [a, b, c] = [n.join(), n.join(), n.join()];
      const [atB, atC] = [inbox(b), inbox(c)];
      await n.settle();
      const sent = { players: [{ health: 100 }] };
      a.send("intent", sent);
      const first = sent.players[0];
      if (first !== undefined) {
        first.health = 0;
      }
      await n.settle();
      t.expect(atB[0]?.[1]).toEqual({ players: [{ health: 100 }] });
      t.expect(atB[0]?.[1]).not.toBe(atC[0]?.[1]);
    });
  });
}
