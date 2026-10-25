import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL_VERSION,
  ROOM_LIMIT,
  ROOM_LOBBY,
  ROOM_MATCH,
  SERVER_FULL_MESSAGE,
} from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";
import { DEFAULT_MAX_ROOMS } from "./config.js";

/**
 * Network robustness (brief §25).
 *
 * Disconnect, reconnect, leaving players and invalid input are covered
 * in `reconnect.test.ts` and `fuzz.test.ts`. This file covers what was
 * left: duplicated input, delayed input, late join, and a server
 * restart.
 *
 * A note on "packet loss", which the brief lists: this game runs over
 * WebSockets, which run over TCP. TCP does not lose packets — it
 * retransmits them. Simulating loss by dropping frames from the socket
 * would not reproduce anything a real player can experience; it would
 * just corrupt the protocol stream and test Colyseus's framing. What a
 * player on a bad network *actually* experiences is delay, bursts, and
 * duplicated or reordered application-level intents, so that is what is
 * tested here. Writing a `packet loss` test that silently tested
 * something else would be worse than saying this plainly.
 */

interface PlayerView {
  readonly health: number;
  readonly energy: number;
  readonly x: number;
  readonly y: number;
  readonly statuses: { readonly length: number; includes: (id: string) => boolean };
}

interface MatchView {
  readonly players: {
    readonly size: number;
    get: (id: string) => PlayerView | undefined;
  };
}

