import {
  MAX_STROKE_POINTS,
  MAX_WIRE_PINGS,
  MAX_WIRE_STROKES,
  STROKE_SECONDS,
  parseWireCalls,
  parseWireStrokes,
  type JsonValue,
  type PeerCall,
  type WireCalls,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MESSAGE_BURST } from "./intent-budget.js";
import type { PeerMatchConnection } from "./match-client.js";
import {
  TICK_SECONDS,
  settle,
  starterBuild,
  startMatch,
  type TestMatch,
} from "./match-harness.test-support.js";
import {
  BOT_CALL_SECONDS,
  RECONNECT_WINDOW_SECONDS,
  botCalls,
  type PlannedSeat,
} from "./match-host.js";
import { testCosmetics } from "./player-key.test-support.js";
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

  it("shows a flood's newest pings, and ignores what is over the message budget (#730)", async () => {
    const match = startMatch();
    const { a, c } = await fourInAMatch(match);
    // The whole burst at one match time: the budget lets at most a burst through.
    for (let i = 0; i < MESSAGE_BURST * 3; i += 1) {
      a.connection.sendCall({ kind: "ping", x: i, y: i });
    }
    await settle();
    await match.step(TICK_SECONDS);
    const { pings } = c.connection.getCalls();
    expect(pings).toHaveLength(MAX_WIRE_PINGS);
    expect(Math.max(...pings.map((ping) => ping.x))).toBeLessThan(MESSAGE_BURST);
  });

  it("sends a team its calls once a tick, however many came in (#730)", async () => {
    const match = startMatch();
    const { a, c } = await fourInAMatch(match);
    const before = c.heard.length;
    for (let i = 0; i < 5; i += 1) {
      a.connection.sendCall({ kind: "ping", x: i, y: i });
    }
    await settle();
    expect(c.heard).toHaveLength(before);
    await match.step(TICK_SECONDS);
    expect(c.heard).toHaveLength(before + 1);
    expect(c.connection.getCalls().pings).toHaveLength(5);
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
    expect(c.connection.getCalls()).toEqual({ target: null, pings: [], strokes: [] });

    a.connection.sendCall({ kind: "target", targetId: b.connection.selfSessionId });
    await settle();
    await match.step(TICK_SECONDS);
    expect(c.connection.getCalls().target?.targetId).toBe(b.connection.selfSessionId);
  });
});

describe("bots calling targets (#4188)", () => {
  const bot = (team: 0 | 1, name: string): [string, PlannedSeat] => [
    name,
    {
      team,
      name,
      guildTag: null,
      heroRank: 0,
      guildCape: null,
      bot: true,
      build: starterBuild("Warrior/Monk"),
    },
  ];
  const human = (peerId: string, team: 0 | 1, key: string): [string, PlannedSeat] => [
    peerId,
    {
      team,
      name: peerId,
      guildTag: null,
      heroRank: 0,
      guildCape: null,
      bot: false,
      playerPubkey: key.repeat(32),
      startMorale: 0,
      cosmetics: testCosmetics,
      build: null,
    },
  ];

  /** The local human and bots A and B on team 0, against bots C and D, and `peer-1` if `guest`. */
  async function botMatch(guest = false) {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([
        human("host/local", 0, "ab"),
        bot(0, "Bot B"),
        bot(0, "Bot A"),
        bot(1, "Bot C"),
        bot(1, "Bot D"),
        ...(guest ? [human("peer-1", 1, "cd")] : []),
      ]),
    });
    const local = await match.joinLocal();
    const peer = guest ? await match.join() : undefined;
    await match.step(TICK_SECONDS);
    return { match, local, peer };
  }

  async function stepUntil(match: TestMatch, seconds: number, done: () => boolean): Promise<void> {
    for (let t = 0; t < seconds && !done(); t += TICK_SECONDS) {
      await match.step(TICK_SECONDS);
    }
  }

  /** The session ids of the players `local` sees named `names`. */
  const idsOf = (local: PeerMatchConnection, names: readonly string[]): string[] =>
    local
      .getSnapshot()
      .players.filter((player) => names.includes(player.name))
      .map((player) => player.sessionId);

  it("calls a bot's target, with its name, for a team with no call up", async () => {
    const { match, local } = await botMatch();
    await stepUntil(match, 5, () => local.getCalls().target !== null);
    const called = local.getCalls().target;
    expect(idsOf(local, ["Bot A", "Bot B"])).toContain(called?.callerId);
    expect(idsOf(local, ["Bot C", "Bot D"])).toContain(called?.targetId);
  });

  it("never replaces a human's call while its target lives, and calls again once it lapses", async () => {
    const { match, local, peer } = await botMatch(true);
    const guestId = peer?.connection.selfSessionId ?? "";
    const humanCall = { targetId: guestId, callerId: local.selfSessionId };
    local.sendCall({ kind: "target", targetId: guestId });
    await settle();
    await match.step(TICK_SECONDS);
    expect(local.getCalls().target).toEqual(humanCall);
    await match.step(2 * BOT_CALL_SECONDS);
    expect(local.getCalls().target).toEqual(humanCall);

    const bots = idsOf(local, ["Bot A", "Bot B"]);
    await peer?.transport.leave();
    await stepUntil(match, RECONNECT_WINDOW_SECONDS + 5, () =>
      bots.includes(local.getCalls().target?.callerId ?? ""),
    );
    expect(bots).toContain(local.getCalls().target?.callerId);
  });

  it("calls nothing for a team with no bots", async () => {
    const match = startMatch({
      seats: new Map<string, PlannedSeat>([human("host/local", 0, "ab"), bot(1, "Bot C")]),
    });
    const local = await match.joinLocal();
    await match.step(5);
    expect(local.getCalls().target).toBeNull();
  });

  it("re-calls a new target at most once in BOT_CALL_SECONDS, and at once with none up", () => {
    const byBot = { targetId: "c", byHuman: false };
    expect(botCalls(null, "c", 0.5, 1)).toBe(true);
    expect(botCalls(byBot, "c", undefined, 10)).toBe(false);
    expect(botCalls(byBot, "d", 1, 1 + BOT_CALL_SECONDS - 0.1)).toBe(false);
    expect(botCalls(byBot, "d", 1, 1 + BOT_CALL_SECONDS)).toBe(true);
    expect(botCalls({ targetId: "c", byHuman: true }, "d", undefined, 100)).toBe(false);
  });
});

