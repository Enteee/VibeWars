import { Client } from "@colyseus/sdk";
import { createRng, seedFromString } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  ROOM_LOBBY,
  ROOM_MATCH,
  parseClientIntent,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

/**
 * Security / validation hardening (brief §27, §32).
 *
 * The requirement is absolute: "the server must never crash because of
 * malformed client input". These tests throw deliberately hostile
 * payloads at every message the protocol accepts, then assert the server
 * is still alive and still correct afterwards.
 *
 * The randomised corpus is seeded, so a failure here is reproducible
 * rather than a one-off that vanishes on re-run.
 */

/** Values chosen to break naive parsers. */
function hostileValues(): unknown[] {
  return [
    undefined,
    null,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    "",
    "   ",
    "0",
    "null",
    "[]",
    "\u0000",
    "x".repeat(500),
    true,
    false,
    [],
    [1, 2, 3],
    {},
    { kind: "move" },
    { kind: "move", dirX: "1", dirY: "1" },
    { kind: "move", dirX: Number.NaN, dirY: 0 },
    { kind: "move", dirX: 1e308, dirY: 1e308 },
    { kind: "target" },
    { kind: "target", targetSessionId: 42 },
    { kind: "use-skill" },
    { kind: "use-skill", slot: -1 },
    { kind: "use-skill", slot: 1.5 },
    { kind: "use-skill", slot: Number.MAX_SAFE_INTEGER },
    { kind: "use-skill", slot: "0" },
    { kind: "__proto__" },
    { kind: "constructor" },
    { kind: "move", dirX: 1, dirY: 0, extra: { deeply: { nested: "junk" } } },
  ];
}

describe("parseClientIntent fuzzing", () => {
  it("never throws, whatever it is handed", () => {
    for (const value of hostileValues()) {
      expect(() => parseClientIntent(value)).not.toThrow();
    }
  });

  it("only ever returns a recognised intent kind or undefined", () => {
    const allowed = new Set(["move", "stop", "target", "use-skill"]);
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed !== undefined) {
        expect(allowed.has(parsed.kind)).toBe(true);
      }
    }
  });

  it("never returns a move intent carrying a non-finite direction", () => {
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed?.kind === "move") {
        expect(Number.isFinite(parsed.dirX)).toBe(true);
        expect(Number.isFinite(parsed.dirY)).toBe(true);
      }
    }
  });

  it("never returns a use-skill intent with a negative or fractional slot", () => {
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed?.kind === "use-skill") {
        expect(Number.isInteger(parsed.slot)).toBe(true);
        expect(parsed.slot).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not pollute Object.prototype via a hostile payload", () => {
    parseClientIntent(
      JSON.parse('{"kind":"move","dirX":1,"dirY":0,"__proto__":{"pwned":1}}') as unknown,
    );
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });

  it("survives a large randomised corpus", () => {
    const rng = createRng(seedFromString("fuzz-corpus"));
    const pieces = hostileValues();
    for (let i = 0; i < 2000; i += 1) {
      const payload: Record<string, unknown> = {};
      for (const field of ["kind", "dirX", "dirY", "slot", "targetSessionId"]) {
        if (rng.nextFloat() < 0.6) {
          payload[field] = pieces[rng.nextInt(0, pieces.length)];
        }
      }
      expect(() => parseClientIntent(payload)).not.toThrow();
    }
  });
});

describe("server survives hostile clients", () => {
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

  /** Whether the server is still answering requests at all. */
  async function serverIsHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }

  it("ignores every hostile match intent and keeps the player connected and sane", async () => {
    const room = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => (room.state.players.get(room.sessionId)?.maxHealth ?? 0) > 0, {
      label: "stats to sync",
    });

    const spawnX = room.state.players.get(room.sessionId)?.x ?? 0;
    const spawnY = room.state.players.get(room.sessionId)?.y ?? 0;

    for (const value of hostileValues()) {
      room.send("intent", value);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Still connected, still simulating, and the position stayed sane —
    // an accepted 1e308 direction would have flung the player to NaN.
    const me = room.state.players.get(room.sessionId);
    expect(me).toBeDefined();
    expect(Number.isFinite(me?.x ?? Number.NaN)).toBe(true);
    expect(Number.isFinite(me?.y ?? Number.NaN)).toBe(true);
    expect(Math.abs((me?.x ?? 0) - spawnX)).toBeLessThan(1000);
    expect(Math.abs((me?.y ?? 0) - spawnY)).toBeLessThan(1000);

    expect(await serverIsHealthy()).toBe(true);
    await room.leave();
  });

  it("ignores every hostile lobby message and keeps the lobby healthy", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    for (const value of hostileValues()) {
      room.send("choose-team", value);
      room.send("ready", value);
      room.send("select-map", value);
      room.send("start-match", value);
      room.send("return-to-lobby", value);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));

    const me = room.state.players.get(room.sessionId);
    expect(me).toBeDefined();
    // Nothing hostile should have put this player on a team, marked them
    // ready, or started a match.
    expect(me?.team).toBe(-1);
    expect(me?.ready).toBe(false);
    expect(room.state.phase).toBe("waiting");

    expect(await serverIsHealthy()).toBe(true);
    await room.leave();
  });

  it("sanitises a hostile display name without dropping the connection", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
      name: `\u0000\u001b[31m${"x".repeat(5000)}`,
    });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    const name = room.state.players.get(room.sessionId)?.name ?? "";
    expect(name.length).toBeLessThanOrEqual(16);
    expect(name).not.toContain("\u0000");
    expect(name).not.toContain("\u001b");

    await room.leave();
  });

  /**
   * Colyseus closes a client that sends a message type the room never
   * registered (close code 4002). That is correct, deliberate transport
   * behaviour and NOT a crash — but it does mean the offending client's
   * connection is gone, so this is pinned as its own expectation rather
   * than tucked in alongside tests that keep using their connection.
   */
  it("disconnects a client that sends an unregistered message type, server unharmed", async () => {
    const victim = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => (victim.state.players.get(victim.sessionId)?.maxHealth ?? 0) > 0, {
      label: "stats",
    });

    victim.send("not-a-real-message", { anything: true });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await serverIsHealthy()).toBe(true);

    // And another client can still join and play normally.
    const fresh = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => (fresh.state.players.get(fresh.sessionId)?.maxHealth ?? 0) > 0, {
      label: "a fresh client to join",
    });
    expect(fresh.state.players.get(fresh.sessionId)).toBeDefined();
    await fresh.leave();
  });

  it("survives a client that floods messages", async () => {
    const room = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => (room.state.players.get(room.sessionId)?.maxHealth ?? 0) > 0, {
      label: "stats",
    });

    for (let i = 0; i < 1000; i += 1) {
      room.send("intent", { kind: "move", dirX: Math.cos(i), dirY: Math.sin(i) });
      room.send("intent", { kind: "use-skill", slot: i % 12 });
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(room.state.players.get(room.sessionId)).toBeDefined();
    expect(await serverIsHealthy()).toBe(true);
    await room.leave();
  });
});