describe("network robustness", () => {
  let server: GameServer;
  let endpoint: string;
  let port: number;

  beforeEach(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
    });
    await server.listen(port);
  });

  afterEach(async () => {
    await server.gracefullyShutdown(false);
  });

  const join = async (): Promise<Room<unknown, MatchView>> => {
    const room = await new Client(endpoint).joinOrCreate<MatchView>(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.get(room.sessionId) !== undefined, {
      label: "own player to appear in state",
    });
    return room;
  };

  it("treats a duplicated movement intent as one instruction", async () => {
    const room = await join();
    // The number, not the schema object: Colyseus decodes patches *in
    // place*, so holding the object and reading `.x` later would read the
    // current value and make any movement assertion trivially true.
    const startX = room.state.players.get(room.sessionId)?.x ?? NaN;
    expect(startX).not.toBeNaN();

    // The same intent 50 times. A duplicate must not stack into 50× the
    // speed — a laggy client that retries is not a client asking to move
    // faster, and treating it as one would be a trivial speed hack.
    for (let i = 0; i < 50; i += 1) {
      room.send("intent", { kind: "move", dirX: 1, dirY: 0 });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    room.send("intent", { kind: "stop" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const travelled = (room.state.players.get(room.sessionId)?.x ?? NaN) - startX;

    // 180 units/s for ~0.5s, with generous slack for scheduling. The
    // ceiling is the real assertion: duplicates did not compound.
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(180);

    await room.leave(true);
  });

  it("charges a duplicated skill request once", async () => {
    const room = await join();
    await waitFor(() => (room.state.players.get(room.sessionId)?.energy ?? 0) > 0, {
      label: "energy to populate",
    });
    const before = room.state.players.get(room.sessionId)?.energy ?? 0;

    // Slot 5 is a self-cast enchantment, so it needs no target. Sent ten
    // times: the cast gate must reject the repeats as "already casting"
    // or "still recharging" rather than billing for each one.
    for (let i = 0; i < 10; i += 1) {
      room.send("intent", { kind: "use-skill", slot: 4 });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // The enchantment landing proves a cast actually resolved. Without
    // this the energy assertion below would also pass if nothing was
    // cast at all — regen alone would satisfy it.
    await waitFor(() => (room.state.players.get(room.sessionId)?.statuses.length ?? 0) > 0, {
      label: "the self-cast enchantment to appear",
    });

    const after = room.state.players.get(room.sessionId)?.energy ?? 0;
    // One cast of a 10-energy skill, minus regen. Ten casts would be 100,
    // far more energy than a player has.
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThanOrEqual(10);

    await room.leave(true);
  });

  it("handles a burst of delayed input without losing the final state", async () => {
    const room = await join();

    // What a stalled connection looks like when it recovers: a pile of
    // intents arriving at once. The last one must win, rather than the
    // player being left moving in a direction they abandoned.
    room.send("intent", { kind: "move", dirX: 1, dirY: 0 });
    room.send("intent", { kind: "move", dirX: 0, dirY: 1 });
    room.send("intent", { kind: "move", dirX: -1, dirY: 0 });
    room.send("intent", { kind: "stop" });
    await new Promise((resolve) => setTimeout(resolve, 400));

    const settled = room.state.players.get(room.sessionId);
    const x = settled?.x ?? 0;
    const y = settled?.y ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 400));

    const later = room.state.players.get(room.sessionId);
    expect(later?.x).toBeCloseTo(x, 1);
    expect(later?.y).toBeCloseTo(y, 1);

    await room.leave(true);
  });

  it("lets a player join a match that is already running", async () => {
    const first = await join();

    // Let the match tick for a while before anyone else arrives.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const late = await new Client(endpoint).joinById<MatchView>(first.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => late.state.players.size === 2, { label: "late joiner to be seen" });

    // The late joiner is a real, alive participant — not a spectator and
    // not a ghost with no health.
    const self = late.state.players.get(late.sessionId);
    expect(self).toBeDefined();
    expect(self?.health).toBeGreaterThan(0);

    // And the player already there sees them too.
    await waitFor(() => first.state.players.get(late.sessionId) !== undefined, {
      label: "existing player to see the late joiner",
    });

    await late.leave(true);
    await first.leave(true);
  });

  it("does not leave a ghost behind when a player leaves mid-match", async () => {
    const a = await join();
    const b = await new Client(endpoint).joinById<MatchView>(a.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => a.state.players.size === 2, { label: "both players present" });

    await b.leave(true);

    await waitFor(() => a.state.players.size === 1, {
      label: "the departed player to be removed",
    });
    expect(a.state.players.get(b.sessionId)).toBeUndefined();

    await a.leave(true);
  });

  it("survives a server restart: clients fail cleanly and new matches work", async () => {
    const room = await join();
    let errored = false;
    room.onError(() => {
      errored = true;
    });
    let left = false;
    room.onLeave(() => {
      left = true;
    });

    await server.gracefullyShutdown(false);

    // The client is told, one way or another. What must not happen is a
    // client that believes it is still in a match that no longer exists.
    await waitFor(() => left || errored, {
      timeoutMs: 8000,
      label: "the client to notice the server went away",
    });

    // Bring it back on the same port and confirm the game is playable
    // again — a restart must not need anything hand-reset.
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
    });
    await server.listen(port);

    const fresh = await join();
    expect(fresh.state.players.get(fresh.sessionId)).toBeDefined();
    await fresh.leave(true);
  });
});

describe("the server-wide room budget (#114)", () => {
  let server: GameServer;
  let endpoint: string;

  beforeEach(async () => {
    const port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: 2,
    });
    await server.listen(port);
  });

  afterEach(async () => {
    await server.gracefullyShutdown(false);
  });

  const host = (): Promise<Room> =>
    new Client(endpoint).create(ROOM_LOBBY, { protocolVersion: PROTOCOL_VERSION, name: "Host" });

  it("refuses a room past the budget with ROOM_LIMIT, and frees a slot on dispose", async () => {
    const first = await host();
    const second = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });

    let refused: unknown;
    try {
      await host();
    } catch (error: unknown) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error & { code?: unknown }).code).toBe(ROOM_LIMIT);
    expect((refused as Error).message).toContain(SERVER_FULL_MESSAGE);

    // The lobby empties and is disposed, and its slot is free again.
    await first.leave(true);
    let third: Room | undefined;
    for (let tries = 0; third === undefined && tries < 50; tries += 1) {
      try {
        third = await host();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    expect(third).toBeDefined();
    await third?.leave(true);
    await second.leave(true);
  });
});
