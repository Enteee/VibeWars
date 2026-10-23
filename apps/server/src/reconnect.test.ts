import { Client } from "@colyseus/sdk";
import { ROOM_MATCH } from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/**
 * Network robustness (brief §25).
 *
 * A LAN party runs on consumer wifi and laptops whose lids get closed.
 * Losing a match because of a two-second blip would be the single most
 * annoying failure mode, so a dropped player keeps their slot, their
 * character and their position for a window, and can walk back in.
 */
describe("reconnection", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({ port, host: "127.0.0.1", webRoot: undefined, devMode: false });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it("holds a dropped player's slot instead of deleting them immediately", async () => {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const dropper = await new Client(endpoint).joinById(watcher.roomId);
    await waitFor(() => watcher.state.players.has(dropper.sessionId), {
      label: "both players",
    });

    // `leave(false)` simulates a drop rather than a deliberate quit.
    await dropper.leave(false);
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Still present — their slot is being held open for them.
    expect(watcher.state.players.has(dropper.sessionId)).toBe(true);

    await watcher.leave();
  });

  it("lets a dropped player reconnect to the same character and position", async () => {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const client = new Client(endpoint);
    const dropper = await client.joinById(watcher.roomId);
    await waitFor(() => watcher.state.players.has(dropper.sessionId), { label: "both" });

    // Move so the restored position is distinguishable from a fresh spawn.
    dropper.send("intent", { kind: "move", dirX: 1, dirY: 0 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    dropper.send("intent", { kind: "stop" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const before = watcher.state.players.get(dropper.sessionId);
    const beforeX = before?.x ?? 0;
    const token = dropper.reconnectionToken;

    await dropper.leave(false);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const resumed = await client.reconnect(token);
    await waitFor(() => resumed.state.players.has(resumed.sessionId), { label: "reconnected" });

    expect(resumed.sessionId).toBe(dropper.sessionId);
    const after = resumed.state.players.get(resumed.sessionId);
    // Same character, same place — not a fresh spawn.
    expect(after?.x).toBeCloseTo(beforeX, 0);

    await resumed.leave();
    await watcher.leave();
  });

  it("freezes a dropped player rather than leaving them running into a wall", async () => {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const client = new Client(endpoint);
    const dropper = await client.joinById(watcher.roomId);
    await waitFor(() => watcher.state.players.has(dropper.sessionId), { label: "both" });

    dropper.send("intent", { kind: "move", dirX: 1, dirY: 0 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    await dropper.leave(false);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const settled = watcher.state.players.get(dropper.sessionId)?.x ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 600));
    const later = watcher.state.players.get(dropper.sessionId)?.x ?? 0;

    // A disconnected player must not keep sliding across the arena.
    expect(later).toBeCloseTo(settled, 1);

    await watcher.leave();
  });

  it("removes a player who leaves deliberately, without holding their slot", async () => {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const quitter = await new Client(endpoint).joinById(watcher.roomId);
    await waitFor(() => watcher.state.players.has(quitter.sessionId), { label: "both" });

    // A normal leave() is consented: no reason to hold the slot.
    await quitter.leave();
    await waitFor(() => !watcher.state.players.has(quitter.sessionId), {
      label: "quitter to be removed",
    });

    expect(watcher.state.players.has(quitter.sessionId)).toBe(false);

    await watcher.leave();
  });

  it("clears a stale target when the targeted player leaves deliberately", async () => {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const quitter = await new Client(endpoint).joinById(watcher.roomId);
    await waitFor(() => watcher.state.players.has(quitter.sessionId), { label: "both" });

    watcher.send("intent", { kind: "target", targetSessionId: quitter.sessionId });
    await waitFor(
      () => watcher.state.players.get(watcher.sessionId)?.targetSessionId === quitter.sessionId,
      { label: "target applied" },
    );

    await quitter.leave();
    await waitFor(() => watcher.state.players.get(watcher.sessionId)?.targetSessionId === "", {
      label: "target cleared",
    });

    expect(watcher.state.players.get(watcher.sessionId)?.targetSessionId).toBe("");

    await watcher.leave();
  });

  it("keeps the match running for everyone else while someone is away", async () => {
    const stayer = await new Client(endpoint).joinOrCreate(ROOM_MATCH);
    const dropper = await new Client(endpoint).joinById(stayer.roomId);
    await waitFor(() => stayer.state.players.has(dropper.sessionId), { label: "both" });

    await dropper.leave(false);
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The remaining player can still move and the clock still runs.
    const beforeX = stayer.state.players.get(stayer.sessionId)?.x ?? 0;
    const beforeClock = stayer.state.elapsedSeconds;
    stayer.send("intent", { kind: "move", dirX: 1, dirY: 0 });
    await waitFor(() => (stayer.state.players.get(stayer.sessionId)?.x ?? 0) > beforeX, {
      timeoutMs: 4000,
      label: "the match to keep simulating",
    });

    expect(stayer.state.elapsedSeconds).toBeGreaterThan(beforeClock);

    await stayer.leave();
  });
});
