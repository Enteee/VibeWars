import { Client } from "@colyseus/sdk";
import { createRng, seedFromString } from "@vibewars/game-core";
import {
  LOBBY_CODE_ALPHABET,
  LOBBY_CODE_LENGTH,
  ROOM_LOBBY,
  isLobbyCode,
} from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateLobbyCode, sanitizeName } from "./rooms/lobby-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { findFreePort, waitFor } from "./testing/harness.js";

describe("sanitizeName", () => {
  it("keeps a reasonable name as-is", () => {
    expect(sanitizeName("Ellie", "fallback")).toBe("Ellie");
  });

  it("falls back for a non-string", () => {
    expect(sanitizeName(42, "fallback")).toBe("fallback");
    expect(sanitizeName(undefined, "fallback")).toBe("fallback");
    expect(sanitizeName(null, "fallback")).toBe("fallback");
  });

  it("falls back for an empty or whitespace-only name", () => {
    expect(sanitizeName("", "fallback")).toBe("fallback");
    expect(sanitizeName("   ", "fallback")).toBe("fallback");
  });

  it("strips control characters that would corrupt logs or other clients' UI", () => {
    // A name carrying an ANSI escape and a NUL byte.
    const hostile = "ab\u001b[31mcd\u0000";
    expect(sanitizeName(hostile, "fallback")).toBe("ab[31mcd");
  });

  it("clamps a very long name so one player cannot flood the screen", () => {
    expect(sanitizeName("x".repeat(500), "fallback")).toHaveLength(16);
  });
});

describe("generateLobbyCode", () => {
  it("produces a code of the expected length from the code alphabet", () => {
    const code = generateLobbyCode(createRng(seedFromString("seed")));
    expect(code).toHaveLength(LOBBY_CODE_LENGTH);
    expect(isLobbyCode(code)).toBe(true);
  });

  it("uses only characters from the unambiguous alphabet", () => {
    const rng = createRng(seedFromString("alphabet"));
    for (let i = 0; i < 200; i += 1) {
      for (const char of generateLobbyCode(rng)) {
        expect(LOBBY_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it("is deterministic for a given seed, so a match can be reproduced", () => {
    expect(generateLobbyCode(createRng(42))).toBe(generateLobbyCode(createRng(42)));
  });

  it("produces varied codes across draws rather than repeating one", () => {
    const rng = createRng(seedFromString("variety"));
    const codes = new Set(Array.from({ length: 50 }, () => generateLobbyCode(rng)));
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("lobby room", () => {
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

  it("gives a newly created lobby a valid, shareable code", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, {});
    // Wait for the condition actually under test. `create()` resolves on
    // the handshake, before the first state patch decodes, so polling for
    // a merely non-empty string can observe a half-synced value.
    await waitFor(() => isLobbyCode(room.state.code), { label: "a valid code to sync" });

    expect(isLobbyCode(room.state.code)).toBe(true);
    await room.leave();
  });

  it("makes the first player the host", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    expect(room.state.players.get(room.sessionId)?.isHost).toBe(true);
    await room.leave();
  });

  it("sanitises the display name a client asks for", async () => {
    const client = new Client(endpoint);
    const room = await client.create(ROOM_LOBBY, { name: "x".repeat(100) });
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self to appear" });

    expect(room.state.players.get(room.sessionId)?.name.length).toBeLessThanOrEqual(16);
    await room.leave();
  });

  it("lets a second player join by room id and does not make them host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    expect(host.state.players.get(guest.sessionId)?.isHost).toBe(false);
    expect(host.state.players.get(host.sessionId)?.isHost).toBe(true);

    await guest.leave();
    await host.leave();
  });

  it("assigns a team when a player chooses one", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 1 });
    await waitFor(() => room.state.players.get(room.sessionId)?.team === 1, {
      label: "team assigned",
    });

    expect(room.state.players.get(room.sessionId)?.team).toBe(1);
    await room.leave();
  });

  it("rejects a nonsense team value rather than accepting it", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 99 });
    room.send("choose-team", { team: "red" });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(room.state.players.get(room.sessionId)?.team).toBe(-1);
    await room.leave();
  });

  it("clears readiness when a player switches teams", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("choose-team", { team: 0 });
    await waitFor(() => room.state.players.get(room.sessionId)?.team === 0, { label: "team" });
    room.send("ready", { ready: true });
    await waitFor(() => room.state.players.get(room.sessionId)?.ready === true, { label: "ready" });

    room.send("choose-team", { team: 1 });
    await waitFor(() => room.state.players.get(room.sessionId)?.ready === false, {
      label: "readiness cleared",
    });

    expect(room.state.players.get(room.sessionId)?.ready).toBe(false);
    await room.leave();
  });

  it("refuses to mark a spectator ready", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    room.send("ready", { ready: true });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Still on no team, so readiness must not stick.
    expect(room.state.players.get(room.sessionId)?.ready).toBe(false);
    await room.leave();
  });

  it("rejects starting when nobody is on a team", async () => {
    const room = await new Client(endpoint).create(ROOM_LOBBY, {});
    await waitFor(() => room.state.players.has(room.sessionId), { label: "self" });

    const rejection = new Promise<{ reason: string }>((resolve) => {
      room.onMessage("start-rejected", resolve);
    });
    room.send("start-match", {});

    expect((await rejection).reason).toContain("team");
    expect(room.state.phase).toBe("waiting");
    await room.leave();
  });

  it("rejects starting while someone on a team is not ready", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    await waitFor(() => host.state.players.get(host.sessionId)?.ready === true, { label: "ready" });

    const rejection = new Promise<{ reason: string }>((resolve) => {
      host.onMessage("start-rejected", resolve);
    });
    host.send("start-match", {});

    expect((await rejection).reason).toContain("ready");
    await guest.leave();
    await host.leave();
  });

  it("ignores a start request from a non-host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(() => host.state.players.get(guest.sessionId)?.ready === true, {
      label: "ready",
    });

    // The guest, not the host, asks to start.
    guest.send("start-match", {});
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(host.state.phase).toBe("waiting");
    await guest.leave();
    await host.leave();
  });

  it("starts the match when the host asks and everyone on a team is ready", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(
      () =>
        host.state.players.get(host.sessionId)?.ready === true &&
        host.state.players.get(guest.sessionId)?.ready === true,
      { label: "both ready" },
    );

    const starting = new Promise<{ mapId: string }>((resolve) => {
      guest.onMessage("match-starting", resolve);
    });
    host.send("start-match", {});

    const message = await starting;
    expect(message.mapId.length).toBeGreaterThan(0);
    await waitFor(() => host.state.phase === "in-match", { label: "phase to advance" });

    await guest.leave();
    await host.leave();
  });

  it("hands hosting to someone else when the host leaves", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => guest.state.players.size === 2, { label: "both players" });

    await host.leave();
    await waitFor(() => guest.state.players.get(guest.sessionId)?.isHost === true, {
      label: "hosting to transfer",
    });

    expect(guest.state.players.get(guest.sessionId)?.isHost).toBe(true);
    await guest.leave();
  });

  it("ignores a map selection from a non-host, and an unknown map from the host", async () => {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    const original = host.state.mapId;
    guest.send("select-map", { mapId: "arena-alpha" });
    host.send("select-map", { mapId: "no-such-map" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(host.state.mapId).toBe(original);
    await guest.leave();
    await host.leave();
  });
});

