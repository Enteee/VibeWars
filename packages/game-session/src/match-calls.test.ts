import { parseWireCalls, type JsonValue, type WireCalls } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CALL_INTERVAL_SECONDS } from "./calls.js";
import { MESSAGE_BURST } from "./intent-budget.js";
import type { PeerMatchConnection } from "./match-client.js";
import { TICK_SECONDS, settle, startMatch, type TestMatch } from "./match-harness.test-support.js";
import type { Transport } from "./transport.js";

/**
 * Calls and pings through the host (#443): a team's calls reach that
 * team's peers, each on its own, and never the other team's.
 */

interface Player {
  readonly connection: PeerMatchConnection;
  readonly transport: Transport;
  /** Every `calls` message this peer was sent, from anyone. */
  readonly heard: WireCalls[];
}

async function joinListening(match: TestMatch): Promise<Player> {
  const { connection, transport } = await match.join();
  const heard: WireCalls[] = [];
  transport.on("calls", (data) => {
    const calls = parseWireCalls(data);
    if (calls !== undefined) {
      heard.push(calls);
    }
  });
  return { connection, transport, heard };
}

/** Four players, seated in turn: a and c on team 0, b and d on team 1. */
async function fourInAMatch(match: TestMatch) {
  const a = await joinListening(match);
  const b = await joinListening(match);
  const c = await joinListening(match);
  const d = await joinListening(match);
  await match.step(TICK_SECONDS);
  return { a, b, c, d };
}

describe("calls through the P2P host (#443)", () => {
  it("shows a call to both peers of the caller's team, and to no peer of the other", async () => {
    const match = startMatch();
    const { a, b, c, d } = await fourInAMatch(match);
    a.connection.sendCall({ kind: "target", targetId: b.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);

    const called = { targetId: b.connection.selfSessionId, callerId: a.connection.selfSessionId };
    expect(a.connection.getCalls().target).toEqual(called);
    expect(c.connection.getCalls().target).toEqual(called);
    expect(b.connection.getCalls().target).toBeNull();
    expect(d.connection.getCalls().target).toBeNull();
    // Not only not shown: never sent.
    for (const foe of [b, d]) {
      expect(foe.heard.every((calls) => calls.target === null && calls.pings.length === 0)).toBe(
        true,
      );
    }
  });

  it("pings for the team, and the ping runs out", async () => {
    const match = startMatch();
    const { a, b, c } = await fourInAMatch(match);
    a.connection.sendCall({ kind: "ping", x: 300, y: 200 });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().pings.map(({ x, y }) => [x, y])).toEqual([[300, 200]]);
    expect(b.connection.getCalls().pings).toEqual([]);
    await match.step(3);
    expect(c.connection.getCalls().pings).toEqual([]);
  });

  it("refuses a call on an ally, and clears a call on a player who left", async () => {
    const match = startMatch();
    const { a, b, c } = await fourInAMatch(match);
    a.connection.sendCall({ kind: "target", targetId: c.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().target).toBeNull();

    await match.step(CALL_INTERVAL_SECONDS);
    a.connection.sendCall({ kind: "target", targetId: b.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().target?.targetId).toBe(b.connection.selfSessionId);
    await b.connection.disconnect();
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().target).toBeNull();
  });

  it("gives a rejoining peer the call its team has up", async () => {
    const match = startMatch();
    const { a, b, c } = await fourInAMatch(match);
    a.connection.sendCall({ kind: "target", targetId: b.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);

    await c.transport.leave();
    await settle();
    await match.step(TICK_SECONDS);
    const { connection: back } = await match.rejoin(c.connection);
    await settle();
    expect(back.getCalls().target?.targetId).toBe(b.connection.selfSessionId);
  });

  it("keeps a flood to one call a second, and inside the message budget", async () => {
    const match = startMatch();
    const { a, c } = await fourInAMatch(match);
    // The whole burst at one match time: one gets through.
    for (let i = 0; i < MESSAGE_BURST * 3; i += 1) {
      a.connection.sendCall({ kind: "ping", x: i, y: i });
    }
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().pings).toHaveLength(1);
    // The flood spent the budget; it refills, and the limit lets one more through.
    await match.step(CALL_INTERVAL_SECONDS);
    a.connection.sendCall({ kind: "ping", x: 1, y: 1 });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().pings).toHaveLength(2);
  });

  it("drops a malformed call without a word, and keeps the peer", async () => {
    const match = startMatch();
    const { a, b, c } = await fourInAMatch(match);
    const junk: JsonValue[] = [
      null,
      "target",
      { kind: "target" },
      { kind: "ping", x: "1", y: 2 },
      { kind: "ping", x: 1 },
      { kind: "focus", targetId: b.connection.selfSessionId },
    ];
    for (const call of junk) {
      a.transport.send("call", call, "host");
    }
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls()).toEqual({ target: null, pings: [] });

    await match.step(CALL_INTERVAL_SECONDS);
    a.connection.sendCall({ kind: "target", targetId: b.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().target?.targetId).toBe(b.connection.selfSessionId);
  });
});