describe("compass lines through the P2P host (#2391)", () => {
  const line = (strokeId: number, from: number): PeerCall => ({
    kind: "stroke",
    strokeId,
    points: [
      [from, 200],
      [from + 20, 210],
    ],
  });

  it("shows a segment to the drawer's team, never a foe, and sends each once", async () => {
    const match = startMatch();
    const { a, b, c, d } = await fourInAMatch(match);
    const sent: number[][] = [];
    for (const player of [a, b, c, d]) {
      const ids: number[] = [];
      sent.push(ids);
      player.transport.on("strokes", (data) => {
        ids.push(...(parseWireStrokes(data)?.segments.map(({ id }) => id) ?? []));
      });
    }
    a.connection.sendCall(line(1, 300));
    await settle();
    await match.step(TICK_SECONDS);
    a.connection.sendCall(line(1, 320));
    await settle();
    await match.step(TICK_SECONDS);

    const drawn = c.connection.getCalls().strokes;
    expect(drawn.map(({ points }) => points[0])).toEqual([
      [300, 200],
      [320, 200],
    ]);
    expect(drawn.every(({ byId }) => byId === a.connection.selfSessionId)).toBe(true);
    expect(a.connection.getCalls().strokes).toHaveLength(2);
    expect(sent).toEqual([[1, 2], [], [1, 2], []]);
    expect(b.connection.getCalls().strokes).toEqual([]);
    expect(d.connection.getCalls().strokes).toEqual([]);
    await match.step(STROKE_SECONDS);
    expect(c.connection.getCalls().strokes).toEqual([]);
  });

  it("gives a rejoining peer its team's live segments", async () => {
    const match = startMatch();
    const { a, c } = await fourInAMatch(match);
    a.connection.sendCall(line(1, 300));
    await settle();
    await match.step(TICK_SECONDS);

    await c.transport.leave();
    await settle();
    await match.step(TICK_SECONDS);
    const { connection: back } = await match.rejoin(c.connection);
    await settle();
    expect(back.getCalls().strokes.map(({ points }) => points[0])).toEqual([[300, 200]]);
  });

  it("keeps a peer's lines bounded however many a hostile host sends", async () => {
    const match = startMatch();
    const { c } = await fourInAMatch(match);
    const points = Array.from({ length: MAX_STROKE_POINTS }, (_, i) => [i, i]);
    for (let message = 0; message < 10; message += 1) {
      match.hostTransport.send("strokes", {
        segments: Array.from({ length: MAX_WIRE_STROKES }, (_, i) => ({
          id: 1000 + message * MAX_WIRE_STROKES + i,
          byId: "forged",
          strokeId: 1,
          points,
          remaining: STROKE_SECONDS,
        })),
      });
    }
    await settle();
    const drawn = c.connection.getCalls().strokes;
    expect(drawn).toHaveLength(MAX_WIRE_STROKES);
    expect(drawn.at(-1)?.id).toBe(1000 + 10 * MAX_WIRE_STROKES - 1);
  });
});
