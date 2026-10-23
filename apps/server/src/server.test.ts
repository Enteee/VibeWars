import { Client } from "@colyseus/sdk";
import { ROOM_LOBBY, PROTOCOL_VERSION, type ServerHello } from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/**
 * Sprint 0/3 networking feasibility test.
 *
 * This is the test that proves the whole transport stack works against our
 * TypeScript configuration: a real server listening on a real socket, a real
 * client joining over WebSocket, real schema state decoded on the client.
 * It is deliberately *not* mocked — a mocked Colyseus would verify nothing.
 */
describe("game server", () => {
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

  it("accepts a client into the lobby and syncs state", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_LOBBY);

    await waitFor(() => room.state.members.size === 1, { label: "member to appear in state" });

    const member = room.state.members.get(room.sessionId);
    expect(member).toBeDefined();
    expect(member?.sessionId).toBe(room.sessionId);
    expect(room.state.protocolVersion).toBe(PROTOCOL_VERSION);

    await room.leave();
  });

  it("sends a hello carrying the protocol version and tick interval", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_LOBBY);

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

    const roomA = await clientA.joinOrCreate(ROOM_LOBBY);
    const roomB = await clientB.joinById(roomA.roomId);

    await waitFor(() => roomA.state.members.size === 2, { label: "both members to appear" });
    expect(roomA.state.members.size).toBe(2);

    await roomB.leave();
    await waitFor(() => roomA.state.members.size === 1, { label: "member to be removed" });
    expect(roomA.state.members.has(roomB.sessionId)).toBe(false);

    await roomA.leave();
  });

  it("rejects a join for an unknown room type", async () => {
    const client = new Client(endpoint);
    await expect(client.joinOrCreate("no-such-room")).rejects.toThrow();
  });
});
