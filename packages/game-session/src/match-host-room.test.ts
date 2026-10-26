import { DEFAULT_MATCH_RULES, DEFAULT_SKILL_BAR } from "@vibewars/game-core";
import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  parsePeerRefuse,
  parsePeerWelcome,
  parseRecharge,
  type PeerRefuse,
  type PeerWelcome,
  type RechargeMessage,
} from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { MatchRefusedError, connectMatch } from "./match-client.js";
import { MATCH_OVER_MESSAGE, RECONNECT_WINDOW_SECONDS, RULESET } from "./match-host.js";
import {
  ARENA,
  TICK_SECONDS,
  hello,
  playerIn,
  self,
  settle,
  startMatch,
  type TestMatch,
} from "./match-harness.test-support.js";
import type { Transport } from "./transport.js";

/**
 * The server's match-room tests (`apps/server/src/match-room.test.ts`),
 * ported to the P2P host (#375): the same behaviour, asked of
 * `createMatchHost` over the memory transport instead of a Colyseus room
 * over a socket. Where the host means to differ from the room, such as
 * holding a dropped player's seat, the test says so.
 */

/** The first player seated always gets the map's first spawn point. */
const FIRST_SPAWN = ARENA.spawns[0]?.position ?? { x: Number.NaN, y: Number.NaN };

/** Every message `transport` is sent on one channel, through `parse`. */
function collect<T>(
  transport: Transport,
  channel: "welcome" | "refuse" | "recharge" | "ended",
  parse: (value: unknown) => T | undefined,
): T[] {
  const received: T[] = [];
  transport.on(channel, (data) => {
    const message = parse(data);
    if (message !== undefined) {
      received.push(message);
    }
  });
  return received;
}

/**
 * Let an intent just sent reach the host, then run one tick. `step` ticks
 * before it lets messages land, so a single tick straight after `sendIntent`
 * would snapshot the match as it was before the intent.
 */
async function landAndTick(match: TestMatch): Promise<void> {
  await settle();
  await match.step(TICK_SECONDS);
}