describe("playing more than one match in a lobby", () => {
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

  /** Drive a lobby from fresh to a started match. */
  async function startAMatch() {
    const host = await new Client(endpoint).create(ROOM_LOBBY, {});
    const guest = await new Client(endpoint).joinById(host.roomId);
    await waitFor(() => host.state.players.size === 2, { label: "both players" });

    host.send("choose-team", { team: 0 });
    guest.send("choose-team", { team: 1 });
    await waitFor(() => host.state.players.get(guest.sessionId)?.team === 1, { label: "teams" });
    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(
      () =>
        host.state.players.get(host.sessionId)?.ready === true &&
        host.state.players.get(guest.sessionId)?.ready === true,
      { label: "both ready" },
    );

    host.send("start-match", {});
    await waitFor(() => host.state.phase === "in-match", { label: "match to start" });
    return { host, guest };
  }

  it("returns to waiting so a second match can be started", async () => {
    const { host, guest } = await startAMatch();

    host.send("return-to-lobby", {});
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });

    expect(host.state.phase).toBe("waiting");
    await guest.leave();
    await host.leave();
  });

  it("clears readiness on return, so nobody is dragged into a match they did not confirm", async () => {
    const { host, guest } = await startAMatch();

    host.send("return-to-lobby", {});
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });

    expect(host.state.players.get(host.sessionId)?.ready).toBe(false);
    expect(host.state.players.get(guest.sessionId)?.ready).toBe(false);

    await guest.leave();
    await host.leave();
  });

  it("keeps team assignments, so sides do not have to be re-picked every round", async () => {
    const { host, guest } = await startAMatch();

    host.send("return-to-lobby", {});
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });

    expect(host.state.players.get(host.sessionId)?.team).toBe(0);
    expect(host.state.players.get(guest.sessionId)?.team).toBe(1);

    await guest.leave();
    await host.leave();
  });

  it("can actually start a second match after returning", async () => {
    const { host, guest } = await startAMatch();

    host.send("return-to-lobby", {});
    await waitFor(() => host.state.phase === "waiting", { label: "return to waiting" });

    host.send("ready", { ready: true });
    guest.send("ready", { ready: true });
    await waitFor(
      () =>
        host.state.players.get(host.sessionId)?.ready === true &&
        host.state.players.get(guest.sessionId)?.ready === true,
      { label: "both ready again" },
    );

    host.send("start-match", {});
    await waitFor(() => host.state.phase === "in-match", { label: "second match to start" });

    expect(host.state.phase).toBe("in-match");
    await guest.leave();
    await host.leave();
  });
});
