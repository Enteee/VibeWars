import { Client } from "@colyseus/sdk";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "@vibewars/game-core";
import { loadMap } from "@vibewars/game-maps";
import {
  PROTOCOL_MISMATCH_MESSAGE,
  PROTOCOL_VERSION,
  ROOM_MATCH,
  type RechargeMessage,
  type ServerHello,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_MAP_ID, DEFAULT_SKILL_BAR } from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/**
 * The first client to join a fresh room always gets the map's first spawn
 * point (`MatchRoom`'s spawn index starts at 0 per room instance). Deriving
 * this from the real map rather than hardcoding a position keeps these
 * tests correct if `arena-alpha`'s spawn points ever move.
 */
const FIRST_SPAWN = loadMap(DEFAULT_MAP_ID).spawnPoints[0]?.position;
if (FIRST_SPAWN === undefined) {
  throw new Error(`${DEFAULT_MAP_ID} has no spawn points — fix the map before running tests`);
}

/**
 * Real-transport tests for the match room: a real server on a real socket,
 * a real `@colyseus/sdk` client over a real WebSocket, real schema state
 * decoded on the client. Deliberately not mocked — a mocked Colyseus would
 * not have caught the dependency-resolution bug in ADR-0002.
 */
describe("match room", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  // Colyseus keeps process-global matchmaker state, so one server is booted
  // for the whole file rather than one per test. Repeatedly listening and
  // shutting down in a single process invalidates seat reservations.
  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
    });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it("answers the health probe", async () => {
    const response = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("accepts a client and syncs state, spawned at the map's first spawn point", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });

    await waitFor(() => room.state.players.size === 1, { label: "player to appear in state" });

    const player = room.state.players.get(room.sessionId);
    expect(player).toBeDefined();
    expect(player?.sessionId).toBe(room.sessionId);
    expect(player?.x).toBe(FIRST_SPAWN.x);
    expect(player?.y).toBe(FIRST_SPAWN.y);
    expect(room.state.protocolVersion).toBe(PROTOCOL_VERSION);

    await room.leave();
  });

  it("sends a hello carrying the protocol version and tick interval", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });

    const hello = await new Promise<ServerHello>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("no hello received"));
      }, 4000);
      room.onMessage("hello", (message: ServerHello) => {
        clearTimeout(timer);
        resolve(message);
      });
    });

    expect(hello.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(hello.sessionId).toBe(room.sessionId);
    expect(hello.tickIntervalMs).toBeGreaterThan(0);

    await room.leave();
  });

  it("tracks multiple clients and removes them on leave", async () => {
    const clientA = new Client(endpoint);
    const clientB = new Client(endpoint);

    const roomA = await clientA.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const roomB = await clientB.joinById(roomA.roomId, { protocolVersion: PROTOCOL_VERSION });

    await waitFor(() => roomA.state.players.size === 2, { label: "both players to appear" });
    expect(roomA.state.players.size).toBe(2);

    await roomB.leave();
    await waitFor(() => roomA.state.players.size === 1, { label: "player to be removed" });
    expect(roomA.state.players.has(roomB.sessionId)).toBe(false);

    await roomA.leave();
  });

  describe("the protocol handshake", () => {
    it("refuses a client on another protocol version, telling it to reload", async () => {
      await expect(
        new Client(endpoint).joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION + 1 }),
      ).rejects.toThrow(PROTOCOL_MISMATCH_MESSAGE);
    });

    it("refuses a client that sends no protocol version at all", async () => {
      // Absence is a mismatch, not "an old client, let it in".
      await expect(new Client(endpoint).joinOrCreate(ROOM_MATCH, {})).rejects.toThrow(
        PROTOCOL_MISMATCH_MESSAGE,
      );
    });

    it("leaves no trace of a refused client in the room", async () => {
      const room = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
      });
      await waitFor(() => room.state.players.size === 1, { label: "the valid player" });

      await expect(new Client(endpoint).joinById(room.roomId, {})).rejects.toThrow(
        PROTOCOL_MISMATCH_MESSAGE,
      );
      const second = await new Client(endpoint).joinById(room.roomId, {
        protocolVersion: PROTOCOL_VERSION,
      });
      await waitFor(() => room.state.players.size === 2, { label: "the second valid player" });
      // The refused join consumed no team slot: alternating assignment
      // still puts the second real player on the other team.
      expect(room.state.players.get(second.sessionId)?.team).not.toBe(
        room.state.players.get(room.sessionId)?.team,
      );

      await second.leave();
      await room.leave();
    });
  });

  it("rejects a join for an unknown room type", async () => {
    const client = new Client(endpoint);
    await expect(client.joinOrCreate("no-such-room")).rejects.toThrow();
  });

  it("moves a player in the requested direction at the ruleset's speed", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    room.send("intent", { kind: "move", dirX: 1, dirY: 0 });

    const expectedMinimumX =
      FIRST_SPAWN.x + (MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond * 0.3) / 2;
    await waitFor(() => (room.state.players.get(room.sessionId)?.x ?? 0) > expectedMinimumX, {
      timeoutMs: 2000,
      label: "player to have moved right",
    });

    const player = room.state.players.get(room.sessionId);
    expect(player?.x).toBeGreaterThan(FIRST_SPAWN.x);
    expect(player?.y).toBeCloseTo(FIRST_SPAWN.y, 1);

    await room.leave();
  });

  it("stops moving once a stop intent is sent", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    room.send("intent", { kind: "move", dirX: 0, dirY: 1 });
    await waitFor(() => (room.state.players.get(room.sessionId)?.y ?? 0) > FIRST_SPAWN.y + 5, {
      timeoutMs: 2000,
      label: "player to have moved down",
    });

    room.send("intent", { kind: "stop" });
    // Let any in-flight tick settle, then sample twice to confirm no further movement.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const firstY = room.state.players.get(room.sessionId)?.y ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const secondY = room.state.players.get(room.sessionId)?.y ?? 0;
    expect(secondY).toBeCloseTo(firstY, 5);

    await room.leave();
  });

  it("ignores a malformed intent rather than crashing the room", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    room.send("intent", { kind: "move", dirX: "not-a-number", dirY: 0 });
    room.send("intent", { kind: "teleport", x: 9999, y: 9999 });
    room.send("intent", null);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const player = room.state.players.get(room.sessionId);
    expect(player?.x).toBe(FIRST_SPAWN.x);
    expect(player?.y).toBe(FIRST_SPAWN.y);

    await room.leave();
  });

  it("accepts targeting another connected player", async () => {
    const clientA = new Client(endpoint);
    const clientB = new Client(endpoint);
    const roomA = await clientA.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const roomB = await clientB.joinById(roomA.roomId, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => roomA.state.players.size === 2, { label: "both players to appear" });

    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target to be applied" },
    );

    expect(roomA.state.players.get(roomA.sessionId)?.targetSessionId).toBe(roomB.sessionId);

    await roomA.leave();
    await roomB.leave();
  });

  it("allows self-targeting", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    room.send("intent", { kind: "target", targetSessionId: room.sessionId });
    await waitFor(
      () => room.state.players.get(room.sessionId)?.targetSessionId === room.sessionId,
      { label: "self-target to be applied" },
    );

    expect(room.state.players.get(room.sessionId)?.targetSessionId).toBe(room.sessionId);

    await room.leave();
  });

  it("clears a target when targetSessionId is null", async () => {
    const clientA = new Client(endpoint);
    const clientB = new Client(endpoint);
    const roomA = await clientA.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const roomB = await clientB.joinById(roomA.roomId, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => roomA.state.players.size === 2, { label: "both players to appear" });

    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target to be applied" },
    );

    roomA.send("intent", { kind: "target", targetSessionId: null });
    await waitFor(() => roomA.state.players.get(roomA.sessionId)?.targetSessionId === "", {
      label: "target to be cleared",
    });

    expect(roomA.state.players.get(roomA.sessionId)?.targetSessionId).toBe("");

    await roomA.leave();
    await roomB.leave();
  });

  it("rejects targeting a session id that does not exist", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    room.send("intent", { kind: "target", targetSessionId: "no-such-session" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(room.state.players.get(room.sessionId)?.targetSessionId).toBe("");

    await room.leave();
  });

  it("clears a stale target once the targeted player leaves", async () => {
    const clientA = new Client(endpoint);
    const clientB = new Client(endpoint);
    const roomA = await clientA.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const roomB = await clientB.joinById(roomA.roomId, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => roomA.state.players.size === 2, { label: "both players to appear" });

    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target to be applied" },
    );

    await roomB.leave();
    await waitFor(() => roomA.state.players.get(roomA.sessionId)?.targetSessionId === "", {
      label: "stale target to be cleared",
    });

    expect(roomA.state.players.get(roomA.sessionId)?.targetSessionId).toBe("");

    await roomA.leave();
  });

  describe("recharges (#152)", () => {
    /** Join, and keep every `recharge` message this client is sent. */
    async function joinCounting() {
      const room = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
      });
      const received: RechargeMessage[] = [];
      room.onMessage("recharge", (message: RechargeMessage) => {
        received.push(message);
      });
      return { room, received };
    }

    it("tells the caster alone, once, and nothing more while it counts down", async () => {
      const caster = await joinCounting();
      const other = await joinCounting();
      // On join, each is told their bar is ready.
      await waitFor(() => caster.received.length === 1 && other.received.length === 1, {
        label: "join messages",
      });
      expect(caster.received[0]?.slots).toEqual([]);

      // Armor of Earth: self-targeted, so it fires with nobody in range.
      const slot = DEFAULT_SKILL_BAR.indexOf("elementalist.armor-of-earth");
      caster.room.send("intent", { kind: "use-skill", slot });
      await waitFor(() => caster.received.length === 2, { label: "the recharge" });
      const [started] = caster.received[1]?.slots ?? [];
      expect(started?.slot).toBe(slot);
      expect(started?.totalSeconds).toBe(15);
      expect(started?.remainingSeconds).toBeGreaterThan(14);

      // A second of plain countdown is the client's to predict.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(caster.received).toHaveLength(2);
      expect(other.received).toHaveLength(1);

      await caster.room.leave();
      await other.room.leave();
    });
  });
});