describe("a P2P match host, as the match room (#375)", () => {
  it("accepts a client and syncs state, spawned at the map's first spawn point", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    await match.step(TICK_SECONDS);

    expect(connection.getSnapshot().players).toHaveLength(1);
    const player = self(connection);
    expect(player?.sessionId).toBe(connection.selfSessionId);
    expect(player?.x).toBe(FIRST_SPAWN.x);
    expect(player?.y).toBe(FIRST_SPAWN.y);
  });

  it("sends a hello carrying the protocol version and tick interval", async () => {
    // The P2P `welcome` is the room's `hello`: read raw, as the wire carries it.
    const match = startMatch();
    const peer = match.network.join();
    const welcomes = collect<PeerWelcome>(peer, "welcome", parsePeerWelcome);
    await settle();
    peer.send("hello", hello(), "host");
    await settle();

    const [welcome] = welcomes;
    expect(welcome?.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(welcome?.playerId).toMatch(/\S/);
    expect(welcome?.tickIntervalMs).toBeGreaterThan(0);
  });

  it("tracks multiple clients and removes them on leave", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b, transport: bTransport } = await match.join();
    await match.step(TICK_SECONDS);
    expect(a.getSnapshot().players).toHaveLength(2);

    // A drop: the peer goes without saying `bye`.
    await bTransport.leave();
    // Unlike the room, the host holds a dropped seat for a while, so a
    // wifi blip does not cost the player their character.
    await match.step(TICK_SECONDS);
    expect(playerIn(a.getSnapshot(), b.selfSessionId)).toBeDefined();
    await match.step(RECONNECT_WINDOW_SECONDS);
    expect(a.getSnapshot().players).toHaveLength(1);
    expect(playerIn(a.getSnapshot(), b.selfSessionId)).toBeUndefined();
  });

  describe("the protocol handshake", () => {
    it("refuses a client on another protocol version, telling it to reload", async () => {
      const match = startMatch();
      const joining = match.join({ ...hello(), protocolVersion: `${PROTOCOL_VERSION}-stale` });
      await expect(joining).rejects.toThrow(PROTOCOL_MISMATCH_MESSAGE);
      await expect(joining).rejects.toBeInstanceOf(MatchRefusedError);
    });

    it("refuses a client that sends no protocol version at all", async () => {
      // Absence is a mismatch, not "an old client, let it in": the peer is
      // told so, rather than left waiting for a welcome that never comes.
      const match = startMatch();
      const peer = match.network.join();
      const refusals = collect<PeerRefuse>(peer, "refuse", parsePeerRefuse);
      await settle();
      peer.send("hello", { name: "Tester", build: null, rejoin: null }, "host");
      await settle();

      expect(refusals.map((refusal) => refusal.message)).toEqual([PROTOCOL_MISMATCH_MESSAGE]);
    });

    it("leaves no trace of a refused client in the room", async () => {
      const match = startMatch();
      const { connection: first } = await match.join();

      await expect(
        match.join({ ...hello(), protocolVersion: `${PROTOCOL_VERSION}-stale` }),
      ).rejects.toThrow(PROTOCOL_MISMATCH_MESSAGE);
      const { connection: second } = await match.join();
      await match.step(TICK_SECONDS);

      expect(first.getSnapshot().players).toHaveLength(2);
      // The refused join consumed no team slot: alternating assignment
      // still puts the second real player on the other team.
      expect(self(second)?.team).not.toBe(self(first)?.team);
    });
  });

  it("moves a player in the requested direction at the ruleset's speed", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.5);

    const player = self(connection);
    expect(player?.x).toBeGreaterThan(
      FIRST_SPAWN.x + RULESET.movement.maxSpeedUnitsPerSecond * 0.3,
    );
    expect(player?.y).toBeCloseTo(FIRST_SPAWN.y, 1);
  });

  it("never places a Quick Match player in a match that has ended (#249)", async () => {
    // The host has no `endMatch`: a short time limit ends it the way a real match ends.
    const match = startMatch({ matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: 1 } });
    const { connection: first, transport } = await match.join();
    const ended = collect(transport, "ended", (value) => value);

    await match.step(2);
    // A tick after the end, as a late timer would run: it ends once.
    match.host.advance(1);
    await settle();
    expect(match.host.phase).toBe("finished");
    expect(first.getSnapshot().phase).toBe("finished");
    expect(ended).toHaveLength(1);

    // There is no other room to be placed in: the host turns the player away.
    const joining = match.join();
    await expect(joining).rejects.toThrow(MATCH_OVER_MESSAGE);
    await expect(joining).rejects.toMatchObject({ reason: "match-over" });
  });

  it("keeps a player inside the map's edge (#244)", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    const radius = RULESET.collision.playerRadius;

    connection.sendIntent({ kind: "move", dirX: -1, dirY: 0 });
    await match.step(3);
    expect(self(connection)?.x).toBe(radius);
    connection.sendIntent({ kind: "move", dirX: 0, dirY: -1 });
    await match.step(3.5);
    expect(self(connection)?.y).toBe(radius);
    // Still pushing: it stays put rather than creeping off.
    await match.step(0.3);
    expect(self(connection)?.x).toBe(radius);
    expect(self(connection)?.y).toBe(radius);
  });

  it("syncs where a player faces, to two decimals (#187)", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    connection.sendIntent({ kind: "move", dirX: 0, dirY: 1 });
    await match.step(0.5);
    // No float32 schema in between: the host's rounding arrives exactly.
    expect(self(connection)?.facing).toBe(1.57);
  });

  it("stops moving once a stop intent is sent", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    connection.sendIntent({ kind: "move", dirX: 0, dirY: 1 });
    await match.step(0.5);
    expect(self(connection)?.y).toBeGreaterThan(FIRST_SPAWN.y + 5);

    connection.sendIntent({ kind: "stop" });
    await match.step(0.15);
    const firstY = self(connection)?.y;
    await match.step(0.15);
    expect(self(connection)?.y).toBe(firstY);
  });

  it("walks a player to a clicked point over ticks, and stops there (#310)", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    const goal = { x: FIRST_SPAWN.x + 120, y: FIRST_SPAWN.y + 40 };

    connection.sendIntent({ kind: "walk-to", ...goal });
    await match.step(2);
    const arrived = { x: self(connection)?.x ?? 0, y: self(connection)?.y ?? 0 };
    expect(Math.hypot(arrived.x - goal.x, arrived.y - goal.y)).toBeLessThanOrEqual(1);

    await match.step(0.3);
    expect({ x: self(connection)?.x, y: self(connection)?.y }).toEqual(arrived);
    expect(self(connection)?.walking).toBe(false);
  });

  it("shows a walk while it runs, and cancel stops it where the player stands (#342)", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    const goal = { x: FIRST_SPAWN.x + 300, y: FIRST_SPAWN.y };

    connection.sendIntent({ kind: "walk-to", ...goal });
    await match.step(0.2);
    expect(self(connection)?.walking).toBe(true);
    expect(self(connection)?.x).toBeGreaterThan(FIRST_SPAWN.x);

    connection.sendIntent({ kind: "cancel" });
    await match.step(TICK_SECONDS * 2);
    expect(self(connection)?.walking).toBe(false);
    const stopped = self(connection)?.x ?? 0;
    await match.step(0.3);
    expect(self(connection)?.x).toBe(stopped);
    expect(stopped).toBeLessThan(goal.x);
  });

  it("shows a spell walking in as walking, and cancel drops it unpaid (#499)", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b } = await match.join();
    // Back off from the foe across the way, past Fireball range.
    a.sendIntent({ kind: "walk-to", x: 50, y: FIRST_SPAWN.y });
    await settle();
    await match.step(5);
    expect(self(a)?.x).toBeLessThan(100);

    a.sendIntent({ kind: "target", targetSessionId: b.selfSessionId });
    a.sendIntent({ kind: "use-skill", slot: DEFAULT_SKILL_BAR.indexOf("elementalist.fireball") });
    await landAndTick(match);
    expect(self(a)?.walking).toBe(true);

    a.sendIntent({ kind: "cancel" });
    await landAndTick(match);
    expect(self(a)?.walking).toBe(false);
    await match.step(3);
    expect(self(a)?.castingSkillId).toBeUndefined();
    expect(self(a)?.energy).toBe(self(a)?.maxEnergy);
  });

  it("ignores a malformed intent rather than crashing the room", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();

    transport.send("intent", { kind: "move", dirX: "not-a-number", dirY: 0 }, "host");
    transport.send("intent", { kind: "teleport", x: 9999, y: 9999 }, "host");
    transport.send("intent", null, "host");
    await match.step(0.15);

    expect(self(connection)?.x).toBe(FIRST_SPAWN.x);
    expect(self(connection)?.y).toBe(FIRST_SPAWN.y);
    // Still running, and still listening.
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.15);
    expect(self(connection)?.x).toBeGreaterThan(FIRST_SPAWN.x);
  });

  it("accepts targeting another connected player", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b } = await match.join();

    a.sendIntent({ kind: "target", targetSessionId: b.selfSessionId });
    await landAndTick(match);

    expect(self(a)?.targetSessionId).toBe(b.selfSessionId);
  });

  it("allows self-targeting", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    connection.sendIntent({ kind: "target", targetSessionId: connection.selfSessionId });
    await landAndTick(match);

    expect(self(connection)?.targetSessionId).toBe(connection.selfSessionId);
  });

  it("clears a target when targetSessionId is null", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b } = await match.join();

    a.sendIntent({ kind: "target", targetSessionId: b.selfSessionId });
    await landAndTick(match);
    expect(self(a)?.targetSessionId).toBe(b.selfSessionId);

    a.sendIntent({ kind: "target", targetSessionId: null });
    await landAndTick(match);
    expect(self(a)?.targetSessionId).toBeUndefined();
  });

  it("rejects targeting a session id that does not exist", async () => {
    const match = startMatch();
    const { connection } = await match.join();

    connection.sendIntent({ kind: "target", targetSessionId: "no-such-session" });
    await match.step(0.15);

    expect(self(connection)?.targetSessionId).toBeUndefined();
  });

  it("clears a stale target once the targeted player leaves", async () => {
    const match = startMatch();
    const { connection: a } = await match.join();
    const { connection: b } = await match.join();

    a.sendIntent({ kind: "target", targetSessionId: b.selfSessionId });
    await landAndTick(match);
    expect(self(a)?.targetSessionId).toBe(b.selfSessionId);

    // The seat is held through a drop, so the target goes when the seat does.
    await b.disconnect();
    await match.step(RECONNECT_WINDOW_SECONDS + TICK_SECONDS);
    expect(self(a)?.targetSessionId).toBeUndefined();
  });

  describe("recharges (#152)", () => {
    /** Join, and keep every `recharge` message this client is sent, from the first. */
    async function joinCounting(match: TestMatch) {
      const transport = match.network.join();
      const received: RechargeMessage[] = collect(transport, "recharge", parseRecharge);
      await settle();
      const connection = await connectMatch({
        transport,
        hostId: "host",
        hello: hello(),
        timeoutMs: 1000,
      });
      return { connection, received };
    }

    it("tells the caster alone, once, and nothing more while it counts down", async () => {
      const match = startMatch();
      const caster = await joinCounting(match);
      const other = await joinCounting(match);
      await settle();
      // On join, each is told their bar is ready.
      expect(caster.received).toHaveLength(1);
      expect(other.received).toHaveLength(1);
      expect(caster.received[0]?.slots).toEqual([]);

      // Armor of Earth: self-targeted, so it fires with nobody in range.
      const slot = DEFAULT_SKILL_BAR.indexOf("elementalist.armor-of-earth");
      caster.connection.sendIntent({ kind: "use-skill", slot });
      await match.step(1);
      expect(caster.received).toHaveLength(2);
      const [started] = caster.received[1]?.slots ?? [];
      expect(started?.slot).toBe(slot);
      expect(started?.totalSeconds).toBe(15);
      expect(started?.remainingSeconds).toBeGreaterThan(14);

      // A second of plain countdown is the client's to predict.
      await match.step(1);
      expect(caster.received).toHaveLength(2);
      expect(other.received).toHaveLength(1);
    });
  });
});
