import { Client, type Room } from "@colyseus/sdk";
import { createRng, defaultBuildEquipment, seedFromString } from "@vibewars/game-core";
import {
  PROTOCOL_VERSION,
  ROOM_LOBBY,
  ROOM_MATCH,
  parseClientIntent,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FLOOD_MESSAGES_PER_SECOND, MESSAGE_BURST, MESSAGES_PER_SECOND } from "./rooms/options.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";
import { DEFAULT_MAX_ROOMS } from "./config.js";

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
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
    });
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

    // Paced, so this client stays within its message budget (#43): the
    // point is what the handlers do with each value, not the flood.
    for (const value of hostileValues()) {
      room.send("choose-team", value);
      room.send("ready", value);
      room.send("select-map", value);
      room.send("start-match", value);
      await new Promise((resolve) => setTimeout(resolve, 125));
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

  it("never lets a client's text forge a log line (#115)", async () => {
    const forged = "a\n[match] finished winner=1 reason=score\r";
    const warn = vi.spyOn(console, "warn");
    const info = vi.spyOn(console, "info");
    try {
      const room = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
        mapId: forged,
        build: {
          name: forged,
          primaryProfession: "elementalist",
          secondaryProfession: undefined,
          attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
          skillBar: [forged, null, null, null, null, null, null, null],
          equipment: defaultBuildEquipment("elementalist"),
        },
      });
      await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });
      await room.leave();

      const lines = [...warn.mock.calls, ...info.mock.calls].map((call) => String(call[0]));
      // The build was refused, and said so, in one line.
      expect(lines.some((line) => line.startsWith("[match] refusing build"))).toBe(true);
      for (const line of lines) {
        expect(line).not.toMatch(/[\n\r]/);
      }
    } finally {
      warn.mockRestore();
      info.mockRestore();
    }
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

  /** A watcher and a second client in one match, both seated. */
  async function twoInAMatch(): Promise<{ watcher: Room; other: Room }> {
    const watcher = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const other = await new Client(endpoint).joinById(watcher.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => (watcher.state.players.get(other.sessionId)?.maxHealth ?? 0) > 0, {
      label: "both",
    });
    return { watcher, other };
  }

  /**
   * Whether the server still acts on `client`: it targets itself, and
   * `watcher` sees it. A target is mirrored at once and no wall can get in
   * its way, as one can in a walk; and no enemy skill picks yourself for
   * you, so only this intent can put it there.
   */
  async function listensTo(watcher: Room, client: Room): Promise<boolean> {
    client.send("intent", { kind: "target", targetSessionId: client.sessionId });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const listened =
      watcher.state.players.get(client.sessionId)?.targetSessionId === client.sessionId;
    client.send("intent", { kind: "target", targetSessionId: null });
    return listened;
  }

  it("keeps playing a client whose input arrives in one burst after a stall", async () => {
    // A wifi blip mid-fight: everything the client sent while its socket
    // stalled arrives at once. Before the budget, 60 in a second dropped
    // the player, deaf and frozen, and never told them (#43).
    const { watcher, other } = await twoInAMatch();

    for (let i = 0; i < 250; i += 1) {
      other.send(
        "intent",
        i % 2 === 0
          ? { kind: "move", dirX: Math.cos(i), dirY: Math.sin(i) }
          : { kind: "use-skill", slot: i % 8 },
      );
    }
    expect(await listensTo(watcher, other)).toBe(true);

    await other.leave();
    await watcher.leave();
  });

  it("ignores a match client's intents over its budget, then listens again", async () => {
    const { watcher, other } = await twoInAMatch();

    // A second's refill past the burst: on a loaded machine the burst
    // arrives spread out, and the bucket refills as it does.
    for (let i = 0; i < MESSAGE_BURST + MESSAGES_PER_SECOND; i += 1) {
      other.send("intent", { kind: "stop" });
    }
    expect(await listensTo(watcher, other)).toBe(false);

    // The budget refills at MESSAGES_PER_SECOND; the client was never dropped.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await listensTo(watcher, other)).toBe(true);

    await other.leave();
    await watcher.leave();
  });

  it("stops listening to a match client that floods messages", async () => {
    const { watcher, other: flooder } = await twoInAMatch();

    for (let i = 0; i < 1000; i += 1) {
      flooder.send("intent", { kind: "move", dirX: Math.cos(i), dirY: Math.sin(i) });
      flooder.send("intent", { kind: "use-skill", slot: i % 12 });
    }
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Past FLOOD_MESSAGES_PER_SECOND, Colyseus stops reading the socket
    // and drops the player (#43): frozen in place, and deaf to anything it
    // sends next. Its slot is held like any drop's, because Colyseus
    // closes a half-open reconnect with the same code, so the code cannot
    // tell a flooder from a wifi blip.
    expect(await listensTo(watcher, flooder)).toBe(false);

    // Everyone else plays on.
    const elapsed = watcher.state.elapsedSeconds;
    await waitFor(() => watcher.state.elapsedSeconds > elapsed, { label: "the match ticking" });
    expect(await serverIsHealthy()).toBe(true);
    await watcher.leave();
  });

  it("drops a lobby client that floods messages", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {
      protocolVersion: PROTOCOL_VERSION,
    });
    const flooder = await new Client(endpoint).joinById(host.roomId, {
      protocolVersion: PROTOCOL_VERSION,
    });
    await waitFor(() => host.state.players.has(flooder.sessionId), { label: "both" });
    let closeCode: number | undefined;
    flooder.onLeave((code) => {
      closeCode = code;
    });

    for (let i = 0; i < 2 * FLOOD_MESSAGES_PER_SECOND; i += 1) {
      flooder.send("ready", { ready: i % 2 === 0 });
    }

    await waitFor(() => closeCode !== undefined, { label: "the flooder to be dropped" });
    expect(closeCode).toBe(4002);
    await waitFor(() => !host.state.players.has(flooder.sessionId), {
      label: "the flooder to leave the lobby",
    });
    await host.leave();
  });
});
